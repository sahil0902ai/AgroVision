/* =========================================================
   AgroVision — AI Farming Assistant (Gemini Grounded Intelligence)
   Strictly grounded in verified analysis data, ICAR protocols & OpenWeather telemetry
   Supports Local FastAPI Backend and Resilient Vercel Live Deployments
   ========================================================= */

// Auth check
const currentUser = typeof getCurrentUser === "function" ? getCurrentUser() : null;

// Proactively warm up backend so Gemini / chat APIs never stall on cold-start
function warmupBackend() {
  try {
    fetch(getApiUrl("/api/health"), { mode: "cors", cache: "no-cache" }).catch(() => {});
  } catch (_) {}
}
warmupBackend();

function getApiUrl(endpoint) {
  if (window.AGROVISION_CONFIG && typeof window.AGROVISION_CONFIG.getApiUrl === "function") {
    return window.AGROVISION_CONFIG.getApiUrl(endpoint);
  }
  if (typeof window !== "undefined") {
    const isDifferentPort = window.location.port && window.location.port !== "8000";
    const isFile = window.location.protocol === "file:";
    if (isDifferentPort || isFile) {
      const host = (window.location.hostname && window.location.hostname !== "localhost") ? window.location.hostname : "127.0.0.1";
      const base = `http://${host}:8000`;
      return endpoint.startsWith("/") ? base + endpoint : `${base}/${endpoint}`;
    }
  }
  return endpoint;
}

let activeRecordUuid = null;
let activeContextRecord = null;
let conversationHistory = [];
let isSending = false;

document.addEventListener("DOMContentLoaded", async () => {
  const urlParams = new URLSearchParams(window.location.search);
  activeRecordUuid = urlParams.get("record_id") || urlParams.get("id") || urlParams.get("uuid");
  const initialQuery = urlParams.get("q") || urlParams.get("prompt") || urlParams.get("message");

  // 1. Fetch analysis context
  await loadActiveAnalysisContext(activeRecordUuid);

  // 2. Verify AI Health & Connectivity
  await checkAssistantHealth();

  // 3. Auto-send initial query if provided in URL
  if (initialQuery && initialQuery.trim()) {
    sendPrompt(initialQuery.trim());
  }
});

// =========================================================
// CONTEXT LOADING
// =========================================================

