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
      <strong style="color:#b91c1c;">Record Not Found</strong>
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

  document.getElementById("pageSub").textContent = `Record UUID: ${r.record_uuid} · ${new Date(r.created_at).toLocaleString()}`;
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

  let recsList = [];
  try {
    if (r.recommendations_json) {
      recsList = JSON.parse(r.recommendations_json);
      if (!Array.isArray(recsList)) recsList = [String(recsList)];
    }
  } catch (_) {}

  // Top CNN finding
  let topClass = "Evaluated";
  let topPct = 0;
  if (Object.keys(cnnObj).length > 0) {
    const topKey = Object.keys(cnnObj).reduce((a, b) => cnnObj[a] > cnnObj[b] ? a : b);
    topClass = topKey.replace("_", " ").replace(/\b\w/g, l => l.toUpperCase());
    topPct = cnnObj[topKey];
  }

  const sev = r.stress_severity || "Moderate";
  const sevBadge = document.getElementById("heroSeverityBadge");
  sevBadge.textContent = `${sev} Environmental Risk`;
  sevBadge.className = `badge-tag ${sev.toLowerCase().startsWith("high") ? "badge-high" : (sev.toLowerCase().startsWith("low") ? "badge-low" : "badge-mod")}`;

  document.getElementById("heroClass").textContent = `${topClass} Detected`;
  document.getElementById("heroSummary").textContent = `Visual leaf assessment indicates ${topClass} (${topPct.toFixed(1)}% model probability) with ${sev} macro-climatic stress severity evaluated across field parameters.`;

  // Hero meta items
  const heroMeta = document.getElementById("heroMetaList");
  heroMeta.innerHTML = `
    <div class="meta-item">
      <div class="meta-label">Observation Date</div>
      <div class="meta-val">${new Date(r.created_at).toLocaleDateString()}</div>
    </div>
    <div class="meta-item">
      <div class="meta-label">Growth Stage</div>
      <div class="meta-val">${(r.growth_stage || "Flowering").replace("_", " ")}</div>
    </div>
    <div class="meta-item">
      <div class="meta-label">SNN Spike Score</div>
      <div class="meta-val">${r.confidence_score ? r.confidence_score.toFixed(1) + "%" : "Evaluated"}</div>
    </div>
  `;

  // Leaf Images
  const leafImg = document.getElementById("leafImg");
  leafImg.src = r.image_url || "";
  const heatImg = document.getElementById("heatmapImg");
  if (r.heatmap_url) {
    heatImg.src = r.heatmap_url;
  } else {
    document.getElementById("heatmapBox").style.display = "none";
  }

  // CNN Probs
  const probsContainer = document.getElementById("cnnProbsContainer");
  const classColorMap = {
    "healthy": "green",
    "water_stress": "red",
    "heat_stress": "orange",
    "nutrient_deficiency": "blue",
    "pollution": "purple"
  };
  probsContainer.innerHTML = Object.entries(cnnObj).map(([k, v]) => {
    const pPercent = Number(v).toFixed(1);
    const label = k.replace("_", " ").replace(/\b\w/g, l => l.toUpperCase());
    const isTop = label === topClass;
    const color = classColorMap[k.toLowerCase()] || "green";
    return `
      <div style="margin-bottom:8px;">
        <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:2px;">
          <span style="font-weight:${isTop ? '700' : '500'}; color:#1f2937;">${label}</span>
          <span style="font-weight:700; color:#0f172a;">${pPercent}%</span>
        </div>
        <div style="width:100%; height:6px; background:#e2e8f0; border-radius:999px; overflow:hidden;">
          <div style="width:${pPercent}%; height:100%; background:var(--${color === 'green' ? 'primary-green' : color}, #059669); border-radius:999px;"></div>
        </div>
      </div>
    `;
  }).join("");

  // Environmental Inputs
  const envGrid = document.getElementById("envInputsGrid");
  const smDisplay = r.soil_moisture <= 1 ? (r.soil_moisture * 100).toFixed(1) + "% (" + r.soil_moisture.toFixed(3) + " m³/m³)" : r.soil_moisture.toFixed(1) + "%";
  envGrid.innerHTML = `
    <div class="meta-item"><div class="meta-label">Temperature</div><div class="meta-val">🌡️ ${r.temperature.toFixed(1)} °C</div></div>
    <div class="meta-item"><div class="meta-label">Humidity</div><div class="meta-val">💧 ${r.humidity.toFixed(1)} %</div></div>
    <div class="meta-item"><div class="meta-label">7-Day Rainfall</div><div class="meta-val">🌧️ ${r.rainfall_mm.toFixed(1)} mm</div></div>
    <div class="meta-item"><div class="meta-label">Soil Moisture</div><div class="meta-val">🌱 ${smDisplay}</div></div>
    <div class="meta-item"><div class="meta-label">Air Quality (AQI)</div><div class="meta-val">🫧 ${r.aqi.toFixed(0)}</div></div>
    <div class="meta-item"><div class="meta-label">Tropospheric Ozone</div><div class="meta-val">☀️ ${r.ozone.toFixed(3)}</div></div>
  `;

  // Spikes Summary
  const snnSum = document.getElementById("snnSpikesSummary");
  if (Array.isArray(spikesObj) && spikesObj.length === 3) {
    snnSum.innerHTML = `SNN Spiking Simulation (T=10 timesteps): <strong>High: ${spikesObj[0]} spikes</strong>, <strong>Low: ${spikesObj[1]} spikes</strong>, <strong>Moderate: ${spikesObj[2]} spikes</strong>.`;
  }

  // Rules & Precautions
  const rulesContainer = document.getElementById("rulesContainer");
  if (recsList.length > 0) {
    rulesContainer.innerHTML = recsList.map(item => `
      <div class="rule-card">
        <div style="font-size:13px; color:#1f2937; line-height:1.5;">${item}</div>
      </div>
    `).join("");
  } else {
    rulesContainer.innerHTML = `
      <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:12px; font-size:13px; color:#166534;">
        ✅ Baseline parameters: Maintain standard irrigation and routine crop scouting.
      </div>
    `;
  }
}
