/* =========================================================
   AgroVision — Detailed Historical Analysis View
   Fetches verified record from /api/v1/records/{uuid}
   ========================================================= */

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
});

function showDetailError(msg) {
  const loading = document.getElementById("loadingState");
  if (loading) {
    loading.innerHTML = `
      <div style="font-size:32px; margin-bottom:12px;">⚠️</div>
      <strong style="color:#b91c1c; font-size:16px;">Record Not Found</strong>
      <p style="margin:4px 0 16px; font-size:13px; color:#4b5563;">${msg}</p>
      <a href="history.html" class="btn btn-primary" style="text-decoration:none;">← Return to History</a>
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
    renderRecordDetail(record);

  } catch (err) {
    console.error("Error fetching detail:", err);
    showDetailError(err.message);
  }
}

function renderRecordDetail(r) {
  document.getElementById("loadingState").style.display = "none";
  document.getElementById("detailContent").style.display = "block";

  const dateStr = r.created_at ? new Date(r.created_at).toLocaleString([], {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  }) : "Recent Session";

  document.getElementById("pageSub").textContent = `Record UUID: ${r.record_uuid} · ${dateStr}`;
  document.getElementById("reportBtn").href = getApiUrl(`/api/v1/records/${r.record_uuid}/report`);
  
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

  // 1. Top CNN finding
  let topClass = "Evaluated";
  let topPct = 0;
  if (Object.keys(cnnObj).length > 0) {
    const topKey = Object.keys(cnnObj).reduce((a, b) => cnnObj[a] > cnnObj[b] ? a : b);
    topClass = topKey.replace("_", " ").replace(/\b\w/g, l => l.toUpperCase());
    topPct = cnnObj[topKey];
  }

  const sev = r.stress_severity || "Moderate";
  const sevBadge = document.getElementById("heroSeverityBadge");
  if (sevBadge) {
    sevBadge.textContent = `${sev} Environmental Risk`;
    if (sev === "High") {
      sevBadge.style.background = "#fee2e2";
      sevBadge.style.color = "#dc2626";
    } else if (sev === "Low") {
      sevBadge.style.background = "#ecfdf5";
      sevBadge.style.color = "#059669";
    } else {
      sevBadge.style.background = "#fef3c7";
      sevBadge.style.color = "#d97706";
    }
  }

  const alignBadge = document.getElementById("heroAlignBadge");
  const relStr = fusionObj.relationship || "ALIGNED";
  if (alignBadge) {
    alignBadge.textContent = relStr.replace("_", " ");
    if (relStr === "CONFLICTING") {
      alignBadge.style.background = "#fee2e2";
      alignBadge.style.color = "#dc2626";
      alignBadge.style.borderColor = "#fca5a5";
    } else if (relStr === "PARTIALLY_ALIGNED") {
      alignBadge.style.background = "#fef3c7";
      alignBadge.style.color = "#d97706";
      alignBadge.style.borderColor = "#fde68a";
    } else {
      alignBadge.style.background = "#ecfdf5";
      alignBadge.style.color = "#059669";
      alignBadge.style.borderColor = "#a7f3d0";
    }
  }

  document.getElementById("heroClass").textContent = `${topClass}`;
  document.getElementById("heroSummary").textContent = fusionObj.summary || `Visual leaf assessment indicates ${topClass} (${topPct.toFixed(1)}% model probability) under ${sev} macro-climatic stress severity evaluated across field parameters.`;

  // 3-Column Evidence Tiles
  const heroMeta = document.getElementById("heroMetaList");
  if (heroMeta) {
    heroMeta.innerHTML = `
      <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px;">
        <div style="font-size:10.5px; font-weight:700; text-transform:uppercase; color:#64748b;">Visual Evidence (CNN)</div>
        <div style="font-size:13.5px; font-weight:800; color:#0d3b2e; margin:3px 0;">${topClass}</div>
        <span style="font-size:11px; font-weight:700; color:#059669;">${topPct.toFixed(1)}% Confidence</span>
      </div>
      <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px;">
        <div style="font-size:10.5px; font-weight:700; text-transform:uppercase; color:#64748b;">Environmental Risk (SNN)</div>
        <div style="font-size:13.5px; font-weight:800; color:#0d3b2e; margin:3px 0;">${sev} Severity</div>
        <span style="font-size:11px; font-weight:700; color:#0284c7;">${(r.confidence_score || 70).toFixed(0)}% Activity Score</span>
      </div>
      <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px;">
        <div style="font-size:10.5px; font-weight:700; text-transform:uppercase; color:#64748b;">Multimodal Relationship</div>
        <div style="font-size:13.5px; font-weight:800; color:#0d3b2e; margin:3px 0;">${relStr.replace("_", " ")}</div>
        <span style="font-size:11px; font-weight:700; color:#64748b;">Deterministic Fusion</span>
      </div>
    `;
  }

  // Leaf Images
  const leafImg = document.getElementById("leafImg");
  if (leafImg) leafImg.src = r.image_url || "images/leaf_placeholder.jpg";
  
  const heatImg = document.getElementById("heatmapImg");
  const heatBox = document.getElementById("heatmapBox");
  if (r.heatmap_url && heatImg) {
    heatImg.src = r.heatmap_url;
  } else if (heatBox) {
    heatBox.style.display = "none";
  }

  // CNN Probability Bar Gauges (Power BI style)
  const probsContainer = document.getElementById("cnnProbsContainer");
  const classColorMap = {
    "healthy": "#059669",
    "water_stress": "#dc2626",
    "heat_stress": "#ea580c",
    "nutrient_deficiency": "#d97706",
    "pollution": "#7c3aed"
  };

  if (probsContainer && Object.keys(cnnObj).length > 0) {
    probsContainer.innerHTML = Object.entries(cnnObj).map(([k, v]) => {
      const pPercent = Number(v).toFixed(1);
      const label = k.replace("_", " ").replace(/\b\w/g, l => l.toUpperCase());
      const isTop = label === topClass;
      const color = classColorMap[k.toLowerCase()] || "#059669";
      return `
        <div style="display:flex; align-items:center; gap:10px; font-size:12px;">
          <span style="width:130px; font-weight:${isTop ? '700' : '500'}; color:#334155; flex-shrink:0;">${label}</span>
          <div style="flex:1; height:8px; background:#e2e8f0; border-radius:999px; overflow:hidden;">
            <div style="width:${pPercent}%; height:100%; background:${color}; border-radius:999px;"></div>
          </div>
          <span style="width:45px; text-align:right; font-weight:700; color:#0f172a; flex-shrink:0;">${pPercent}%</span>
        </div>
      `;
    }).join("");
  }

  // Environmental Telemetry Grid (6 Tiles)
  const envGrid = document.getElementById("envInputsGrid");
  let soilNum = 68;
  if (r.soil_moisture !== undefined) {
    soilNum = r.soil_moisture <= 1.0 ? (r.soil_moisture * 100).toFixed(1) : Number(r.soil_moisture).toFixed(1);
  }
  let ozoneNum = 41;
  if (r.ozone !== undefined) {
    ozoneNum = r.ozone <= 1.0 ? (r.ozone * 1000).toFixed(1) : Number(r.ozone).toFixed(1);
  }

  if (envGrid) {
    envGrid.innerHTML = `
      <div class="meta-tile">
        <div class="meta-lbl">Temperature</div>
        <div class="meta-val">🌡️ ${(r.temperature || 31).toFixed(1)} °C</div>
      </div>
      <div class="meta-tile">
        <div class="meta-lbl">Relative Humidity</div>
        <div class="meta-val">💧 ${(r.humidity || 72).toFixed(1)} %</div>
      </div>
      <div class="meta-tile">
        <div class="meta-lbl">7-Day Precipitation</div>
        <div class="meta-val">🌧️ ${(r.rainfall_mm || 18).toFixed(1)} mm</div>
      </div>
      <div class="meta-tile">
        <div class="meta-lbl">Soil Moisture</div>
        <div class="meta-val">🌱 ${soilNum}%</div>
      </div>
      <div class="meta-tile">
        <div class="meta-lbl">Air Quality Index</div>
        <div class="meta-val">🫧 ${Math.round(r.aqi || 84)}</div>
      </div>
      <div class="meta-tile">
        <div class="meta-lbl">Tropospheric Ozone</div>
        <div class="meta-val">☀️ ${ozoneNum} ppb</div>
      </div>
    `;
  }

  // SNN Spikes Summary
  const snnSum = document.getElementById("snnSpikesSummary");
  if (snnSum) {
    let spikesText = "Leaky Integrate-and-Fire neurons simulated across 10 temporal timesteps (β = 0.95).";
    if (typeof spikesObj === "object" && Object.keys(spikesObj).length > 0) {
      const parts = Object.entries(spikesObj).map(([k, v]) => `<strong>${k}: ${v} spikes</strong>`);
      spikesText = `SNN Spiking Simulation (T=10 timesteps): ${parts.join(" · ")}.`;
    }
    snnSum.innerHTML = spikesText;
  }

  // Historical Macroclimate & Weather Context (OpenWeather)
  const weatherCard = document.getElementById("detailWeatherCard");
  if (weatherCard && weatherContext && weatherContext.current) {
    weatherCard.style.display = "block";
    const stEl = document.getElementById("detailWeatherStation");
    const obsEl = document.getElementById("detailWeatherObserved");
    const condEl = document.getElementById("detailWeatherCondition");
    const gridEl = document.getElementById("detailWeatherGrid");
    const fText = document.getElementById("detailWeatherForecastText");

    const stName = weatherContext.location?.name || r.field_name || "Field Station";
    const latStr = weatherContext.location?.latitude !== undefined ? `${weatherContext.location.latitude.toFixed(3)}°N` : "";
    const lonStr = weatherContext.location?.longitude !== undefined ? `${weatherContext.location.longitude.toFixed(3)}°E` : "";
    const locCoord = (latStr && lonStr) ? ` (${latStr}, ${lonStr})` : "";

    if (stEl) stEl.textContent = `${stName}${locCoord}`;
    if (obsEl) {
      const d = new Date(weatherContext.observed_at || r.created_at || Date.now());
      obsEl.textContent = `Recorded: ${d.toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
    }
    if (condEl) condEl.textContent = `Condition: ${weatherContext.current.weather_condition || "Clear"}`;

    if (gridEl) {
      const wTemp = weatherContext.current.temperature_c !== undefined ? weatherContext.current.temperature_c.toFixed(1) : "—";
      const wHum = weatherContext.current.humidity_percent !== undefined ? Math.round(weatherContext.current.humidity_percent) : "—";
      const wRain = weatherContext.current.rainfall_mm !== undefined ? weatherContext.current.rainfall_mm.toFixed(1) : "0.0";
      const wWind = weatherContext.current.wind_speed !== undefined ? weatherContext.current.wind_speed.toFixed(1) : "—";
      const wAqi = weatherContext.air_quality?.aqi !== undefined ? Math.round(weatherContext.air_quality.aqi) : "—";
      const wOzone = weatherContext.air_quality?.ozone_ppb !== undefined ? weatherContext.air_quality.ozone_ppb : (weatherContext.air_quality?.ozone ? Math.round(weatherContext.air_quality.ozone * 1000) : "—");

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
          <div class="meta-lbl">Wind Speed</div>
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
      fText.innerHTML = `<strong>48-Hour Macro Forecast:</strong> Expected precipitation ${fRain} mm · Rain Probability: ${fPop}% · Next 24h: ${next24}.`;
    }
  } else if (weatherCard) {
    weatherCard.style.display = "none";
  }

  // Triggered Expert Veto Rules (Transparent Analytical Rules)
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
    // Legacy fallback to baseline
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

  // Render What to Check Next Interactive Checklist
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
}

// =========================================================
// WHAT TO CHECK NEXT (DETAIL VIEW CHECKLIST)
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
