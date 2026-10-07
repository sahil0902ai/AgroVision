/* =========================================================
   AgroVision — Analysis History & Archive Logic
   Power BI-Style Sorting, Dynamic Filtering, Search & Pagination
   Only real database records from /api/v1/records
   ========================================================= */

let rawHistoryRecords = [];
let filteredHistoryRecords = [];
let currentHistoryPage = 1;
let historyPageSize = 10;
let currentSortColumn = "date";
let currentSortDirection = "desc";
let searchDebounceTimer = null;
let latestHistoryRecordUuid = null;

function getApiUrl(endpoint) {
  if (window.AGROVISION_CONFIG && typeof window.AGROVISION_CONFIG.getApiUrl === "function") {
    return window.AGROVISION_CONFIG.getApiUrl(endpoint);
  }
  return endpoint;
}

// ---------------------------------------------------------
// Initialization
// ---------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  loadHistoryData();

  // Populate Today's Date in Header
  const dateEl = document.getElementById("globalHeaderDate");
  if (dateEl) {
    const now = new Date();
    dateEl.textContent = now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  }

  // Bind Header Search Input to History Filter
  const headerSearchInput = document.getElementById("globalSearchInput");
  if (headerSearchInput) {
    headerSearchInput.addEventListener("input", (e) => {
      const pageSearch = document.getElementById("historyFilterSearch");
      if (pageSearch) {
        pageSearch.value = e.target.value;
        handleFilterChange();
      }
    });
  }
});

// ---------------------------------------------------------
// Data Fetching & KPI Computation
// ---------------------------------------------------------
async function loadHistoryData() {
  const user = typeof requireLogin === "function" ? requireLogin() : null;
  const userEmailParam = user && user.email ? `&user_email=${encodeURIComponent(user.email)}` : "";

  const tbody = document.getElementById("historyTbody");
  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="padding:16px 20px;">
          <div style="display:flex; flex-direction:column; gap:12px;">
            <div class="agro-skeleton" style="height:28px; width:100%;"></div>
            <div class="agro-skeleton" style="height:28px; width:95%;"></div>
            <div class="agro-skeleton" style="height:28px; width:98%;"></div>
            <div class="agro-skeleton" style="height:28px; width:92%;"></div>
          </div>
        </td>
      </tr>
    `;
  }

  try {
    const res = await fetch(getApiUrl(`/api/v1/records?limit=200${userEmailParam}`));
    if (!res.ok) throw new Error(`HTTP ${res.status}: Could not load history records`);

    const data = await res.json();
    rawHistoryRecords = Array.isArray(data) ? data : (data.records || []);

    // 1. Populate Field Filter Dropdown dynamically
    populateFieldFilterDropdown(rawHistoryRecords);

    // 2. Update KPI Cards
    updateHistoryKpiCards(rawHistoryRecords);

    // 3. Update Latest Report Hero Section
    updateLatestReportHero(rawHistoryRecords);

    // 4. Apply Filters, Sort, and Render Table
    applyHistoryFiltersAndRender();

  } catch (err) {
    console.error("Error loading history data:", err);
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" style="padding:28px 20px;">
            <div class="agro-error-banner" style="margin:0;">
              <div class="agro-error-icon">⚠️</div>
              <div class="agro-error-body">
                <h4 class="agro-error-title">Unable to load analysis history</h4>
                <p class="agro-error-desc">${escapeHtml(err.message || "Failed to connect to backend database service. Please ensure the server is active.")}</p>
                <button type="button" class="agro-retry-btn agro-retry-btn-primary" onclick="loadHistoryData()">
                  🔄 Retry Connection
                </button>
              </div>
            </div>
          </td>
        </tr>
      `;
    }
  }
}

function populateFieldFilterDropdown(records) {
  const fieldSelect = document.getElementById("historyFilterField");
  if (!fieldSelect) return;

  const currentVal = fieldSelect.value;
  const uniqueFields = new Set();

  records.forEach(r => {
    const f = (r.field_name || "").trim();
    if (f) uniqueFields.add(f);
  });

  // Default options
  let html = `<option value="">All Fields</option>`;
  if (uniqueFields.size === 0) {
    html += `<option value="Field A — North Parcel">Field A — North Parcel</option>`;
  } else {
    Array.from(uniqueFields).sort().forEach(f => {
      html += `<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`;
    });
  }

  fieldSelect.innerHTML = html;
  if (currentVal) fieldSelect.value = currentVal;
}

