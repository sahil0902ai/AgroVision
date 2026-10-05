/* =========================================================
   AgroVision — Analysis History & Reports Logic
   Fetches verified records from /api/v1/records
   ========================================================= */

let currentSkip = 0;
const PAGE_LIMIT = 15;
let debounceTimeout = null;
let latestRecordUuid = null;

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
  loadRecords();
});

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
          <td colspan="7" style="text-align:center; padding:40px; color:#64748b;">
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
    }

    const rowsHtml = records.map(r => {
      // Parse top CNN class safely
      let topClass = "Evaluated";
      let topPct = 0;
      try {
        if (r.cnn_predictions_json) {
          const cnnObj = JSON.parse(r.cnn_predictions_json);
          const topKey = Object.keys(cnnObj).reduce((a, b) => cnnObj[a] > cnnObj[b] ? a : b);
          topClass = topKey.replace("_", " ").replace(/\b\w/g, l => l.toUpperCase());
          topPct = cnnObj[topKey];
        }
      } catch (_) {}

      // Color map for predicted class matching Figure 8
      const classColorMap = {
        "Water Stress": "#dc2626",
        "Heat Stress": "#dc2626",
        "Nutrient Deficiency": "#d97706",
        "Pollution": "#dc2626",
        "Healthy": "#16a34a"
      };
      const classColor = classColorMap[topClass] || "#0d3b2e";

      const sevIcons = {
        "High": "🔴 High",
        "Moderate": "🟡 Moderate",
        "Low": "🟢 Low"
      };
      const sevDisplay = sevIcons[sev] || `${sev}`;

      const dateStr = r.created_at ? new Date(r.created_at).toLocaleString([], {
        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      }) : "Recent";

      const imgSrc = r.image_url || "images/leaf_placeholder.jpg";

      const expertStatus = r.expert_veto_rule_triggered ? "⚠️ Precaution" : "✓ Normal";
      const expertColor = r.expert_veto_rule_triggered ? "#d97706" : "#059669";

      return `
        <tr>
          <td style="color:#0f172a; font-weight:600; white-space:nowrap;">${dateStr}</td>
          <td>
            <a href="analysis_detail.html?uuid=${r.record_uuid}">
              <img src="${imgSrc}" class="leaf-thumb" alt="Leaf thumbnail" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'44\\' height=\\'44\\'><rect width=\\'44\\' height=\\'44\\' fill=\\'%23e2e8f0\\'/><text x=\\'50%\\' y=\\'55%\\' dominant-baseline=\\'middle\\' text-anchor=\\'middle\\' fill=\\'%2364748b\\' font-size=\\'18\\'>🌿</text></svg>'" />
            </a>
          </td>
          <td>
            <strong style="color:${classColor}; font-size:13px;">${topClass}</strong>
            <div style="font-size:10px; color:#94a3b8;">${r.record_uuid}</div>
          </td>
          <td>
            <span style="font-weight:700; color:#0f172a;">${topPct ? topPct.toFixed(0) + "%" : "—"}</span>
          </td>
          <td>
            <span style="font-weight:600; font-size:12px;">${sevDisplay}</span>
          </td>
          <td>
            <span style="font-weight:700; font-size:11px; color:${expertColor};">${expertStatus}</span>
          </td>
          <td style="text-align:right; white-space:nowrap;">
            <a href="analysis_detail.html?uuid=${r.record_uuid}" class="action-link-btn" title="View complete structured analysis">
              View ✓
            </a>
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
        <td colspan="7" style="text-align:center; padding:30px; color:#dc2626;">
          <strong>Unable to load historical records.</strong>
          <p style="margin:4px 0 0; font-size:12px;">Please ensure the backend database service is operational.</p>
        </td>
      </tr>
    `;
  }
}
