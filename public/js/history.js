/* =========================================================
   AgroVision — Analysis History & Reports Logic
   Fetches verified records from /api/v1/records
   ========================================================= */

let currentSkip = 0;
const PAGE_LIMIT = 15;
let debounceTimeout = null;
let latestRecordUuid = null;
let allRecordsCache = [];

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
  loadSummaryKpis();
  loadRecords();
});

async function loadSummaryKpis() {
  try {
    const res = await fetch(getApiUrl("/api/v1/records?limit=100"));
    if (!res.ok) return;
    const records = await res.json();
    if (!Array.isArray(records)) return;

    allRecordsCache = records;
    const total = records.length;
    let high = 0;
    let mod = 0;
    let low = 0;

    records.forEach(r => {
      const sev = (r.stress_severity || "").toLowerCase();
      if (sev === "high") high++;
      else if (sev === "moderate") mod++;
      else low++;
    });

    const elTotal = document.getElementById("histKpiTotal");
    const elHigh = document.getElementById("histKpiHigh");
    const elMod = document.getElementById("histKpiMod");
    const elLow = document.getElementById("histKpiLow");

    if (elTotal) elTotal.textContent = `${total} Scans`;
    if (elHigh) elHigh.textContent = `${high}`;
    if (elMod) elMod.textContent = `${mod}`;
    if (elLow) elLow.textContent = `${low}`;
  } catch (err) {
    console.error("Error loading history KPIs:", err);
  }
}

function debounceFilter() {
  clearTimeout(debounceTimeout);
  debounceTimeout = setTimeout(() => {
    currentSkip = 0;
    loadRecords();
  }, 350);
}

function applyFilter() {
  currentSkip = 0;
  loadRecords();
}

function resetFilters() {
  document.getElementById("searchInput").value = "";
  document.getElementById("severityFilter").value = "";
  document.getElementById("stageFilter").value = "";
  currentSkip = 0;
  loadRecords();
}

function exportCSV() {
  const sev = document.getElementById("severityFilter").value;
  const stage = document.getElementById("stageFilter").value;
  let url = getApiUrl("/api/v1/records/export/csv?");
  const params = [];
  if (sev) params.push(`stress_severity=${encodeURIComponent(sev)}`);
  if (stage) params.push(`growth_stage=${encodeURIComponent(stage)}`);
  url += params.join("&");
  window.location.href = url;
}

function openLatestReport() {
  if (latestRecordUuid) {
    window.open(getApiUrl(`/api/v1/records/${latestRecordUuid}/report`), "_blank");
  } else {
    alert("No stored analysis records found to generate a report.");
  }
}

function changePage(delta) {
  currentSkip = Math.max(0, currentSkip + delta * PAGE_LIMIT);
  loadRecords();
}