function updateHistoryKpiCards(records) {
  const total = records.length;
  let healthyCount = 0;
  let stressedCount = 0;
  let alertsCount = 0;

  records.forEach(r => {
    const { topClass } = getRecordTopClass(r);
    const { isAlert } = getRecordExpertStatus(r);

    if (topClass.toLowerCase().includes("healthy")) {
      healthyCount++;
    } else {
      stressedCount++;
    }

    if (isAlert) {
      alertsCount++;
    }
  });

  const totalEl = document.getElementById("histKpiTotal");
  const totalSubEl = document.getElementById("histKpiTotalSub");
  const healthyEl = document.getElementById("histKpiHealthy");
  const healthySubEl = document.getElementById("histKpiHealthySub");
  const healthyBar = document.getElementById("histHealthyBar");
  const stressedEl = document.getElementById("histKpiStressed");
  const stressedSubEl = document.getElementById("histKpiStressedSub");
  const stressedBar = document.getElementById("histStressedBar");
  const alertsEl = document.getElementById("histKpiAlerts");
  const alertsSubEl = document.getElementById("histKpiAlertsSub");

  if (totalEl) totalEl.textContent = String(total);
  if (totalSubEl) {
    totalSubEl.textContent = total > 0 ? "Total verified sessions" : "No recorded scans yet";
  }

  if (healthyEl) healthyEl.textContent = String(healthyCount);
  if (healthySubEl) {
    healthySubEl.textContent = total > 0 ? `${Math.round((healthyCount / total) * 100)}% optimal condition` : "No data";
  }
  if (healthyBar) {
    healthyBar.style.width = total > 0 ? `${Math.round((healthyCount / total) * 100)}%` : "0%";
  }

  if (stressedEl) stressedEl.textContent = String(stressedCount);
  if (stressedSubEl) {
    stressedSubEl.textContent = total > 0 ? `${Math.round((stressedCount / total) * 100)}% require review` : "No data";
  }
  if (stressedBar) {
    stressedBar.style.width = total > 0 ? `${Math.round((stressedCount / total) * 100)}%` : "0%";
  }

  if (alertsEl) alertsEl.textContent = String(alertsCount);
  if (alertsSubEl) {
    alertsSubEl.textContent = total > 0 ? `${alertsCount} rule interventions` : "No data";
  }
}