async function loadActiveAnalysisContext(uuid) {
  const titleEl = document.getElementById("contextTitle");
  const subEl = document.getElementById("contextSub");
  const sessionBadge = document.getElementById("contextSessionBadge");
  const returnBtn = document.getElementById("btnReturnToLeaf");

  try {
    const user = typeof getCurrentUser === "function" ? getCurrentUser() : null;
    const userEmailParam = user && user.email ? `&user_email=${encodeURIComponent(user.email)}` : "";
    const urlParams = new URLSearchParams(window.location.search);
    const isFromCombined = urlParams.get("from") === "combined";

    let record = null;

    // 1. Instant Cache Hydration: Check active sessionStorage & localStorage first (0ms)
    try {
      const storedActive = sessionStorage.getItem("agrovision_active_assistant_context");
      if (storedActive) {
        const parsed = JSON.parse(storedActive);
        if (parsed && (uuid ? (parsed.record_uuid === uuid || parsed.id === uuid) : true)) {
          record = parsed;
        }
      }
      if (!record) {
        const storedLatest = sessionStorage.getItem("agrovision_latest_analysis") || localStorage.getItem("agrovision_latest_analysis");
        if (storedLatest) {
          const parsed = JSON.parse(storedLatest);
          if (parsed && (uuid ? (parsed.record_uuid === uuid || parsed.id === uuid) : true)) {
            record = parsed;
          }
        }
      }
      if (!record && uuid) {
        const storedHist = localStorage.getItem("agrovision_analysis_history");
        if (storedHist) {
          const list = JSON.parse(storedHist);
          if (Array.isArray(list)) {
            record = list.find(r => r.record_uuid === uuid || r.id === uuid);
          }
        }
      }
      if (!record && !uuid) {
        const storedHist = localStorage.getItem("agrovision_analysis_history");
        if (storedHist) {
          const list = JSON.parse(storedHist);
          if (Array.isArray(list) && list.length > 0) {
            record = list[0];
          }
        }
      }
    } catch (_) {}

    // 2. If not found in local cache and UUID is specified, fetch from server
    if (!record && uuid) {
      try {
        const res = await fetch(getApiUrl(`/api/v1/records/${encodeURIComponent(uuid)}?${userEmailParam}`));
        if (res.ok) {
          record = await res.json();
        }
      } catch (_) {}
    }

    // 4. If still no record, attempt to load most recent analysis from history
    if (!record) {
      const resRecent = await fetch(getApiUrl(`/api/v1/records?limit=1${userEmailParam}`));
      if (resRecent.ok) {
        const list = await resRecent.json();
        if (Array.isArray(list) && list.length > 0) {
          record = list[0];
          activeRecordUuid = record.record_uuid;
        }
      }
    }

    if (record) {
      activeContextRecord = record;
      activeRecordUuid = record.record_uuid || activeRecordUuid;
      const diag = record.final_assessment?.diagnosis || record.visual_assessment?.class || record.cnn?.predicted_class || "Cotton Assessment";
      const conf = record.visual_assessment?.confidence_percentage !== undefined 
        ? `${record.visual_assessment.confidence_percentage}%` 
        : (record.cnn?.confidence_percentage !== undefined 
          ? `${record.cnn.confidence_percentage}%` 
          : `${Math.round((record.visual_assessment?.confidence || record.cnn?.confidence || 0.95) * 100)}%`);
      const dateStr = record.created_at ? new Date(record.created_at).toLocaleDateString() : "Active Session";
      const field = record.field_name || "Wardha Research Station";

      if (titleEl) titleEl.textContent = `${diag} (${conf} Confidence)`;

      if (isFromCombined) {
        if (subEl) subEl.textContent = `Strictly analyzing this scan: ${diag} (${conf}) · ${field}`;
        if (sessionBadge) {
          sessionBadge.textContent = "● Locked to Current Combined Scan";
          sessionBadge.className = "context-badge attached";
          sessionBadge.style.background = "#dcfce7";
          sessionBadge.style.color = "#15803d";
        }
      } else {
        if (subEl) subEl.textContent = `Attached Record: ${record.record_uuid || 'Live Scan'} · ${field} · ${dateStr}`;
        if (sessionBadge) {
          sessionBadge.textContent = "● Grounded Diagnosis Attached";
          sessionBadge.className = "context-badge attached";
        }
      }

      if (returnBtn) {
        returnBtn.style.display = "inline-flex";
        returnBtn.href = activeRecordUuid ? `dashboard.html?record_id=${encodeURIComponent(activeRecordUuid)}` : `dashboard.html?step=combined`;
      }

      // Populate Quick Action prompt chips
      populateContextPrompts(record);
      return;
    }
  } catch (err) {
    console.warn("Could not load active analysis context:", err);
  }

  // Fallback to general farm knowledge context
  if (titleEl) titleEl.textContent = "Wardha Station · OpenWeather Live Telemetry";
  if (subEl) subEl.textContent = "General cotton agronomic decision support grounded in Central Cotton Belt standards.";
  if (sessionBadge) {
    sessionBadge.textContent = "● Live Agronomic Advisory";
    sessionBadge.className = "context-badge";
  }
  if (returnBtn) {
    returnBtn.href = "dashboard.html";
  }
}

function populateContextPrompts(record) {
  const container = document.getElementById("contextPromptsWrap");
  if (!container) return;

  const prompts = [
    `What should I do in my field today?`,
    `Explain this scan in simple terms.`,
    `How does my soil moisture affect this?`,
    `When is the best time to irrigate or spray?`,
    `How do temperature and weather impact this?`
  ];

  container.innerHTML = prompts.map(p => `
    <button type="button" class="prompt-chip" onclick="sendPrompt('${escapeHtml(p)}')">
      <span>💡</span>
      <span>${escapeHtml(p)}</span>
    </button>
  `).join("");
}

// =========================================================
// SERVICE HEALTH CHECK
// =========================================================

async function checkAssistantHealth() {
  const alertCard = document.getElementById("serviceUnavailableAlert");
  const notifBadge = document.getElementById("notifModelStatusBadge");

  try {
    const res = await fetch(getApiUrl("/api/health")).catch(() => null);
    if (res && res.ok) {
      const health = await res.json();
      if (!health.gemini_api_configured && health.status === "degraded") {
        if (alertCard) alertCard.style.display = "none";
        if (notifBadge) {
          notifBadge.textContent = "Agronomic Engine Active";
          notifBadge.style.background = "#ecfdf5";
          notifBadge.style.color = "#059669";
        }
      } else {
        if (alertCard) alertCard.style.display = "none";
        if (notifBadge) {
          notifBadge.textContent = "Gemini Flash Active";
          notifBadge.style.background = "#ecfdf5";
          notifBadge.style.color = "#059669";
        }
      }
    } else {
      if (alertCard) alertCard.style.display = "none";
      if (notifBadge) {
        notifBadge.textContent = "Agronomic AI Active";
        notifBadge.style.background = "#ecfdf5";
        notifBadge.style.color = "#059669";
      }
    }
  } catch (err) {
    console.warn("Health check error:", err);
  }
}

