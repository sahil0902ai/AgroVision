/* =========================================================
   AgroVision — Dedicated AI Assistant Logic
   Grounded strictly in verified session & database telemetry
   ========================================================= */

let latestContextRecord = null;

function getApiUrl(endpoint) {
  if (window.AGROVISION_CONFIG && typeof window.AGROVISION_CONFIG.getApiUrl === "function") {
    return window.AGROVISION_CONFIG.getApiUrl(endpoint);
  }
  return endpoint;
}

// Auth check
const currentUser = typeof requireLogin === "function" ? requireLogin() : null;
if (currentUser && document.getElementById("welcomeMsg")) {
  document.getElementById("welcomeMsg").textContent = `Welcome back, ${currentUser.name.split(" ")[0]}`;
}

// Populate today's date in header
const today = new Date();
const formattedDate = today.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
const todayDateEl = document.getElementById("todayDate");
if (todayDateEl) todayDateEl.textContent = formattedDate;

document.addEventListener("DOMContentLoaded", () => {
  fetchLatestContext();
});

async function fetchLatestContext() {
  try {
    const res = await fetch(getApiUrl("/api/v1/records?limit=1"));
    if (res.ok) {
      const records = await res.json();
      if (records && records.length > 0) {
        latestContextRecord = records[0];
        const bannerDesc = document.getElementById("chatContextDesc");
        if (bannerDesc) {
          bannerDesc.textContent = `Using analysis context: ${latestContextRecord.record_uuid} (${latestContextRecord.growth_stage || "Flowering"})`;
        }
      }
    }
  } catch (err) {
    console.warn("Could not fetch latest analysis context:", err);
  }
}

function sendChip(promptText) {
  const input = document.getElementById("chatInput");
  if (input) {
    input.value = promptText;
    sendMessage();
  }
}

function sendMessage() {
  const input = document.getElementById("chatInput");
  const msgArea = document.getElementById("chatMessages");
  if (!input || !msgArea) return;

  const text = input.value.trim();
  if (!text) return;

  // Append user bubble
  const userBubble = document.createElement("div");
  userBubble.className = "chat-bubble chat-bubble-user";
  userBubble.textContent = text;
  msgArea.appendChild(userBubble);
  input.value = "";
  msgArea.scrollTop = msgArea.scrollHeight;

  // Generate grounded assistant response
  setTimeout(() => {
    const replyBubble = document.createElement("div");
    replyBubble.className = "chat-bubble chat-bubble-assistant";
    replyBubble.innerHTML = generateAssistantResponse(text, latestContextRecord);
    msgArea.appendChild(replyBubble);
    msgArea.scrollTop = msgArea.scrollHeight;
  }, 400);
}

