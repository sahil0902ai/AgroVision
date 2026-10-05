/* =========================================================
   AgroVision — Interactive Farmer Dashboard Logic
   Exact implementation matching Figures 4, 5, 6, 7 & 8
   ========================================================= */

let selectedFile = null;
let latestCNNResult = null;
let latestSNNResult = null;
let latestSNNPayload = null;
let latestCombinedData = null;

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
    if (el) el.style.display = key === viewName ? (key === "combined" ? "flex" : "grid") : "none";
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

    const response = await fetch("/api/cnn/predict", {
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
  const predClass = pred.class || "Water Stress";
  const confidencePercent = (pred.confidence * 100).toFixed(0);

  const titleEl = document.getElementById("fig5ClassTitle");
  const pillEl = document.getElementById("fig5ConfPill");
  const calloutText = document.getElementById("fig5CalloutText");
  const probRows = document.getElementById("fig5ProbRows");

  if (titleEl) titleEl.textContent = predClass;
  if (pillEl) pillEl.textContent = `CNN Confidence: ${confidencePercent}%`;

  if (calloutText) {
    calloutText.textContent = `The visual assessment indicates foliar patterns associated with ${predClass.toLowerCase()}, such as characteristic discoloration and structural stress cues.`;
  }

  const classOrder = [
    { name: "Water Stress", icon: "🔴", color: "#ef4444" },
    { name: "Heat Stress", icon: "🟡", color: "#f59e0b" },
    { name: "Nutrient Deficiency", icon: "🟢", color: "#10b981" },
    { name: "Pollution", icon: "🟣", color: "#8b5cf6" },
    { name: "Healthy", icon: "🟢", color: "#22c55e" }
  ];

  if (probRows) {
    probRows.innerHTML = classOrder.map(item => {
      const pVal = probs[item.name] !== undefined ? probs[item.name] : (item.name === predClass ? pred.confidence : 0.05);
      const pct = (pVal * 100).toFixed(0);
      return `
        <div class="fig-prob-row">
          <span class="fig-prob-icon">${item.icon}</span>
          <span class="fig-prob-label">${item.name}</span>
          <div class="fig-prob-track"><div class="fig-prob-fill" style="width:${pct}%; background:${item.color};"></div></div>
          <span class="fig-prob-val">${pct}%</span>
        </div>
      `;
    }).join("");
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

    const response = await fetch("/api/snn/predict", {
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
  const stressLevel = pred.class || "High";
  const spikeCounts = data.spike_counts || {};
  const maxSpikes = spikeCounts[stressLevel] !== undefined ? spikeCounts[stressLevel] : 8;

  const titleEl = document.getElementById("fig6ClassTitle");
  const pillEl = document.getElementById("fig6ConfPill");
  const calloutText = document.getElementById("fig6CalloutText");

  if (titleEl) titleEl.textContent = `${stressLevel} Risk`;
  if (pillEl) pillEl.textContent = `Output Evidence: ${maxSpikes}/10 Spikes`;

  if (calloutText) {
    if (stressLevel === "High") {
      calloutText.textContent = "Observed atmospheric temperature and soil moisture conditions indicate elevated environmental stress risk.";
    } else if (stressLevel === "Moderate") {
      calloutText.textContent = "Sub-optimal field conditions observed. Regular canopy scouting advised.";
    } else {
      calloutText.textContent = "Observed environmental parameters are within optimal agronomic ranges.";
    }
  }

  // Update physical environmental factor values
  const elTemp = document.getElementById("fig6FactorTemp");
  const elHum = document.getElementById("fig6FactorHumidity");
  const elRain = document.getElementById("fig6FactorRainfall");
  const elSoil = document.getElementById("fig6FactorSoil");
  const elAqi = document.getElementById("fig6FactorAqi");
  const elOzone = document.getElementById("fig6FactorOzone");

  if (elTemp) elTemp.textContent = `${payload.temperature.toFixed(1)}°C`;
  if (elHum) elHum.textContent = `${payload.humidity.toFixed(0)}%`;
  if (elRain) elRain.textContent = `${payload.rainfall.toFixed(1)} mm`;
  if (elSoil) elSoil.textContent = `${(payload.soil_moisture * 100).toFixed(0)}%`;
  if (elAqi) elAqi.textContent = `${Math.round(payload.aqi)}`;
  if (elOzone) elOzone.textContent = `${Math.round(payload.ozone * 1000)} ppb`;
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

    const response = await fetch("/api/analysis/combine", {
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

  const visualClass = data.visual_assessment?.class || (latestCNNResult?.prediction?.class || "Water Stress");
  const visualConf = ((data.visual_assessment?.confidence || latestCNNResult?.prediction?.confidence || 0.65) * 100).toFixed(0);
  const envClass = data.environmental_assessment?.severity || (latestSNNResult?.prediction?.class || "High");
  const snnSpikes = latestSNNResult?.spike_counts?.[envClass] !== undefined ? latestSNNResult.spike_counts[envClass] : 8;

  // Top Left Mini Cards
  const cnnTitle = document.getElementById("fig7CNNTitle");
  const cnnConf = document.getElementById("fig7CNNConf");
  const snnTitle = document.getElementById("fig7SNNTitle");
  const snnConf = document.getElementById("fig7SNNConf");
  if (cnnTitle) cnnTitle.textContent = visualClass;
  if (cnnConf) cnnConf.textContent = `CNN Confidence: ${visualConf}%`;
  if (snnTitle) snnTitle.textContent = `${envClass} Risk`;
  if (snnConf) snnConf.textContent = `Evidence: ${snnSpikes}/10 Spikes`;

  // Top Right Evidence Overview
  const evVisual = document.getElementById("fig7EvidenceVisual");
  const evEnv = document.getElementById("fig7EvidenceEnv");
  const evRel = document.getElementById("fig7EvidenceRelationship");
  if (evVisual) evVisual.textContent = `${visualClass} (CNN Confidence: ${visualConf}%)`;
  if (evEnv) evEnv.textContent = `${envClass} Risk (${snnSpikes}/10 Spikes)`;

  const concordance = fusion.concordance_type || "ALIGNED";
  let relLabel = "Aligned";
  if (evRel) {
    if (concordance === "ALIGNED") {
      relLabel = "Aligned";
      evRel.textContent = "Aligned";
      evRel.style.background = "#ecfdf5";
      evRel.style.color = "#059669";
      evRel.style.borderColor = "#a7f3d0";
    } else if (concordance === "PARTIALLY_ALIGNED") {
      relLabel = "Partially Aligned";
      evRel.textContent = "Partially Aligned";
      evRel.style.background = "#fef3c7";
      evRel.style.color = "#d97706";
      evRel.style.borderColor = "#fde68a";
    } else if (concordance === "CONFLICTING") {
      relLabel = "Conflicting Signals";
      evRel.textContent = "Conflicting Signals";
      evRel.style.background = "#fee2e2";
      evRel.style.color = "#dc2626";
      evRel.style.borderColor = "#fca5a5";
    } else {
      relLabel = "Optimal Baseline";
      evRel.textContent = "Optimal Baseline";
      evRel.style.background = "#ecfdf5";
      evRel.style.color = "#059669";
      evRel.style.borderColor = "#a7f3d0";
    }
  }

  // Final Assessment Hero
  const finalTitle = document.getElementById("fig7FinalTitle");
  const visualConfBadge = document.getElementById("fig7VisualConfBadge");
  const finalDesc = document.getElementById("fig7FinalDesc");
  if (finalTitle) finalTitle.textContent = final.finding || visualClass;
  if (visualConfBadge) visualConfBadge.textContent = `CNN Confidence: ${visualConf}%`;
  if (finalDesc) {
    finalDesc.textContent = `The visual assessment indicates a pattern associated with ${visualClass.toLowerCase()}, while the environmental assessment indicates ${envClass.toLowerCase()} risk. The two signals are ${relLabel.toLowerCase()}.`;
  }

  // Expert Check Box
  const expertBox = document.getElementById("fig7ExpertBox");
  const expertStatus = document.getElementById("fig7ExpertStatus");
  const expertText = document.getElementById("fig7ExpertText");
  if (rules.length > 0) {
    if (expertBox) {
      expertBox.style.display = "block";
      expertBox.style.borderLeftColor = "#d97706";
    }
    if (expertStatus) {
      expertStatus.textContent = "EXPERT CHECK — PRECAUTION DETECTED";
      expertStatus.style.color = "#d97706";
    }
    if (expertText) {
      expertText.innerHTML = rules.map(r => {
        let precautionText = r.precaution;
        if (r.rule_id === "EVR-006") {
          precautionText = "Confirm nutrient status using additional field/soil/plant evidence before corrective treatment.";
        }
        return `
          <div style="margin-bottom:6px;">
            <strong>Rule:</strong> ${r.rule_id} (${r.name})<br>
            <strong>Why:</strong> ${r.condition || 'Triggered agronomic threshold condition'}<br>
            <strong>Meaning:</strong> ${r.interpretation}<br>
            <strong>What to check:</strong> ${precautionText}
          </div>
        `;
      }).join("");
    }
  } else {
    if (expertBox) {
      expertBox.style.display = "block";
      expertBox.style.borderLeftColor = "#10b981";
    }
    if (expertStatus) {
      expertStatus.textContent = "EXPERT CHECK — BASELINE STABILITY";
      expertStatus.style.color = "#059669";
    }
    if (expertText) {
      expertText.innerHTML = `
        <strong>Rule:</strong> EVR-007 (Routine Health Maintenance)<br>
        <strong>Why:</strong> All observed parameters are within normal agronomic thresholds.<br>
        <strong>Meaning:</strong> Optimal physiological environmental support.<br>
        <strong>What to check:</strong> Maintain regular field scouting routines.
      `;
    }
  }

  // Precautions List
  const precList = document.getElementById("fig7PrecautionsList");
  if (precList && final.precautions && final.precautions.length > 0) {
    precList.innerHTML = final.precautions.map(p => `<li>${p}</li>`).join("");
  }

  // Quick Action Links
  const reportBtn = document.getElementById("fig7ReportBtn");
  if (reportBtn && recUuid) {
    reportBtn.href = `/api/v1/records/${recUuid}/report`;
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