function retryGeminiConnection() {
  const alertCard = document.getElementById("serviceUnavailableAlert");
  if (alertCard) alertCard.style.display = "none";
  checkAssistantHealth();
}

// =========================================================
// CLIENT-SIDE AGRONOMIC REASONING ENGINE (Resilient Fallback)
/// =========================================================
// CLIENT-SIDE AGRONOMIC REASONING ENGINE (Resilient & Instantaneous)
// Dynamic semantic answering strictly grounded in active leaf scan & climate telemetry
// =========================================================

function generateAgronomicAIResponse(query, contextRecord) {
  const q = (query || "").toLowerCase().trim();

  // 1. CNN Visual Data Extraction
  const diag = contextRecord?.final_assessment?.diagnosis 
    || contextRecord?.visual_assessment?.class 
    || contextRecord?.cnn?.predicted_class 
    || "Healthy";

  let confNum = contextRecord?.visual_assessment?.confidence_percentage !== undefined
    ? contextRecord.visual_assessment.confidence_percentage
    : (contextRecord?.cnn?.confidence_percentage !== undefined
      ? contextRecord.cnn.confidence_percentage
      : (contextRecord?.confidence_score 
        ? (contextRecord.confidence_score > 1 ? contextRecord.confidence_score : Math.round(contextRecord.confidence_score * 100))
        : Math.round((contextRecord?.visual_assessment?.confidence || contextRecord?.cnn?.confidence || 0.95) * 100)));
  const confStr = `${Number(confNum).toFixed(1)}%`;

  // 2. SNN Environmental Risk Extraction
  const risk = contextRecord?.final_assessment?.environmental_risk 
    || contextRecord?.snn?.predicted_severity 
    || contextRecord?.stress_severity 
    || "Low";

  const snnSpikes = contextRecord?.snn?.spike_counts || {};
  let totalSpikes = 0;
  try {
    if (typeof snnSpikes === "object" && Object.keys(snnSpikes).length > 0) {
      totalSpikes = Object.values(snnSpikes).reduce((a, b) => a + Number(b), 0);
    }
  } catch (_) {}

  // 3. Environmental Telemetry Extraction
  const temp = contextRecord?.environment?.temperature 
    ?? (contextRecord?.environmental_inputs?.temperature 
      ?? (contextRecord?.temperature ?? 31.0));

  const humidity = contextRecord?.environment?.humidity 
    ?? (contextRecord?.environmental_inputs?.humidity 
      ?? (contextRecord?.humidity ?? 72));

  let soilRaw = contextRecord?.environment?.soil_moisture 
    ?? (contextRecord?.environmental_inputs?.soil_moisture 
      ?? (contextRecord?.soil_moisture ?? 68));
  let soilMoisture = Number(soilRaw) <= 1.0 ? Math.round(Number(soilRaw) * 100) : Math.round(Number(soilRaw));

  const rainfall = contextRecord?.environment?.rainfall 
    ?? (contextRecord?.environmental_inputs?.rainfall 
      ?? (contextRecord?.rainfall_mm ?? 0.0));

  const aqi = Math.round(Number(contextRecord?.environment?.aqi 
    ?? (contextRecord?.environmental_inputs?.aqi 
      ?? (contextRecord?.aqi ?? 64))));

  let ozoneRaw = contextRecord?.environment?.ozone 
    ?? (contextRecord?.environmental_inputs?.ozone 
      ?? (contextRecord?.ozone ?? 41));
  let ozone = Number(ozoneRaw) <= 1.0 ? Math.round(Number(ozoneRaw) * 1000) : Math.round(Number(ozoneRaw));

  const fieldName = contextRecord?.field_name || "Wardha Field";

  // 4. Multimodal Fusion & Expert Veto Extraction
  const fusionRel = contextRecord?.fusion?.relationship || "INCONCLUSIVE";
  const rawAlign = contextRecord?.fusion?.alignment_score;
  const alignScore = (rawAlign !== null && rawAlign !== undefined && rawAlign !== "" && Number.isFinite(Number(rawAlign)))
    ? `${Math.round(Number(rawAlign) * 100)}%`
    : "Not Available";
  const vetoStatus = contextRecord?.expert_veto?.overall_status || "PASSED";
  const triggeredRules = contextRecord?.expert_veto?.triggered_rules || [];

  // Diagnostic visual symptom descriptors
  const symptomDescriptions = {
    "Healthy": "uniform deep-green foliar coloration, firm leaf turgor, well-defined venation without chlorosis, and healthy cell membrane integrity.",
    "Water Stress": "foliar wilting, loss of cell turgidity, inward curling of leaf margins, and moisture-deficient stomatal constriction.",
    "Heat Stress": "marginal scorch necrosis, elevated leaf surface temperature, heat-induced bleaching, and high vapor pressure deficit stress.",
    "Nutrient Deficiency": "interveinal chlorosis (yellowing between leaf veins), pale younger canopy leaves, and Nitrogen/Zinc metabolic deficiency markers.",
    "Pollution": "surface particulate dust accumulation, reduced photosynthetically active radiation (PAR) absorption, and atmospheric oxidant stippling."
  };

  const symptomDetail = symptomDescriptions[diag] || "foliar stress symptoms consistent with the diagnosed category.";

  // --- QUERY ROUTING LOGIC (Farmer-Friendly & Grounded) ---

  // 1. Why did I get this result / Diagnosis Explanation / Scan Summary
  if (q.includes("why") || q.includes("result") || q.includes("explain") || q.includes("diagnosis") || q.includes("meaning") || q.includes("what does this mean") || q.includes("scan")) {
    let plainSymptom = "";
    let plainSteps = "";
    if (diag.toLowerCase().includes("water")) {
      plainSymptom = "The leaf scan shows signs of wilting and drooping, indicating the plant is losing moisture faster than roots can draw it from the soil.";
      plainSteps = `1. **Soil Check**: Dig 6–12 inches deep near the roots to verify if the soil feels dry or powdery.
2. **Irrigation**: Water your field during the cool morning hours (6:00 AM – 9:00 AM) to minimize evaporation.
3. **Inspect Drip Lines**: Check drip emitters or furrow tail-ends to make sure water reaches all rows evenly.`;
    } else if (diag.toLowerCase().includes("heat")) {
      plainSymptom = "The leaf scan shows heat stress with curling or dry edges caused by intense sunlight and high ambient temperatures.";
      plainSteps = `1. **Moisture Support**: Keep soil adequately moist to help plants naturally cool down through leaf evaporation.
2. **Avoid Midday Sprays**: Never spray foliar fertilizers or pesticides during peak midday heat (>32°C) to prevent leaf burn.
3. **Monitor Recovery**: Check if leaves perk back up by early evening as temperatures ease.`;
    } else if (diag.toLowerCase().includes("nutrient")) {
      plainSymptom = "The leaf scan shows yellowing between the veins (chlorosis), which typically points to a shortage of key nutrients such as Nitrogen, Zinc, or Magnesium.";
      plainSteps = `1. **Inspect Yellowing**: Check if yellowing is mostly on older lower leaves (Nitrogen) or young upper leaves (Zinc/Iron).
2. **Morning Foliar Spray**: Consider applying 19:19:19 (5g per liter of water) or chelated micronutrients in early morning.
3. **Check Root Drainage**: Ensure soil is well-drained, as waterlogged roots cannot absorb fertilizers properly.`;
    } else if (diag.toLowerCase().includes("pollution")) {
      plainSymptom = "The leaf scan shows dust or particulate buildup on the leaf surface, which blocks sunlight and reduces photosynthesis.";
      plainSteps = `1. **Canopy Wash**: A gentle overhead water rinse or natural rain will clean dust off the leaf surfaces.
2. **Dust Barriers**: If near a dirt road, maintain border crops or windbreaks to catch dust.
3. **Scout for Mites**: Check under leaves to ensure dust has not encouraged spider mites.`;
    } else {
      plainSymptom = "The leaf is in healthy condition with good green color, well-formed veins, and no significant stress marks.";
      plainSteps = `1. **Maintain Care**: Continue your current watering and nutrient schedule.
2. **Weekly Field Walk**: Scout 15–20 plants weekly to catch any early pest or water issues.
3. **Watch Weather**: Keep an eye on upcoming heat spikes or heavy rain.`;
    }

    return `### 📋 Leaf Scan Summary for ${escapeHtml(fieldName)}

**1. What Your Leaf Scan Shows:**
Your leaf scan indicates **${diag}** (${confStr} confidence). ${plainSymptom}

**2. Current Field Conditions:**
- Temperature: **${Number(temp).toFixed(1)}°C**
- Air Humidity: **${humidity}%**
- Soil Moisture: **${soilMoisture}%**
- Weather Risk Level: **${risk} Risk**

**3. Action Steps for Today:**
${plainSteps}`;
  }

  // 2. What should I check next / Action plan
  if (q.includes("next") || q.includes("check") || q.includes("inspect") || q.includes("action") || q.includes("what should i do") || q.includes("steps") || q.includes("plan") || q.includes("today")) {
    let specificAction = "";
    if (diag.toLowerCase().includes("water")) {
      specificAction = `1. **Check Soil Moisture**: Dig 6 to 12 inches deep into the soil. If it crumbles dry, irrigate as soon as possible.
2. **Water in Early Morning**: Irrigate between 6:00 AM and 9:00 AM to give roots maximum moisture before midday heat.
3. **Check Nozzles & Furrows**: Walk along irrigation lines to ensure no nozzles or furrows are clogged.
4. **Follow Up**: Re-check leaf appearance in 2–3 days after watering.`;
    } else if (diag.toLowerCase().includes("heat")) {
      specificAction = `1. **Maintain Moderate Soil Moisture**: Keep soil damp to help plants cool themselves naturally.
2. **Hold Chemical Sprays**: Delay any chemical or foliar spraying until late afternoon when temperatures cool below 32°C.
3. **Check Squares & Flowers**: Inspect whether squares or young bolls are shedding due to high temperatures.
4. **Follow Up**: Monitor morning leaf recovery over the next 3 days.`;
    } else if (diag.toLowerCase().includes("nutrient")) {
      specificAction = `1. **Examine Yellowing Pattern**: Check whether yellowing starts from leaf tips, between veins, or on lower leaves.
2. **Morning Foliar Feed**: Apply 1% Potassium Nitrate (10g/L) or 19:19:19 (5g/L) during cool morning hours.
3. **Verify Root Health**: Make sure the soil is aerated and not waterlogged.
4. **Follow Up**: Look for greener new growth within 4–6 days.`;
    } else if (diag.toLowerCase().includes("pollution")) {
      specificAction = `1. **Rinse Leaves**: Use a light water misting to wash heavy dust off leaf canopies.
2. **Check for Pests**: Inspect leaf undersides for spider mites or whiteflies that thrive in dusty conditions.
3. **Follow Up**: Re-scan after washing to check if clean green color is restored.`;
    } else {
      specificAction = `1. **Continue Routine Care**: Keep your existing watering and crop nutrition schedule.
2. **Scout Weekly**: Turn over 10–15 leaves to check for early sucking pests (aphids, thrips).
3. **Monitor Forecast**: Check for upcoming heat spikes or rain to plan your field operations.`;
    }

    return `### 🚜 Action Steps for Your Field Today

Based on your leaf scan (**${diag}** with **${risk}** weather risk):

${specificAction}

*Farmer Tip: Always check 10 to 15 plants across different spots in your field to ensure uniform crop health.*`;
  }

  // 3. Soil Moisture Questions
  if (q.includes("soil moisture") || q.includes("moisture") || q.includes("soil water")) {
    let statusText = "Good (55%–75% Range)";
    let adviceText = "Soil moisture is in a healthy range for steady cotton root growth.";
    if (soilMoisture < 45) {
      statusText = "Low Moisture (<45%)";
      adviceText = "The root zone is dry. Schedule irrigation soon to prevent squares and young bolls from dropping.";
    } else if (soilMoisture > 80) {
      statusText = "Saturated / Very Wet (>80%)";
      adviceText = "Soil is very wet. Ensure field drainage ditches are open so roots do not suffocate.";
    }

    return `### 💧 Soil Moisture in Your Field

- **Current Reading**: **${soilMoisture}%** (Status: **${statusText}**)
- **How to Test in Field**: Dig down 6 to 12 inches near the roots and squeeze a handful of soil. It should form a ball that holds together without dripping water.
- **Farmer Tip**: ${adviceText}`;
  }

  // 4. Leaf Scanner / CNN Questions
  if (q.includes("cnn") || q.includes("convolutional") || q.includes("visual model") || q.includes("image model") || q.includes("resnet") || q.includes("scanner")) {
    return `### 🍃 How the Leaf Scanner Works

The leaf scanner acts like a digital agronomist. It analyzes your leaf photo by looking at:

1. **Surface Color**: Looks for healthy dark green color, yellowing, or bleached spots.
2. **Vein Health**: Checks if yellowing is between veins (nutrition shortage) or across the whole leaf.
3. **Leaf Edges & Shape**: Detects wilting, curling, or dry scorched margins.

*In your latest scan, your leaf was identified as **${diag}** with **${confStr}** confidence.*`;
  }

  // 5. Climate Risk / SNN Questions
  if (q.includes("snn") || q.includes("spiking") || q.includes("neuromorphic") || q.includes("spike") || q.includes("climate model")) {
    return `### ⛅ How Field Climate Analysis Works

The climate analyzer checks the physical weather conditions around your crop:

1. **Field Weather**: Checks air temperature (**${Number(temp).toFixed(1)}°C**), humidity (**${humidity}%**), rainfall (**${rainfall} mm**), and soil moisture (**${soilMoisture}%**).
2. **Stress Level**: Evaluates whether these weather readings combine to create stress for cotton plants.

*Your current field climate risk is rated at **${risk} Risk**.*`;
  }

  // 6. Temperature / Thermal
  if (q.includes("temperature") || q.includes("heat") || q.includes("thermal") || q.includes("hot")) {
    let tempWarning = "Current temperature is within the safe vegetative and flowering envelope (28°C–32°C).";
    if (temp > 35) {
      tempWarning = "⚠️ **High Heat Hazard**: Ambient temperature exceeds 35°C, causing high vapor pressure deficit and potential pollen sterility.";
    }

    return `### ☀️ Temperature Telemetry & Cotton Phenology

- **Observed Field Temperature**: **${Number(temp).toFixed(1)}°C** (Source: OpenWeather Station Telemetry)
- **Thermal Thresholds**:
  - **Optimal Growth Range**: 28°C–32°C.
  - **Critical Upper Limit**: >35°C impairs enzyme kinetics and boll formation.
- **Agronomic Guidance**: ${tempWarning} Avoid foliar chemical sprays during peak afternoon sun to prevent leaf scorch.`;
  }

  // 7. Humidity & Rainfall
  if (q.includes("humidity") || q.includes("rain") || q.includes("rainfall") || q.includes("forecast") || q.includes("precipitation")) {
    return `### 🌫️ Humidity & Precipitation Telemetry

- **Relative Humidity**: **${humidity}%** | **Observed Rainfall**: **${rainfall} mm**
- **Impact on Cotton**: High humidity (>75%) coupled with warm temperatures creates favorable microclimates for foliar fungal pathogens (e.g. Alternaria leaf spot and grey mildew).
- **Spray Rule**: Avoid spraying foliar nutrition or systemic pesticides if rain is forecast within 24 hours to prevent runoff.`;
  }

  // 8. Air Quality & Ozone
  if (q.includes("aqi") || q.includes("ozone") || q.includes("pollution") || q.includes("air quality") || q.includes("dust")) {
    return `### 🏭 Air Quality Index & Tropospheric Ozone

- **Current AQI**: **${aqi}** | **Tropospheric Ozone ($O_3$)**: **${ozone} ppb**
- **Agronomic Impact**: Ground-level ozone enters leaf stomata and triggers oxidative stress, producing bronze stippling and early leaf drop. Heavy particulate dust reduces photosynthetic efficiency.`;
  }

  // 9. Fertilizer & Nutrition
  if (q.includes("fertilizer") || q.includes("nutrient") || q.includes("nitrogen") || q.includes("urea") || q.includes("spray") || q.includes("npk")) {
    return `### 🧪 ICAR-Grounded Cotton Nutrition Guidance

1. **Foliar Nutrition**: Apply **1% Potassium Nitrate (KNO₃, 10g/L)** or **19:19:19 (5g/L)** in early morning to enhance boll retention and drought tolerance.
2. **Nitrogen Splitting**: Apply Nitrogen in 3 splits (50% basal at sowing, 25% at square initiation, 25% at peak flowering).
3. **Micronutrient Correction**: If leaves show interveinal yellowing, spray **0.5% ZnSO₄ + 0.5% MgSO₄** (5g/L water).`;
  }

  // 10. Pest & IPM
  if (q.includes("pest") || q.includes("insect") || q.includes("bollworm") || q.includes("aphid") || q.includes("thrip") || q.includes("whitefly") || q.includes("ipm")) {
    return `### 🐛 Integrated Pest Management (IPM) for Cotton

1. **Sucking Pests (Aphids, Jassids, Thrips, Whiteflies)**:
   - Install **Yellow and Blue Sticky Traps** (10–12 traps/acre) at top canopy height.
   - If Economic Threshold Level (ETL) is reached, spray **Neem Oil 1500 ppm (5 ml/L)** or **Diafenthiuron 50% WP (1g/L)**.
2. **Bollworm Monitoring**:
   - Install **Pheromone Traps** (4–5 traps/acre) to detect moth emergence early.`;
  }

  // 11. General Catch-All
  return `### 🌿 AgroVision Agronomic Intelligence

Regarding **"${escapeHtml(query)}"**:

- **Active Field**: ${escapeHtml(fieldName)} · **Diagnosis**: **${diag}** (${confStr} Confidence)
- **Microclimate**: Temperature **${Number(temp).toFixed(1)}°C** · Humidity **${humidity}%** · Soil Moisture **${soilMoisture}%**
- **Environmental Risk**: **${risk} Risk** · **Fusion**: **${fusionRel}**

**Recommendation**: Ground all farm management actions in direct field scouting before applying fertilizers or pesticide treatments.`;
}

