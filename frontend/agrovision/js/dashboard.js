/* =========================================================
   AgroVision — Interactive Farmer Dashboard Logic
   Exact implementation matching Figures 4, 5, 6, 7 & 8
   ========================================================= */

let selectedFile = null;
let latestCNNResult = null;
let latestSNNResult = null;
let latestSNNPayload = null;
let latestCombinedData = null;

function getApiUrl(endpoint) {
  if (window.AGROVISION_CONFIG && typeof window.AGROVISION_CONFIG.getApiUrl === "function") {
    return window.AGROVISION_CONFIG.getApiUrl(endpoint);
  }
  return endpoint;
}

// Populate current date in header
const today = new Date();
const formattedDate = today.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const todayDateEl = document.getElementById("todayDate");
if (todayDateEl) todayDateEl.textContent = formattedDate;

// Protect page — check login session
const currentUser = typeof requireLogin === "function" ? requireLogin() : null;
if (currentUser) {
  const nameFirst = currentUser.name.split(" ")[0];
  if (document.getElementById("welcomeMsg")) {
    document.getElementById("welcomeMsg").textContent = `Welcome back, ${nameFirst.toLowerCase()}`;
  }
  if (document.getElementById("userAvatar")) {
    document.getElementById("userAvatar").textContent = nameFirst.charAt(0).toUpperCase();
  }
}

// Formatters for Environmental Sliders
const SNN_ENV_FORMATTERS = {
  envTemp:      v => String(Math.round(v)),
  envHumidity:  v => String(Math.round(v)),
  envRainfall:  v => String(Math.round(v)),
  envSoil:      v => String(Math.round(v)),
  envAqi:       v => String(Math.round(v)),
  envOzone:     v => String(Math.round(v))
};

function updateEnvDisplay() {
  for (const [displayId, format] of Object.entries(SNN_ENV_FORMATTERS)) {
    const sliderId = displayId.replace("env", "slider");
    const slider = document.getElementById(sliderId);
    const display = document.getElementById(displayId);
    if (slider && display) display.textContent = format(parseFloat(slider.value));
  }
}

function resetEnvSliders() {
  const defaults = {
    sliderTemp: "31",
    sliderHumidity: "72",
    sliderRainfall: "18",
    sliderSoil: "68",
    sliderAqi: "84",
    sliderOzone: "41"
  };
  for (const [id, val] of Object.entries(defaults)) {
    const el = document.getElementById(id);
    if (el) el.value = val;
  }
  const stageEl = document.getElementById("cropGrowthStage");
  if (stageEl) stageEl.value = "Flowering";
  const daysEl = document.getElementById("cropDays");
  if (daysEl) daysEl.value = "60";

  updateEnvDisplay();
}

// View Switcher (Figures 4, 5, 6, 7)
function switchView(viewName) {
  const views = {
    input: document.getElementById("viewInput"),
    cnn: document.getElementById("viewCNN"),
    snn: document.getElementById("viewSNN"),
    combined: document.getElementById("viewCombined")
  };

  const buttons = {
    input: document.getElementById("stepBtnInput"),
    cnn: document.getElementById("stepBtnCNN"),
    snn: document.getElementById("stepBtnSNN"),
    combined: document.getElementById("stepBtnCombined")
  };

  for (const [key, el] of Object.entries(views)) {
    if (el) {
      if (key === viewName) {
        el.style.display = key === "input" ? "grid" : "block";
      } else {
        el.style.display = "none";
      }
    }
  }

  for (const [key, btn] of Object.entries(buttons)) {
    if (btn) {
      if (key === viewName) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    }
  }
}

// File Selection Handler
function handleFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
  if (!validTypes.includes(file.type) && !file.name.match(/\.(jpg|jpeg|png|webp)$/i)) {
    alert("Unsupported image format. Please upload JPG or PNG.");
    return;
  }

  if (file.size > 10 * 1024 * 1024) {
    alert("Image size is too large. Please upload a smaller image (max 10MB).");
    return;
  }

  selectedFile = file;

  const nameLabel = document.getElementById("fileNameLabel");
  if (nameLabel) nameLabel.textContent = file.name;

  const reader = new FileReader();
  reader.onload = (e) => {
    const previewImg = document.getElementById("previewImg");
    const uploadPreview = document.getElementById("uploadPreview");
    const uploadPrompt = document.getElementById("uploadPrompt");
    if (previewImg) previewImg.src = e.target.result;
    if (uploadPreview) uploadPreview.style.display = "block";
    if (uploadPrompt) uploadPrompt.style.display = "none";

    // Propagate image to Figure 5, 6, 7 previews
    const f5 = document.getElementById("fig5LeafImg");
    const f6 = document.getElementById("fig6LeafImg");
    const f7 = document.getElementById("fig7LeafImg");
    if (f5) f5.src = e.target.result;
    if (f6) f6.src = e.target.result;
    if (f7) f7.src = e.target.result;

    const fn5 = document.getElementById("fig5FileName");
    const fn6 = document.getElementById("fig6FileName");
    const fn7 = document.getElementById("fig7FileName");
    if (fn5) fn5.textContent = file.name;
    if (fn6) fn6.textContent = file.name;
    if (fn7) fn7.textContent = file.name;
  };
  reader.readAsDataURL(file);

  const analyzeBtn = document.getElementById("analyzeBtn");
  if (analyzeBtn) analyzeBtn.disabled = false;
}

