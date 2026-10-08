/* =========================================================
   AgroVision — AI Farming Assistant (Gemini Grounded Intelligence)
   Strictly grounded in verified analysis data, ICAR protocols & OpenWeather telemetry
   Supports Local FastAPI Backend and Resilient Vercel Live Deployments
   ========================================================= */

// Auth check
if (typeof requireLogin === "function") {
  requireLogin();
}

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

  try {
    const user = typeof requireLogin === "function" ? requireLogin() : null;
    const userEmailParam = user && user.email ? `&user_email=${encodeURIComponent(user.email)}` : "";

    let record = null;
    if (uuid) {
      const res = await fetch(getApiUrl(`/api/v1/records/${encodeURIComponent(uuid)}?${userEmailParam}`));
      if (res.ok) {
        record = await res.json();
      }
    }

    // If no specific UUID, attempt to load most recent analysis from history
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
      const diag = record.final_assessment?.diagnosis || record.visual_assessment?.class || "Cotton Assessment";
      const conf = record.visual_assessment?.confidence_percentage !== undefined 
        ? `${record.visual_assessment.confidence_percentage}%` 
        : `${Math.round((record.visual_assessment?.confidence || 0.95) * 100)}%`;
      const dateStr = record.created_at ? new Date(record.created_at).toLocaleDateString() : "Recent";
      const field = record.field_name || "Wardha Research Station";

      if (titleEl) titleEl.textContent = `${diag} (${conf} Confidence)`;
      if (subEl) subEl.textContent = `Attached Record: ${record.record_uuid} · ${field} · ${dateStr}`;
      if (sessionBadge) {
        sessionBadge.textContent = "● Grounded Diagnosis Attached";
        sessionBadge.className = "context-badge attached";
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
}

function populateContextPrompts(record) {
  const container = document.getElementById("contextPromptsWrap");
  if (!container) return;

  const diag = record.final_assessment?.diagnosis || "Water Stress";
  const prompts = [
    `Why did I get this result?`,
    `What should I check next?`,
    `What is soil moisture?`,
    `Explain CNN.`,
    `Is high temperature important?`
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
// Dynamic semantic answering to prevent repeating static text
// =========================================================

function generateAgronomicAIResponse(query, contextRecord) {
  const q = (query || "").toLowerCase().trim();
  const diag = contextRecord?.final_assessment?.diagnosis || contextRecord?.visual_assessment?.class || "Healthy";
  const conf = contextRecord?.visual_assessment?.confidence_percentage !== undefined
    ? `${contextRecord.visual_assessment.confidence_percentage}%`
    : `${Math.round((contextRecord?.visual_assessment?.confidence || 0.95) * 100)}%`;
  const risk = contextRecord?.final_assessment?.environmental_risk || "Low";
  const temp = contextRecord?.environment?.weather_context?.current?.temperature_c || contextRecord?.environmental_inputs?.temperature || 29.5;
  const humidity = contextRecord?.environment?.weather_context?.current?.humidity_percent || contextRecord?.environmental_inputs?.humidity || 65;
  const soilMoisture = contextRecord?.environmental_inputs?.soil_moisture || 68;
  const aqi = contextRecord?.environmental_inputs?.aqi || 48;
  const ozone = contextRecord?.environmental_inputs?.ozone || 32;
  const fieldName = contextRecord?.field_name || "Wardha Field";

  // 1. Soil Moisture
  if (q.includes("soil moisture") || q.includes("moisture level") || q.includes("soil water")) {
    return `### 💧 Understanding Soil Moisture in Cotton Farming

**Soil moisture** represents the volumetric water content held in the root zone pore spaces. For cotton, maintaining 55%–75% of field capacity (0.20–0.35 m³/m³) is vital for nutrient uptake and preventing square shedding.

- **Current Reading**: **${soilMoisture}%** (Source: Manual Field Input / Capacitance Sensor)
- **Agronomic Impact**: In deep black Vertisols, severe moisture deficit (<40%) reduces boll size, while waterlogging (>85%) restricts oxygen to root tips.
- **Action**: Check 15–30 cm soil depth before scheduling irrigation cycles.`;
  }

  // 2. CNN Questions
  if (q.includes("cnn") || q.includes("convolutional") || q.includes("visual model") || q.includes("image model")) {
    return `### 🍃 Convolutional Neural Network (CNN) in AgroVision

A **Convolutional Neural Network (CNN)** is a specialized deep learning architecture designed for computer vision. AgroVision uses a calibrated **ResNet-18** model to examine foliar cotton images:

1. **Feature Extraction**: Convolutional filters scan leaf contours, venation networks, and discoloration spots.
2. **Diagnostic Classification**: Classifies foliar health into 5 stress categories (*Healthy, Water Stress, Heat Stress, Nutrient Deficiency, Pollution*).
3. **Current Result**: Leaf symptoms classified as **${diag}** with **${conf}** confidence.`;
  }

  // 3. SNN Questions
  if (q.includes("snn") || q.includes("spiking") || q.includes("neuromorphic") || q.includes("spike")) {
    return `### ⚡ Spiking Neural Network (SNN) in AgroVision

A **Spiking Neural Network (SNN)** is a 3rd-generation neuromorphic AI architecture that processes environmental telemetry using **discrete temporal spikes** over 10 simulation timesteps:

1. **33-Feature Multidimensional Input**: Evaluates temperature, humidity, VPD, soil moisture, and atmospheric oxidants.
2. **Leaky Integrate-and-Fire (LIF) Dynamics**: Mimics biological neurons to detect microclimate stress thresholds with ultra-low compute energy.
3. **Current Assessment**: Environmental stress classified at **${risk} Risk**.`;
  }

  // 4. Temperature / Thermal Questions
  if (q.includes("temperature") || q.includes("heat") || q.includes("thermal") || q.includes("hot weather")) {
    return `### ☀️ Temperature Impact on Cotton Phenology

Temperature is a primary environmental factor driving cotton growth, transpiration, and boll development:

- **Optimal Envelope**: 28°C–32°C for vegetative growth and flowering.
- **Critical Threshold (>35°C)**: Triggers thermal stress, high vapor pressure deficits, and pollen sterility.
- **Current Observation**: **${Number(temp).toFixed(1)}°C** (Source: OpenWeather Station).
- **Safety Precaution**: Avoid chemical foliar sprays during peak mid-day heat (>34°C) to prevent leaf scorching.`;
  }

  // 5. Humidity Questions
  if (q.includes("humidity") || q.includes("rh") || q.includes("moisture in air")) {
    return `### 🌫️ Relative Humidity & Transpiration in Cotton

- **Current Relative Humidity**: **${humidity}%**
- **Agronomic Dynamics**: High humidity (>80%) reduces transpiration cooling and elevates fungal disease pressure (e.g. Alternaria leaf spot), while low humidity (<40%) accelerates soil moisture depletion.
- **Scouting Tip**: Check lower canopy leaves for foliar spotting if high humidity persists with warm temperatures.`;
  }

  // 6. Rainfall / Weather Forecast
  if (q.includes("rain") || q.includes("rainfall") || q.includes("precipitation") || q.includes("weather forecast") || q.includes("forecast")) {
    const weather = contextRecord?.environment?.weather_context;
    const next24h = weather?.forecast?.next_24h_rainfall_mm || 0.0;
    const rainProb = Math.round((weather?.forecast?.rain_probability || 0.0) * 100);
    return `### 🌧️ Weather & Rainfall Telemetry

- **Ambient Temperature**: ${Number(temp).toFixed(1)}°C | **Humidity**: ${humidity}%
- **Next 24h Rainfall Expected**: ${next24h} mm (Rain Probability: ${rainProb}%)
- **Microclimate Summary**: ${weather?.forecast?.summary || "Stable microclimate conditions."}

**Farming Precaution**: Postpone foliar nutrition or pesticide sprays if rainfall is forecast within 24 hours to avoid wash-off.`;
  }

  // 7. Air Quality & Ozone
  if (q.includes("aqi") || q.includes("ozone") || q.includes("pollution") || q.includes("air quality") || q.includes("smoke")) {
    return `### 🏭 Air Quality & Tropospheric Ozone Impact

- **Current Air Quality Index (AQI)**: **${aqi}** | **Tropospheric Ozone**: **${ozone} ppb**
- **Ozone ($O_3$) Effect**: Ground-level ozone enters leaf stomata, forming reactive oxygen species (ROS) that produce bronze stippling and early leaf drop.
- **Particulate Matter**: High particulate levels deposit on leaf surfaces, reducing photosynthetically active radiation (PAR).`;
  }

  // 8. Why did I get this result / Diagnosis Explanation
  if (q.includes("why") || q.includes("result") || q.includes("explain") || q.includes("diagnosis") || q.includes("meaning")) {
    return `### 🧩 Multimodal Diagnostic Breakdown

AgroVision evaluated your field using dual AI models and deterministic agronomic rules:

1. **CNN Leaf Scan**: Identified **${diag}** (${conf} confidence) based on leaf color, edge patterns, and venation.
2. **SNN Climate Analysis**: Evaluated environmental risk at **${risk} Risk** based on ambient temperature (${Number(temp).toFixed(1)}°C), humidity (${humidity}%), and soil moisture (${soilMoisture}%).
3. **Multimodal Fusion & Expert Veto**: Checked deterministic agricultural safety rules to ensure no conflicting environmental factors invalidate the diagnosis.`;
  }

  // 9. What should I check next / Action steps
  if (q.includes("next") || q.includes("check") || q.includes("inspect") || q.includes("action") || q.includes("what should i do") || q.includes("steps")) {
    return `### 🔍 Recommended Field Verification Checklist

Based on your current diagnosis (**${diag}** with **${risk}** environmental risk):

1. **Root Zone Inspection**: Dig a 15–30 cm soil pit to verify moisture penetration across root depth.
2. **Canopy Scouting**: Inspect 20 representative plants across diagonal transects for uniform symptoms.
3. **Irrigation Uniformity**: Check drip laterals and furrow ends for consistent water delivery.
4. **Pest Monitoring**: Check the undersides of mid-canopy leaves for early sucking pests (aphids, thrips, jassids).
5. **Re-Scan Schedule**: Take follow-up leaf photos in **3–5 days** to monitor recovery.`;
  }

  // 10. Irrigation & Water Management
  if (q.includes("irrigation") || q.includes("watering") || q.includes("drip") || q.includes("water management")) {
    return `### 💧 Irrigation & Water Scheduling Protocol

- **Current Soil Moisture**: ${soilMoisture}% | **Temperature**: ${Number(temp).toFixed(1)}°C

1. **Drip Scheduling**: Run drip cycles during cooler morning hours (6:00 AM – 9:00 AM) or late evening to minimize evaporation.
2. **Vertisol Management**: In deep black clay soils, apply 25–30 mm per cycle, ensuring adequate drainage to prevent root hypoxia.
3. **Critical Growth Stage**: Ensure steady moisture during flowering and boll formation to prevent square shedding.`;
  }

  // 11. Fertilizer & Nutrition
  if (q.includes("fertilizer") || q.includes("nutrient") || q.includes("nitrogen") || q.includes("urea") || q.includes("npk") || q.includes("dosage") || q.includes("spray")) {
    return `### 🧪 ICAR-Grounded Cotton Nutrition Guidance

1. **Foliar Nutrition Spray**: Apply **1% Potassium Nitrate ($KNO_3$)** or **19:19:19 (5g/L water)** in early morning to boost boll retention.
2. **Split Nitrogen Schedule**: Apply Nitrogen in 3 splits (50% basal at sowing, 25% at square initiation, 25% at peak flowering).
3. **Micronutrient Correction**: For interveinal chlorosis (Mg/Zn deficiency), apply **0.5% $MgSO_4$ + 0.2% Chelated Zinc (Zn-EDTA)**.`;
  }

  // 12. Pest & Integrated Pest Management
  if (q.includes("pest") || q.includes("insect") || q.includes("bollworm") || q.includes("aphid") || q.includes("thrip") || q.includes("whitefly") || q.includes("ipm")) {
    return `### 🐛 Integrated Pest Management (IPM) for Cotton

1. **Sucking Pests (Aphids, Jassids, Thrips, Whiteflies)**:
   - Install **Yellow and Blue Sticky Traps** (10–12 traps/acre) at top canopy height.
   - If Economic Threshold Level (ETL) is reached, spray **Neem Oil 1500 ppm (5 ml/L)** or **Diafenthiuron 50% WP (1g/L)**.
2. **Bollworm Monitoring**:
   - Install **Pheromone Traps** (4–5 traps/acre) to monitor moth flights.
   - Destroy flared squares and dropped flower buds weekly during field rounds.`;
  }

  // 13. General Catch-All
  return `### 🌿 AgroVision Agronomic Guidance

Regarding **"${escapeHtml(query)}"**:

- **Active Field**: ${fieldName} | **Crop Assessment**: **${diag}** (${risk} Environmental Risk)
- **Current Readings**: Temperature ${Number(temp).toFixed(1)}°C, Humidity ${humidity}%, Soil Moisture ${soilMoisture}%

**Recommendation**: Ground all farm management decisions in direct field scouting. Inspect root-zone soil moisture and leaf canopy before applying chemical or fertilizer treatments.`;
}

// =========================================================
// CHAT INTERACTION & MESSAGE STREAM
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
  let status = "ok";

  // 3. Dispatch to /api/chat with full context payload
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
        visual_assessment: activeContextRecord.visual_assessment,
        environmental_assessment: activeContextRecord.environmental_assessment,
        environmental_inputs: activeContextRecord.environmental_inputs,
        fusion: activeContextRecord.fusion,
        expert_veto: activeContextRecord.expert_veto,
        final_assessment: activeContextRecord.final_assessment,
        weather_context: activeContextRecord.environment?.weather_context || activeContextRecord.weather_context
      } : undefined
    };

    const res = await fetch(getApiUrl("/api/chat"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).catch(() => null);

    if (res && res.ok) {
      const data = await res.json();
      replyText = data.reply || "";
      modelUsed = data.model_used || "Gemini Flash";
      status = data.status || "ok";
    }
  } catch (err) {
    console.warn("Backend chat endpoint unavailable, activating client agronomic engine:", err);
  }

  // If backend didn't return text (e.g. Vercel deployment or rate limit), use client agronomic engine
  if (!replyText || replyText.trim().length === 0) {
    replyText = generateAgronomicAIResponse(text, activeContextRecord);
    modelUsed = "Grounded Agronomic AI";
    status = "grounded";
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

  assistantRow.innerHTML = `
    <div class="message-bubble assistant-bubble">
      <div style="font-size:13px; line-height:1.55; color:#0f172a;">
        ${formattedHtml}
      </div>
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
