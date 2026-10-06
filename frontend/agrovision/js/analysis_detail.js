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

  // Triggered Expert Veto Rules
  const rulesContainer = document.getElementById("rulesContainer");
  const triggeredRules = expertObj.triggered_rules || [];
  if (rulesContainer) {
    if (triggeredRules.length > 0) {
      rulesContainer.innerHTML = triggeredRules.map(rule => `
        <div class="rule-pbi-card">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <strong style="color:#9a3412; font-size:12.5px;">🛡️ Rule ${rule.rule_id}: ${rule.name}</strong>
            <span style="background:#fef3c7; color:#d97706; font-size:10px; font-weight:700; padding:2px 8px; border-radius:999px;">${rule.severity || 'Caution'}</span>
          </div>
          <p style="margin:0 0 6px; font-size:12px; color:#334155; line-height:1.45;">
            <strong>Interpretation:</strong> ${rule.interpretation || rule.condition}
          </p>
          <div style="background:#fffbeb; border-radius:6px; padding:8px 10px; font-size:11.5px; color:#9a3412; font-weight:600;">
            👉 <strong>Precaution:</strong> ${rule.precaution}
          </div>
        </div>
      `).join("");
    } else if (recsList.length > 0) {
      rulesContainer.innerHTML = recsList.map(rec => `
        <div class="rule-pbi-card">
          <div style="font-size:12.5px; color:#1e293b; line-height:1.5;">${rec}</div>
        </div>
      `).join("");
    } else {
      rulesContainer.innerHTML = `
        <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:10px; padding:14px; font-size:12.5px; color:#166534;">
          ✅ <strong>Standard Baseline:</strong> Environmental parameters and leaf observables are within acceptable agronomic limits. Continue standard field scouting.
        </div>
      `;
    }
  }

  // Checkpoints Checklist
  const checkList = document.getElementById("precautionsChecklist");
  if (checkList && expertObj.final_assessment && Array.isArray(expertObj.final_assessment.precautions)) {
    checkList.innerHTML = expertObj.final_assessment.precautions.map(p => `
      <li style="display:flex; align-items:center; gap:8px;">
        <span style="color:#059669; font-size:14px;">🟢</span>
        <span>${p}</span>
      </li>
    `).join("");
  }
}
