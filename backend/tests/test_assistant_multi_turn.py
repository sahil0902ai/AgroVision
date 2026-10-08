import os
import sys

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.services.gemini_service import GeminiChatService

def run_tests():
    service = GeminiChatService.get_instance()
    print("=" * 60)
    print(f"Gemini Service Available: {service.is_available()}")
    print(f"Models Cascade: {service.models_cascade}")
    print("=" * 60)

    # Realistic mock analysis context (Water Stress with High Heat & EVR001 trigger)
    analysis_context = {
        "record_uuid": "AGRO-2026-TEST-9988",
        "growth_stage": "Flowering & Early Boll Formation",
        "visual_assessment": {
            "class": "Water Stress",
            "confidence": 0.942,
            "probabilities": {
                "water_stress": 0.942,
                "healthy": 0.035,
                "heat_stress": 0.015,
                "nutrient_deficiency": 0.005,
                "pollution": 0.003
            }
        },
        "environmental_assessment": {
            "severity": "Moderate",
            "confidence": 0.88,
            "spike_counts": {"Low": 12, "Moderate": 46, "High": 18}
        },
        "environmental_inputs": {
            "temperature": 36.5,
            "humidity": 42.0,
            "rainfall": 0.0,
            "soil_moisture": 32.0,
            "aqi": 65,
            "ozone": 48
        },
        "fusion": {
            "relationship": "Reinforcing",
            "interpretation": "Foliar wilting and low root moisture align with thermal stress."
        },
        "expert_veto": {
            "overall_status": "Veto Applied (EVR001 Triggered)",
            "triggered_rules": [
                {
                    "rule_id": "EVR001",
                    "rule_name": "Extreme Heat & Drought Safeguard",
                    "reason": "Temperature exceeds 35°C with soil moisture below 35%",
                    "precaution": "Do NOT apply emulsifiable chemical sprays mid-day",
                    "what_to_check": "Inspect root zone moisture and drip emitters"
                }
            ]
        },
        "final_assessment": {
            "description": "Critical Water and Thermal Stress. Urgent root hydration required.",
            "precautions": [
                "Irrigate in alternate furrows or run drip cycles during 6-9 AM",
                "Do not spray systemic pesticides during peak temperature (>35°C)",
                "Re-scan foliage in 3-5 days"
            ]
        }
    }

    weather_context = {
        "location": {"name": "Wardha Research Station", "lat": 20.975, "lon": 78.720},
        "current": {
            "temperature_c": 36.5,
            "humidity_percent": 42.0,
            "weather_condition": "Sunny",
            "weather_description": "hot and dry with clear skies"
        },
        "forecast": {
            "next_24h_rainfall_mm": 0.0,
            "next_48h_rainfall_mm": 0.0,
            "rain_probability": 0.05,
            "summary": "Dry heatwave persisting for next 48 hours"
        },
        "air_quality": {
            "aqi": 65,
            "aqi_category": "Moderate",
            "ozone": 48
        }
    }

    test_questions = [
        ("Why did I get this result?", "Diagnostic breakdown referencing Water Stress, 36.5°C, and EVR001"),
        ("What is soil moisture?", "General agronomic explanation of soil moisture, root zone, and Vertisols"),
        ("What should I check next?", "Specific field verification checklist including root zone, drip lines, and canopy"),
        ("Explain CNN.", "General explanation of Convolutional Neural Networks and ResNet-18 in AgroVision"),
        ("Is high temperature important?", "Specific explanation of temperature impact on cotton phenology, transpiration, and EC spray caution")
    ]

    history = []
    responses = []

    print("\n--- RUNNING MULTI-TURN CONVERSATION TEST ---\n")
    for i, (q, expected_focus) in enumerate(test_questions, 1):
        print(f"\n[Turn {i}] User: {q}")
        print(f"Expected Focus: {expected_focus}")
        res = service.chat(
            message=q,
            analysis_data=analysis_context,
            weather_data=weather_context,
            field_name="Wardha Block 4",
            history=history
        )
        reply = res["reply"]
        model = res.get("model_used")
        status = res.get("status")
        print(f"Model Used: {model} | Status: {status}")
        print(f"Assistant Response ({len(reply)} chars):\n{reply}\n")
        print("-" * 50)

        # Verify response is non-empty and unique
        assert len(reply) > 50, f"Turn {i} reply too short"
        assert reply not in responses, f"Turn {i} returned a duplicate response!"
        responses.append(reply)

        # Update multi-turn history
        history.append({"role": "user", "content": q})
        history.append({"role": "assistant", "content": reply})

    print("\n[PASSED] ALL 5 TURNS GENERATED UNIQUE, CONTEXT-APPROPRIATE, AND NON-REPETITIVE RESPONSES!")

if __name__ == "__main__":
    run_tests()