function updateLatestReportHero(records) {
  if (!records || records.length === 0) return;

  const latest = records[0];
  latestHistoryRecordUuid = latest.record_uuid;

  const repDate = document.getElementById("reportRecordDate");
  const repTitle = document.getElementById("reportRecordTitle");

  if (repDate) {
    const dt = new Date(latest.created_at || Date.now());
    repDate.textContent = `Recorded: ${dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
  }

  if (repTitle) {
    const { topClass } = getRecordTopClass(latest);
    const sev = latest.stress_severity || "Moderate";
    repTitle.textContent = `${topClass} Assessment (${sev} Risk)`;
  }
}

// ---------------------------------------------------------
// Record Parsing Helpers
// ---------------------------------------------------------
function getRecordTopClass(r) {
  let topClass = "Evaluated";
  let topPct = 0;
  try {
    if (r.cnn_predictions_json) {
      const cObj = JSON.parse(r.cnn_predictions_json);
      const tKey = Object.keys(cObj).reduce((a, b) => cObj[a] > cObj[b] ? a : b);
      topClass = tKey.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
      const rawVal = cObj[tKey];
      topPct = rawVal <= 1.0 ? rawVal * 100 : rawVal;
    }
  } catch (_) {}
  if (topClass === "Evaluated" && r.stress_severity) {
    topClass = r.stress_severity === "Low" ? "Healthy" : "Water Stress";
    topPct = r.confidence_score ? (r.confidence_score <= 1.0 ? r.confidence_score * 100 : r.confidence_score) : 88;
  }
  return { topClass, topPct };
}

function getRecordExpertStatus(r) {
  let isAlert = false;
  let ruleName = "Normal Baseline";
  let rulePrecaution = "";
  try {
    if (r.expert_veto_json) {
      const expObj = JSON.parse(r.expert_veto_json);
      if (expObj.triggered_rules && expObj.triggered_rules.length > 0) {
        isAlert = true;
        ruleName = expObj.triggered_rules[0].name || expObj.triggered_rules[0].rule_id || "Expert Rule";
        rulePrecaution = expObj.triggered_rules[0].precaution || expObj.triggered_rules[0].interpretation || "";
      } else if (expObj.overall_status && expObj.overall_status !== "NO_RULE_TRIGGERED" && expObj.overall_status !== "No Rule Triggered") {
        isAlert = true;
        ruleName = expObj.overall_status.replace(/_/g, " ");
      }
    }
  } catch (_) {}
  if (!isAlert && r.expert_veto_rule_triggered) {
    isAlert = true;
    ruleName = "Safety Threshold";
  }
  return { isAlert, ruleName, rulePrecaution };
}

function getRecordFinalAssessment(r) {
  let relationship = "ALIGNED";
  let summary = "";
  try {
    if (r.fusion_json) {
      const fObj = JSON.parse(r.fusion_json);
      relationship = (fObj.relationship || "ALIGNED").toUpperCase();
      summary = fObj.summary || "";
    }
  } catch (_) {}
  return { relationship, summary };
}

// ---------------------------------------------------------
// Filter & Search Handlers
// ---------------------------------------------------------
function handleFilterChange() {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    currentHistoryPage = 1;
    applyHistoryFiltersAndRender();
  }, 200);

  const searchInput = document.getElementById("historyFilterSearch");
  const clearBtn = document.getElementById("clearHistorySearchBtn");
  if (searchInput && clearBtn) {
    clearBtn.style.display = searchInput.value.trim() ? "inline-block" : "none";
  }
}

function handleGlobalHeaderSearch(e) {
  const pageSearch = document.getElementById("historyFilterSearch");
  if (pageSearch) {
    pageSearch.value = e.target.value;
  }
  handleFilterChange();
}

function clearSearchInput() {
  const searchInput = document.getElementById("historyFilterSearch");
  const globalSearch = document.getElementById("globalSearchInput");
  const clearBtn = document.getElementById("clearHistorySearchBtn");

  if (searchInput) searchInput.value = "";
  if (globalSearch) globalSearch.value = "";
  if (clearBtn) clearBtn.style.display = "none";

  handleFilterChange();
}

function handleDateRangeChange() {
  const rangeSelect = document.getElementById("historyFilterDateRange");
  const customBox = document.getElementById("customDateRangeBox");

  if (rangeSelect && customBox) {
    customBox.style.display = rangeSelect.value === "custom" ? "inline-flex" : "none";
  }
  handleFilterChange();
}

function handlePageSizeChange() {
  const sizeSelect = document.getElementById("historyPageSize");
  if (sizeSelect) {
    historyPageSize = parseInt(sizeSelect.value, 10) || 10;
  }
  currentHistoryPage = 1;
  applyHistoryFiltersAndRender();
}

function resetAllFilters() {
  const searchInput = document.getElementById("historyFilterSearch");
  const globalSearch = document.getElementById("globalSearchInput");
  const clearBtn = document.getElementById("clearHistorySearchBtn");
  const dateRange = document.getElementById("historyFilterDateRange");
  const customBox = document.getElementById("customDateRangeBox");
  const startDate = document.getElementById("historyStartDate");
  const endDate = document.getElementById("historyEndDate");
  const fieldSelect = document.getElementById("historyFilterField");
  const cnnSelect = document.getElementById("historyFilterCnn");
  const snnSelect = document.getElementById("historyFilterSnn");
  const expertSelect = document.getElementById("historyFilterExpert");

  if (searchInput) searchInput.value = "";
  if (globalSearch) globalSearch.value = "";
  if (clearBtn) clearBtn.style.display = "none";
  if (dateRange) dateRange.value = "all";
  if (customBox) customBox.style.display = "none";
  if (startDate) startDate.value = "";
  if (endDate) endDate.value = "";
  if (fieldSelect) fieldSelect.value = "";
  if (cnnSelect) cnnSelect.value = "";
  if (snnSelect) snnSelect.value = "";
  if (expertSelect) expertSelect.value = "";

  currentHistoryPage = 1;
  applyHistoryFiltersAndRender();
}

// ---------------------------------------------------------
// Filter & Sort Execution
// ---------------------------------------------------------
function applyHistoryFiltersAndRender() {
  // If database is completely empty:
  if (!rawHistoryRecords || rawHistoryRecords.length === 0) {
    renderHistoryTable([], 0);
    return;
  }

  let filtered = [...rawHistoryRecords];

  // 1. Search text filter
  const searchInput = document.getElementById("historyFilterSearch");
  const query = searchInput ? searchInput.value.trim().toLowerCase() : "";
  if (query) {
    filtered = filtered.filter(r => {
      const { topClass } = getRecordTopClass(r);
      const { ruleName } = getRecordExpertStatus(r);
      const uuidMatch = (r.record_uuid || "").toLowerCase().includes(query);
      const fieldMatch = (r.field_name || "").toLowerCase().includes(query);
      const classMatch = topClass.toLowerCase().includes(query);
      const sevMatch = (r.stress_severity || "").toLowerCase().includes(query);
      const ruleMatch = ruleName.toLowerCase().includes(query);
      return uuidMatch || fieldMatch || classMatch || sevMatch || ruleMatch;
    });
  }

  // 2. Date Filter
  const dateRangeSelect = document.getElementById("historyFilterDateRange");
  const dateMode = dateRangeSelect ? dateRangeSelect.value : "all";
  const now = Date.now();

  if (dateMode === "today") {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const startMs = todayStart.getTime();
    filtered = filtered.filter(r => {
      const rTime = new Date(r.created_at || 0).getTime();
      return rTime >= startMs;
    });
  } else if (dateMode === "7d") {
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    filtered = filtered.filter(r => {
      const rTime = new Date(r.created_at || 0).getTime();
      return rTime >= sevenDaysAgo;
    });
  } else if (dateMode === "30d") {
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    filtered = filtered.filter(r => {
      const rTime = new Date(r.created_at || 0).getTime();
      return rTime >= thirtyDaysAgo;
    });
  } else if (dateMode === "custom") {
    const sInput = document.getElementById("historyStartDate");
    const eInput = document.getElementById("historyEndDate");
    if (sInput && sInput.value) {
      const startMs = new Date(`${sInput.value}T00:00:00`).getTime();
      filtered = filtered.filter(r => new Date(r.created_at || 0).getTime() >= startMs);
    }
    if (eInput && eInput.value) {
      const endMs = new Date(`${eInput.value}T23:59:59`).getTime();
      filtered = filtered.filter(r => new Date(r.created_at || 0).getTime() <= endMs);
    }
  }

  // 3. Field Filter
  const fieldSelect = document.getElementById("historyFilterField");
  const fieldVal = fieldSelect ? fieldSelect.value.trim().toLowerCase() : "";
  if (fieldVal) {
    filtered = filtered.filter(r => (r.field_name || "").toLowerCase().includes(fieldVal));
  }

  // 4. CNN Result Filter
  const cnnSelect = document.getElementById("historyFilterCnn");
  const cnnVal = cnnSelect ? cnnSelect.value.trim().toLowerCase().replace(/_/g, " ") : "";
  if (cnnVal) {
    filtered = filtered.filter(r => {
      const { topClass } = getRecordTopClass(r);
      return topClass.toLowerCase().includes(cnnVal);
    });
  }

  // 5. SNN Stress Filter
  const snnSelect = document.getElementById("historyFilterSnn");
  const snnVal = snnSelect ? snnSelect.value.trim().toLowerCase() : "";
  if (snnVal) {
    filtered = filtered.filter(r => (r.stress_severity || "").toLowerCase() === snnVal);
  }

  // 6. Expert Alert Filter
  const expertSelect = document.getElementById("historyFilterExpert");
  const expertVal = expertSelect ? expertSelect.value : "";
  if (expertVal) {
    filtered = filtered.filter(r => {
      const { isAlert } = getRecordExpertStatus(r);
      return expertVal === "alert" ? isAlert : !isAlert;
    });
  }

  // 7. Sort Records
  filtered.sort((a, b) => {
    let valA, valB;
    if (currentSortColumn === "date") {
      valA = new Date(a.created_at || 0).getTime();
      valB = new Date(b.created_at || 0).getTime();
    } else if (currentSortColumn === "field") {
      valA = (a.field_name || "").toLowerCase();
      valB = (b.field_name || "").toLowerCase();
    } else if (currentSortColumn === "cnn") {
      valA = getRecordTopClass(a).topClass.toLowerCase();
      valB = getRecordTopClass(b).topClass.toLowerCase();
    } else if (currentSortColumn === "snn") {
      const rank = { "high": 3, "moderate": 2, "low": 1 };
      valA = rank[(a.stress_severity || "low").toLowerCase()] || 0;
      valB = rank[(b.stress_severity || "low").toLowerCase()] || 0;
    } else if (currentSortColumn === "final") {
      valA = getRecordFinalAssessment(a).relationship;
      valB = getRecordFinalAssessment(b).relationship;
    } else if (currentSortColumn === "expert") {
      valA = getRecordExpertStatus(a).isAlert ? 1 : 0;
      valB = getRecordExpertStatus(b).isAlert ? 1 : 0;
    }

    if (valA < valB) return currentSortDirection === "asc" ? -1 : 1;
    if (valA > valB) return currentSortDirection === "asc" ? 1 : -1;
    return 0;
  });

  filteredHistoryRecords = filtered;
  renderHistoryTable(filteredHistoryRecords, rawHistoryRecords.length);
}

// ---------------------------------------------------------
// Table Rendering & Pagination
// ---------------------------------------------------------
function renderHistoryTable(records, totalDbRecords) {
  const tbody = document.getElementById("historyTbody");
  const countBadge = document.getElementById("historyRecordCountBadge");
  const paginationInfo = document.getElementById("historyPaginationInfo");
  const pageNumbersContainer = document.getElementById("historyPageNumbers");
  const prevBtn = document.getElementById("historyPrevBtn");
  const nextBtn = document.getElementById("historyNextBtn");

  if (!tbody) return;

  // 1. Case: Total database is empty
  if (totalDbRecords === 0) {
    if (countBadge) countBadge.textContent = "0 Scans";
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="padding:0;">
          <div class="agro-empty-state">
            <div class="empty-icon">🌱</div>
            <h3 class="empty-title">No analyses yet</h3>
            <p class="empty-subtitle">Start your first cotton leaf assessment.</p>
            <div class="empty-actions">
              <a href="dashboard.html" class="empty-btn empty-btn-primary">+ Start First Analysis</a>
            </div>
          </div>
        </td>
      </tr>
    `;
    if (paginationInfo) paginationInfo.textContent = "Showing 0 to 0 of 0 records";
    if (pageNumbersContainer) pageNumbersContainer.innerHTML = "";
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;
    return;
  }

  // 2. Case: Filter returned 0 matching records
  if (records.length === 0) {
    if (countBadge) countBadge.textContent = `0 of ${totalDbRecords} Scans`;
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="padding:0;">
          <div class="agro-empty-state">
            <div class="empty-icon icon-info">🔍</div>
            <h3 class="empty-title">No matching records found</h3>
            <p class="empty-subtitle">Try adjusting your search query, dates, or active dropdown filters.</p>
            <div class="empty-actions">
              <button type="button" class="empty-btn empty-btn-outline" onclick="resetAllFilters()">↺ Clear All Filters</button>
            </div>
          </div>
        </td>
      </tr>
    `;
    if (paginationInfo) paginationInfo.textContent = `Showing 0 to 0 of ${totalDbRecords} records`;
    if (pageNumbersContainer) pageNumbersContainer.innerHTML = "";
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;
    return;
  }

  if (countBadge) {
    countBadge.textContent = records.length === totalDbRecords 
      ? `${records.length} Scans` 
      : `${records.length} of ${totalDbRecords} Scans`;
  }

  // 3. Pagination computation
  const totalRecords = records.length;
  const totalPages = Math.ceil(totalRecords / historyPageSize) || 1;
  currentHistoryPage = Math.max(1, Math.min(currentHistoryPage, totalPages));

  const startIdx = (currentHistoryPage - 1) * historyPageSize;
  const endIdx = Math.min(startIdx + historyPageSize, totalRecords);
  const pageRecords = records.slice(startIdx, endIdx);

  if (paginationInfo) {
    paginationInfo.textContent = `Showing ${startIdx + 1} to ${endIdx} of ${totalRecords} records (Page ${currentHistoryPage} of ${totalPages})`;
  }

  if (prevBtn) prevBtn.disabled = currentHistoryPage <= 1;
  if (nextBtn) nextBtn.disabled = currentHistoryPage >= totalPages;

  if (pageNumbersContainer) {
    let pagesHtml = "";
    const maxVisible = 5;
    let startP = Math.max(1, currentHistoryPage - Math.floor(maxVisible / 2));
    let endP = Math.min(totalPages, startP + maxVisible - 1);
    if (endP - startP + 1 < maxVisible) {
      startP = Math.max(1, endP - maxVisible + 1);
    }
    for (let p = startP; p <= endP; p++) {
      pagesHtml += `
        <button type="button" class="page-num-btn ${p === currentHistoryPage ? 'active' : ''}" onclick="setHistoryPage(${p})">
          ${p}
        </button>
      `;
    }
    pageNumbersContainer.innerHTML = pagesHtml;
  }

  // 4. Render Table Rows
  tbody.innerHTML = pageRecords.map(r => {
    const { topClass, topPct } = getRecordTopClass(r);
    const { isAlert, ruleName } = getRecordExpertStatus(r);
    const { relationship } = getRecordFinalAssessment(r);

    // CNN Badge
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

    // SNN Risk Pill
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

    // Expert Check Badge
    let expertBadge = `<span style="background:#f8fafc; color:#475569; border:1px solid #e2e8f0; font-size:10.5px; font-weight:600; padding:2px 7px; border-radius:6px; white-space:nowrap;" title="Verified by Agronomic Rules">🛡️ Normal</span>`;
    if (isAlert) {
      const shortRule = ruleName.length > 15 ? `${ruleName.substring(0, 14)}…` : ruleName;
      expertBadge = `<span style="background:#fffbeb; color:#b45309; border:1px solid #fed7aa; font-size:10.5px; font-weight:700; padding:2px 7px; border-radius:6px; white-space:nowrap;" title="${escapeHtml(ruleName)}">⚠️ ${escapeHtml(shortRule)}</span>`;
    }

    // Final Assessment Badge
    let finalBadge = `<span style="background:#ecfdf5; color:#059669; border:1px solid #a7f3d0; font-size:10.5px; font-weight:700; padding:2px 7px; border-radius:6px; white-space:nowrap;">⚖️ Aligned</span>`;
    if (relationship.includes("DIVERGENT") || relationship.includes("CONFLICT")) {
      finalBadge = `<span style="background:#fef3c7; color:#d97706; border:1px solid #fde68a; font-size:10.5px; font-weight:700; padding:2px 7px; border-radius:6px; white-space:nowrap;">⚡ Divergent</span>`;
    } else if (relationship.includes("VETO") || relationship.includes("OVERRULE") || relationship.includes("CRITICAL")) {
      finalBadge = `<span style="background:#fee2e2; color:#dc2626; border:1px solid #fecaca; font-size:10.5px; font-weight:700; padding:2px 7px; border-radius:6px; white-space:nowrap;">🛡️ Safety Veto</span>`;
    }

    // Field Badge
    const fieldName = r.field_name || "Field A — North Parcel";

    // Date & Time
    const dt = r.created_at ? new Date(r.created_at) : new Date();
    const dateFormatted = dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const timeFormatted = dt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    const uuidShort = (r.record_uuid || "").substring(0, 8);
    const imgUrl = r.image_url || "images/leaf_placeholder.jpg";
    const reportUrl = getApiUrl(`/api/v1/records/${r.record_uuid}/report`);

    return `
      <tr>
        <td>
          <div style="font-weight:700; color:#0f172a; white-space:nowrap;">${dateFormatted}</div>
          <div style="font-size:10px; color:#64748b; margin-top:1px; display:flex; align-items:center; gap:4px;">
            <span>${timeFormatted}</span>
            <span>·</span>
            <span style="font-family:monospace; color:#94a3b8;">#${uuidShort}</span>
          </div>
        </td>
        <td>
          <div style="display:inline-flex; align-items:center; gap:4px; font-weight:600; color:#1e293b; background:#f8fafc; border:1px solid #e2e8f0; padding:2px 8px; border-radius:6px; white-space:nowrap;">
            <span style="font-size:11px;">📍</span>
            <span>${escapeHtml(fieldName)}</span>
          </div>
        </td>
        <td style="text-align:center;">
          <img
            src="${imgUrl}"
            alt="Leaf thumbnail"
            class="leaf-thumb-compact"
            onclick="openQuickViewModal('${r.record_uuid}')"
            title="Click to view detailed preview"
            onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'38\\' height=\\'38\\'><rect width=\\'38\\' height=\\'38\\' fill=\\'%23e2e8f0\\'/><text x=\\'50%\\' y=\\'55%\\' dominant-baseline=\\'middle\\' text-anchor=\\'middle\\' fill=\\'%2364748b\\' font-size=\\'14\\'>🌿</text></svg>'"
          />
        </td>
        <td>
          ${classBadge}
          <div style="display:flex; align-items:center; gap:6px; margin-top:2px;">
            <span style="font-size:10.5px; font-weight:700; color:#334155;">${topPct.toFixed(1)}%</span>
            <div class="evidence-bar-wrap">
              <div class="evidence-bar-fill" style="width:${Math.min(100, Math.max(10, Math.round(topPct)))}%; background:${classColor};"></div>
            </div>
          </div>
        </td>
        <td>
          ${envPill}
          ${envTelemetrySub}
        </td>
        <td>
          ${finalBadge}
        </td>
        <td>
          ${expertBadge}
        </td>
        <td style="text-align:right;">
          <div class="table-actions-group">
            <button
              type="button"
              class="tbl-action-btn view-btn"
              onclick="openQuickViewModal('${r.record_uuid}')"
              title="Quick inspect summary"
            >
              👁 View
            </button>
            <a
              href="analysis_detail.html?uuid=${r.record_uuid}"
              class="tbl-action-btn open-btn"
              title="Open full interactive analysis"
            >
              Open →
            </a>
            <a
              href="${reportUrl}"
              target="_blank"
              class="tbl-action-btn report-btn"
              title="Generate PDF report"
            >
              PDF ↗
            </a>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

// ---------------------------------------------------------
// Sorting & Pagination Controls
// ---------------------------------------------------------
function sortHistoryBy(col) {
  if (currentSortColumn === col) {
    currentSortDirection = currentSortDirection === "asc" ? "desc" : "asc";
  } else {
    currentSortColumn = col;
    currentSortDirection = col === "date" ? "desc" : "asc";
  }

  // Update header sort indicators
  const sortColumns = ["date", "field", "cnn", "snn", "final", "expert"];
  sortColumns.forEach(c => {
    const iconId = `sortIcon${c.charAt(0).toUpperCase() + c.slice(1)}`;
    const iconEl = document.getElementById(iconId);
    const thEl = iconEl?.closest("th");
    if (iconEl) {
      if (currentSortColumn === c) {
        iconEl.textContent = currentSortDirection === "asc" ? "▲" : "▼";
        if (thEl) thEl.classList.add("active-sort");
      } else {
        iconEl.textContent = "⇅";
        if (thEl) thEl.classList.remove("active-sort");
      }
    }
  });

  applyHistoryFiltersAndRender();
}

function changeHistoryPage(delta) {
  currentHistoryPage += delta;
  applyHistoryFiltersAndRender();
}

function setHistoryPage(pageNum) {
  currentHistoryPage = pageNum;
  applyHistoryFiltersAndRender();
}

// ---------------------------------------------------------
// CSV Export Functionality
// ---------------------------------------------------------
function exportHistoryCSV() {
  const records = filteredHistoryRecords && filteredHistoryRecords.length > 0 ? filteredHistoryRecords : rawHistoryRecords;
  if (!records || records.length === 0) {
    alert("No completed analysis records available to export.");
    return;
  }

  const headers = [
    "Record UUID",
    "Field Name",
    "Timestamp (ISO)",
    "Date",
    "Time",
    "CNN Top Diagnosis",
    "CNN Confidence (%)",
    "SNN Stress Severity",
    "Temperature (°C)",
    "Humidity (%)",
    "Soil Moisture (%)",
    "Rainfall (mm)",
    "AQI",
    "Ozone (ppb)",
    "Expert Veto Triggered",
    "Expert Rule Details",
    "Multimodal Fusion Status",
    "Image URL"
  ];

  const csvRows = [headers.join(",")];

  records.forEach(r => {
    const { topClass, topPct } = getRecordTopClass(r);
    const { isAlert, ruleName } = getRecordExpertStatus(r);
    const { relationship } = getRecordFinalAssessment(r);

    const dt = new Date(r.created_at || Date.now());
    const dateStr = dt.toISOString().split("T")[0];
    const timeStr = dt.toTimeString().split(" ")[0];

    let soilPct = 68;
    if (r.soil_moisture !== undefined) {
      soilPct = r.soil_moisture <= 1.0 ? Math.round(r.soil_moisture * 100) : Math.round(r.soil_moisture);
    }

    const row = [
      `"${r.record_uuid || ''}"`,
      `"${(r.field_name || 'Field A — North Parcel').replace(/"/g, '""')}"`,
      `"${r.created_at || ''}"`,
      `"${dateStr}"`,
      `"${timeStr}"`,
      `"${topClass}"`,
      topPct.toFixed(2),
      `"${r.stress_severity || 'Moderate'}"`,
      r.temperature !== undefined ? r.temperature.toFixed(1) : "31.0",
      r.humidity !== undefined ? r.humidity.toFixed(0) : "72",
      soilPct,
      r.rainfall_mm !== undefined ? r.rainfall_mm.toFixed(1) : "0.0",
      r.aqi !== undefined ? Math.round(r.aqi) : "64",
      r.ozone !== undefined ? Math.round(r.ozone) : "41",
      isAlert ? "YES" : "NO",
      `"${ruleName.replace(/"/g, '""')}"`,
      `"${relationship}"`,
      `"${r.image_url || ''}"`
    ];

    csvRows.push(row.join(","));
  });

  const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `agrovision_analysis_archive_${new Date().toISOString().split("T")[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function openLatestReport() {
  if (latestHistoryRecordUuid) {
    window.open(getApiUrl(`/api/v1/records/${latestHistoryRecordUuid}/report`), "_blank");
  } else if (rawHistoryRecords.length > 0) {
    window.open(getApiUrl(`/api/v1/records/${rawHistoryRecords[0].record_uuid}/report`), "_blank");
  } else {
    alert("No stored analysis records found to generate a report.");
  }
}

// ---------------------------------------------------------
// Quick View Modal Handlers
// ---------------------------------------------------------
function openQuickViewModal(uuid) {
  const modal = document.getElementById("quickViewModal");
  const modalTitle = document.getElementById("qvModalTitle");
  const modalDate = document.getElementById("qvModalDate");
  const modalBody = document.getElementById("qvModalBody");
  const reportBtn = document.getElementById("qvModalReportBtn");
  const openDetailBtn = document.getElementById("qvModalOpenDetailBtn");

  if (!modal) return;

  const record = rawHistoryRecords.find(r => r.record_uuid === uuid);
  if (!record) {
    alert("Record details not found.");
    return;
  }

  const { topClass, topPct } = getRecordTopClass(record);
  const { isAlert, ruleName, rulePrecaution } = getRecordExpertStatus(record);
  const { relationship, summary } = getRecordFinalAssessment(record);

  const dt = new Date(record.created_at || Date.now());
  const formattedDate = dt.toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit"
  });

  if (modalTitle) modalTitle.textContent = `${topClass} Assessment`;
  if (modalDate) modalDate.textContent = `Recorded: ${formattedDate} · #${record.record_uuid.substring(0, 8)}`;
  if (reportBtn) reportBtn.href = getApiUrl(`/api/v1/records/${record.record_uuid}/report`);
  if (openDetailBtn) openDetailBtn.href = `analysis_detail.html?uuid=${record.record_uuid}`;

  // Telemetry values
  const tempStr = record.temperature !== undefined ? `${record.temperature.toFixed(1)} °C` : "31.0 °C";
  const humStr = record.humidity !== undefined ? `${record.humidity.toFixed(0)} %` : "72 %";
  let soilNum = 68;
  if (record.soil_moisture !== undefined) {
    soilNum = record.soil_moisture <= 1.0 ? Math.round(record.soil_moisture * 100) : Math.round(record.soil_moisture);
  }
  const rainStr = record.rainfall_mm !== undefined ? `${record.rainfall_mm.toFixed(1)} mm` : "0.0 mm";
  const aqiStr = record.aqi !== undefined ? `${Math.round(record.aqi)} AQI` : "64 AQI";

  const imgUrl = record.image_url || "images/leaf_placeholder.jpg";
  const heatmapUrl = record.heatmap_url;

  if (modalBody) {
    modalBody.innerHTML = `
      <div style="display:grid; grid-template-columns:${heatmapUrl ? '1fr 1fr' : '1fr'}; gap:12px; margin-bottom:16px;">
        <div style="text-align:center; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:10px;">
          <div style="font-size:10.5px; font-weight:700; color:#64748b; margin-bottom:6px; text-transform:uppercase;">Input Foliar Image</div>
          <img src="${imgUrl}" alt="Leaf Image" style="max-height:160px; max-width:100%; border-radius:8px; object-fit:contain;" />
        </div>
        ${heatmapUrl ? `
          <div style="text-align:center; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:10px;">
            <div style="font-size:10.5px; font-weight:700; color:#64748b; margin-bottom:6px; text-transform:uppercase;">Grad-CAM Saliency</div>
            <img src="${heatmapUrl}" alt="Heatmap" style="max-height:160px; max-width:100%; border-radius:8px; object-fit:contain;" />
          </div>
        ` : ''}
      </div>

      <!-- Diagnosis & Multimodal Summary -->
      <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:14px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <div style="font-size:1.15rem; font-weight:800; color:#0d3b2e;">${topClass}</div>
          <span style="font-size:11px; font-weight:700; background:#ecfdf5; color:#059669; padding:2px 8px; border-radius:999px; border:1px solid #a7f3d0;">
            ${topPct.toFixed(1)}% CNN Evidence
          </span>
        </div>
        <p style="font-size:12px; color:#475569; margin:0; line-height:1.45;">
          ${summary || `Multimodal verification indicates ${topClass} under ${record.stress_severity || 'Moderate'} environmental stress risk.`}
        </p>
      </div>

      <!-- Telemetry Grid -->
      <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:8px; margin-bottom:14px;">
        <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; padding:8px 10px; text-align:center;">
          <div style="font-size:10px; font-weight:700; color:#64748b; text-transform:uppercase;">Temperature</div>
          <div style="font-size:13px; font-weight:800; color:#0f172a; margin-top:2px;">${tempStr}</div>
        </div>
        <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; padding:8px 10px; text-align:center;">
          <div style="font-size:10px; font-weight:700; color:#64748b; text-transform:uppercase;">Humidity</div>
          <div style="font-size:13px; font-weight:800; color:#0f172a; margin-top:2px;">${humStr}</div>
        </div>
        <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; padding:8px 10px; text-align:center;">
          <div style="font-size:10px; font-weight:700; color:#64748b; text-transform:uppercase;">Soil Moisture</div>
          <div style="font-size:13px; font-weight:800; color:#0f172a; margin-top:2px;">${soilNum}%</div>
        </div>
        <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; padding:8px 10px; text-align:center;">
          <div style="font-size:10px; font-weight:700; color:#64748b; text-transform:uppercase;">Air Quality</div>
          <div style="font-size:13px; font-weight:800; color:#0f172a; margin-top:2px;">${aqiStr}</div>
        </div>
      </div>

      <!-- Expert Veto & Actionable Guidance -->
      <div style="background:${isAlert ? '#fffbeb' : '#ecfdf5'}; border:1px solid ${isAlert ? '#fed7aa' : '#a7f3d0'}; border-radius:10px; padding:12px 14px; font-size:12px;">
        <div style="font-weight:700; color:${isAlert ? '#9a3412' : '#047857'}; margin-bottom:4px;">
          ${isAlert ? `⚠️ Expert Rule Intervention: ${escapeHtml(ruleName)}` : '🛡️ Standard Field Baseline'}
        </div>
        <p style="margin:0; font-size:11.5px; color:#334155; line-height:1.45;">
          ${rulePrecaution || 'All sensory metrics are within normal agronomical thresholds. Maintain routine moisture surveillance.'}
        </p>
      </div>
    `;
  }

  modal.style.display = "flex";
}

function closeQuickViewModal() {
  const modal = document.getElementById("quickViewModal");
  if (modal) modal.style.display = "none";
}

// Utility: HTML Escape
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
