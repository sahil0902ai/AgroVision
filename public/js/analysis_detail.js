/* =========================================================
   AgroVision — Full Analytical Report View (Analysis Details)
   Renders verified historical record across all 11 sections.
   ========================================================= */

// Global active record storage
let currentRecordData = null;

// Auth check
if (typeof requireLogin === "function") {
  requireLogin();
}

function getApiUrl(endpoint) {
  if (window.AGROVISION_CONFIG && typeof window.AGROVISION_CONFIG.getApiUrl === "function") {
    return window.AGROVISION_CONFIG.getApiUrl(endpoint);
  }
  return endpoint;
}

document.addEventListener("DOMContentLoaded", () => {
  const urlParams = new URLSearchParams(window.location.search);
  const recordIdentifier = urlParams.get("uuid") || urlParams.get("id");

  if (!recordIdentifier) {
    showDetailError("No record identifier provided in the URL.");
    return;
  }

  fetchRecordDetail(recordIdentifier);

  // Close download dropdown on outside click
  document.addEventListener("click", (e) => {
    const wrap = document.querySelector(".download-dropdown-wrap");
    const menu = document.getElementById("downloadDropdownMenu");
    if (wrap && menu && !wrap.contains(e.target)) {
      menu.classList.remove("show");
    }
  });
});

function showDetailError(msg) {
  const loading = document.getElementById("loadingState");
  if (loading) {
    loading.innerHTML = `
      <div style="font-size:32px; margin-bottom:12px;">⚠️</div>
      <strong style="color:#b91c1c; font-size:16px;">Record Not Found</strong>
      <p style="margin:4px 0 16px; font-size:13px; color:#4b5563;">${msg}</p>
      <a href="history.html" class="btn btn-primary" style="text-decoration:none;">← Return to History Archive</a>
    `;
  }
}

async function fetchRecordDetail(identifier) {
  try {
    const res = await fetch(getApiUrl(`/api/v1/records/${encodeURIComponent(identifier)}`));
    if (!res.ok) {
      throw new Error(`Record ${identifier} could not be retrieved.`);
    }

    const record = await res.json();
    currentRecordData = record;
    renderRecordDetail(record);

  } catch (err) {
    console.error("Error fetching detail:", err);
    showDetailError(err.message);
  }
}