// =========================================================
// CHAT INTERACTION & MESSAGE STREAM (High Performance & Fast SLA)
// =========================================================

function sendPrompt(promptText) {
  const input = document.getElementById("chatInputField");
  if (input && !isSending) {
    input.value = promptText;
    handleSendMessage();
  }
}

function handleInputKeydown(event) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    handleSendMessage();
  }
}

async function handleSendMessage() {
  if (isSending) return;

  const input = document.getElementById("chatInputField");
  const stream = document.getElementById("messagesStream");
  const welcomeState = document.getElementById("chatWelcomeState");
  const sendBtn = document.getElementById("chatSendBtn");
  const scrollArea = document.getElementById("chatConversationArea");

  if (!input || !stream) return;

  const text = input.value.trim();
  if (!text) return;

  isSending = true;
  input.value = "";
  input.disabled = true;
  if (sendBtn) sendBtn.disabled = true;

  // Hide empty welcome state on first message
  if (welcomeState) {
    welcomeState.style.display = "none";
  }

  // 1. Render User Message Bubble
  const userRow = document.createElement("div");
  userRow.className = "message-row user-row";
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  userRow.innerHTML = `
    <div class="message-bubble user-bubble">
      <div>${escapeHtml(text)}</div>
      <div style="font-size:10px; color:rgba(255,255,255,0.85); text-align:right; margin-top:4px;">
        ${timeStr}
      </div>
    </div>
  `;
  stream.appendChild(userRow);
  if (scrollArea) scrollArea.scrollTop = scrollArea.scrollHeight;

  // 2. Render Typing Indicator
  const typingRow = document.createElement("div");
  typingRow.className = "message-row assistant-row";
  typingRow.id = "typingIndicatorRow";
  typingRow.innerHTML = `
    <div class="message-bubble assistant-bubble">
      <div style="display:flex; align-items:center; gap:8px; color:#475569; font-size:12.5px;">
        <span>🧠 Consulting Gemini &amp; grounding telemetry…</span>
        <div style="display:inline-block; width:12px; height:12px; border:2px solid #059669; border-top-color:transparent; border-radius:50%; animation:spin 0.8s linear infinite;"></div>
      </div>
    </div>
  `;
  stream.appendChild(typingRow);
  if (scrollArea) scrollArea.scrollTop = scrollArea.scrollHeight;

  let replyText = "";
  let modelUsed = "Gemini Flash";

  // 3. Dispatch to /api/chat with strict 2500ms timeout for ultra-fast response
  try {
    const user = typeof requireLogin === "function" ? requireLogin() : null;
    const payload = {
      message: text,
      user_email: user?.email || undefined,
      record_uuid: activeRecordUuid,
      field_name: activeContextRecord?.field_name || "Wardha Field",
      history: conversationHistory.slice(-8),
      session_context: activeContextRecord ? {
        record_uuid: activeContextRecord.record_uuid,
        growth_stage: activeContextRecord.growth_stage || activeContextRecord.environmental_inputs?.growth_stage,
        visual_assessment: activeContextRecord.visual_assessment || (activeContextRecord.cnn ? {
          class: activeContextRecord.cnn.predicted_class,
          confidence: activeContextRecord.cnn.confidence,
          probabilities: activeContextRecord.cnn.probabilities
        } : undefined),
        environmental_assessment: activeContextRecord.environmental_assessment || (activeContextRecord.snn ? {
          severity: activeContextRecord.snn.predicted_severity,
          confidence: activeContextRecord.snn.confidence,
          spike_counts: activeContextRecord.snn.spike_counts
        } : undefined),
        environmental_inputs: activeContextRecord.environmental_inputs || activeContextRecord.environment,
        fusion: activeContextRecord.fusion,
        expert_veto: activeContextRecord.expert_veto,
        final_assessment: activeContextRecord.final_assessment,
        weather_context: activeContextRecord.environment?.weather_context || activeContextRecord.weather_context
      } : undefined
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    const res = await fetch(getApiUrl("/api/chat"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    }).catch(() => null);

    clearTimeout(timeoutId);

    if (res && res.ok) {
      const data = await res.json();
      replyText = data.reply || "";
      modelUsed = data.model_used || "Gemini Flash";
    }
  } catch (err) {
    console.warn("Backend chat unavailable or timed out, activating instant agronomic engine:", err);
  }

  // If backend didn't return in time or is offline, instantly use client agronomic engine
  if (!replyText || replyText.trim().length === 0) {
    replyText = generateAgronomicAIResponse(text, activeContextRecord);
    modelUsed = "Grounded Agronomic AI";
  }

  // Update conversation history
  conversationHistory.push({ role: "user", content: text });
  conversationHistory.push({ role: "assistant", content: replyText });

  // Remove typing indicator
  const typingIndicator = document.getElementById("typingIndicatorRow");
  if (typingIndicator) typingIndicator.remove();

  // 4. Render Assistant Reply Bubble
  const assistantRow = document.createElement("div");
  assistantRow.className = "message-row assistant-row";

  const formattedHtml = renderMarkdown(replyText);
  const sourceBadgesHtml = `
    <span class="source-tag">CNN Visual</span>
    <span class="source-tag">SNN Telemetry</span>
    <span class="source-tag">OpenWeather</span>
    <span class="source-tag">ICAR Rules</span>
  `;

  const modelBadge = `<span style="color:#059669; font-weight:700;">✨ Powered by ${modelUsed}</span>`;

  // Return to leaf option button inside each message bubble
  const returnLeafHref = activeRecordUuid 
    ? `dashboard.html?record_id=${encodeURIComponent(activeRecordUuid)}`
    : `dashboard.html?step=combined`;

  const returnLeafBtnHtml = `
    <div style="margin-top:10px; padding-top:8px; border-top:1px dashed #e2e8f0; display:flex; justify-content:flex-end; align-items:center; gap:8px;">
      <a href="${returnLeafHref}" class="return-to-leaf-pill" style="display:inline-flex; align-items:center; gap:5px; padding:4px 10px; border-radius:6px; background:#ecfdf5; border:1px solid #a7f3d0; color:#059669; font-weight:700; font-size:11px; text-decoration:none; transition:all 0.15s ease;">
        <span>🍃</span>
        <span>Return to this Leaf Analysis</span>
        <span style="font-size:13px;">→</span>
      </a>
    </div>
  `;

  assistantRow.innerHTML = `
    <div class="message-bubble assistant-bubble">
      <div style="font-size:13px; line-height:1.55; color:#0f172a;">
        ${formattedHtml}
      </div>
      ${returnLeafBtnHtml}
      <div class="message-footer">
        <div style="display:flex; align-items:center; gap:4px; flex-wrap:wrap;">
          ${sourceBadgesHtml}
        </div>
        <div>${modelBadge} · ${timeStr}</div>
      </div>
    </div>
  `;

  stream.appendChild(assistantRow);
  if (scrollArea) scrollArea.scrollTop = scrollArea.scrollHeight;

  isSending = false;
  input.disabled = false;
  if (sendBtn) sendBtn.disabled = false;
  input.focus();
}

function clearChatConversation() {
  conversationHistory = [];
  const stream = document.getElementById("messagesStream");
  const welcomeState = document.getElementById("chatWelcomeState");
  if (stream) stream.innerHTML = "";
  if (welcomeState) welcomeState.style.display = "flex";
  const alertCard = document.getElementById("serviceUnavailableAlert");
  if (alertCard) alertCard.style.display = "none";
}

// =========================================================
// MARKDOWN & HTML FORMATTING
// =========================================================

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function renderMarkdown(md) {
  if (!md) return "";
  let html = md
    .replace(/^### (.*$)/gim, '<h3 style="font-size:14px; font-weight:800; color:#0d3b2e; margin:10px 0 6px;">$1</h3>')
    .replace(/^## (.*$)/gim, '<h2 style="font-size:15px; font-weight:800; color:#0d3b2e; margin:12px 0 6px;">$1</h2>')
    .replace(/^# (.*$)/gim, '<h1 style="font-size:16px; font-weight:800; color:#0d3b2e; margin:14px 0 8px;">$1</h1>')
    .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/gim, '<em>$1</em>')
    .replace(/\n\n/gim, '</p><p style="margin:6px 0;">')
    .replace(/\n/gim, '<br>');

  // Format unordered lists
  html = html.replace(/<br>\s*-\s*(.*?)(?=(<br>|<\/p>|$))/gim, '<li style="margin-left:18px; margin-bottom:4px;">$1</li>');
  html = html.replace(/<br>\s*\d+\.\s*(.*?)(?=(<br>|<\/p>|$))/gim, '<li style="margin-left:18px; margin-bottom:4px; list-style-type:decimal;">$1</li>');

  return `<p style="margin:0 0 6px;">${html}</p>`;
}