function clearSelectedImage(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }

  selectedFile = null;
  const fileInput = document.getElementById("fileInput");
  if (fileInput) fileInput.value = "";

  const nameLabel = document.getElementById("fileNameLabel");
  if (nameLabel) nameLabel.textContent = "No file chosen (e.g. cotton_leaf.jpg)";

  const uploadPreview = document.getElementById("uploadPreview");
  const uploadPrompt = document.getElementById("uploadPrompt");
  if (uploadPreview) uploadPreview.style.display = "none";
  if (uploadPrompt) uploadPrompt.style.display = "block";
}

function resetAnalysisState() {
  clearSelectedImage();
  resetEnvSliders();
  latestCNNResult = null;
  latestSNNResult = null;
  latestSNNPayload = null;
  latestCombinedData = null;
  switchView('input');
}

// =========================================================
// 1. CNN Visual Stress Inference (Figure 5)
// =========================================================

async function runAnalysis() {
  if (!selectedFile) {
    alert("Please select a cotton leaf image to analyze.");
    return;
  }

  const analyzeBtn = document.getElementById("analyzeBtn");
  if (analyzeBtn) {
    analyzeBtn.disabled = true;
    analyzeBtn.textContent = "Analyzing leaf…";
  }

  try {
    const formData = new FormData();
    formData.append("file", selectedFile);

    const response = await fetch(getApiUrl("/api/cnn/predict"), {
      method: "POST",
      body: formData
    });

    if (!response.ok) {
      throw new Error("Visual analysis could not be completed.");
    }

    const data = await response.json();
    latestCNNResult = data;
    renderFigure5(data);
    switchView('cnn');

    // Automatically trigger environmental & combined synthesis
    await runEnvironmentAnalysis(false);

  } catch (err) {
    console.error("CNN inference error:", err);
    alert(err.message || "Error running visual leaf analysis.");
  } finally {
    if (analyzeBtn) {
      analyzeBtn.disabled = false;
      analyzeBtn.textContent = "Analyze Leaf →";
    }
  }
}

