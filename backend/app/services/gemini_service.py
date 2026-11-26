import json
import logging
from typing import Any, Dict, List, Optional

from ..core.config import settings

logger = logging.getLogger("agrovision.gemini_service")

# Try importing the official Google GenAI SDK
try:
    from google import genai
    from google.genai import types
    GENAI_AVAILABLE = True
except ImportError:
    GENAI_AVAILABLE = False
    logger.warning("google-genai package not available. Chat will operate in rule-grounded fallback mode.")


SYSTEM_PROMPT_TEMPLATE = """You are AgroVision AI Assistant, a helpful and practical agricultural decision-support companion for cotton farmers and agronomists.

Your role is to explain leaf scans, field weather conditions, and practical farm actions in simple, clear, and farmer-friendly language. Avoid complex academic jargon, research terminology, or deep learning theory.

=== CRITICAL RULES FOR FARMER-FRIENDLY ADVICE ===
1. SIMPLE, PRACTICAL LANGUAGE:
   - Talk like an experienced and supportive farm agronomist speaking directly to a farmer.
   - Use plain, everyday terms: "leaf scan result", "field weather", "soil moisture", "field checking", "watering schedule".
   - NEVER use complex academic or ML jargon such as "33-feature neuromorphic LIF model", "temporal membrane potential", "softmax probabilities", "convolutional residual blocks", or "stochastic loss".
   - Keep answers clear, encouraging, respectful, and direct. Do not make answers overly long or complicated.

2. STRICT GROUNDING ON THE CURRENT SCAN DATA:
   - When an active leaf scan or combined assessment is attached in the context below, answer SPECIFICALLY AND STRICTLY about that scan's data.
   - Do NOT talk about unrelated diseases or conditions that were not found in this scan unless the farmer explicitly asks a general concept question.
   - Ground all explanations and advice directly in:
     * The verified leaf diagnosis (e.g., Healthy, Water Stress, Heat Stress, Nutrient Deficiency, or Pollution)
     * The actual field readings (temperature, air humidity, rainfall, soil moisture)
     * The triggered safety rules and recommended precautions

3. CLEAR 3-PART STRUCTURE FOR SCAN EXPLANATIONS:
   Whenever explaining the scan result or answering what the farmer should do, organize your response into these 3 easy-to-read sections:
   - **What Your Leaf Scan Shows**: Plain-language explanation of what was found on the leaf and how confident the diagnosis is.
   - **Current Field Conditions**: How field temperature, soil moisture, and air humidity relate to this leaf condition.
   - **Action Steps for Today**: 3 to 4 clear, numbered, practical steps the farmer should take in the field today (e.g., how to check soil dampness, watering recommendations, scouting tips, spray precautions).

4. GENERAL CONCEPT QUESTIONS:
   - If the farmer asks a general farming or concept question (e.g., "What is soil moisture?", "When should I water?", "What are aphids?"), explain that specific concept simply and directly without forcing the leaf diagnosis into it.

5. SAFETY & PRACTICAL INTEGRITY:
   - Never invent fake numbers or confidence scores.
   - Recommend practical field checks (e.g. digging 6–12 inches to feel soil moisture, checking leaf undersides for pests) and consulting local agriculture extension officers (KVK / CICR) before applying expensive or hazardous chemicals.

=== CURRENT AUTHORITATIVE ANALYSIS & FIELD CONTEXT ===
{context_block}
"""

# Models to attempt in priority order (Fast, resilient Google GenAI models)
CANDIDATE_MODELS_CASCADE = [
    "gemini-flash-lite-latest",
    "gemini-2.5-flash",
    "gemini-flash-latest",
]


