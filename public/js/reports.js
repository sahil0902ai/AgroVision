/* =========================================================
   AgroVision — Reports Center
   Enterprise Report Management & Diagnostic Archive
   Fetches verified analysis records from /api/v1/records
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

let allReportsList = [];
let pendingDeleteUuid = null;

document.addEventListener("DOMContentLoaded", () => {
  fetchReportsList();

  // Attach modal change listener for live preview
  const modalSelect = document.getElementById("modalAnalysisSelect");
  if (modalSelect) {
    modalSelect.addEventListener("change", updateModalPreview);
  }
});

// =========================================================
// FETCH & RENDER REPORTS
// =========================================================

async function fetchReportsList() {
  const user = typeof requireLogin === "function" ? requireLogin() : null;
  const userEmailParam = user && user.email ? `&user_email=${encodeURIComponent(user.email)}` : "";

  const tbody = document.getElementById("reportsTableBody");
  const emptyState = document.getElementById("reportsEmptyState");
  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align:center; padding:40px; color:#64748b;">
          <div style="font-size:24px; margin-bottom:8px;">⏳</div>
          <strong>Retrieving verified reports from database…</strong>
        </td>
      </tr>
    `;
  }

  try {
    const res = await fetch(getApiUrl(`/api/v1/records?limit=200${userEmailParam}`));
    if (!res.ok) {
      throw new Error(`Failed to retrieve reports: ${res.statusText}`);
    }

    const records = await res.json();
    allReportsList = Array.isArray(records) ? records : [];
    updateReportsKPIs(allReportsList);
    renderReportsTable(allReportsList);
    populateModalSelect(allReportsList);

  } catch (err) {
    console.error("Error fetching reports:", err);
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align:center; padding:40px; color:#dc2626;">
            <div style="font-size:24px; margin-bottom:8px;">⚠️</div>
            <strong>Could not load reports from database</strong>
            <p style="font-size:12px; color:#64748b; margin:4px 0 12px;">${err.message}</p>
            <button onclick="fetchReportsList()" class="btn btn-action-table">Try Again</button>
          </td>
        </tr>
      `;
    }
  }
}

function updateReportsKPIs(records) {
  const totalEl = document.getElementById("kpiTotalReports");
  const highEl = document.getElementById("kpiHighReports");
  const modEl = document.getElementById("kpiModReports");
  const lowEl = document.getElementById("kpiLowReports");

  const total = records.length;
  let highCount = 0;
  let modCount = 0;
  let lowCount = 0;

  records.forEach(r => {
    const sev = (r.stress_severity || "").toLowerCase();
    if (sev === "high") highCount++;
    else if (sev === "moderate" || sev === "mod") modCount++;
    else lowCount++;
  });

  if (totalEl) totalEl.textContent = total;
  if (highEl) highEl.textContent = highCount;
  if (modEl) modEl.textContent = modCount;
  if (lowEl) lowEl.textContent = lowCount;
}

function renderReportsTable(records) {
  const tbody = document.getElementById("reportsTableBody");
  const emptyState = document.getElementById("reportsEmptyState");
  const tableWrap = document.querySelector(".reports-table-wrap");

  if (!tbody) return;

  if (!records || records.length === 0) {
    tbody.innerHTML = "";
    if (emptyState) {
      emptyState.style.display = "block";
      if (allReportsList && allReportsList.length > 0) {
        emptyState.innerHTML = `
          <div class="agro-empty-state" style="padding:32px 20px;">
            <div class="empty-icon">🔍</div>
            <div class="empty-title">No matching reports found</div>
            <div class="empty-subtitle">Try adjusting your keyword search or filter criteria.</div>
            <div class="empty-actions">
              <button onclick="resetReportsFilters()" class="empty-btn-outline">Reset Filters</button>
            </div>
          </div>
        `;
      } else {
        emptyState.innerHTML = `
          <div class="agro-empty-state" style="padding:32px 20px;">
            <div class="empty-icon">📄</div>
            <div class="empty-title">No reports yet</div>
            <div class="empty-subtitle">Completed analysis reports will appear here.</div>
            <div class="empty-actions">
              <a href="dashboard.html" class="empty-btn-primary">🌿 Start New Analysis</a>
              <button onclick="openGenerateReportModal()" class="empty-btn-outline">Generate from History</button>
            </div>
          </div>
        `;
      }
    }
    if (tableWrap) tableWrap.style.display = "none";
    return;
  }

  if (emptyState) emptyState.style.display = "none";
  if (tableWrap) tableWrap.style.display = "block";

  tbody.innerHTML = records.map(r => {
    const dateObj = r.created_at ? new Date(r.created_at) : new Date();
    const dateFormatted = dateObj.toLocaleString([], {
      month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    // Parse CNN to find top class
    let topClass = "Healthy";
    try {
      if (r.cnn_predictions_json) {
        const cnnObj = JSON.parse(r.cnn_predictions_json);
        if (Object.keys(cnnObj).length > 0) {
          const topKey = Object.keys(cnnObj).reduce((a, b) => (cnnObj[a] > cnnObj[b] ? a : b));
          topClass = topKey.replace("_", " ").replace(/\b\w/g, l => l.toUpperCase());
        }
      }
    } catch (_) {}

    // Parse Fusion relationship
    let relStr = "ALIGNED";
    try {
      if (r.fusion_json) {
        const fObj = JSON.parse(r.fusion_json);
        if (fObj.relationship) relStr = fObj.relationship.toUpperCase();
      }
    } catch (_) {}

    const field = r.field_name || "Field A — Wardha Parcel";
    const reportName = `Cotton Diagnostic Report — ${field}`;
    const uuid = r.record_uuid || `REC-${r.id}`;
    const shortUuid = uuid.length > 13 ? `${uuid.substring(0, 13)}…` : uuid;

    const sev = r.stress_severity || "Moderate";
    let statusBadgeHtml = "";

    if (relStr === "CONFLICTING") {
      statusBadgeHtml = `<span class="status-badge status-conflict">⚠️ Evidence Conflict</span>`;
    } else if (sev.toLowerCase() === "high") {
      statusBadgeHtml = `<span class="status-badge status-high">🚨 High Risk Alert</span>`;
    } else if (sev.toLowerCase() === "moderate") {
      statusBadgeHtml = `<span class="status-badge status-moderate">⚠️ Precaution</span>`;
    } else {
      statusBadgeHtml = `<span class="status-badge status-verified">✓ Verified Baseline</span>`;
    }

    const reportUrl = getApiUrl(`/api/v1/records/${encodeURIComponent(uuid)}/report`);
    const detailUrl = `analysis_detail.html?uuid=${encodeURIComponent(uuid)}`;

    return `
      <tr>
        <!-- 1. Report Name -->
        <td>
          <div style="font-weight:700; color:#0f172a; font-size:12.5px;">
            <a href="${reportUrl}" target="_blank" style="color:#065f46; text-decoration:none; display:inline-flex; align-items:center; gap:6px;">
              <span>📄</span> ${reportName}
            </a>
          </div>
          <div style="font-size:11px; color:#64748b; margin-top:2px;">
            Finding: <strong>${topClass}</strong> · Severity: <strong>${sev}</strong>
          </div>
        </td>

        <!-- 2. Analysis ID -->
        <td>
          <div style="display:flex; align-items:center; gap:6px;">
            <a href="${detailUrl}" style="font-family:monospace; font-size:11.5px; font-weight:700; color:#2563eb; text-decoration:none;">
              ${shortUuid}
            </a>
            <button onclick="copyReportUuid('${uuid}')" title="Copy UUID" style="background:none; border:none; cursor:pointer; font-size:11px; color:#64748b; padding:0;">
              📋
            </button>
          </div>
        </td>

        <!-- 3. Field -->
        <td>
          <div style="font-weight:600; color:#334155;">📍 ${field}</div>
          <div style="font-size:10.5px; color:#64748b;">${r.growth_stage || 'Vegetative'} stage</div>
        </td>

        <!-- 4. Created Date -->
        <td style="white-space:nowrap;">
          <div style="font-size:12px; color:#1e293b;">📅 ${dateFormatted}</div>
        </td>

        <!-- 5. Status -->
        <td>
          ${statusBadgeHtml}
        </td>

        <!-- 6. Actions (View, Download, Delete) -->
        <td style="text-align:right;">
          <div class="action-btn-group">
            <a href="${reportUrl}" target="_blank" class="btn-action-table btn-view" title="View print-ready HTML/PDF report">
              👁️ View
            </a>
            <button onclick="downloadReportJSON('${uuid}')" class="btn-action-table btn-download" title="Download report JSON data">
              💾 Download
            </button>
            <button onclick="openDeleteModal('${uuid}', '${reportName.replace(/'/g, "\\'")}')" class="btn-action-table btn-delete" title="Delete report from database">
              🗑️ Delete
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

// =========================================================
// FILTERING & SEARCH
// =========================================================

function applyReportsFilter() {
  const search = (document.getElementById("reportsSearchInput")?.value || "").toLowerCase().trim();
  const sevFilter = document.getElementById("reportsSeverityFilter")?.value || "";
  const growthFilter = document.getElementById("reportsGrowthFilter")?.value || "";

  let filtered = allReportsList.filter(r => {
    // Severity filter
    if (sevFilter && (r.stress_severity || "").toLowerCase() !== sevFilter.toLowerCase()) {
      return false;
    }

    // Growth stage filter
    if (growthFilter && (r.growth_stage || "").toLowerCase() !== growthFilter.toLowerCase()) {
      return false;
    }

    // Keyword search
    if (search) {
      const uuid = (r.record_uuid || "").toLowerCase();
      const field = (r.field_name || "").toLowerCase();
      const sev = (r.stress_severity || "").toLowerCase();
      const growth = (r.growth_stage || "").toLowerCase();
      const recs = (r.recommendations_json || "").toLowerCase();
      if (!uuid.includes(search) && !field.includes(search) && !sev.includes(search) && !growth.includes(search) && !recs.includes(search)) {
        return false;
      }
    }

    return true;
  });

  renderReportsTable(filtered);
}

// =========================================================
// MODAL & REPORT GENERATION
// =========================================================

function openGenerateReportModal() {
  const modal = document.getElementById("generateReportModal");
  if (modal) modal.classList.add("active");
  updateModalPreview();
}

function closeGenerateReportModal() {
  const modal = document.getElementById("generateReportModal");
  if (modal) modal.classList.remove("active");
}

function populateModalSelect(records) {
  const select = document.getElementById("modalAnalysisSelect");
  if (!select) return;

  if (records.length === 0) {
    select.innerHTML = `<option value="">No stored analyses available. Run a new analysis first.</option>`;
    return;
  }

  select.innerHTML = records.map(r => {
    const uuid = r.record_uuid || `REC-${r.id}`;
    const dateStr = r.created_at ? new Date(r.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : "Recent";
    const field = r.field_name || "Wardha Field";
    const sev = r.stress_severity || "Moderate";
    return `<option value="${uuid}">${field} · ${dateStr} · Severity: ${sev} (${uuid.substring(0, 8)}…)</option>`;
  }).join("");

  updateModalPreview();
}

function updateModalPreview() {
  const select = document.getElementById("modalAnalysisSelect");
  const preview = document.getElementById("modalAnalysisPreview");
  if (!select || !preview) return;

  const selectedUuid = select.value;
  if (!selectedUuid) {
    preview.style.display = "none";
    return;
  }

  const record = allReportsList.find(r => (r.record_uuid || `REC-${r.id}`) === selectedUuid);
  if (!record) {
    preview.style.display = "none";
    return;
  }

  let topClass = "Healthy";
  try {
    if (record.cnn_predictions_json) {
      const cnn = JSON.parse(record.cnn_predictions_json);
      if (Object.keys(cnn).length > 0) {
        const topKey = Object.keys(cnn).reduce((a, b) => (cnn[a] > cnn[b] ? a : b));
        topClass = topKey.replace("_", " ").replace(/\b\w/g, l => l.toUpperCase());
      }
    }
  } catch (_) {}

  preview.style.display = "block";
  preview.innerHTML = `
    <div style="font-weight:700; color:#0f172a; margin-bottom:4px;">Selected Analysis Preview:</div>
    <div style="color:#334155; line-height:1.45;">
      <strong>Field:</strong> ${record.field_name || 'Field A'} · <strong>Growth Stage:</strong> ${record.growth_stage || 'Vegetative'}<br>
      <strong>Visual Finding:</strong> ${topClass} · <strong>Environmental Risk:</strong> ${record.stress_severity || 'Moderate'}<br>
      <strong>Telemetry:</strong> Temp: ${(record.temperature || 31).toFixed(1)}°C · Humidity: ${(record.humidity || 72).toFixed(1)}% · Soil: ${(record.soil_moisture ? (record.soil_moisture <= 1 ? record.soil_moisture * 100 : record.soil_moisture).toFixed(1) : 68)}%
    </div>
  `;
}

function generateSelectedReport() {
  const select = document.getElementById("modalAnalysisSelect");
  if (!select || !select.value) {
    alert("Please select a valid analysis session from the list.");
    return;
  }

  const uuid = select.value;
  closeGenerateReportModal();
  window.open(getApiUrl(`/api/v1/records/${encodeURIComponent(uuid)}/report`), "_blank");
}

// =========================================================
// DELETE MODAL & ACTION
// =========================================================

function openDeleteModal(uuid, name) {
  pendingDeleteUuid = uuid;
  const modal = document.getElementById("deleteConfirmModal");
  const nameEl = document.getElementById("deleteReportName");
  const idEl = document.getElementById("deleteReportId");

  if (nameEl) nameEl.textContent = name;
  if (idEl) idEl.textContent = `UUID: ${uuid}`;
  if (modal) modal.classList.add("active");
}

function closeDeleteModal() {
  pendingDeleteUuid = null;
  const modal = document.getElementById("deleteConfirmModal");
  if (modal) modal.classList.remove("active");
}

async function executeDeleteRecord() {
  if (!pendingDeleteUuid) return;

  const btn = document.getElementById("confirmDeleteBtn");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Deleting…";
  }

  try {
    const res = await fetch(getApiUrl(`/api/v1/records/${encodeURIComponent(pendingDeleteUuid)}`), {
      method: "DELETE"
    });

    if (!res.ok) {
      throw new Error(`Failed to delete record: ${res.statusText}`);
    }

    closeDeleteModal();
    // Refresh reports list
    await fetchReportsList();

  } catch (err) {
    console.error("Delete error:", err);
    alert(`Could not delete report: ${err.message}`);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Delete Report";
    }
  }
}

// =========================================================
// DOWNLOAD UTILITIES
// =========================================================

function downloadReportJSON(uuid) {
  const record = allReportsList.find(r => r.record_uuid === uuid);
  if (!record) {
    alert("Record not found in local cache.");
    return;
  }

  const jsonStr = JSON.stringify(record, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `agrovision_report_${uuid}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function resetReportsFilters() {
  const search = document.getElementById("reportsSearchInput");
  const sev = document.getElementById("reportsSeverityFilter");
  const growth = document.getElementById("reportsGrowthFilter");
  if (search) search.value = "";
  if (sev) sev.value = "";
  if (growth) growth.value = "";
  renderReportsTable(allReportsList);
}

function exportReportsCSV() {
  const user = typeof requireLogin === "function" ? requireLogin() : null;
  const userEmailParam = user && user.email ? `?user_email=${encodeURIComponent(user.email)}` : "";
  window.location.href = getApiUrl(`/api/v1/records/export/csv${userEmailParam}`);
}

function copyReportUuid(uuid) {
  navigator.clipboard.writeText(uuid).then(() => {
    alert("Analysis UUID copied to clipboard: " + uuid);
  }).catch(() => {
    prompt("Copy Analysis UUID:", uuid);
  });
}