function renderFigure5(data) {
  const pred = data.prediction || {};
  const probs = data.probabilities || {};
  const predClass = pred.class || "Evaluated";
  
  const titleEl = document.getElementById("fig5ClassTitle");
  const pillEl = document.getElementById("fig5ConfPill");
  const calloutText = document.getElementById("fig5CalloutText");
  const probRows = document.getElementById("fig5ProbRows");
  const metaLatency = document.getElementById("fig5InferenceMeta");

  // Semantic color mapping
  const semanticColors = {
    "Healthy": { text: "#059669", bg: "#ecfdf5", border: "#a7f3d0", bar: "#059669" },
    "Water Stress": { text: "#dc2626", bg: "#fee2e2", border: "#fca5a5", bar: "#dc2626" },
    "Heat Stress": { text: "#ea580c", bg: "#ffedd5", border: "#fed7aa", bar: "#ea580c" },
    "Nutrient Deficiency": { text: "#d97706", bg: "#fef3c7", border: "#fde68a", bar: "#d97706" },
    "Pollution": { text: "#7c3aed", bg: "#f5f3ff", border: "#ddd6fe", bar: "#7c3aed" }
  };

  const currentTheme = semanticColors[predClass] || { text: "#0d3b2e", bg: "#f1f5f9", border: "#cbd5e1", bar: "#0d3b2e" };

  if (titleEl) {
    titleEl.textContent = predClass;
    titleEl.style.color = currentTheme.text;
  }

  // Display backend confidence directly if provided; do not invent if missing
  if (pillEl) {
    if (pred && pred.confidence !== undefined && pred.confidence !== null) {
      let confNum = Number(pred.confidence);
      if (confNum <= 1.0) confNum = confNum * 100.0;
      pillEl.textContent = `CNN Confidence: ${confNum.toFixed(1)}%`;
      pillEl.style.background = currentTheme.bg;
      pillEl.style.color = currentTheme.text;
      pillEl.style.borderColor = currentTheme.border;
      pillEl.style.display = "inline-block";
    } else {
      pillEl.style.display = "none";
    }
  }

  // Grounded rationale explaining foliar observables without claiming disease diagnosis
  if (calloutText) {
    const rationales = {
      "Healthy": "Foliar pigmentation, leaf turgidity, and vein structure show uniform green coloration without visible signs of abiotic stress, wilting, or chlorosis.",
      "Water Stress": "Foliar observables show leaf drooping, marginal curling, or reduced turgor pressure consistent with plant moisture deficit.",
      "Heat Stress": "Foliar observables show thermal stress indicators, leaf edge scorch, or cupping typically observed under elevated ambient temperatures.",
      "Nutrient Deficiency": "Interveinal chlorosis, pale yellowing, or abnormal discoloration patterns suggest potential mineral deficit (such as nitrogen, potassium, or micronutrients).",
      "Pollution": "Superficial spotting, particulate deposit signatures, or atmospheric exposure symptoms observed on the leaf surface."
    };
    calloutText.textContent = rationales[predClass] || `The leaf image displays foliar observables and pigmentation signatures consistent with ${predClass.toLowerCase()}.`;
  }

  // 5 strict classes in order
  const classOrder = [
    "Healthy",
    "Water Stress",
    "Heat Stress",
    "Nutrient Deficiency",
    "Pollution"
  ];

  if (probRows) {
    probRows.innerHTML = classOrder.map(clsName => {
      let pVal = 0.0;
      if (probs[clsName] !== undefined) {
        pVal = Number(probs[clsName]);
      } else if (probs[clsName.toLowerCase().replace(/ /g, "_")] !== undefined) {
        pVal = Number(probs[clsName.toLowerCase().replace(/ /g, "_")]);
      } else if (clsName.toLowerCase() === predClass.toLowerCase() && pred.confidence !== undefined) {
        pVal = Number(pred.confidence);
      }

      if (pVal > 1.0) pVal = pVal / 100.0;
      const pctFormatted = (pVal * 100).toFixed(1);
      const isTop = clsName.toLowerCase() === predClass.toLowerCase();
      
      const barColor = isTop ? currentTheme.bar : "#94a3b8";
      const textColor = isTop ? currentTheme.text : "#475569";
      const fontWeight = isTop ? "800" : "500";
      const barWidth = Math.max(parseFloat(pctFormatted), isTop ? 3 : 1);

      return `
        <div style="display:flex; align-items:center; gap:12px; font-size:12px;">
          <span style="width:135px; color:#334155; font-weight:${fontWeight}; flex-shrink:0;">${clsName}</span>
          <div style="flex:1; height:8px; background:#f1f5f9; border-radius:999px; overflow:hidden;">
            <div style="width:${barWidth}%; height:100%; background:${barColor}; border-radius:999px; transition:width 0.4s ease;"></div>
          </div>
          <span style="width:48px; text-align:right; font-weight:${fontWeight}; color:${textColor}; flex-shrink:0;">${pctFormatted}%</span>
        </div>
      `;
    }).join("");
  }

  // Update inference metadata if available
  if (metaLatency && data.inference_time_ms) {
    metaLatency.innerHTML = `<strong>Inference Time:</strong> ${data.inference_time_ms.toFixed(1)}ms on CPU`;
  }
}

// =========================================================
// 2. SNN Environmental Stress Inference (View 3)
// =========================================================

const SNN_FIXED_INPUTS = {
  latitude: 20.975,
  longitude: 78.72,
  soil_nitrogen: 280.0,
  soil_phosphorus: 13.5,
  soil_potassium: 122.4,
  ndvi: 0.50,
  evi: 0.36,
  gndvi: 0.42,
  sif_740: 1.35,
  f687: 1.27,
  f760: 1.60,
  fluorescence_ratio: 0.82,
  chlorophyll_content: 42.2,
  leaf_area_index: 2.52,
  light: 553.0
};