class GeminiChatService:
    """
    Dedicated Gemini API integration service for AgroVision.
    
    Handles:
    - Client initialization with official Google GenAI SDK
    - Multi-model dynamic cascade (falling back to active models upon rate limits)
    - Constructing authoritative system prompts with validated analysis context
    - Multi-turn conversation management
    - Comprehensive semantic rule-grounded fallback explanations
    """
    _instance: Optional["GeminiChatService"] = None

    def __init__(self):
        self.api_key = settings.GEMINI_API_KEY
        configured_model = settings.GEMINI_MODEL or "gemini-3.5-flash"
        # Put configured model at the front of cascade if specified
        self.models_cascade = [configured_model] + [m for m in CANDIDATE_MODELS_CASCADE if m != configured_model]
        self.client = None
        if GENAI_AVAILABLE and self.api_key:
            try:
                self.client = genai.Client(api_key=self.api_key)
                logger.info(f"Initialized Gemini Chat Client. Primary model cascade: {self.models_cascade}")
            except Exception as e:
                logger.warning(f"Failed to initialize Gemini Client: {e}")
                self.client = None

    @classmethod
    def get_instance(cls) -> "GeminiChatService":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def is_available(self) -> bool:
        return self.client is not None and bool(self.api_key)

    def is_configured(self) -> bool:
        return self.is_available()

    def generate_response(
        self,
        user_message: str,
        record_context: Optional[Dict[str, Any]] = None,
        weather_data: Optional[Dict[str, Any]] = None,
        field_name: Optional[str] = "Field A — North Parcel",
        history: Optional[List[Dict[str, str]]] = None,
    ) -> Dict[str, Any]:
        """Convenience alias for chat() method."""
        return self.chat(
            message=user_message,
            analysis_data=record_context,
            weather_data=weather_data,
            field_name=field_name,
            history=history,
        )

    def build_context_block(
        self,
        analysis_data: Optional[Dict[str, Any]] = None,
        weather_data: Optional[Dict[str, Any]] = None,
        field_name: Optional[str] = "Field A — North Parcel"
    ) -> str:
        """Constructs an uncompromised text block containing all verified analysis facts."""
        if not analysis_data and not weather_data:
            return "No active leaf scan or weather snapshot is currently attached to this conversation. The user is asking general farm management or agricultural technology questions."

        sections = []

        # 1. Field & Metadata
        sections.append(f"FIELD: {field_name}")
        if analysis_data:
            sections.append(f"ANALYSIS UUID: {analysis_data.get('record_uuid', 'Current Active Session')}")
            sections.append(f"GROWTH STAGE: {analysis_data.get('growth_stage', 'Flowering')}")

        # 2. CNN Visual Analysis
        visual = analysis_data.get("visual_assessment", {}) if analysis_data else {}
        if visual:
            top_class = visual.get("class") or visual.get("predicted_class", "Healthy")
            conf = visual.get("confidence", 0.0)
            conf_str = f"{conf * 100:.1f}%" if conf <= 1.0 else f"{conf:.1f}%"
            probs = visual.get("probabilities", {})
            probs_str = ", ".join([f"{k}: {v*100:.1f}%" if float(v)<=1.0 else f"{k}: {float(v):.1f}%" for k, v in probs.items()]) if probs else "N/A"
            sections.append(
                f"\n[CNN VISUAL ANALYSIS (Leaf Image)]\n"
                f"- Predicted Condition: {top_class} (Confidence: {conf_str})\n"
                f"- Class Probabilities: {probs_str}"
            )

        # 3. SNN Environmental Analysis
        env_eval = analysis_data.get("environmental_assessment", {}) if analysis_data else {}
        if env_eval:
            severity = env_eval.get("severity") or env_eval.get("predicted_severity", "Low")
            snn_conf = env_eval.get("confidence", 0.0)
            snn_conf_str = f"{snn_conf * 100:.1f}%" if snn_conf <= 1.0 else f"{snn_conf:.1f}%"
            spikes = env_eval.get("spike_counts", {})
            sections.append(
                f"\n[SNN ENVIRONMENTAL ANALYSIS (33-Feature Neuromorphic Model)]\n"
                f"- Predicted Environmental Stress: {severity} Stress (Evidence Score: {snn_conf_str})\n"
                f"- Output Spike Counts (10 Timesteps): {json.dumps(spikes)}"
            )

        # 4. Field Environmental Inputs & Measurements
        env_inputs = analysis_data.get("environmental_inputs", {}) if analysis_data else {}
        if env_inputs:
            temp = env_inputs.get("temperature", "N/A")
            hum = env_inputs.get("humidity", "N/A")
            rain = env_inputs.get("rainfall", env_inputs.get("rainfall_mm", "N/A"))
            soil = env_inputs.get("soil_moisture", "N/A")
            aqi = env_inputs.get("aqi", "N/A")
            ozone = env_inputs.get("ozone", "N/A")
            sections.append(
                f"\n[FIELD ENVIRONMENTAL INPUTS]\n"
                f"- Air Temperature: {temp} °C (Source: OpenWeather or Manual)\n"
                f"- Relative Humidity: {hum} % (Source: OpenWeather or Manual)\n"
                f"- Observed Rainfall: {rain} mm (Source: OpenWeather or Manual)\n"
                f"- Soil Moisture: {soil} m³/m³ (Source: MANUAL FIELD INPUT / SENSOR ONLY)\n"
                f"- Air Quality Index (AQI): {aqi} (Source: OpenWeather Air Pollution)\n"
                f"- Tropospheric Ozone: {ozone} (Source: OpenWeather Air Pollution)"
            )

        # 5. OpenWeather Live & Forecast Context
        if weather_data:
            curr = weather_data.get("current", {})
            fore = weather_data.get("forecast", {})
            air = weather_data.get("air_quality", {})
            sections.append(
                f"\n[OPENWEATHER MACROCLIMATE CONTEXT]\n"
                f"- Location: {weather_data.get('location', {}).get('name', 'Local Area')}\n"
                f"- Weather Condition: {curr.get('weather_condition', 'Clear')} ({curr.get('weather_description', 'clear sky')})\n"
                f"- Observed Temperature: {curr.get('temperature_c', 'N/A')} °C\n"
                f"- Observed Humidity: {curr.get('humidity_percent', 'N/A')} %\n"
                f"- Expected 24h Rainfall: {fore.get('next_24h_rainfall_mm', 0.0)} mm\n"
                f"- Expected 48h Rainfall: {fore.get('next_48h_rainfall_mm', 0.0)} mm\n"
                f"- Rain Probability: {float(fore.get('rain_probability', 0.0))*100:.0f}%\n"
                f"- Forecast Summary: {fore.get('summary', 'Stable')}\n"
                f"- Air Quality: AQI {air.get('aqi', 'N/A')} ({air.get('aqi_category', 'Moderate')}), Ozone: {air.get('ozone', 'N/A')} ppm"
            )

        # 6. Multimodal Fusion & Expert Veto
        fusion = analysis_data.get("fusion", {}) if analysis_data else {}
        veto = analysis_data.get("expert_veto", {}) if analysis_data else {}
        final_assessment = analysis_data.get("final_assessment", {}) if analysis_data else {}
        if fusion or veto or final_assessment:
            rel = fusion.get("relationship", "Aligned")
            interp = fusion.get("interpretation", "Visual and environmental evidence evaluated.")
            status_str = veto.get("overall_status", "No Rule Triggered")
            rules = veto.get("triggered_rules", [])
            rules_desc = []
            for r in rules:
                rules_desc.append(
                    f"  * [{r.get('rule_id', 'EVR')}] {r.get('rule_name', 'Rule')}: {r.get('reason', '')} "
                    f"-> Precaution: {r.get('precaution', '')} -> Check: {r.get('what_to_check', '')}"
                )
            rules_text = "\n".join(rules_desc) if rules_desc else "  * No restrictive agronomic rules triggered (Baseline Stability)."

            final_desc = final_assessment.get("description", "Standard monitoring.")
            precautions = final_assessment.get("precautions", [])
            prec_text = "\n".join([f"  * {p}" for p in precautions]) if precautions else "  * Maintain regular scouting."

            sections.append(
                f"\n[MULTIMODAL FUSION & DETERMINISTIC EXPERT VETO]\n"
                f"- Evidence Relationship: {rel}\n"
                f"- Fusion Interpretation: {interp}\n"
                f"- Expert Veto Overall Status: {status_str}\n"
                f"- Triggered Rules:\n{rules_text}\n"
                f"- Final Assessment: {final_desc}\n"
                f"- Recommended Precautions:\n{prec_text}"
            )

        return "\n".join(sections)

    def chat(
        self,
        message: str,
        analysis_data: Optional[Dict[str, Any]] = None,
        weather_data: Optional[Dict[str, Any]] = None,
        field_name: Optional[str] = "Field A — North Parcel",
        history: Optional[List[Dict[str, str]]] = None,
    ) -> Dict[str, Any]:
        """
        Sends user message to Gemini model anchored by trusted context and multi-turn history.
        Uses a resilient multi-model cascade to gracefully handle rate limits.
        """
        context_block = self.build_context_block(analysis_data, weather_data, field_name)
        system_instruction = SYSTEM_PROMPT_TEMPLATE.format(context_block=context_block)

        if not self.is_available():
            logger.warning("Gemini Client not available. Returning grounded semantic fallback response.")
            return {
                "reply": self._fallback_chat(message, analysis_data, weather_data),
                "model_used": "AgroVision Agronomic Engine",
                "source_context_used": True,
                "status": "fallback",
            }

        # Construct conversation contents for google-genai
        contents = []

        # Add recent history turns (limit to last 8 turns)
        if history:
            for h in history[-8:]:
                role = "user" if h.get("role") in ["user", "human"] else "model"
                content_text = h.get("content", "").strip()
                if content_text:
                    contents.append(
                        types.Content(
                            role=role,
                            parts=[types.Part.from_text(text=content_text)]
                        )
                    )

        # Add current user prompt
        contents.append(
            types.Content(
                role="user",
                parts=[types.Part.from_text(text=message.strip())]
            )
        )

        config = types.GenerateContentConfig(
            system_instruction=system_instruction,
            temperature=0.3,
            max_output_tokens=1024,
        )

        # Iterate through models cascade
        last_error = None
        for model_name in self.models_cascade:
            try:
                response = self.client.models.generate_content(
                    model=model_name,
                    contents=contents,
                    config=config,
                )

                # Extract text cleanly across response parts
                reply_text = ""
                if hasattr(response, "candidates") and response.candidates:
                    for cand in response.candidates:
                        if hasattr(cand, "content") and cand.content and hasattr(cand.content, "parts"):
                            for part in cand.content.parts:
                                if hasattr(part, "text") and part.text:
                                    reply_text += part.text
                
                if not reply_text and hasattr(response, "text") and response.text:
                    reply_text = str(response.text)

                if reply_text:
                    reply_text = reply_text.strip()

                if reply_text:
                    return {
                        "reply": reply_text,
                        "model_used": model_name,
                        "source_context_used": True,
                        "status": "ok",
                    }
            except Exception as e:
                logger.warning(f"Gemini model '{model_name}' failed: {e}. Trying next model in cascade...")
                last_error = e
                continue

        logger.error(f"All Gemini models in cascade failed. Last error: {last_error}")
        return {
            "reply": self._fallback_chat(message, analysis_data, weather_data),
            "model_used": "AgroVision Agronomic Engine",
            "source_context_used": True,
            "status": "fallback",
        }

    def _fallback_chat(
        self,
        message: str,
        analysis_data: Optional[Dict[str, Any]],
        weather_data: Optional[Dict[str, Any]]
    ) -> str:
        """
        Comprehensive semantic rule-grounded fallback when Gemini API is offline or quota-limited.
        Answers the exact specific question asked without repeating identical static responses.
        """
        q = message.lower().strip()

        visual = analysis_data.get("visual_assessment", {}) if analysis_data else {}
        top_class = visual.get("class") or visual.get("predicted_class", "Healthy")
        conf_val = visual.get("confidence", 0.95)
        conf_pct = f"{conf_val*100:.1f}%" if conf_val <= 1.0 else f"{conf_val:.1f}%"
        
        env = analysis_data.get("environmental_assessment", {}) if analysis_data else {}
        severity = env.get("severity") or env.get("predicted_severity", "Low")
        
        env_inputs = analysis_data.get("environmental_inputs", {}) if analysis_data else {}
        temp = env_inputs.get("temperature") or weather_data.get("current", {}).get("temperature_c") or 31.0
        hum = env_inputs.get("humidity") or weather_data.get("current", {}).get("humidity_percent") or 65
        soil_m = env_inputs.get("soil_moisture", 68)
        rain = env_inputs.get("rainfall", 0.0)
        aqi = env_inputs.get("aqi", 50)
        ozone = env_inputs.get("ozone", 35)

        veto = analysis_data.get("expert_veto", {}) if analysis_data else {}
        rules = veto.get("triggered_rules", [])
        rules_status = veto.get("overall_status", "Normal Baseline")

        # 1. Soil Moisture Questions
        if "soil moisture" in q or "moisture level" in q or "soil water" in q:
            return (
                f"### 💧 Understanding Soil Moisture in Cotton Farming\n\n"
                f"**Soil moisture** is the volume of water held in the pore spaces between soil particles in the root zone. "
                f"For cotton crops, maintaining optimal root-zone moisture (typically **55%–75% of field capacity** or 0.20–0.35 m³/m³) is vital to prevent square shedding and support nutrient uptake.\n\n"
                f"- **Current Reading:** {soil_m}% (Source: Manual Field Input / Capacitance Sensor)\n"
                f"- **Agronomic Impact:** In deep black clay soils (Vertisols), over-saturation (>85%) causes root hypoxia, while severe depletion (<40%) stalls boll development.\n"
                f"- **Field Action:** Dig a 15–30 cm soil profile check; soil should form a pliable ball without squeezing free water."
            )

        # 2. CNN / Leaf Scanner Questions
        if "cnn" in q or "convolutional" in q or "visual model" in q or "image model" in q or "scanner" in q:
            return (
                f"### 🍃 How the Leaf Scanner Works\n\n"
                f"The leaf scanner acts like an automated agronomist. It examines your leaf photograph by looking closely at:\n\n"
                f"1. **Leaf Color & Surface:** Looks for healthy green tone, yellow patches, or dark marks.\n"
                f"2. **Vein Patterns:** Checks if yellowing is between veins (nutrient issues) or across the whole leaf.\n"
                f"3. **Leaf Shape & Edges:** Identifies wilting, inward curling, or dry scorched margins.\n\n"
                f"*In your latest scan, the diagnosis is **{top_class}** ({conf_pct} confidence).*"
            )

        # 3. SNN / Field Climate Questions
        if "snn" in q or "spiking" in q or "neuromorphic" in q or "climate model" in q:
            return (
                f"### ⛅ How Field Climate Analysis Works\n\n"
                f"The climate analyzer continuously evaluates the physical weather in your field:\n\n"
                f"1. **Weather Factors:** Looks at air temperature ({temp}°C), air humidity ({hum}%), rainfall ({rain} mm), and root-zone soil moisture ({soil_m}%).\n"
                f"2. **Crop Stress Score:** Determines whether these weather conditions create stress for cotton plants.\n\n"
                f"*Your current field weather stress is rated at **{severity} Risk**.*"
            )

        # 4. Temperature & Thermal Stress Questions
        if "temperature" in q or "heat" in q or "hot weather" in q or "thermal" in q:
            return (
                f"### ☀️ Temperature Impact on Your Cotton Crop\n\n"
                f"- **Ideal Growing Range:** 28°C–32°C during vegetative growth and flowering.\n"
                f"- **Current Reading:** **{temp}°C** (Observed Field Temperature).\n"
                f"- **High Heat Warning (>35°C):** High temperatures cause plants to lose water quickly and can lead to flower shedding.\n\n"
                f"**Farmer Tip:** Avoid spraying pesticides or foliar fertilizers during the hottest afternoon hours to prevent leaf burn."
            )

        # 5. Humidity Questions
        if "humidity" in q or "rh" in q or "moisture in air" in q:
            return (
                f"### 🌫️ Air Humidity in Your Field\n\n"
                f"- **Current Humidity:** **{hum}%**\n"
                f"- **High Humidity (>80%):** Can encourage fungal spots and leaf mildew if temperatures are warm.\n"
                f"- **Low Humidity (<40%):** Dries out the soil and crop canopy faster.\n\n"
                f"**Farmer Tip:** Check the underside of leaves for moisture buildup during very humid mornings."
            )

        # 6. Rainfall & Forecast Questions
        if "rain" in q or "rainfall" in q or "precipitation" in q or "weather forecast" in q:
            if weather_data:
                curr = weather_data.get("current", {})
                fore = weather_data.get("forecast", {})
                return (
                    f"### 🌧️ Rainfall & Weather Outlook\n\n"
                    f"- **Observed Rain Today:** {rain} mm\n"
                    f"- **Current Condition:** {curr.get('weather_condition', 'Clear')} ({curr.get('weather_description', 'clear sky')})\n"
                    f"- **Next 24h Rain Chance:** {float(fore.get('rain_probability', 0.0))*100:.0f}% ({fore.get('next_24h_rainfall_mm', 0.0)} mm expected)\n"
                    f"- **Forecast Summary:** {fore.get('summary', 'Stable conditions')}\n\n"
                    f"**Farmer Tip:** If rain is expected within 24 hours, hold off on spraying foliar fertilizers or pesticides so they do not wash off."
                )
            return (
                f"### 🌧️ Rainfall & Field Water Balance\n\n"
                f"Cotton requires consistent moisture throughout flowering and boll formation. Ensure drainage channels are clear to prevent waterlogging during heavy rains."
            )

        # 7. Air Quality, Ozone & Pollution Questions
        if "aqi" in q or "ozone" in q or "pollution" in q or "air quality" in q or "smoke" in q:
            return (
                f"### 🏭 Air Quality in Your Field\n\n"
                f"- **Current Air Quality:** AQI **{aqi}** | Ozone: **{ozone} ppb**\n"
                f"- **Impact on Leaves:** Dust and smoke settle on leaf surfaces, reducing light absorption and slowing down plant growth.\n\n"
                f"**Farmer Tip:** Overhead sprinkling or rain will wash dusty leaves and help the plants breathe and photosynthesize better."
            )

        # 8. Why did I get this result / Explanation of Diagnosis
        if "why" in q or "result" in q or "explain" in q or "diagnosis" in q or "what does this mean" in q or "scan" in q:
            action_text = "Ensure steady watering and inspect 10-15 plants across your field."
            if "water" in top_class.lower():
                action_text = "Check soil moisture 6-12 inches deep. Irrigate in early morning hours (6 AM - 9 AM) to replenish roots."
            elif "heat" in top_class.lower():
                action_text = "Keep soil damp to help plants cool down. Avoid any midday spraying."
            elif "nutrient" in top_class.lower():
                action_text = "Inspect yellowing on lower vs upper leaves. Apply a morning foliar spray of 19:19:19 (5g/L) or chelated micronutrients."
            elif "pollution" in top_class.lower():
                action_text = "Wash dust off leaf canopies with clean water and inspect for pests under leaves."

            return (
                f"### 📋 Scan Summary for Your Field\n\n"
                f"**1. What Your Leaf Scan Shows:**\n"
                f"Your leaf scan indicates **{top_class}** with **{conf_pct}** confidence based on the visual condition of the leaf.\n\n"
                f"**2. Current Field Conditions:**\n"
                f"Your field weather shows **{severity} Risk** (Temperature: {temp}°C, Air Humidity: {hum}%, Soil Moisture: {soil_m}%).\n\n"
                f"**3. Action Steps for Today:**\n"
                f"- **Field check:** Walk your rows and check 10–15 plants to see if the symptom is isolated or widespread.\n"
                f"- **Action:** {action_text}\n"
                f"- **Track Progress:** Re-scan a leaf in 3–5 days to observe improvement."
            )

        # 9. Next Steps / Field Verification Checklist
        if "next" in q or "check" in q or "inspect" in q or "what should i do" in q or "action" in q or "steps" in q:
            return (
                f"### 🚜 Action Steps for Your Field Today\n\n"
                f"Based on your diagnosis (**{top_class}** with **{severity}** weather risk):\n\n"
                f"1. **Check Soil Moisture**: Dig 6 to 12 inches deep near the crop roots; feel whether the soil is dry and crumbly or moist.\n"
                f"2. **Field Walk**: Inspect 15–20 plants diagonally across your field to verify if symptoms are in specific rows or widespread.\n"
                f"3. **Irrigation Timing**: If watering, irrigate during the cool morning hours (6:00 AM – 9:00 AM) to minimize evaporation.\n"
                f"4. **Pest Inspection**: Turn over 5–10 leaves to check for sucking pests like aphids, jassids, or whiteflies.\n"
                f"5. **Re-scan in 3–5 Days**: Take another photo in a few days to track crop health."
            )

        # 10. Irrigation & Water Management
        if "irrigation" in q or "water management" in q or "watering" in q or "drip" in q:
            return (
                f"### 💧 Watering & Irrigation Advice\n\n"
                f"- **Soil Moisture Reading:** {soil_m}% | **Temperature:** {temp}°C\n\n"
                f"1. **Best Time to Water:** Irrigate in early morning (6:00 AM – 9:00 AM) or late evening. Avoid watering during midday heat.\n"
                f"2. **Check Drip Lines:** Walk your drip lines to make sure nozzles and emitters are not blocked.\n"
                f"3. **Critical Flowering Stage:** Cotton needs steady root moisture during flowering and boll formation to prevent square dropping."
            )

        # 11. Fertilizer & Nutrition
        if "fertilizer" in q or "nutrient" in q or "nitrogen" in q or "urea" in q or "npk" in q or "potassium" in q:
            return (
                f"### 🧪 Practical Crop Nutrition Tips\n\n"
                f"1. **Morning Foliar Spray:** Apply **19:19:19 (5g per liter of water)** or **1% Potassium Nitrate** early in the morning for quick absorption.\n"
                f"2. **Nitrogen Timing:** Apply Nitrogen in split doses—do not apply all at once to avoid excessive leafy growth.\n"
                f"3. **Micronutrients:** If leaves show yellowing between green veins, spray **chelated Zinc or Magnesium sulphate** in the morning."
            )

        # 12. Pest & Insect Management
        if "pest" in q or "insect" in q or "bollworm" in q or "aphid" in q or "thrip" in q or "whitefly" in q:
            return (
                f"### 🐛 Pest Management Tips\n\n"
                f"1. **Sticky Traps:** Place yellow and blue sticky traps (8–10 per acre) above crop height to monitor and catch sucking pests.\n"
                f"2. **Natural Neem Spray:** If early pests appear, spray **Neem oil (5 ml per liter of water)** in late afternoon.\n"
                f"3. **Pheromone Traps:** Set up 4–5 pheromone traps per acre to check for bollworm moths early."
            )

        # 13. General Catch-All
        return (
            f"### 🌿 AgroVision Farm Guidance\n\n"
            f"Regarding your question **\"{message}\"**:\n\n"
            f"- **Your Crop Status:** **{top_class}** ({severity} Weather Risk)\n"
            f"- **Field Conditions:** Temperature {temp}°C · Humidity {hum}% · Soil Moisture {soil_m}%\n\n"
            f"**Recommendation:** Check your soil moisture 6 inches deep and scout 10–15 plants in your field. If you notice persistent stress, consult your local agricultural extension officer (KVK) for advice."
        )