async function loadRecords() {
  const tbody = document.getElementById("recordsTbody");
  const countLabel = document.getElementById("countLabel");
  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");

  const search = document.getElementById("searchInput").value.trim();
  const severity = document.getElementById("severityFilter").value;
  const stage = document.getElementById("stageFilter").value;

  const params = new URLSearchParams({
    skip: currentSkip,
    limit: PAGE_LIMIT
  });
  if (search) params.append("search", search);
  if (severity) params.append("stress_severity", severity);
  if (stage) params.append("growth_stage", stage);

  try {
    const res = await fetch(getApiUrl(`/api/v1/records?${params.toString()}`));
    if (!res.ok) throw new Error("Could not load records.");

    const records = await res.json();

    if (!records || records.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align:center; padding:40px; color:#64748b;">
            <div style="font-size:24px; margin-bottom:8px;">🌾</div>
            <strong style="color:#0d3b2e; font-size:14px;">No analysis records found</strong>
            <p style="margin:4px 0 0; font-size:12px; color:#64748b;">Try adjusting your search filters or create a new leaf analysis scan.</p>
          </td>
        </tr>
      `;
      countLabel.textContent = "0 records found";
      prevBtn.disabled = currentSkip === 0;
      nextBtn.disabled = true;
      return;
    }

    if (records.length > 0 && currentSkip === 0) {
      latestRecordUuid = records[0].record_uuid;
      const repDate = document.getElementById("reportRecordDate");
      const repTitle = document.getElementById("reportRecordTitle");
      if (repDate) repDate.textContent = `Recorded: ${new Date(records[0].created_at || Date.now()).toLocaleDateString()}`;
      if (repTitle) {
        let firstClass = "Cotton Stress";
        try {
          if (records[0].cnn_predictions_json) {
            const obj = JSON.parse(records[0].cnn_predictions_json);
            const topKey = Object.keys(obj).reduce((a, b) => obj[a] > obj[b] ? a : b);
            firstClass = topKey.replace("_", " ").replace(/\b\w/g, l => l.toUpperCase());
          }
        } catch (_) {}
        repTitle.textContent = `${firstClass} (${records[0].stress_severity || 'Moderate'} Risk)`;
      }
    }

    const rowsHtml = records.map(r => {
      // Parse top CNN class safely
      let topClass = "Evaluated";
      let topPct = 0;
      try {
        if (r.cnn_predictions_json) {
          const cnnObj = JSON.parse(r.cnn_predictions_json);
          const topKey = Object.keys(cnnObj).reduce((a, b) => cnnObj[a] > cnnObj[b] ? a : b);
          topClass = topKey.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
          const rawVal = cnnObj[topKey];
          topPct = rawVal <= 1.0 ? rawVal * 100 : rawVal;
        }
      } catch (_) {}

      // Visual Class Badge & Color
      let classBadge = `<span style="background:#ecfdf5; color:#059669; font-weight:700; padding:2px 8px; border-radius:999px; font-size:11px; white-space:nowrap;">🟢 Healthy</span>`;
      let classColor = "#059669";
      const lowerClass = topClass.toLowerCase();

      if (lowerClass.includes("water")) {
        classBadge = `<span style="background:#eff6ff; color:#2563eb; font-weight:700; padding:2px 8px; border-radius:999px; font-size:11px; white-space:nowrap;">💧 Water Stress</span>`;
        classColor = "#2563eb";
      } else if (lowerClass.includes("heat")) {
        classBadge = `<span style="background:#fff7ed; color:#ea580c; font-weight:700; padding:2px 8px; border-radius:999px; font-size:11px; white-space:nowrap;">☀️ Heat Stress</span>`;
        classColor = "#ea580c";
      } else if (lowerClass.includes("nutrient")) {
        classBadge = `<span style="background:#fefce8; color:#ca8a04; font-weight:700; padding:2px 8px; border-radius:999px; font-size:11px; white-space:nowrap;">🍃 Nutrient Def.</span>`;
        classColor = "#ca8a04";
      } else if (lowerClass.includes("pollution")) {
        classBadge = `<span style="background:#f5f3ff; color:#7c3aed; font-weight:700; padding:2px 8px; border-radius:999px; font-size:11px; white-space:nowrap;">🌫️ Pollution</span>`;
        classColor = "#7c3aed";
      }

      // SNN Environmental Risk Badge
      const sev = r.stress_severity || "Moderate";
      let envPill = `<span style="background:#fef3c7; color:#d97706; font-size:10.5px; font-weight:700; padding:2px 7px; border-radius:999px; white-space:nowrap;">🟡 Moderate</span>`;
      if (sev === "High") {
        envPill = `<span style="background:#fee2e2; color:#dc2626; font-size:10.5px; font-weight:700; padding:2px 7px; border-radius:999px; white-space:nowrap;">🔴 High</span>`;
      } else if (sev === "Low") {
        envPill = `<span style="background:#ecfdf5; color:#059669; font-size:10.5px; font-weight:700; padding:2px 7px; border-radius:999px; white-space:nowrap;">🟢 Low</span>`;
      }

      // SNN micro telemetry
      const tempStr = r.temperature !== undefined ? `${r.temperature.toFixed(1)}°C` : "31°C";
      const humStr = r.humidity !== undefined ? `${r.humidity.toFixed(0)}%` : "72%";
      let soilNum = 68;
      if (r.soil_moisture !== undefined) {
        soilNum = r.soil_moisture <= 1.0 ? Math.round(r.soil_moisture * 100) : Math.round(r.soil_moisture);
      }
      const envTelemetrySub = `<div style="font-size:10px; color:#64748b; margin-top:2px; white-space:nowrap;">${tempStr} · ${humStr} · ${soilNum}% SM</div>`;

      // Expert Check
      let isAlert = false;
      let ruleName = "Normal Baseline";
      try {
        if (r.expert_veto_json) {
          const expObj = JSON.parse(r.expert_veto_json);
          if (expObj.triggered_rules && expObj.triggered_rules.length > 0) {
            isAlert = true;
            ruleName = expObj.triggered_rules[0].name || expObj.triggered_rules[0].rule_id || "Expert Rule";
          }
        }
      } catch (_) {}
      if (!isAlert && r.expert_veto_rule_triggered) {
        isAlert = true;
        ruleName = "Safety Threshold";
      }

      let expertBadge = `<span style="background:#f8fafc; color:#475569; border:1px solid #e2e8f0; font-size:10.5px; font-weight:600; padding:2px 7px; border-radius:6px; white-space:nowrap;" title="Verified by Agronomic Rules">🛡️ Normal</span>`;
      if (isAlert) {
        const shortRule = ruleName.length > 15 ? `${ruleName.substring(0, 14)}…` : ruleName;
        expertBadge = `<span style="background:#fffbeb; color:#b45309; border:1px solid #fed7aa; font-size:10.5px; font-weight:700; padding:2px 7px; border-radius:6px; white-space:nowrap;" title="${ruleName}">⚠️ ${shortRule}</span>`;
      }

      // Final Assessment
      let relationship = "ALIGNED";
      try {
        if (r.fusion_json) {
          const fObj = JSON.parse(r.fusion_json);
          relationship = (fObj.relationship || "ALIGNED").toUpperCase();
        }
      } catch (_) {}

      let finalBadge = `<span style="background:#ecfdf5; color:#059669; border:1px solid #a7f3d0; font-size:10.5px; font-weight:700; padding:2px 7px; border-radius:6px; white-space:nowrap;">⚖️ Aligned</span>`;
      if (relationship.includes("DIVERGENT") || relationship.includes("CONFLICT")) {
        finalBadge = `<span style="background:#fef3c7; color:#d97706; border:1px solid #fde68a; font-size:10.5px; font-weight:700; padding:2px 7px; border-radius:6px; white-space:nowrap;">⚡ Divergent</span>`;
      } else if (relationship.includes("VETO") || relationship.includes("OVERRULE") || relationship.includes("CRITICAL")) {
        finalBadge = `<span style="background:#fee2e2; color:#dc2626; border:1px solid #fecaca; font-size:10.5px; font-weight:700; padding:2px 7px; border-radius:6px; white-space:nowrap;">🛡️ Safety Veto</span>`;
      }

      const dateStr = r.created_at ? new Date(r.created_at).toLocaleString([], {
        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      }) : "Recent";
      const uuidShort = (r.record_uuid || "").substring(0, 8);
      const imgSrc = r.image_url || "images/leaf_placeholder.jpg";
      const reportUrl = getApiUrl(`/api/v1/records/${r.record_uuid}/report`);

      return `
        <tr>
          <td>
            <div style="font-weight:700; color:#0f172a; white-space:nowrap;">${dateStr}</div>
            <div style="font-size:10px; color:#64748b; font-family:monospace; margin-top:1px;">ID: ${uuidShort}</div>
          </td>
          <td style="text-align:center;">
            <a href="analysis_detail.html?uuid=${r.record_uuid}">
              <img src="${imgSrc}" class="leaf-thumb" alt="Leaf thumbnail" style="width:36px; height:36px; border-radius:6px; object-fit:cover; border:1px solid #cbd5e1;" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'36\\' height=\\'36\\'><rect width=\\'36\\' height=\\'36\\' fill=\\'%23e2e8f0\\'/><text x=\\'50%\\' y=\\'55%\\' dominant-baseline=\\'middle\\' text-anchor=\\'middle\\' fill=\\'%2364748b\\' font-size=\\'14\\'>🌿</text></svg>'" />
            </a>
          </td>
          <td>
            ${classBadge}
          </td>
          <td>
            <div style="font-weight:700; color:#0f172a; font-size:11.5px;">${topPct.toFixed(1)}%</div>
            <div style="width:48px; height:4px; background:#e2e8f0; border-radius:999px; overflow:hidden; margin-top:3px;">
              <div style="height:100%; width:${Math.min(100, Math.max(10, Math.round(topPct)))}%; background:${classColor};"></div>
            </div>
          </td>
          <td>
            ${envPill}
            ${envTelemetrySub}
          </td>
          <td>
            ${expertBadge}
          </td>
          <td>
            ${finalBadge}
          </td>
          <td style="text-align:right; white-space:nowrap;">
            <div style="display:flex; align-items:center; justify-content:flex-end; gap:5px;">
              <a href="analysis_detail.html?uuid=${r.record_uuid}" class="action-link-btn" title="Open complete structured analysis" style="padding:4px 8px; font-size:11px;">
                Open →
              </a>
              <a href="${reportUrl}" target="_blank" class="action-link-btn" style="background:#eff6ff; color:#2563eb; border-color:#bfdbfe; padding:4px 8px; font-size:11px;" title="Generate PDF report">
                PDF ↗
              </a>
            </div>
          </td>
        </tr>
      `;
    }).join("");

    tbody.innerHTML = rowsHtml;
    countLabel.textContent = `Showing ${currentSkip + 1}–${currentSkip + records.length} records`;
    prevBtn.disabled = currentSkip === 0;
    nextBtn.disabled = records.length < PAGE_LIMIT;

  } catch (err) {
    console.error("Failed to load records:", err);
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align:center; padding:30px; color:#dc2626;">
          <strong>Unable to load historical records.</strong>
          <p style="margin:4px 0 0; font-size:12px;">Please ensure the backend database service is operational.</p>
        </td>
      </tr>
    `;
  }
}