function generateAssistantResponse(query, record) {
  const q = query.toLowerCase();

  if (!record) {
    if (q.includes("environment") || q.includes("snn") || q.includes("weather") || q.includes("macro")) {
      return `
        <strong>AgroVision Multimodal System:</strong>
        <p style="margin:4px 0;">AgroVision combines a Deep Convolutional Neural Network (CNN) for leaf visual symptom classification with a Neuromorphic Spiking Neural Network (SNN) that processes 33 environmental &amp; spectral telemetry features.</p>
        <p style="margin:4px 0 0; color:#065f46;">To see an environmental stress evaluation for your field, please run a leaf scan on the <a href="dashboard.html" style="color:#059669; font-weight:700; text-decoration:underline;">Leaf Check Dashboard</a>.</p>
      `;
    }
    if (q.includes("expert") || q.includes("rule") || q.includes("veto")) {
      return `
        <strong>Deterministic Expert Veto Engine:</strong>
        <p style="margin:4px 0;">The Expert Veto Engine cross-examines CNN visual predictions against physical microclimate limits (e.g. flagging over-irrigation or high vapor pressure deficits) to prevent false chemical interventions.</p>
        <p style="margin:4px 0 0; color:#065f46;">Perform a scan on the <a href="dashboard.html" style="color:#059669; font-weight:700; text-decoration:underline;">Dashboard</a> to see triggered rules for your crop.</p>
      `;
    }
    if (q.includes("monitor") || q.includes("action") || q.includes("next")) {
      return `
        <strong>General Field Monitoring Guidance:</strong>
        <ol style="margin:6px 0; padding-left:18px; line-height:1.5;">
          <li>Routinely inspect leaf undersides and canopy stems for early chlorosis or wilting.</li>
          <li>Measure soil moisture depth before scheduling irrigation cycles.</li>
          <li>Upload field photos to AgroVision to obtain automated multimodal stress detection.</li>
        </ol>
      `;
    }
    return `
      <strong>No Active Scan Context Loaded:</strong>
      <p style="margin:4px 0;">No previous leaf analysis was found in the current session. To get tailored agronomic explanations, please run an image and microclimate analysis on the <a href="dashboard.html" style="color:#059669; font-weight:700; text-decoration:underline;">Leaf Check Dashboard</a>.</p>
    `;
  }

  let topClass = "Healthy";
  let topPct = 0.0;
  let severity = record.stress_severity || "Low";
  let temp = record.temperature !== undefined && record.temperature !== null ? record.temperature : 0.0;
  let hum = record.humidity !== undefined && record.humidity !== null ? record.humidity : 0.0;
  let soil = record.soil_moisture !== undefined && record.soil_moisture !== null ? record.soil_moisture : 0.0;
  let stage = record.growth_stage || "Flowering";
  let rules = [];

  try {
    if (record.cnn_predictions_json) {
      const cnnObj = JSON.parse(record.cnn_predictions_json);
      const topKey = Object.keys(cnnObj).reduce((a, b) => cnnObj[a] > cnnObj[b] ? a : b);
      topClass = topKey.replace("_", " ").replace(/\b\w/g, l => l.toUpperCase());
      topPct = cnnObj[topKey];
    }
  } catch (_) {}

  if (record.recommendations_json) {
    try {
      const recs = JSON.parse(record.recommendations_json);
      if (Array.isArray(recs) && recs.length > 0) rules = recs;
    } catch (_) {}
  }
  if (rules.length === 0) {
    rules = ["Maintain routine irrigation scheduling and regular canopy scouting."];
  }

  if (q.includes("explain") || q.includes("summarize") || q.includes("summary")) {
    return `
      <strong>Analysis Summary (UUID: ${record.record_uuid || "Current"}):</strong>
      <ul style="margin:6px 0; padding-left:18px; line-height:1.5;">
        <li><strong>Visual Symptom (CNN):</strong> Identified <em>${topClass}</em> with ${topPct.toFixed(1)}% model probability.</li>
        <li><strong>Macro Environment (SNN):</strong> Evaluated at <em>${severity} Risk</em> based on environmental telemetry.</li>
        <li><strong>Crop Stage:</strong> Observed at <em>${stage.replace("_", " ")}</em>.</li>
        <li><strong>Field Telemetry:</strong> Temp ${temp.toFixed(1)}°C, Humidity ${hum.toFixed(0)}%, Soil Moisture ${(soil <= 1 ? (soil*100).toFixed(0) : soil.toFixed(0))}%.</li>
      </ul>
      <p style="margin:4px 0 0; color:#065f46;"><strong>Guidance:</strong> Cross-verify soil moisture and nutrient levels before initiating broad chemical applications.</p>
    `;
  }

  if (q.includes("environment") || q.includes("snn") || q.includes("weather") || q.includes("macro")) {
    return `
      <strong>Environmental Context &amp; SNN Evaluation:</strong>
      <p style="margin:4px 0;">The Neuromorphic Spiking Neural Network (SNN) evaluates 33 multidimensional microclimate, soil, and spectral telemetry features to determine abiotic stress levels:</p>
      <ul style="margin:6px 0; padding-left:18px; line-height:1.5;">
        <li><strong>Field Telemetry:</strong> Air Temp ${temp.toFixed(1)}°C · Humidity ${hum.toFixed(0)}% · Soil Moisture ${(soil <= 1 ? (soil*100).toFixed(0) : soil.toFixed(0))}%</li>
        <li><strong>Biological Impact:</strong> Environmental risk is assessed as <strong>${severity}</strong>. Spiking neurons integrate temperature and moisture gradients over discrete timesteps to quantify macro stress before irreversible crop damage occurs.</li>
      </ul>
      <p style="margin:4px 0 0; font-size:12px; color:#475569;">When visual symptoms exist alongside moderate/high environmental risk, the stress may be aggravated by heat, vapor pressure deficit, or root water deficit.</p>
    `;
  }

  if (q.includes("why") && (q.includes("result") || q.includes("this"))) {
    return `
      <strong>Finding Rationale:</strong>
      <p style="margin:4px 0;">The CNN model identified leaf color and texture signatures consistent with <strong>${topClass}</strong>. Concurrently, the Spiking Neural Network (SNN) evaluated field conditions (Temperature: ${temp.toFixed(1)}°C, Humidity: ${hum.toFixed(0)}%, Soil Moisture: ${(soil <= 1 ? (soil*100).toFixed(0) : soil.toFixed(0))}%) and indicated <strong>${severity}</strong> environmental stress risk.</p>
      <p style="margin:4px 0 0; font-size:12px; color:#64748b;">The multimodal synthesis establishes whether visual symptoms stem primarily from immediate environmental stress or underlying crop nutrition/soil factors.</p>
    `;
  }

  if (q.includes("expert") || q.includes("rule") || q.includes("veto") || q.includes("check")) {
    return `
      <strong>Expert Veto Rule Evaluation:</strong>
      <p style="margin:4px 0;">Deterministic agronomic rules safeguard against false alarms. Active precautions for this observation:</p>
      <ul style="margin:6px 0; padding-left:18px; line-height:1.5; color:#065f46;">
        ${rules.map(r => `<li>${r}</li>`).join("")}
      </ul>
      <p style="margin:4px 0 0; font-size:12px; color:#64748b;">These rules are transparent, deterministic agronomic safeguards designed to support field decisions.</p>
    `;
  }

  if (q.includes("monitor") || q.includes("next") || q.includes("action")) {
    return `
      <strong>Recommended Field Monitoring Steps:</strong>
      <ol style="margin:6px 0; padding-left:18px; line-height:1.5;">
        <li>Inspect root zone soil moisture depth across the affected field block.</li>
        <li>Check lower canopy leaves for chlorosis, necrosis, or edge discoloration.</li>
        <li>Review recent irrigation cycles against current ${stage.replace("_", " ")} water requirements.</li>
        <li>Consult with a certified agricultural extension officer before applying fertilizers or pesticides.</li>
      </ol>
    `;
  }

  return `
    <strong>Agronomic Guidance:</strong>
    <p style="margin:4px 0;">For your crop at <strong>${stage.replace("_", " ")}</strong> stage with <strong>${topClass}</strong> symptoms, prioritize maintaining steady soil moisture and inspecting foliage weekly.</p>
    <p style="margin:4px 0 0; font-size:12px; color:#64748b;">You can ask for a detailed summary, environmental explanation, rule breakdown, or specific monitoring recommendations anytime.</p>
  `;
}