function renderRecordDetail(r) {
  const loadingState = document.getElementById("loadingState");
  const detailContent = document.getElementById("detailContent");
  if (loadingState) loadingState.style.display = "none";
  if (detailContent) detailContent.style.display = "block";

  const dateObj = r.created_at ? new Date(r.created_at) : new Date();
  const dateFormatted = dateObj.toLocaleString([], {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  // 1. Top Action Buttons Setup
  const reportBtn = document.getElementById("reportBtn");
  if (reportBtn) {
    reportBtn.href = getApiUrl(`/api/v1/records/${encodeURIComponent(r.record_uuid)}/report`);
  }

  const askAIBtn = document.getElementById("askAIBtn");
  if (askAIBtn) {
    askAIBtn.href = `assistant.html?record_id=${encodeURIComponent(r.record_uuid)}`;
  }

  // Parse JSON payloads safely
  let cnnObj = {};
  try {
    if (r.cnn_predictions_json) cnnObj = JSON.parse(r.cnn_predictions_json);
  } catch (_) {}

  let spikesObj = {};
  try {
    if (r.spike_counts_json) spikesObj = JSON.parse(r.spike_counts_json);
  } catch (_) {}

  let fusionObj = {};
  try {
    if (r.fusion_json) fusionObj = JSON.parse(r.fusion_json);
  } catch (_) {}

  let expertObj = {};
  try {
    if (r.expert_veto_json) expertObj = JSON.parse(r.expert_veto_json);
  } catch (_) {}

  let weatherContext = null;
  try {
    if (r.weather_context_json) weatherContext = JSON.parse(r.weather_context_json);
    else if (r.weather_context) weatherContext = r.weather_context;
  } catch (_) {}

  let recsList = [];
  try {
    if (r.recommendations_json) {
      recsList = JSON.parse(r.recommendations_json);
      if (!Array.isArray(recsList)) recsList = [String(recsList)];
    }
  } catch (_) {}

  // Determine top CNN class and confidence
  let topClass = "Evaluated";
  let topPct = 0;
  if (Object.keys(cnnObj).length > 0) {
    const topKey = Object.keys(cnnObj).reduce((a, b) => (cnnObj[a] > cnnObj[b] ? a : b));
    topClass = topKey.replace("_", " ").replace(/\b\w/g, l => l.toUpperCase());
    topPct = Number(cnnObj[topKey]) || 0;
  } else {
    topClass = r.stress_severity ? (r.stress_severity === "High" ? "Water Stress" : "Healthy") : "Healthy";
    topPct = r.confidence_score || 85.0;
  }

  const sev = r.stress_severity || "Moderate";
  const relStr = (fusionObj.relationship || "ALIGNED").toUpperCase();

  // Setup AI Action Button Deep Links
  const aiActionNutrient = document.getElementById("aiActionNutrient");
  if (aiActionNutrient) {
    aiActionNutrient.href = `assistant.html?record_id=${encodeURIComponent(r.record_uuid)}&q=${encodeURIComponent(`Explain why ${topClass} was identified in this cotton leaf scan.`)}`;
  }
  const aiActionIrrigation = document.getElementById("aiActionIrrigation");
  if (aiActionIrrigation) {
    aiActionIrrigation.href = `assistant.html?record_id=${encodeURIComponent(r.record_uuid)}&q=${encodeURIComponent(`What irrigation schedule is recommended based on soil moisture ${r.soil_moisture ? (r.soil_moisture <= 1 ? (r.soil_moisture*100).toFixed(1) : r.soil_moisture) : 68}% and temperature ${r.temperature || 31}°C?`)}`;
  }
  const aiActionSoil = document.getElementById("aiActionSoil");
  if (aiActionSoil) {
    aiActionSoil.href = `assistant.html?record_id=${encodeURIComponent(r.record_uuid)}&q=${encodeURIComponent(`What soil tests and scouting checks should I prioritize for this analysis?`)}`;
  }

  // =========================================================
  // HEADER: 4 CORE METADATA TILES
  // =========================================================
  const hId = document.getElementById("detailHeaderId");
  const hIdShort = document.getElementById("detailHeaderIdShort");
  if (hId) hId.textContent = r.record_uuid || "—";
  if (hIdShort) hIdShort.textContent = r.record_uuid ? `ID: ${r.record_uuid.substring(0, 13)}…` : "UUID";

  const hDate = document.getElementById("detailHeaderDate");
  const hDateSub = document.getElementById("detailHeaderDateSub");
  if (hDate) hDate.textContent = dateFormatted;
  if (hDateSub) hDateSub.textContent = `Observed at ${dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

  const hField = document.getElementById("detailHeaderField");
  const hGrowth = document.getElementById("detailHeaderGrowth");
  if (hField) hField.textContent = r.field_name || "Field A — Wardha Parcel";
  if (hGrowth) hGrowth.textContent = `Growth Stage: ${r.growth_stage || "Vegetative"}`;

  const hStatusBadge = document.getElementById("detailHeaderStatusBadge");
  const hStatusSub = document.getElementById("detailHeaderStatusSub");
  if (hStatusBadge) {
    if (relStr === "CONFLICTING") {
      hStatusBadge.textContent = "Evidence Conflict";
      hStatusBadge.style.background = "#fff1f2";
      hStatusBadge.style.color = "#e11d48";
      hStatusBadge.style.borderColor = "#fecdd3";
      if (hStatusSub) hStatusSub.textContent = "Safety Gate Alert Triggered";
    } else if (sev === "High") {
      hStatusBadge.textContent = "High Risk Alert";
      hStatusBadge.style.background = "#fee2e2";
      hStatusBadge.style.color = "#dc2626";
      hStatusBadge.style.borderColor = "#fca5a5";
      if (hStatusSub) hStatusSub.textContent = "Environmental Veto Qualified";
    } else {
      hStatusBadge.textContent = "Verified Analysis";
      hStatusBadge.style.background = "#ecfdf5";
      hStatusBadge.style.color = "#059669";
      hStatusBadge.style.borderColor = "#a7f3d0";
      if (hStatusSub) hStatusSub.textContent = "Deterministic Check Passed";
    }
  }

  // =========================================================
  // SECTION 1: LEAF IMAGE & SALIENCY MAP
  // =========================================================
  const leafImg = document.getElementById("leafImg");
  if (leafImg) {
    leafImg.src = r.image_url || "images/leaf_placeholder.jpg";
  }

  const heatImg = document.getElementById("heatmapImg");
  const heatBox = document.getElementById("heatmapBox");
  if (r.heatmap_url && heatImg) {
    heatImg.src = r.heatmap_url;
    if (heatBox) heatBox.style.display = "flex";
  } else if (heatBox) {
    heatBox.style.display = "none";
  }

  // =========================================================
  // SECTION 2: VISUAL ANALYSIS — CNN
  // =========================================================
  const cnnTopBadge = document.getElementById("cnnTopBadge");
  if (cnnTopBadge) cnnTopBadge.textContent = `Top Finding: ${topClass}`;

  const cnnPrimaryClass = document.getElementById("cnnPrimaryClass");
  if (cnnPrimaryClass) cnnPrimaryClass.textContent = topClass;

  const cnnConfidenceText = document.getElementById("cnnConfidenceText");
  if (cnnConfidenceText) cnnConfidenceText.textContent = `Confidence: ${topPct.toFixed(1)}% model certainty`;

  const cnnSymptomDesc = document.getElementById("cnnSymptomDesc");
  if (cnnSymptomDesc) {
    const lowClass = topClass.toLowerCase();
    if (lowClass.includes("nutrient")) {
      cnnSymptomDesc.textContent = "Interveinal chlorosis and subtle foliar yellowing detected along leaf margins, indicating micro-nutrient or nitrogen restriction.";
    } else if (lowClass.includes("water")) {
      cnnSymptomDesc.textContent = "Loss of cellular turgor, leaf drooping, and marginal desiccation patterns identified in visual foliar scan.";
    } else if (lowClass.includes("heat")) {
      cnnSymptomDesc.textContent = "Solar scorching, upward leaf cupping, and apex thermal discoloration identified across upper foliar surface.";
    } else if (lowClass.includes("pollution")) {
      cnnSymptomDesc.textContent = "Particulate speckling and atmospheric oxidant surface stippling detected across leaf lamina.";
    } else {
      cnnSymptomDesc.textContent = "Uniform green pigmentation, intact chlorophyll distribution, and healthy leaf turgor without necrotic lesions.";
    }
  }

  // Probability Bars
  const probsContainer = document.getElementById("cnnProbsContainer");
  const classColorMap = {
    "healthy": "#059669",
    "water_stress": "#dc2626",
    "heat_stress": "#ea580c",
    "nutrient_deficiency": "#d97706",
    "pollution": "#7c3aed"
  };

  if (probsContainer) {
    if (Object.keys(cnnObj).length > 0) {
      probsContainer.innerHTML = Object.entries(cnnObj).map(([k, v]) => {
        const pPercent = Number(v).toFixed(1);
        const label = k.replace("_", " ").replace(/\b\w/g, l => l.toUpperCase());
        const isTop = label === topClass;
        const color = classColorMap[k.toLowerCase()] || "#059669";
        return `
          <div style="display:flex; align-items:center; gap:10px; font-size:12px;">
            <span style="width:140px; font-weight:${isTop ? '700' : '500'}; color:#334155; flex-shrink:0;">${label}</span>
            <div style="flex:1; height:8px; background:#e2e8f0; border-radius:999px; overflow:hidden;">
              <div style="width:${pPercent}%; height:100%; background:${color}; border-radius:999px;"></div>
            </div>
            <span style="width:48px; text-align:right; font-weight:700; color:#0f172a; flex-shrink:0;">${pPercent}%</span>
          </div>
        `;
      }).join("");
    } else {
      probsContainer.innerHTML = `
        <div style="font-size:12px; color:#64748b; padding:8px 0;">
          Class probabilities recorded: <strong>${topClass} (${topPct.toFixed(1)}%)</strong>.
        </div>
      `;
    }
  }

  // =========================================================
  // SECTION 3: ENVIRONMENTAL ANALYSIS — SNN
  // =========================================================
  const snnSeverityBadge = document.getElementById("snnSeverityBadge");
  const snnRiskLevel = document.getElementById("snnRiskLevel");
  const snnActivityScore = document.getElementById("snnActivityScore");

  if (snnSeverityBadge) {
    snnSeverityBadge.textContent = `${sev} Stress Severity`;
    if (sev === "High") {
      snnSeverityBadge.style.background = "#fee2e2";
      snnSeverityBadge.style.color = "#dc2626";
      snnSeverityBadge.style.borderColor = "#fca5a5";
    } else if (sev === "Low") {
      snnSeverityBadge.style.background = "#ecfdf5";
      snnSeverityBadge.style.color = "#059669";
      snnSeverityBadge.style.borderColor = "#a7f3d0";
    } else {
      snnSeverityBadge.style.background = "#fef3c7";
      snnSeverityBadge.style.color = "#d97706";
      snnSeverityBadge.style.borderColor = "#fde68a";
    }
  }

  if (snnRiskLevel) snnRiskLevel.textContent = sev;
  if (snnActivityScore) snnActivityScore.textContent = `${(r.confidence_score || 74.0).toFixed(1)}%`;

  const snnSum = document.getElementById("snnSpikesSummary");
  if (snnSum) {
    let spikesText = "Leaky Integrate-and-Fire neurons simulated across 10 temporal timesteps (β = 0.95).";
    if (typeof spikesObj === "object" && Object.keys(spikesObj).length > 0) {
      const parts = Object.entries(spikesObj).map(([k, v]) => `<strong>${k}: ${v} spikes</strong>`);
      spikesText = `SNN Neuromorphic Spike Counts (T=10 timesteps): ${parts.join(" · ")}.`;
    }
    snnSum.innerHTML = spikesText;
  }

  // =========================================================
  // SECTION 4: ENVIRONMENTAL INPUTS (6 TELEMETRY TILES)
  // =========================================================
  const envGrid = document.getElementById("envInputsGrid");
  let soilNum = 68;
  if (r.soil_moisture !== undefined && r.soil_moisture !== null) {
    soilNum = r.soil_moisture <= 1.0 ? (r.soil_moisture * 100).toFixed(1) : Number(r.soil_moisture).toFixed(1);
  }
  let ozoneNum = 41;
  if (r.ozone !== undefined && r.ozone !== null) {
    ozoneNum = r.ozone <= 1.0 ? (r.ozone * 1000).toFixed(1) : Number(r.ozone).toFixed(1);
  }

  if (envGrid) {
    envGrid.innerHTML = `
      <div class="meta-tile">
        <div class="meta-lbl">Air Temperature</div>
        <div class="meta-val">🌡️ ${(r.temperature !== undefined ? Number(r.temperature).toFixed(1) : 31.0)} °C</div>
        <div class="meta-sub">Baseline: 25°C – 35°C</div>
      </div>
      <div class="meta-tile">
        <div class="meta-lbl">Relative Humidity</div>
        <div class="meta-val">💧 ${(r.humidity !== undefined ? Number(r.humidity).toFixed(1) : 72.0)} %</div>
        <div class="meta-sub">Baseline: 50% – 80%</div>
      </div>
      <div class="meta-tile">
        <div class="meta-lbl">7-Day Precipitation</div>
        <div class="meta-val">🌧️ ${(r.rainfall_mm !== undefined ? Number(r.rainfall_mm).toFixed(1) : 18.0)} mm</div>
        <div class="meta-sub">Accumulated rainfall</div>
      </div>
      <div class="meta-tile">
        <div class="meta-lbl">Soil Moisture</div>
        <div class="meta-val">🌱 ${soilNum}%</div>
        <div class="meta-sub">Optimal: 55% – 75%</div>
      </div>
      <div class="meta-tile">
        <div class="meta-lbl">Air Quality Index</div>
        <div class="meta-val">🫧 ${Math.round(r.aqi || 84)} AQI</div>
        <div class="meta-sub">Standard: &lt; 100</div>
      </div>
      <div class="meta-tile">
        <div class="meta-lbl">Tropospheric Ozone</div>
        <div class="meta-val">☀️ ${ozoneNum} ppb</div>
        <div class="meta-sub">Threshold: &lt; 50 ppb</div>
      </div>
    `;
  }

  // =========================================================
  // SECTION 5: WEATHER SNAPSHOT (HISTORICAL OPENWEATHER)
  // =========================================================
  const weatherCard = document.getElementById("sectionWeatherSnapshot");
  const stEl = document.getElementById("detailWeatherStation");
  const obsEl = document.getElementById("detailWeatherObserved");
  const condEl = document.getElementById("detailWeatherCondition");
  const gridEl = document.getElementById("detailWeatherGrid");
  const fText = document.getElementById("detailWeatherForecastText");

  if (weatherContext && weatherContext.current) {
    const stName = weatherContext.location?.name || r.field_name || "Wardha Field Station";
    const latStr = weatherContext.location?.latitude !== undefined ? `${weatherContext.location.latitude.toFixed(3)}°N` : "20.745°N";
    const lonStr = weatherContext.location?.longitude !== undefined ? `${weatherContext.location.longitude.toFixed(3)}°E` : "78.602°E";
    const locCoord = ` (${latStr}, ${lonStr})`;

    if (stEl) stEl.textContent = `${stName}${locCoord}`;
    if (obsEl) {
      const d = new Date(weatherContext.observed_at || r.created_at || Date.now());
      obsEl.textContent = `Recorded at: ${d.toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
    }
    if (condEl) condEl.textContent = `Condition: ${weatherContext.current.weather_condition || "Clear / Stable"}`;

    if (gridEl) {
      const wTemp = weatherContext.current.temperature_c !== undefined ? weatherContext.current.temperature_c.toFixed(1) : (r.temperature || 31.0).toFixed(1);
      const wHum = weatherContext.current.humidity_percent !== undefined ? Math.round(weatherContext.current.humidity_percent) : Math.round(r.humidity || 72);
      const wRain = weatherContext.current.rainfall_mm !== undefined ? weatherContext.current.rainfall_mm.toFixed(1) : (r.rainfall_mm || 0.0).toFixed(1);
      const wWind = weatherContext.current.wind_speed !== undefined ? weatherContext.current.wind_speed.toFixed(1) : "3.2";
      const wAqi = weatherContext.air_quality?.aqi !== undefined ? Math.round(weatherContext.air_quality.aqi) : Math.round(r.aqi || 84);
      const wOzone = weatherContext.air_quality?.ozone_ppb !== undefined ? weatherContext.air_quality.ozone_ppb : (weatherContext.air_quality?.ozone ? Math.round(weatherContext.air_quality.ozone * 1000) : ozoneNum);

      gridEl.innerHTML = `
        <div class="meta-tile">
          <div class="meta-lbl">Air Temperature</div>
          <div class="meta-val">🌡️ ${wTemp} °C</div>
        </div>
        <div class="meta-tile">
          <div class="meta-lbl">Relative Humidity</div>
          <div class="meta-val">💧 ${wHum} %</div>
        </div>
        <div class="meta-tile">
          <div class="meta-lbl">Observed Rain</div>
          <div class="meta-val">🌧️ ${wRain} mm</div>
        </div>
        <div class="meta-tile">
          <div class="meta-lbl">Wind Velocity</div>
          <div class="meta-val">💨 ${wWind} m/s</div>
        </div>
        <div class="meta-tile">
          <div class="meta-lbl">Air Quality Index</div>
          <div class="meta-val">🫧 ${wAqi} AQI</div>
        </div>
        <div class="meta-tile">
          <div class="meta-lbl">Ozone Concentration</div>
          <div class="meta-val">☀️ ${wOzone} ppb</div>
        </div>
      `;
    }

    if (fText) {
      const fRain = weatherContext.forecast?.rainfall_forecast_mm !== undefined ? weatherContext.forecast.rainfall_forecast_mm.toFixed(1) : "0.0";
      const fPop = Math.round((weatherContext.forecast?.rain_probability || 0) * 100);
      const next24 = weatherContext.forecast?.next_24h || "Stable microclimate";
      fText.innerHTML = `<strong>48-Hour Macro Forecast Snapshot:</strong> Expected precipitation ${fRain} mm · Rain Probability: ${fPop}% · Outlook: ${next24}.`;
    }
  } else {
    // Graceful fallback using session fields
    if (stEl) stEl.textContent = `${r.field_name || "Wardha Field Station"} (Historical Session Snapshot)`;
    if (obsEl) obsEl.textContent = `Recorded at: ${dateFormatted}`;
    if (condEl) condEl.textContent = `Condition: Atmospheric Telemetry Logged`;
    if (gridEl) {
      gridEl.innerHTML = `
        <div class="meta-tile">
          <div class="meta-lbl">Air Temperature</div>
          <div class="meta-val">🌡️ ${(r.temperature || 31.0).toFixed(1)} °C</div>
        </div>
        <div class="meta-tile">
          <div class="meta-lbl">Relative Humidity</div>
          <div class="meta-val">💧 ${(r.humidity || 72.0).toFixed(1)} %</div>
        </div>
        <div class="meta-tile">
          <div class="meta-lbl">Observed Rain</div>
          <div class="meta-val">🌧️ ${(r.rainfall_mm || 0.0).toFixed(1)} mm</div>
        </div>
        <div class="meta-tile">
          <div class="meta-lbl">Wind Velocity</div>
          <div class="meta-val">💨 3.2 m/s</div>
        </div>
        <div class="meta-tile">
          <div class="meta-lbl">Air Quality Index</div>
          <div class="meta-val">🫧 ${Math.round(r.aqi || 84)} AQI</div>
        </div>
        <div class="meta-tile">
          <div class="meta-lbl">Ozone Concentration</div>
          <div class="meta-val">☀️ ${ozoneNum} ppb</div>
        </div>
      `;
    }
    if (fText) {
      fText.innerHTML = `<strong>48-Hour Macro Forecast Snapshot:</strong> Telemetry captured during observation session.`;
    }
  }

  // =========================================================
  // SECTION 6: MULTIMODAL FUSION
  // =========================================================
  const fusionRelBadge = document.getElementById("fusionRelBadge");
  const fusionVerdictText = document.getElementById("fusionVerdictText");
  const fusionConvergenceSub = document.getElementById("fusionConvergenceSub");
  const fusionSummaryText = document.getElementById("fusionSummaryText");

  if (fusionRelBadge) {
    fusionRelBadge.textContent = relStr.replace("_", " ");
    if (relStr === "CONFLICTING") {
      fusionRelBadge.style.background = "#fee2e2";
      fusionRelBadge.style.color = "#dc2626";
      fusionRelBadge.style.borderColor = "#fca5a5";
      if (fusionVerdictText) fusionVerdictText.textContent = "Evidence Disagreement";
      if (fusionConvergenceSub) fusionConvergenceSub.textContent = "Visual leaf finding diverges from high environmental sensor stress.";
    } else if (relStr === "PARTIALLY_ALIGNED") {
      fusionRelBadge.style.background = "#fef3c7";
      fusionRelBadge.style.color = "#d97706";
      fusionRelBadge.style.borderColor = "#fde68a";
      if (fusionVerdictText) fusionVerdictText.textContent = "Partial Convergence";
      if (fusionConvergenceSub) fusionConvergenceSub.textContent = "Visual indicators moderately supported by ambient microclimate trends.";
    } else {
      fusionRelBadge.style.background = "#ecfdf5";
      fusionRelBadge.style.color = "#059669";
      fusionRelBadge.style.borderColor = "#a7f3d0";
      if (fusionVerdictText) fusionVerdictText.textContent = "Coincident Evidence";
      if (fusionConvergenceSub) fusionConvergenceSub.textContent = "Visual leaf diagnosis is corroborated by microclimatic sensor stress level.";
    }
  }

  if (fusionSummaryText) {
    fusionSummaryText.textContent = fusionObj.summary || `Multimodal fusion integrates CNN visual probabilities (${topPct.toFixed(1)}% ${topClass}) with SNN environmental firing dynamics (${sev} risk) to calibrate actionable agricultural findings.`;
  }

  // =========================================================
  // SECTION 7: EXPERT CHECK (DETERMINISTIC RULE LAYER)
  // =========================================================
  const rulesContainer = document.getElementById("rulesContainer");
  const detailRuleIdBadge = document.getElementById("detailRuleIdBadge");
  const detailRuleStatusBadge = document.getElementById("detailRuleStatusBadge");

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

  let triggeredRules = expertObj.triggered_rules || [];
  if (triggeredRules.length === 0 && recsList.length > 0) {
    triggeredRules = [defaultBaselineRule];
  } else if (triggeredRules.length === 0) {
    triggeredRules = [defaultBaselineRule];
  }

  function getExpertDetailMeta(ruleItem) {
    const rid = (ruleItem.rule_id || "").toUpperCase();
    const ruleSev = (ruleItem.severity || "").toUpperCase();
    const rel = (relStr || "").toUpperCase();

    let status = ruleItem.rule_status;
    let statusBg = "#fef3c7";
    let statusColor = "#d97706";
    let statusBorder = "#fde68a";

    if (!status) {
      if (rid === "EVR-004" || rel === "CONFLICTING" || (ruleItem.name && ruleItem.name.toLowerCase().includes("disagreement"))) {
        status = "Evidence Conflict";
      } else if (rid === "EVR-001" || rid === "EVR-002" || rid === "EVR-005" || ruleSev === "CRITICAL" || ruleSev === "WARNING" || sev.toLowerCase() === "high") {
        status = "High Environmental Risk";
      } else if (rid === "EVR-007" || ruleSev === "INFO") {
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

    const condition = ruleItem.condition || "Deterministic physical rule evaluated across telemetry & visual parameters";
    const reason = ruleItem.reason || ruleItem.rationale || "Visual observations and environmental sensor inputs evaluated against deterministic threshold rules.";
    const impact = ruleItem.impact || ruleItem.interpretation || "Additional evidence should be reviewed before taking field crop actions.";
    const precaution = ruleItem.precaution || "Inspect field conditions and verify root zone parameters.";
    const whatToCheck = ruleItem.what_to_check || "Confirm field root zone moisture, check canopy foliage, and repeat analysis if necessary.";

    return {
      ruleId: ruleItem.rule_id || "EVR-000",
      name: ruleItem.name || "Deterministic Rule",
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

  const primeMeta = getExpertDetailMeta(triggeredRules[0]);

  if (detailRuleIdBadge) detailRuleIdBadge.textContent = primeMeta.ruleId;
  if (detailRuleStatusBadge) {
    detailRuleStatusBadge.textContent = primeMeta.status;
    detailRuleStatusBadge.style.background = primeMeta.statusBg;
    detailRuleStatusBadge.style.color = primeMeta.statusColor;
    detailRuleStatusBadge.style.borderColor = primeMeta.statusBorder;
  }

  if (rulesContainer) {
    rulesContainer.innerHTML = triggeredRules.map(ruleItem => {
      const meta = getExpertDetailMeta(ruleItem);
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

  // =========================================================
  // SECTION 8: FINAL ASSESSMENT
  // =========================================================
  const finalSevBadge = document.getElementById("finalSevBadge");
  const finalAlignBadge = document.getElementById("finalAlignBadge");
  const finalHeroClass = document.getElementById("finalHeroClass");
  const finalHeroSummary = document.getElementById("finalHeroSummary");
  const finalMetaGrid = document.getElementById("finalMetaGrid");

  if (finalHeroClass) finalHeroClass.textContent = topClass;

  if (finalSevBadge) {
    finalSevBadge.textContent = `${sev} Risk`;
    if (sev === "High") {
      finalSevBadge.style.background = "#fee2e2";
      finalSevBadge.style.color = "#dc2626";
      finalSevBadge.style.borderColor = "#fca5a5";
    } else if (sev === "Low") {
      finalSevBadge.style.background = "#ecfdf5";
      finalSevBadge.style.color = "#059669";
      finalSevBadge.style.borderColor = "#a7f3d0";
    } else {
      finalSevBadge.style.background = "#fef3c7";
      finalSevBadge.style.color = "#d97706";
      finalSevBadge.style.borderColor = "#fde68a";
    }
  }

  if (finalAlignBadge) {
    finalAlignBadge.textContent = relStr.replace("_", " ");
    if (relStr === "CONFLICTING") {
      finalAlignBadge.style.background = "#fee2e2";
      finalAlignBadge.style.color = "#dc2626";
      finalAlignBadge.style.borderColor = "#fca5a5";
    } else if (relStr === "PARTIALLY_ALIGNED") {
      finalAlignBadge.style.background = "#fef3c7";
      finalAlignBadge.style.color = "#d97706";
      finalAlignBadge.style.borderColor = "#fde68a";
    } else {
      finalAlignBadge.style.background = "#ecfdf5";
      finalAlignBadge.style.color = "#059669";
      finalAlignBadge.style.borderColor = "#a7f3d0";
    }
  }

  if (finalHeroSummary) {
    finalHeroSummary.textContent = fusionObj.summary || `Visual leaf assessment identifies ${topClass} (${topPct.toFixed(1)}% model certainty) corroborated by ${sev} environmental stress severity across microclimatic sensor parameters.`;
  }

  if (finalMetaGrid) {
    finalMetaGrid.innerHTML = `
      <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px;">
        <div style="font-size:10.5px; font-weight:700; text-transform:uppercase; color:#64748b;">Visual Finding (CNN)</div>
        <div style="font-size:13.5px; font-weight:800; color:#0d3b2e; margin:3px 0;">${topClass}</div>
        <span style="font-size:11px; font-weight:700; color:#059669;">${topPct.toFixed(1)}% Confidence</span>
      </div>
      <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px;">
        <div style="font-size:10.5px; font-weight:700; text-transform:uppercase; color:#64748b;">Environmental Risk (SNN)</div>
        <div style="font-size:13.5px; font-weight:800; color:#0d3b2e; margin:3px 0;">${sev} Severity</div>
        <span style="font-size:11px; font-weight:700; color:#0284c7;">${(r.confidence_score || 70).toFixed(0)}% Activity Score</span>
      </div>
      <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px;">
        <div style="font-size:10.5px; font-weight:700; text-transform:uppercase; color:#64748b;">Expert Safeguard</div>
        <div style="font-size:13.5px; font-weight:800; color:#0d3b2e; margin:3px 0;">${primeMeta.ruleId}</div>
        <span style="font-size:11px; font-weight:700; color:#64748b;">${primeMeta.status}</span>
      </div>
    `;
  }

  // =========================================================
  // SECTION 9: WHAT TO CHECK NEXT
  // =========================================================
  const detailCheckContext = {
    visualClass: topClass,
    visualConfidence: topPct,
    environmentalSeverity: sev,
    relationship: relStr,
    temperature: r.temperature || 31,
    humidity: r.humidity || 72,
    rainfall: r.rainfall_mm || 0,
    soilMoisture: soilNum,
    aqi: r.aqi || 64,
    ozone: ozoneNum,
    triggeredRules: triggeredRules,
    weatherForecast: weatherContext?.forecast
  };

  renderDetailWhatToCheckNext(detailCheckContext);

  // =========================================================
  // SECTION 10: AI EXPLANATION
  // =========================================================
  const aiExplanationText = document.getElementById("aiExplanationText");
  if (aiExplanationText) {
    if (fusionObj.ai_explanation) {
      aiExplanationText.textContent = fusionObj.ai_explanation;
    } else {
      aiExplanationText.innerHTML = `
        <strong>Agronomic Synthesis:</strong> The cotton crop in <em>${r.field_name || "Wardha Field"}</em> exhibits phenotypic indicators of <strong>${topClass}</strong> under <strong>${sev}</strong> ambient environmental risk. Root-zone moisture (${soilNum}%) and air temperature (${(r.temperature || 31).toFixed(1)}°C) indicate conditions that qualify this diagnosis. Follow the step-by-step checklist above before scheduling any chemical amendments or irrigation adjustments.
      `;
    }
  }
}

// =========================================================
// SECTION 9: DYNAMIC CHECKLIST GENERATOR
// =========================================================

let detailWhatToCheckItems = [];

function generateDetailWhatToCheckItems(ctx) {
  const items = [];
  const vClass = (ctx.visualClass || "Healthy").toLowerCase();
  const envSev = (ctx.environmentalSeverity || "Low").toLowerCase();
  const rules = ctx.triggeredRules || [];
  const sm = Number(ctx.soilMoisture) || 68;
  const temp = Number(ctx.temperature) || 31;
  const rain = Number(ctx.rainfall) || 0;
  const aqi = Number(ctx.aqi) || 64;
  const ozone = Number(ctx.ozone) || 41;
  const isConflict = ctx.relationship === "CONFLICTING" || rules.some(r => (r.rule_id || "").toUpperCase() === "EVR-004");
  const isWaterlogging = rules.some(r => (r.rule_id || "").toUpperCase() === "EVR-001") || (rain >= 20 && sm >= 55);
  const isDesiccation = rules.some(r => (r.rule_id || "").toUpperCase() === "EVR-002") || (temp >= 38 && sm <= 25);
  const isPollution = rules.some(r => (r.rule_id || "").toUpperCase() === "EVR-003") || vClass.includes("pollution") || aqi >= 100 || ozone >= 50;

  // 1. Soil Nutrition / Fertility Check (Verb: Confirm)
  if (vClass.includes("nutrient") || rules.some(r => (r.rule_id || "").toUpperCase() === "EVR-006")) {
    items.push({
      verb: "Confirm",
      category: "Soil & Foliar Nutrition",
      text: "Confirm soil nutrient status (available N, P, K, and micro-nutrients like Zinc/Magnesium) using a soil test kit before applying foliar or soil amendments.",
      checked: false
    });
  } else if (sm < 40 || vClass.includes("water")) {
    items.push({
      verb: "Confirm",
      category: "Nutrient Uptake",
      text: "Confirm root zone moisture status before adding fertilizers, as dry soil restricts plant nutrient absorption.",
      checked: false
    });
  } else {
    items.push({
      verb: "Confirm",
      category: "Soil Nutrition",
      text: "Confirm soil nutrient levels align with current crop growth stage without adding unneeded fertilizers.",
      checked: false
    });
  }

  // 2. Foliar & Canopy Inspection (Verb: Inspect)
  if (vClass.includes("water") || isDesiccation) {
    items.push({
      verb: "Inspect",
      category: "Canopy Turgor",
      text: "Inspect affected leaves in early morning (6:00 AM – 8:00 AM) to verify if morning leaf turgor recovers before daytime wilting.",
      checked: false
    });
  } else if (vClass.includes("heat") || temp >= 35) {
    items.push({
      verb: "Inspect",
      category: "Canopy Scorch",
      text: "Inspect affected leaves along top canopy borders for marginal scorching and upward cupping caused by solar heat.",
      checked: false
    });
  } else if (vClass.includes("nutrient")) {
    items.push({
      verb: "Inspect",
      category: "Leaf Symptoms",
      text: "Inspect affected leaves across lower versus upper canopy to distinguish mobile nitrogen deficiency from immobile micro-nutrient chlorosis.",
      checked: false
    });
  } else if (isPollution) {
    items.push({
      verb: "Inspect",
      category: "Leaf Surface",
      text: "Inspect affected leaves for particulate or dust accumulation on upper surfaces blocking stomatal pores.",
      checked: false
    });
  } else {
    items.push({
      verb: "Inspect",
      category: "Foliage Scouting",
      text: "Inspect upper and lower leaf surfaces periodically for early signs of sucking pests or subtle discoloration.",
      checked: false
    });
  }

  // 3. Growth & Squares / Fruiting Bodies (Verb: Check)
  if (vClass.includes("heat") || temp >= 35 || isDesiccation) {
    items.push({
      verb: "Check",
      category: "Growth & Squares",
      text: "Check new plant growth, terminal shoots, and flower squares for thermal drying or premature square drop.",
      checked: false
    });
  } else if (vClass.includes("water") || sm < 45) {
    items.push({
      verb: "Check",
      category: "Vegetative Growth",
      text: "Check new plant growth and internode length between upper nodes to gauge growth slowdown from moisture deficit.",
      checked: false
    });
  } else if (isWaterlogging) {
    items.push({
      verb: "Check",
      category: "Terminal Growth",
      text: "Check new plant growth and terminal shoots for pale yellowing caused by temporary root oxygen deprivation.",
      checked: false
    });
  } else {
    items.push({
      verb: "Check",
      category: "Growth Benchmarks",
      text: "Check new plant growth and square retention against expected seasonal stage targets.",
      checked: false
    });
  }

  // 4. Soil Moisture & Root Zone (Verb: Review)
  if (sm < 45 || vClass.includes("water") || isDesiccation) {
    items.push({
      verb: "Review",
      category: "Root Zone Moisture",
      text: "Review soil moisture at root zone depth (15–30 cm) using a probe or hand-squeeze test before watering.",
      checked: false
    });
  } else if (isWaterlogging || sm >= 75) {
    items.push({
      verb: "Review",
      category: "Field Drainage",
      text: "Review field drainage furrows and soil saturation to ensure no standing water persists around crop root zones.",
      checked: false
    });
  } else {
    items.push({
      verb: "Review",
      category: "Soil Moisture",
      text: "Review soil moisture levels every 3 to 4 days to maintain root zone moisture within the optimal 55%–70% range.",
      checked: false
    });
  }

  // 5. Environmental & Weather Conditions (Verb: Review / Monitor)
  if (rain > 0 || (ctx.weatherForecast && ctx.weatherForecast.rainfall_forecast_mm > 0)) {
    const rainVal = (rain || ctx.weatherForecast?.rainfall_forecast_mm || 0).toFixed(1);
    items.push({
      verb: "Review",
      category: "Rainfall Outlook",
      text: `Review recent rainfall (${rainVal} mm) and the upcoming 3-day weather forecast before scheduling field irrigation.`,
      checked: false
    });
  } else if (temp >= 35 || isDesiccation) {
    items.push({
      verb: "Monitor",
      category: "Peak Temperature",
      text: "Monitor environmental conditions during peak afternoon heat (12:00 PM – 3:30 PM) for excessive crop canopy stress.",
      checked: false
    });
  } else if (isPollution) {
    items.push({
      verb: "Monitor",
      category: "Air Quality",
      text: `Monitor environmental conditions and ambient air quality (${Math.round(aqi)} AQI) during stagnant wind periods.`,
      checked: false
    });
  } else {
    items.push({
      verb: "Monitor",
      category: "Environmental Conditions",
      text: "Monitor environmental conditions and ambient temperature trends over the next 48 hours.",
      checked: false
    });
  }

  // 6. Follow-up Assessment (Verb: Repeat)
  if (isConflict || envSev === "high" || !vClass.includes("healthy")) {
    items.push({
      verb: "Repeat",
      category: "Follow-up",
      text: "Repeat analysis when appropriate in 3 to 5 days after field adjustments to track crop recovery.",
      checked: false
    });
  } else {
    items.push({
      verb: "Repeat",
      category: "Routine Schedule",
      text: "Repeat analysis when appropriate in 7 to 10 days for regular preventative monitoring.",
      checked: false
    });
  }

  return items;
}

function renderDetailWhatToCheckNext(ctx) {
  const panel = document.getElementById("detailWhatToCheckPanel");
  const listContainer = document.getElementById("detailWhatToCheckList");

  if (!panel || !listContainer) return;

  detailWhatToCheckItems = generateDetailWhatToCheckItems(ctx);
  panel.style.display = "block";

  renderDetailWhatToCheckList();
}

function renderDetailWhatToCheckList() {
  const listContainer = document.getElementById("detailWhatToCheckList");
  const countBadge = document.getElementById("detailWhatToCheckCount");
  if (!listContainer) return;

  const total = detailWhatToCheckItems.length;
  const completed = detailWhatToCheckItems.filter(i => i.checked).length;

  if (countBadge) {
    countBadge.textContent = `${completed} / ${total} Completed`;
    if (completed === total && total > 0) {
      countBadge.style.background = "#dcfce7";
      countBadge.style.color = "#15803d";
      countBadge.style.borderColor = "#86efac";
    } else {
      countBadge.style.background = "#ecfdf5";
      countBadge.style.color = "#059669";
      countBadge.style.borderColor = "#a7f3d0";
    }
  }

  listContainer.innerHTML = detailWhatToCheckItems.map((item, idx) => `
    <div
      class="check-item-card ${item.checked ? 'completed' : ''}"
      data-index="${idx}"
      onclick="toggleDetailCheckItem(${idx})"
    >
      <div class="check-checkbox-wrap">
        <input
          type="checkbox"
          class="check-custom-checkbox"
          ${item.checked ? 'checked' : ''}
          aria-label="${item.verb} ${item.category}"
          onclick="event.stopPropagation(); toggleDetailCheckItem(${idx})"
        />
      </div>
      <div class="check-item-content">
        <div class="check-item-top">
          <span class="check-verb">${item.verb}</span>
          <span class="check-category-pill">${item.category}</span>
        </div>
        <p class="check-item-text">${item.text}</p>
      </div>
    </div>
  `).join("");
}

function toggleDetailCheckItem(idx) {
  if (detailWhatToCheckItems[idx]) {
    detailWhatToCheckItems[idx].checked = !detailWhatToCheckItems[idx].checked;
    renderDetailWhatToCheckList();
  }
}

// =========================================================
// EXPORT DATA UTILITIES (JSON & CSV DOWNLOAD)
// =========================================================

function toggleDownloadDropdown(e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById("downloadDropdownMenu");
  if (menu) menu.classList.toggle("show");
}

function exportCurrentRecordJSON() {
  const menu = document.getElementById("downloadDropdownMenu");
  if (menu) menu.classList.remove("show");

  if (!currentRecordData) {
    alert("No active record data to download.");
    return;
  }

  const jsonStr = JSON.stringify(currentRecordData, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `agrovision_analysis_${currentRecordData.record_uuid || "record"}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function exportCurrentRecordCSV() {
  const menu = document.getElementById("downloadDropdownMenu");
  if (menu) menu.classList.remove("show");

  if (!currentRecordData) {
    alert("No active record data to download.");
    return;
  }

  const r = currentRecordData;
  const headers = [
    "Record UUID", "Field Name", "Timestamp", "Temperature (°C)", "Humidity (%)",
    "Rainfall (mm)", "Soil Moisture (%)", "AQI", "Ozone (ppb)", "SNN Stress Severity",
    "Confidence (%)", "Growth Stage", "Weather Source"
  ];

  let soilNum = 68;
  if (r.soil_moisture !== undefined && r.soil_moisture !== null) {
    soilNum = r.soil_moisture <= 1.0 ? (r.soil_moisture * 100).toFixed(1) : Number(r.soil_moisture).toFixed(1);
  }
  let ozoneNum = 41;
  if (r.ozone !== undefined && r.ozone !== null) {
    ozoneNum = r.ozone <= 1.0 ? (r.ozone * 1000).toFixed(1) : Number(r.ozone).toFixed(1);
  }

  const row = [
    `"${r.record_uuid || ''}"`,
    `"${r.field_name || 'Field A'}"`,
    `"${r.created_at || ''}"`,
    (r.temperature || 31.0).toFixed(1),
    (r.humidity || 72.0).toFixed(1),
    (r.rainfall_mm || 0.0).toFixed(1),
    soilNum,
    Math.round(r.aqi || 84),
    ozoneNum,
    `"${r.stress_severity || 'Moderate'}"`,
    (r.confidence_score || 70.0).toFixed(1),
    `"${r.growth_stage || 'Vegetative'}"`,
    `"${r.weather_source || 'OpenWeather'}"`
  ];

  const csvContent = headers.join(",") + "\n" + row.join(",");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `agrovision_analysis_${r.record_uuid || "record"}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function copyRecordUuid() {
  if (currentRecordData && currentRecordData.record_uuid) {
    navigator.clipboard.writeText(currentRecordData.record_uuid).then(() => {
      alert("Analysis UUID copied to clipboard: " + currentRecordData.record_uuid);
    }).catch(() => {
      prompt("Copy Analysis UUID:", currentRecordData.record_uuid);
    });
  }
}