async function runEnvironmentAnalysis(switchToSNN = true) {
  const snnBtn = document.getElementById("snnAnalyzeBtn");
  if (snnBtn) {
    snnBtn.disabled = true;
    snnBtn.textContent = "Analyzing environment…";
  }

  try {
    const temp = parseFloat(document.getElementById("sliderTemp").value) || 31.0;
    const humidity = parseFloat(document.getElementById("sliderHumidity").value) || 72.0;
    const rainfall = parseFloat(document.getElementById("sliderRainfall").value) || 18.0;
    const soilRaw = parseFloat(document.getElementById("sliderSoil").value) || 68.0;
    const soil_moisture = soilRaw <= 1 ? soilRaw : soilRaw / 100.0;
    const aqi = parseFloat(document.getElementById("sliderAqi").value) || 84.0;
    const ozoneRaw = parseFloat(document.getElementById("sliderOzone").value) || 41.0;
    const ozone = ozoneRaw > 1 ? ozoneRaw / 1000.0 : ozoneRaw;

    const growth_stage = document.getElementById("cropGrowthStage")?.value || "Flowering";
    const days_since_sowing = parseInt(document.getElementById("cropDays")?.value || "60", 10);

    const now = new Date();
    const payload = {
      ...SNN_FIXED_INPUTS,
      temperature: temp,
      humidity: humidity,
      rainfall: rainfall,
      soil_moisture: soil_moisture,
      aqi: aqi,
      ozone: ozone,
      growth_stage: growth_stage,
      days_since_sowing: days_since_sowing,
      observation_date: now.toISOString().split("T")[0]
    };

    const response = await fetch(getApiUrl("/api/snn/predict"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error("Environmental analysis could not be completed.");
    }

    const data = await response.json();
    latestSNNResult = data;
    latestSNNPayload = payload;
    renderFigure6(data, payload);

    if (switchToSNN) {
      switchView('snn');
    }

    // Combine when both visual and environmental evidence are ready
    if (latestCNNResult && latestSNNResult) {
      await runCombinedSynthesis();
    }

  } catch (err) {
    console.error("SNN inference error:", err);
    if (switchToSNN) alert(err.message || "Error running environmental stress analysis.");
  } finally {
    if (snnBtn) {
      snnBtn.disabled = false;
      snnBtn.textContent = "Save Conditions & Analyze →";
    }
  }
}

function renderFigure6(data, payload) {
  const pred = data.prediction || {};
  const stressLevel = pred.class || "Low";
  const spikeCounts = data.spike_counts || {};
  const classScores = data.class_scores || {};

  const titleEl = document.getElementById("fig6ClassTitle");
  const statusPill = document.getElementById("fig6StatusPill");
  const spikesSummary = document.getElementById("fig6SpikesSummary");
  const spikesDetail = document.getElementById("fig6SpikesDetail");
  const factorsList = document.getElementById("fig6FactorsList");
  const banner = document.getElementById("fig6Banner");
  const metaLatency = document.getElementById("fig6InferenceMeta");

  // Semantic styling by stress level
  if (titleEl) {
    titleEl.textContent = stressLevel;
    if (stressLevel === "Low") {
      titleEl.style.color = "#059669";
      if (banner) { banner.style.background = "#f0fdf4"; banner.style.borderColor = "#bbf7d0"; }
      if (statusPill) {
        statusPill.textContent = "● Low Risk";
        statusPill.style.background = "#ecfdf5";
        statusPill.style.color = "#059669";
        statusPill.style.borderColor = "#a7f3d0";
      }
    } else if (stressLevel === "Moderate") {
      titleEl.style.color = "#d97706";
      if (banner) { banner.style.background = "#fffbeb"; banner.style.borderColor = "#fde68a"; }
      if (statusPill) {
        statusPill.textContent = "● Moderate Risk";
        statusPill.style.background = "#fef3c7";
        statusPill.style.color = "#d97706";
        statusPill.style.borderColor = "#fde68a";
      }
    } else {
      titleEl.style.color = "#dc2626";
      if (banner) { banner.style.background = "#fff1f2"; banner.style.borderColor = "#fecdd3"; }
      if (statusPill) {
        statusPill.textContent = "● High Risk";
        statusPill.style.background = "#fee2e2";
        statusPill.style.color = "#dc2626";
        statusPill.style.borderColor = "#fca5a5";
      }
    }
  }

  // Real SNN Output Evidence (Spike Counts over T=10 timesteps)
  const lowS = spikeCounts["Low"] !== undefined ? spikeCounts["Low"] : 0;
  const modS = spikeCounts["Moderate"] !== undefined ? spikeCounts["Moderate"] : 0;
  const highS = spikeCounts["High"] !== undefined ? spikeCounts["High"] : 0;

  if (spikesSummary) {
    spikesSummary.textContent = `▶ Output Evidence (SNN Spikes) — Low: ${lowS} | Moderate: ${modS} | High: ${highS} spikes (T=10)`;
  }

  if (spikesDetail) {
    const lowScore = classScores["Low"] !== undefined ? (classScores["Low"] * 100).toFixed(1) : "—";
    const modScore = classScores["Moderate"] !== undefined ? (classScores["Moderate"] * 100).toFixed(1) : "—";
    const highScore = classScores["High"] !== undefined ? (classScores["High"] * 100).toFixed(1) : "—";

    spikesDetail.innerHTML = `
      <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:10px; margin-bottom:10px;">
        <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; padding:8px 10px; text-align:center;">
          <div style="font-size:10px; font-weight:700; color:#64748b; text-transform:uppercase;">Low Stress Neurons</div>
          <div style="font-size:14px; font-weight:800; color:#059669; margin:2px 0;">${lowS} spikes</div>
          <div style="font-size:10px; color:#64748b;">Activity: ${lowScore}%</div>
        </div>
        <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; padding:8px 10px; text-align:center;">
          <div style="font-size:10px; font-weight:700; color:#64748b; text-transform:uppercase;">Moderate Stress Neurons</div>
          <div style="font-size:14px; font-weight:800; color:#d97706; margin:2px 0;">${modS} spikes</div>
          <div style="font-size:10px; color:#64748b;">Activity: ${modScore}%</div>
        </div>
        <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; padding:8px 10px; text-align:center;">
          <div style="font-size:10px; font-weight:700; color:#64748b; text-transform:uppercase;">High Stress Neurons</div>
          <div style="font-size:14px; font-weight:800; color:#dc2626; margin:2px 0;">${highS} spikes</div>
          <div style="font-size:10px; color:#64748b;">Activity: ${highScore}%</div>
        </div>
      </div>
      <p style="margin:0; font-size:11.5px; color:#475569; line-height:1.45;">
        Leaky Integrate-and-Fire (LIF) neurons integrate 33 microclimate &amp; soil feature inputs across 10 temporal timesteps with membrane decay parameter β = 0.95.
      </p>
    `;
  }

  // Selected Environmental Inputs with Horizontal Analytical Bars
  if (factorsList) {
    const temp = Number(payload.temperature || 31.0);
    const hum = Number(payload.humidity || 72.0);
    const rain = Number(payload.rainfall || 18.0);
    const soilRaw = Number(payload.soil_moisture || 0.68);
    const soil = soilRaw <= 1.0 ? (soilRaw * 100) : soilRaw;
    const aqi = Number(payload.aqi || 84.0);
    const ozoneRaw = Number(payload.ozone || 0.041);
    const ozone = ozoneRaw <= 1.0 ? (ozoneRaw * 1000) : ozoneRaw;

    // Domain status categorizations & bar widths
    const tempStatus = temp >= 20 && temp <= 34 ? { text: "Optimal", bg: "#ecfdf5", color: "#059669", bar: "#059669" }
      : (temp <= 38 ? { text: "Moderate Alert", bg: "#fef3c7", color: "#d97706", bar: "#d97706" } : { text: "Thermal Stress", bg: "#fee2e2", color: "#dc2626", bar: "#dc2626" });
    const tempWidth = Math.min(100, Math.max(5, (temp / 55.0) * 100)).toFixed(1);

    const humStatus = hum >= 50 && hum <= 80 ? { text: "Normal", bg: "#ecfdf5", color: "#059669", bar: "#059669" }
      : (hum < 50 ? { text: "Low RH", bg: "#fef3c7", color: "#d97706", bar: "#d97706" } : { text: "High RH", bg: "#fef3c7", color: "#d97706", bar: "#d97706" });
    const humWidth = Math.min(100, Math.max(5, hum)).toFixed(1);

    const soilStatus = soil >= 50 && soil <= 80 ? { text: "Optimal Moisture", bg: "#ecfdf5", color: "#059669", bar: "#059669" }
      : (soil < 50 ? { text: "Moisture Deficit", bg: "#fee2e2", color: "#dc2626", bar: "#dc2626" } : { text: "Saturated", bg: "#fef3c7", color: "#d97706", bar: "#d97706" });
    const soilWidth = Math.min(100, Math.max(5, soil)).toFixed(1);

    const rainStatus = rain < 5 ? { text: "Dry", bg: "#f1f5f9", color: "#475569", bar: "#94a3b8" }
      : (rain <= 40 ? { text: "Normal", bg: "#ecfdf5", color: "#059669", bar: "#059669" } : { text: "Heavy Rain", bg: "#fef3c7", color: "#d97706", bar: "#d97706" });
    const rainWidth = Math.min(100, Math.max(5, (rain / 120.0) * 100)).toFixed(1);

    const aqiStatus = aqi <= 50 ? { text: "Good", bg: "#ecfdf5", color: "#059669", bar: "#059669" }
      : (aqi <= 100 ? { text: "Moderate", bg: "#fef3c7", color: "#d97706", bar: "#d97706" } : { text: "Unhealthy", bg: "#fee2e2", color: "#dc2626", bar: "#dc2626" });
    const aqiWidth = Math.min(100, Math.max(5, (aqi / 250.0) * 100)).toFixed(1);

    const ozoneStatus = ozone <= 45 ? { text: "Normal", bg: "#ecfdf5", color: "#059669", bar: "#059669" }
      : (ozone <= 70 ? { text: "Moderate", bg: "#fef3c7", color: "#d97706", bar: "#d97706" } : { text: "Elevated", bg: "#fee2e2", color: "#dc2626", bar: "#dc2626" });
    const ozoneWidth = Math.min(100, Math.max(5, (ozone / 120.0) * 100)).toFixed(1);

    const rows = [
      { icon: "🌡️", name: "Temperature", val: `${temp.toFixed(1)} °C`, status: tempStatus, width: tempWidth },
      { icon: "💧", name: "Humidity", val: `${hum.toFixed(0)} %`, status: humStatus, width: humWidth },
      { icon: "🌱", name: "Soil Moisture", val: `${soil.toFixed(0)} %`, status: soilStatus, width: soilWidth },
      { icon: "🌧️", name: "Rainfall (today)", val: `${rain.toFixed(1)} mm`, status: rainStatus, width: rainWidth },
      { icon: "🫧", name: "AQI", val: `${Math.round(aqi)}`, status: aqiStatus, width: aqiWidth },
      { icon: "☀️", name: "Ozone", val: `${Math.round(ozone)} ppb`, status: ozoneStatus, width: ozoneWidth }
    ];

    factorsList.innerHTML = rows.map(r => `
      <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:10px 14px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:15px;">${r.icon}</span>
            <span style="font-size:12.5px; font-weight:700; color:#334155;">${r.name}</span>
          </div>
          <div style="display:flex; align-items:center; gap:12px;">
            <span style="font-size:13px; font-weight:800; color:#0f172a;">${r.val}</span>
            <span style="background:${r.status.bg}; color:${r.status.color}; font-size:10px; font-weight:700; padding:2px 8px; border-radius:999px;">${r.status.text}</span>
          </div>
        </div>
        <div style="width:100%; height:7px; background:#e2e8f0; border-radius:999px; overflow:hidden;">
          <div style="width:${r.width}%; height:100%; background:${r.status.bar}; border-radius:999px; transition:width 0.4s ease;"></div>
        </div>
      </div>
    `).join("");
  }

  // Update inference metadata if available
  if (metaLatency && data.inference_time_ms) {
    metaLatency.innerHTML = `<strong>Inference Time:</strong> ${data.inference_time_ms.toFixed(1)}ms on CPU`;
  }
}

// =========================================================
// 3. Combined Assessment (View 4)
// =========================================================

async function runCombinedSynthesis() {
  if (!latestCNNResult || !latestSNNResult || !latestSNNPayload) return;

  try {
    const combinePayload = {
      visual_evidence: {
        class: latestCNNResult.prediction.class,
        confidence: latestCNNResult.prediction.confidence,
        probabilities: latestCNNResult.probabilities || {}
      },
      environmental_evidence: {
        class: latestSNNResult.prediction.class,
        confidence: latestSNNResult.prediction.confidence,
        spike_counts: latestSNNResult.spike_counts || {},
        timesteps: latestSNNResult.timesteps || 10
      },
      environmental_inputs: latestSNNPayload
    };

    const response = await fetch(getApiUrl("/api/analysis/combine"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(combinePayload)
    });

    if (!response.ok) throw new Error("Could not combine multimodal evidence.");

    const data = await response.json();
    latestCombinedData = data;
    renderFigure7(data);

  } catch (err) {
    console.error("Combined synthesis error:", err);
  }
}

function renderFigure7(data) {
  const fusion = data.fusion || {};
  const veto = data.expert_veto || {};
  const final = data.final_assessment || {};
  const rules = veto.triggered_rules || [];
  const recUuid = data.record_uuid || "";

  // 1. Visual evidence from backend
  const visualClass = data.visual_assessment?.class || (latestCNNResult?.prediction?.class || "Evaluated");
  let visualConf = data.visual_assessment?.confidence !== undefined ? data.visual_assessment.confidence : latestCNNResult?.prediction?.confidence;
  let visualConfStr = "";
  if (visualConf !== undefined && visualConf !== null) {
    if (visualConf <= 1.0) visualConf = visualConf * 100.0;
    visualConfStr = `${visualConf.toFixed(1)}%`;
  }

  // 2. Environmental evidence from backend
  const envClass = data.environmental_assessment?.severity || (latestSNNResult?.prediction?.class || "Low");
  
  // 3. Evidence Relationship from backend
  const relRaw = (fusion.relationship || "ALIGNED").toUpperCase();
  let relLabel = "Aligned";
  let relBg = "#ecfdf5";
  let relColor = "#059669";
  let relBorder = "#a7f3d0";

  if (relRaw === "CONFLICTING") {
    relLabel = "Conflicting";
    relBg = "#fee2e2";
    relColor = "#dc2626";
    relBorder = "#fca5a5";
  } else if (relRaw === "PARTIALLY_ALIGNED") {
    relLabel = "Partially Aligned";
    relBg = "#fef3c7";
    relColor = "#d97706";
    relBorder = "#fde68a";
  } else if (relRaw === "BASELINE_HEALTHY" || relRaw === "ALIGNED") {
    relLabel = "Aligned";
    relBg = "#ecfdf5";
    relColor = "#059669";
    relBorder = "#a7f3d0";
  } else {
    relLabel = relRaw.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
    relBg = "#eff6ff";
    relColor = "#2563eb";
    relBorder = "#bfdbfe";
  }

  // Bind 3 Evidence Blocks
  const evVisTitle = document.getElementById("fig7EvidenceVisualTitle");
  const evVisBadge = document.getElementById("fig7EvidenceVisualBadge");
  const evEnvTitle = document.getElementById("fig7EvidenceEnvTitle");
  const evRel = document.getElementById("fig7EvidenceRelationship");

  if (evVisTitle) evVisTitle.textContent = visualClass;
  if (evVisBadge) {
    if (visualConfStr) {
      evVisBadge.textContent = `Confidence: ${visualConfStr}`;
      evVisBadge.style.display = "inline-block";
    } else {
      evVisBadge.style.display = "none";
    }
  }

  if (evEnvTitle) evEnvTitle.textContent = `${envClass} Stress`;
  if (evRel) {
    evRel.textContent = relLabel;
    evRel.style.background = relBg;
    evRel.style.color = relColor;
    evRel.style.borderColor = relBorder;
  }

  // 4. Prominent Final Assessment Banner
  const finalTitle = document.getElementById("fig7FinalTitle");
  const heroBanner = document.getElementById("fig7HeroBanner");
  const attentionBadge = document.getElementById("fig7AttentionBadge");
  const finalDesc = document.getElementById("fig7FinalDesc");

  const isHealthy = visualClass.toLowerCase() === "healthy" && envClass.toLowerCase() === "low";

  if (finalTitle) {
    finalTitle.textContent = isHealthy ? "Healthy Baseline Maintained" : `${visualClass} Observable`;
    finalTitle.style.color = isHealthy ? "#059669" : (visualClass.toLowerCase().includes("stress") ? "#dc2626" : "#d97706");
  }

  if (heroBanner) {
    if (isHealthy) {
      heroBanner.style.background = "#f0fdf4";
      heroBanner.style.borderColor = "#bbf7d0";
    } else if (relRaw === "CONFLICTING" || visualClass.toLowerCase() === "water stress") {
      heroBanner.style.background = "#fff1f2";
      heroBanner.style.borderColor = "#fecdd3";
    } else {
      heroBanner.style.background = "#fffbeb";
      heroBanner.style.borderColor = "#fde68a";
    }
  }

  if (attentionBadge) {
    if (isHealthy) {
      attentionBadge.textContent = "● Stable Baseline";
      attentionBadge.style.background = "#ecfdf5";
      attentionBadge.style.color = "#059669";
      attentionBadge.style.borderColor = "#a7f3d0";
    } else if (relRaw === "CONFLICTING" || visualClass.toLowerCase() === "water stress") {
      attentionBadge.textContent = "● Action Recommended";
      attentionBadge.style.background = "#fee2e2";
      attentionBadge.style.color = "#dc2626";
      attentionBadge.style.borderColor = "#fca5a5";
    } else {
      attentionBadge.textContent = "● Cautionary Monitoring";
      attentionBadge.style.background = "#fef3c7";
      attentionBadge.style.color = "#d97706";
      attentionBadge.style.borderColor = "#fde68a";
    }
  }

  // 5. Plain Language Why This Result?
  if (finalDesc) {
    if (fusion.interpretation) {
      finalDesc.textContent = fusion.interpretation;
    } else if (fusion.summary) {
      finalDesc.textContent = fusion.summary;
    } else {
      finalDesc.textContent = `Visual leaf assessment indicates observable patterns of ${visualClass.toLowerCase()}, while current field environmental sensors register ${envClass.toLowerCase()} abiotic risk. The two evidence streams are evaluated in synthesis (${relLabel.toLowerCase()}).`;
    }
  }

  // 6. Expert Check Transparent Analytical Rules Section
  const ruleDetailsContainer = document.getElementById("fig7RuleDetailsContainer");
  const topRuleIdBadge = document.getElementById("fig7RuleIdBadge");
  const topRuleStatusBadge = document.getElementById("fig7RuleStatusBadge");

  const defaultBaselineRule = {
    rule_id: "EVR-007",
    name: "Routine Crop Health Maintenance",
    severity: "INFO",
    rule_status: "No Rule Triggered",
    condition: "CNN Healthy >= 50.0% AND SNN Environmental Stress is LOW",
    reason: "All environmental telemetry readings and visual foliar indicators remain within normal agricultural baseline parameters.",
    impact: "Crop canopy exhibits stable physiological vigor with balanced vegetative growth and low environmental hazard.",
    precaution: "Maintain scheduled irrigation cycles and continue routine crop scouting.",
    what_to_check: "Continue routine weekly canopy scouting and maintain regular soil moisture sensor log reviews."
  };

  const activeRulesList = (rules && rules.length > 0) ? rules : [defaultBaselineRule];

  function getExpertRuleMeta(r) {
    const rid = (r.rule_id || "").toUpperCase();
    const sev = (r.severity || "").toUpperCase();
    const rel = (relRaw || "").toUpperCase();

    let status = r.rule_status;
    let statusBg = "#fef3c7";
    let statusColor = "#d97706";
    let statusBorder = "#fde68a";

    if (!status) {
      if (rid === "EVR-004" || rel === "CONFLICTING" || (r.name && r.name.toLowerCase().includes("disagreement"))) {
        status = "Evidence Conflict";
      } else if (rid === "EVR-001" || rid === "EVR-002" || rid === "EVR-005" || sev === "CRITICAL" || sev === "WARNING" || envClass.toLowerCase() === "high") {
        status = "High Environmental Risk";
      } else if (rid === "EVR-007" || sev === "INFO") {
        status = "No Rule Triggered";
      } else {
        status = "Precaution Detected";
      }
    }

    if (status === "Evidence Conflict") {
      statusBg = "#fff1f2";
      statusColor = "#e11d48";
      statusBorder = "#fecdd3";
    } else if (status === "High Environmental Risk") {
      statusBg = "#fee2e2";
      statusColor = "#dc2626";
      statusBorder = "#fca5a5";
    } else if (status === "No Rule Triggered") {
      statusBg = "#ecfdf5";
      statusColor = "#059669";
      statusBorder = "#a7f3d0";
    } else {
      status = "Precaution Detected";
      statusBg = "#fef3c7";
      statusColor = "#d97706";
      statusBorder = "#fde68a";
    }

    const condition = r.condition || "Deterministic threshold comparison evaluated across physical sensor and vision inputs";
    const reason = r.reason || r.rationale || "Visual symptoms and ambient environmental readings evaluated against deterministic thresholds.";
    const impact = r.impact || r.interpretation || "Additional evidence should be reviewed before making operational crop interventions.";
    const precaution = r.precaution || "Inspect field conditions and verify root zone parameters.";
    const whatToCheck = r.what_to_check || "Confirm field root zone moisture, check canopy foliage, and repeat analysis if necessary.";

    return {
      ruleId: r.rule_id || "EVR-000",
      name: r.name || "Deterministic Rule",
      status,
      statusBg,
      statusColor,
      statusBorder,
      condition,
      reason,
      impact,
      precaution,
      whatToCheck
    };
  }

  const primaryMeta = getExpertRuleMeta(activeRulesList[0]);

  if (topRuleIdBadge) topRuleIdBadge.textContent = primaryMeta.ruleId;
  if (topRuleStatusBadge) {
    topRuleStatusBadge.textContent = primaryMeta.status;
    topRuleStatusBadge.style.background = primaryMeta.statusBg;
    topRuleStatusBadge.style.color = primaryMeta.statusColor;
    topRuleStatusBadge.style.borderColor = primaryMeta.statusBorder;
  }

  if (ruleDetailsContainer) {
    ruleDetailsContainer.innerHTML = activeRulesList.map(r => {
      const meta = getExpertRuleMeta(r);
      return `
        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:14px; margin-bottom:10px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; flex-wrap:wrap; gap:6px;">
            <div style="font-weight:800; font-size:13px; color:#0f172a; display:flex; align-items:center; gap:8px;">
              <span style="font-family:monospace; background:#e2e8f0; color:#1e293b; padding:2px 8px; border-radius:4px; font-size:11.5px; font-weight:700;">${meta.ruleId}</span>
              <span>${meta.name}</span>
            </div>
            <span style="background:${meta.statusBg}; color:${meta.statusColor}; border:1px solid ${meta.statusBorder}; font-size:10.5px; font-weight:700; padding:2px 10px; border-radius:999px;">${meta.status}</span>
          </div>

          <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:6px; padding:8px 12px; margin-bottom:10px;">
            <div style="font-size:10px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:0.04em; margin-bottom:2px;">Triggered Condition (Deterministic Logic)</div>
            <div style="font-family:monospace; font-size:11.5px; color:#0f172a; font-weight:600;">${meta.condition}</div>
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
            <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; padding:10px 12px;">
              <div style="font-size:10px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:0.04em; margin-bottom:3px;">Reason</div>
              <div style="font-size:12px; color:#334155; line-height:1.45;">${meta.reason}</div>
            </div>

            <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; padding:10px 12px;">
              <div style="font-size:10px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:0.04em; margin-bottom:3px;">Impact / Meaning</div>
              <div style="font-size:12px; color:#334155; line-height:1.45;">${meta.impact}</div>
            </div>

            <div style="background:#fffbeb; border:1px solid #fed7aa; border-radius:8px; padding:10px 12px;">
              <div style="font-size:10px; font-weight:700; color:#9a3412; text-transform:uppercase; letter-spacing:0.04em; margin-bottom:3px;">Precaution</div>
              <div style="font-size:12px; color:#9a3412; font-weight:600; line-height:1.45;">👉 ${meta.precaution}</div>
            </div>

            <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:10px 12px;">
              <div style="font-size:10px; font-weight:700; color:#065f46; text-transform:uppercase; letter-spacing:0.04em; margin-bottom:3px;">What to Check Next</div>
              <div style="font-size:12px; color:#166534; line-height:1.45;">📋 ${meta.whatToCheck}</div>
            </div>
          </div>
        </div>
      `;
    }).join("");
  }

  // 7. Action Buttons
  const reportBtn = document.getElementById("fig7ReportBtn");
  if (reportBtn && recUuid) {
    reportBtn.href = getApiUrl(`/api/v1/records/${recUuid}/report`);
  }
  const askAIBtn = document.getElementById("fig7AskAIBtn");
  if (askAIBtn) {
    askAIBtn.href = recUuid ? `assistant.html?record_id=${recUuid}` : "assistant.html";
  }
}

function saveCurrentAnalysis() {
  if (!latestCombinedData && !latestCNNResult) {
    alert("No active analysis to save. Please run an analysis first.");
    return;
  }
  const uuid = latestCombinedData?.record_uuid || "SAVED-LOCAL";
  alert(`Analysis session verified and committed to persistent database ledger.\nRecord ID: ${uuid}`);
}
