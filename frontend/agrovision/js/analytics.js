/* =========================================================
   AgroVision — Advanced Analytics Controller (Power BI Style)
   Database-driven multi-dimensional cross-filtering intelligence
   ========================================================= */

let rawAllRecords = [];
let filteredRecords = [];
let activeFilters = {
  field: "",
  dateRange: "30d",
  startDate: "",
  endDate: "",
  stage: "",
  visualClass: "",
  envRisk: "",
  tableSearch: ""
};
let hBarSortOrder = "desc"; // "desc" or "asc"
let tableCurrentPage = 1;
const tablePageSize = 10;

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

function escapeHtml(text) {
  if (!text) return "";
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

document.addEventListener("DOMContentLoaded", () => {
  const activeField = window.AgroVisionSync ? window.AgroVisionSync.getActiveField() : null;
  if (activeField && activeField.field_name) {
    activeFilters.field = activeField.field_name;
  }
  loadAnalyticsData();

  if (window.AgroVisionSync) {
    window.AgroVisionSync.on("fieldChanged", (field) => {
      if (field && field.field_name) {
        activeFilters.field = field.field_name;
        const fieldSelect = document.getElementById("slicerField");
        if (fieldSelect) fieldSelect.value = field.field_name;
        applyAnalyticsFilters();
      }
    });

    window.AgroVisionSync.on("analysisSaved", () => {
      loadAnalyticsData();
    });

    window.AgroVisionSync.on("tabFocused", () => {
      loadAnalyticsData();
    });
  }
});

// =========================================================
// 1. DATA FETCHING & INITIALIZATION
// =========================================================

async function loadAnalyticsData() {
  const loadingEl = document.getElementById("analyticsLoadingState");
  const errorEl = document.getElementById("analyticsErrorState");
  const emptyEl = document.getElementById("analyticsEmptyState");
  const contentEl = document.getElementById("analyticsContent");
  const lastUpdatedEl = document.getElementById("analyticsLastUpdated");

  if (loadingEl) loadingEl.style.display = "flex";
  if (errorEl) errorEl.style.display = "none";
  if (emptyEl) emptyEl.style.display = "none";
  if (contentEl) contentEl.style.display = "none";

  try {
    const user = typeof requireLogin === "function" ? requireLogin() : null;
    const userEmailParam = user && user.email ? `&user_email=${encodeURIComponent(user.email)}` : "";
    
    const res = await fetch(getApiUrl(`/api/v1/records?limit=300${userEmailParam}`));
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: Failed to retrieve records from database`);
    }

    const data = await res.json();
    rawAllRecords = Array.isArray(data) ? data : (data.records || []);

    if (lastUpdatedEl) {
      const now = new Date();
      lastUpdatedEl.textContent = `Updated: ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ${rawAllRecords.length} DB records`;
    }

    // Populate Field Slicer dropdown
    populateFieldSlicer(rawAllRecords);

    // Initial Filter & Render
    applyAnalyticsFilters();

  } catch (err) {
    console.error("Error loading analytics data:", err);
    if (loadingEl) loadingEl.style.display = "none";
    if (errorEl) {
      errorEl.style.display = "block";
      const errMsg = document.getElementById("analyticsErrorMessage");
      if (errMsg) errMsg.textContent = err.message || "Could not retrieve analytical records from backend database.";
    }
  }
}

function populateFieldSlicer(records) {
  const fieldSelect = document.getElementById("slicerField");
  if (!fieldSelect) return;

  const currentVal = fieldSelect.value;
  const uniqueFields = new Set();

  records.forEach(r => {
    const f = (r.field_name || "").trim();
    if (f) uniqueFields.add(f);
  });

  let html = `<option value="">All Fields</option>`;
  Array.from(uniqueFields).sort().forEach(f => {
    html += `<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`;
  });

  fieldSelect.innerHTML = html;
  if (currentVal) fieldSelect.value = currentVal;
}

// =========================================================
// 2. SLICER HANDLERS & CROSS-FILTERING
// =========================================================

function handleSlicerChange() {
  activeFilters.field = document.getElementById("slicerField")?.value || "";
  activeFilters.dateRange = document.getElementById("slicerDateRange")?.value || "all";
  activeFilters.startDate = document.getElementById("slicerStartDate")?.value || "";
  activeFilters.endDate = document.getElementById("slicerEndDate")?.value || "";
  activeFilters.stage = document.getElementById("slicerStage")?.value || "";
  activeFilters.visualClass = document.getElementById("slicerVisual")?.value || "";
  activeFilters.envRisk = document.getElementById("slicerEnv")?.value || "";

  tableCurrentPage = 1;
  applyAnalyticsFilters();
}

function handleDateRangeChange() {
  const range = document.getElementById("slicerDateRange")?.value || "all";
  const customBox = document.getElementById("customDateRangeBox");
  if (customBox) {
    customBox.style.display = range === "custom" ? "inline-flex" : "none";
  }
  handleSlicerChange();
}

function setVisualClassFilter(clsKey) {
  const select = document.getElementById("slicerVisual");
  if (select) {
    select.value = select.value === clsKey ? "" : clsKey;
    handleSlicerChange();
  }
}

function setEnvRiskFilter(riskKey) {
  const select = document.getElementById("slicerEnv");
  if (select) {
    select.value = select.value === riskKey ? "" : riskKey;
    handleSlicerChange();
  }
}

function setFieldFilter(fieldName) {
  const select = document.getElementById("slicerField");
  if (select) {
    select.value = select.value === fieldName ? "" : fieldName;
    handleSlicerChange();
  }
}

function resetAllSlicers() {
  const sField = document.getElementById("slicerField");
  const sDate = document.getElementById("slicerDateRange");
  const sStart = document.getElementById("slicerStartDate");
  const sEnd = document.getElementById("slicerEndDate");
  const sStage = document.getElementById("slicerStage");
  const sVisual = document.getElementById("slicerVisual");
  const sEnv = document.getElementById("slicerEnv");
  const sSearch = document.getElementById("tableFilterSearch");
  const customBox = document.getElementById("customDateRangeBox");

  if (sField) sField.value = "";
  if (sDate) sDate.value = "all";
  if (sStart) sStart.value = "";
  if (sEnd) sEnd.value = "";
  if (sStage) sStage.value = "";
  if (sVisual) sVisual.value = "";
  if (sEnv) sEnv.value = "";
  if (sSearch) sSearch.value = "";
  if (customBox) customBox.style.display = "none";

  activeFilters = {
    field: "",
    dateRange: "all",
    startDate: "",
    endDate: "",
    stage: "",
    visualClass: "",
    envRisk: "",
    tableSearch: ""
  };

  tableCurrentPage = 1;
  applyAnalyticsFilters();
}

function removeFilter(type) {
  if (type === "field") {
    const el = document.getElementById("slicerField");
    if (el) el.value = "";
  } else if (type === "visualClass") {
    const el = document.getElementById("slicerVisual");
    if (el) el.value = "";
  } else if (type === "envRisk") {
    const el = document.getElementById("slicerEnv");
    if (el) el.value = "";
  } else if (type === "stage") {
    const el = document.getElementById("slicerStage");
    if (el) el.value = "";
  } else if (type === "dateRange") {
    const el = document.getElementById("slicerDateRange");
    if (el) el.value = "all";
  }
  handleSlicerChange();
}

// =========================================================
// 3. FILTER EVALUATION & KPI COMPUTATION
// =========================================================

function applyAnalyticsFilters() {
  const loadingEl = document.getElementById("analyticsLoadingState");
  const emptyEl = document.getElementById("analyticsEmptyState");
  const contentEl = document.getElementById("analyticsContent");

  if (loadingEl) loadingEl.style.display = "none";

  if (!rawAllRecords || rawAllRecords.length === 0) {
    if (emptyEl) emptyEl.style.display = "block";
    if (contentEl) contentEl.style.display = "none";
    updateKPIs([], 0);
    return;
  }

  const now = Date.now();
  let dateCutoff = 0;
  if (activeFilters.dateRange === "7d") dateCutoff = now - 7 * 24 * 60 * 60 * 1000;
  else if (activeFilters.dateRange === "30d") dateCutoff = now - 30 * 24 * 60 * 60 * 1000;
  else if (activeFilters.dateRange === "90d") dateCutoff = now - 90 * 24 * 60 * 60 * 1000;

  filteredRecords = rawAllRecords.filter(r => {
    // 1. Field Filter
    if (activeFilters.field && (r.field_name || "").toLowerCase() !== activeFilters.field.toLowerCase()) {
      return false;
    }

    // 2. Crop Stage Filter
    if (activeFilters.stage && (r.growth_stage || "").toLowerCase() !== activeFilters.stage.toLowerCase()) {
      return false;
    }

    // 3. Date Range Filter
    const recordTime = r.created_at ? new Date(r.created_at).getTime() : 0;
    if (activeFilters.dateRange === "custom") {
      if (activeFilters.startDate) {
        const start = new Date(activeFilters.startDate).getTime();
        if (recordTime < start) return false;
      }
      if (activeFilters.endDate) {
        const end = new Date(activeFilters.endDate).getTime() + 24 * 60 * 60 * 1000;
        if (recordTime > end) return false;
      }
    } else if (dateCutoff > 0) {
      if (recordTime < dateCutoff) return false;
    }

    // 4. Visual Stress Filter
    const topVisual = getRecordVisualClass(r).key;
    if (activeFilters.visualClass && topVisual !== activeFilters.visualClass.toLowerCase()) {
      return false;
    }

    // 5. Environmental Risk Filter
    const envSev = (r.stress_severity || "Low").toLowerCase();
    if (activeFilters.envRisk && envSev !== activeFilters.envRisk.toLowerCase()) {
      return false;
    }

    // 6. Table Search
    if (activeFilters.tableSearch) {
      const q = activeFilters.tableSearch.toLowerCase();
      const matchUuid = (r.record_uuid || "").toLowerCase().includes(q);
      const matchField = (r.field_name || "").toLowerCase().includes(q);
      const matchDiag = (r.diagnosis || "").toLowerCase().includes(q);
      if (!matchUuid && !matchField && !matchDiag) return false;
    }

    return true;
  });

  if (emptyEl) emptyEl.style.display = "none";
  if (contentEl) contentEl.style.display = "flex";

  renderActiveFilterChips();
  updateKPIs(filteredRecords, rawAllRecords.length);
  renderVisualStressHBar(filteredRecords);
  renderEnvDonutChart(filteredRecords);
  renderTimelineChart(filteredRecords);
  renderFieldBreakdown(filteredRecords);
  renderTelemetryChart(filteredRecords);
  renderExpertAlertDistribution(filteredRecords);
  renderAnalyticsTable(filteredRecords);
}

function getRecordVisualClass(r) {
  let label = "Healthy";
  let key = "healthy";
  let pct = 95.0;

  try {
    if (r.cnn_predictions_json) {
      const obj = JSON.parse(r.cnn_predictions_json);
      const topKey = Object.keys(obj).reduce((a, b) => (obj[a] > obj[b] ? a : b));
      key = topKey.toLowerCase();
      label = topKey.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
      const rawPct = obj[topKey];
      pct = rawPct <= 1.0 ? rawPct * 100 : rawPct;
    }
  } catch (_) {}

  return { label, key, pct };
}

function renderActiveFilterChips() {
  const container = document.getElementById("activeFilterChipsContainer");
  const list = document.getElementById("activeFilterChipsList");
  if (!container || !list) return;

  const chips = [];
  if (activeFilters.field) {
    chips.push({ label: `Field: ${activeFilters.field}`, type: "field" });
  }
  if (activeFilters.dateRange && activeFilters.dateRange !== "all") {
    chips.push({ label: `Range: ${activeFilters.dateRange.toUpperCase()}`, type: "dateRange" });
  }
  if (activeFilters.stage) {
    chips.push({ label: `Stage: ${activeFilters.stage}`, type: "stage" });
  }
  if (activeFilters.visualClass) {
    const formatted = activeFilters.visualClass.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
    chips.push({ label: `Visual: ${formatted}`, type: "visualClass" });
  }
  if (activeFilters.envRisk) {
    chips.push({ label: `Risk: ${activeFilters.envRisk.toUpperCase()}`, type: "envRisk" });
  }

  if (chips.length === 0) {
    container.style.display = "none";
    list.innerHTML = "";
  } else {
    container.style.display = "flex";
    list.innerHTML = chips.map(c => `
      <div class="filter-chip">
        <span>${escapeHtml(c.label)}</span>
        <span class="filter-chip-remove" onclick="removeFilter('${c.type}')" title="Remove filter">×</span>
      </div>
    `).join("");
  }
}

// =========================================================
// 4. KPI ROW RENDERING
// =========================================================

function updateKPIs(records, totalDbCount) {
  const total = records.length;
  let healthy = 0;
  let stressed = 0;
  let highRisk = 0;

  records.forEach(r => {
    const { key } = getRecordVisualClass(r);
    if (key === "healthy") healthy++;
    else stressed++;

    if ((r.stress_severity || "").toLowerCase() === "high") {
      highRisk++;
    }
  });

  const healthyPct = total > 0 ? Math.round((healthy / total) * 100) : 0;
  const stressedPct = total > 0 ? Math.round((stressed / total) * 100) : 0;
  const highRiskPct = total > 0 ? Math.round((highRisk / total) * 100) : 0;

  // KPI 1: Total
  const elTotal = document.getElementById("kpiTotalCount");
  const elTotalSub = document.getElementById("kpiTotalSub");
  if (elTotal) elTotal.textContent = String(total);
  if (elTotalSub) {
    elTotalSub.textContent = total === totalDbCount 
      ? `All ${total} verified database sessions` 
      : `${total} filtered of ${totalDbCount} total sessions`;
  }

  // KPI 2: Healthy
  const elHealthy = document.getElementById("kpiHealthyCount");
  const elHealthySub = document.getElementById("kpiHealthySub");
  const elHealthyProgress = document.getElementById("kpiHealthyProgress");
  if (elHealthy) elHealthy.textContent = String(healthy);
  if (elHealthySub) elHealthySub.textContent = `${healthyPct}% optimal physiological state`;
  if (elHealthyProgress) elHealthyProgress.style.width = `${healthyPct}%`;

  // KPI 3: Stressed
  const elStressed = document.getElementById("kpiStressedCount");
  const elStressedSub = document.getElementById("kpiStressedSub");
  const elStressedProgress = document.getElementById("kpiStressedProgress");
  if (elStressed) elStressed.textContent = String(stressed);
  if (elStressedSub) elStressedSub.textContent = `${stressedPct}% require scouting or care`;
  if (elStressedProgress) elStressedProgress.style.width = `${stressedPct}%`;

  // KPI 4: High Climate Risk
  const elRisk = document.getElementById("kpiRiskCount");
  const elRiskSub = document.getElementById("kpiRiskSub");
  const elRiskProgress = document.getElementById("kpiRiskProgress");
  if (elRisk) elRisk.textContent = String(highRisk);
  if (elRiskSub) elRiskSub.textContent = `${highRiskPct}% elevated environmental hazard`;
  if (elRiskProgress) elRiskProgress.style.width = `${highRiskPct}%`;
}

// =========================================================
// 5. ROW 1: HORIZONTAL BAR CHART & DONUT CHART
// =========================================================

const VISUAL_CATEGORIES = [
  { key: "healthy", name: "Healthy", color: "#059669" },
  { key: "water_stress", name: "Water Stress", color: "#dc2626" },
  { key: "heat_stress", name: "Heat Stress", color: "#ea580c" },
  { key: "nutrient_deficiency", name: "Nutrient Deficiency", color: "#d97706" },
  { key: "pollution", name: "Pollution", color: "#7c3aed" }
];

function toggleHBarSort() {
  hBarSortOrder = hBarSortOrder === "desc" ? "asc" : "desc";
  const btn = document.getElementById("sortHBarBtn");
  if (btn) btn.textContent = `Sort: Count ${hBarSortOrder === "desc" ? "↓" : "↑"}`;
  renderVisualStressHBar(filteredRecords);
}

function renderVisualStressHBar(records) {
  const container = document.getElementById("visualHBarContainer");
  if (!container) return;

  const total = records.length;
  const counts = {
    healthy: 0,
    water_stress: 0,
    heat_stress: 0,
    nutrient_deficiency: 0,
    pollution: 0
  };

  records.forEach(r => {
    const { key } = getRecordVisualClass(r);
    if (counts[key] !== undefined) counts[key]++;
    else counts.healthy++;
  });

  let items = VISUAL_CATEGORIES.map(cat => ({
    ...cat,
    count: counts[cat.key] || 0,
    pct: total > 0 ? ((counts[cat.key] / total) * 100).toFixed(1) : 0
  }));

  // Sort
  items.sort((a, b) => hBarSortOrder === "desc" ? b.count - a.count : a.count - b.count);

  if (total === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:30px 10px; color:#94a3b8; font-size:12px;">
        No visual stress records match current slicers.
      </div>
    `;
    return;
  }

  container.innerHTML = items.map(item => {
    const isSelected = activeFilters.visualClass === item.key;
    return `
      <div class="hbar-row ${isSelected ? 'selected' : ''}" onclick="setVisualClassFilter('${item.key}')" title="Click to filter by ${item.name}">
        <div class="hbar-meta">
          <span class="hbar-name">
            <span class="hbar-dot" style="background:${item.color};"></span>
            <span>${item.name}</span>
          </span>
          <span class="hbar-values">${item.count} scans (${item.pct}%)</span>
        </div>
        <div class="hbar-track">
          <div class="hbar-fill" style="width:${item.pct}%; background:${item.color};"></div>
        </div>
      </div>
    `;
  }).join("");
}

function renderEnvDonutChart(records) {
  const svg = document.getElementById("envDonutSvg");
  const legend = document.getElementById("envDonutLegend");
  if (!svg || !legend) return;

  const total = records.length;
  let low = 0, mod = 0, high = 0;

  records.forEach(r => {
    const sev = (r.stress_severity || "Low").toLowerCase();
    if (sev === "high") high++;
    else if (sev === "moderate" || sev === "mod") mod++;
    else low++;
  });

  if (total === 0) {
    svg.innerHTML = `<circle cx="50" cy="50" r="38" fill="none" stroke="#e2e8f0" stroke-width="14"/>`;
    legend.innerHTML = `<div style="font-size:12px; color:#94a3b8;">No data</div>`;
    return;
  }

  const pLow = low / total;
  const pMod = mod / total;
  const pHigh = high / total;

  const circumference = 2 * Math.PI * 38; // r = 38, C ≈ 238.76
  const lenLow = pLow * circumference;
  const lenMod = pMod * circumference;
  const lenHigh = pHigh * circumference;

  const offLow = 0;
  const offMod = -lenLow;
  const offHigh = -(lenLow + lenMod);

  svg.innerHTML = `
    <!-- Background Track -->
    <circle cx="50" cy="50" r="38" fill="none" stroke="#f1f5f9" stroke-width="14"/>
    
    <!-- Low Segment (Green) -->
    ${low > 0 ? `<circle cx="50" cy="50" r="38" fill="none" stroke="#059669" stroke-width="14"
      stroke-dasharray="${lenLow} ${circumference - lenLow}" stroke-dashoffset="${offLow}" transform="rotate(-90 50 50)" style="cursor:pointer;" onclick="setEnvRiskFilter('low')"/>` : ''}

    <!-- Moderate Segment (Amber) -->
    ${mod > 0 ? `<circle cx="50" cy="50" r="38" fill="none" stroke="#d97706" stroke-width="14"
      stroke-dasharray="${lenMod} ${circumference - lenMod}" stroke-dashoffset="${offMod}" transform="rotate(-90 50 50)" style="cursor:pointer;" onclick="setEnvRiskFilter('moderate')"/>` : ''}

    <!-- High Segment (Red) -->
    ${high > 0 ? `<circle cx="50" cy="50" r="38" fill="none" stroke="#dc2626" stroke-width="14"
      stroke-dasharray="${lenHigh} ${circumference - lenHigh}" stroke-dashoffset="${offHigh}" transform="rotate(-90 50 50)" style="cursor:pointer;" onclick="setEnvRiskFilter('high')"/>` : ''}

    <!-- Center Label -->
    <text x="50" y="48" text-anchor="middle" font-size="12" font-weight="800" fill="#0f172a">${total}</text>
    <text x="50" y="59" text-anchor="middle" font-size="6.5" font-weight="600" fill="#64748b">TOTAL SCANS</text>
  `;

  legend.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px; padding:4px 8px; border-radius:6px; cursor:pointer; ${activeFilters.envRisk === 'low' ? 'background:#f0fdf4;' : ''}" onclick="setEnvRiskFilter('low')">
      <div style="display:flex; align-items:center; gap:6px;">
        <span style="width:10px; height:10px; background:#059669; border-radius:50%;"></span>
        <span style="font-weight:600; color:#1e293b;">Low Risk (Optimal)</span>
      </div>
      <span style="font-weight:700; color:#0f172a;">${low} (${((low/total)*100).toFixed(0)}%)</span>
    </div>

    <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px; padding:4px 8px; border-radius:6px; cursor:pointer; ${activeFilters.envRisk === 'moderate' ? 'background:#fffbeb;' : ''}" onclick="setEnvRiskFilter('moderate')">
      <div style="display:flex; align-items:center; gap:6px;">
        <span style="width:10px; height:10px; background:#d97706; border-radius:50%;"></span>
        <span style="font-weight:600; color:#1e293b;">Moderate Risk</span>
      </div>
      <span style="font-weight:700; color:#0f172a;">${mod} (${((mod/total)*100).toFixed(0)}%)</span>
    </div>

    <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px; padding:4px 8px; border-radius:6px; cursor:pointer; ${activeFilters.envRisk === 'high' ? 'background:#fef2f2;' : ''}" onclick="setEnvRiskFilter('high')">
      <div style="display:flex; align-items:center; gap:6px;">
        <span style="width:10px; height:10px; background:#dc2626; border-radius:50%;"></span>
        <span style="font-weight:600; color:#1e293b;">High Risk Alert</span>
      </div>
      <span style="font-weight:700; color:#0f172a;">${high} (${((high/total)*100).toFixed(0)}%)</span>
    </div>
  `;
}

// =========================================================
// 6. ROW 2: TIMELINE TREND & STRESS BY FIELD
// =========================================================

function renderTimelineChart(records) {
  const svg = document.getElementById("timelineSvg");
  if (!svg) return;

  if (!records || records.length === 0) {
    svg.innerHTML = `
      <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#94a3b8" font-size="12">
        No timeline data available for active filters
      </text>
    `;
    return;
  }

  // Aggregate by Date (YYYY-MM-DD)
  const dateMap = {};
  records.forEach(r => {
    const dStr = r.created_at ? r.created_at.substring(0, 10) : "2026-10-01";
    if (!dateMap[dStr]) dateMap[dStr] = { healthy: 0, stressed: 0 };
    const { key } = getRecordVisualClass(r);
    if (key === "healthy") dateMap[dStr].healthy++;
    else dateMap[dStr].stressed++;
  });

  const sortedDates = Object.keys(dateMap).sort();
  const maxVal = Math.max(1, ...sortedDates.map(d => dateMap[d].healthy + dateMap[d].stressed));

  const width = 500;
  const height = 180;
  const padBottom = 26;
  const padTop = 15;
  const padLeft = 30;
  const padRight = 15;
  const chartHeight = height - padBottom - padTop;
  const chartWidth = width - padLeft - padRight;
  const barWidth = Math.max(8, Math.min(28, (chartWidth / sortedDates.length) * 0.65));

  let barsHtml = "";
  let axesHtml = `
    <line x1="${padLeft}" y1="${height - padBottom}" x2="${width - padRight}" y2="${height - padBottom}" stroke="#cbd5e1" stroke-width="1"/>
  `;

  sortedDates.forEach((d, idx) => {
    const x = padLeft + (idx + 0.5) * (chartWidth / sortedDates.length);
    const { healthy, stressed } = dateMap[d];
    const total = healthy + stressed;

    const hHealthy = (healthy / maxVal) * chartHeight;
    const hStressed = (stressed / maxVal) * chartHeight;

    const yStressed = height - padBottom - hStressed;
    const yHealthy = yStressed - hHealthy;

    const shortDate = d.length > 5 ? d.substring(5) : d;

    barsHtml += `
      <!-- Stressed Bar -->
      ${stressed > 0 ? `<rect x="${x - barWidth/2}" y="${yStressed}" width="${barWidth}" height="${hStressed}" fill="#dc2626" rx="2" title="${d}: ${stressed} Stressed"/>` : ''}
      <!-- Healthy Bar -->
      ${healthy > 0 ? `<rect x="${x - barWidth/2}" y="${yHealthy}" width="${barWidth}" height="${hHealthy}" fill="#059669" rx="2" title="${d}: ${healthy} Healthy"/>` : ''}
      <!-- Date label -->
      <text x="${x}" y="${height - 8}" text-anchor="middle" font-size="9.5" fill="#64748b">${shortDate}</text>
    `;
  });

  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.innerHTML = `
    ${axesHtml}
    ${barsHtml}
  `;
}

function renderFieldBreakdown(records) {
  const container = document.getElementById("fieldBreakdownContainer");
  if (!container) return;

  const fieldMap = {};
  records.forEach(r => {
    const f = (r.field_name || "Field A — Wardha").trim();
    if (!fieldMap[f]) fieldMap[f] = { total: 0, healthy: 0, stressed: 0 };
    fieldMap[f].total++;
    const { key } = getRecordVisualClass(r);
    if (key === "healthy") fieldMap[f].healthy++;
    else fieldMap[f].stressed++;
  });

  const fields = Object.keys(fieldMap).sort();
  if (fields.length === 0) {
    container.innerHTML = `<div style="text-align:center; padding:30px 10px; color:#94a3b8; font-size:12px;">No field data</div>`;
    return;
  }

  container.innerHTML = fields.map(f => {
    const { total, healthy, stressed } = fieldMap[f];
    const hPct = ((healthy / total) * 100).toFixed(0);
    const sPct = ((stressed / total) * 100).toFixed(0);
    const isSelected = activeFilters.field === f;

    return `
      <div class="hbar-row ${isSelected ? 'selected' : ''}" onclick="setFieldFilter('${escapeHtml(f)}')" title="Click to filter by ${escapeHtml(f)}">
        <div class="hbar-meta">
          <span class="hbar-name">📍 ${escapeHtml(f)}</span>
          <span class="hbar-values">${total} scans · <span style="color:#059669;">${healthy} Healthy</span> / <span style="color:#dc2626;">${stressed} Stressed</span></span>
        </div>
        <div class="hbar-track" style="display:flex;">
          <div style="width:${hPct}%; height:100%; background:#059669;"></div>
          <div style="width:${sPct}%; height:100%; background:#dc2626;"></div>
        </div>
      </div>
    `;
  }).join("");
}

// =========================================================
// 7. ROW 3: TELEMETRY TREND & EXPERT RULES
// =========================================================

function renderTelemetryChart(records) {
  const svg = document.getElementById("envTelemetrySvg");
  if (!svg) return;

  if (!records || records.length === 0) {
    svg.innerHTML = `
      <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#94a3b8" font-size="12">
        No environmental telemetry available
      </text>
    `;
    return;
  }

  const sample = records.slice(0, 25).reverse();
  const width = 500;
  const height = 180;
  const padBottom = 20;
  const padTop = 15;
  const padLeft = 30;
  const padRight = 15;
  const chartHeight = height - padBottom - padTop;
  const chartWidth = width - padLeft - padRight;

  const step = sample.length > 1 ? chartWidth / (sample.length - 1) : chartWidth;

  let tempPts = [];
  let humPts = [];
  let soilPts = [];

  sample.forEach((r, idx) => {
    const x = padLeft + idx * step;
    
    // Scale Temp: 20°C to 45°C
    const t = r.temperature !== undefined ? r.temperature : 31;
    const yT = height - padBottom - Math.max(0, Math.min(1, (t - 20) / 25)) * chartHeight;
    tempPts.push(`${x.toFixed(1)},${yT.toFixed(1)}`);

    // Scale Humidity: 0% to 100%
    const h = r.humidity !== undefined ? r.humidity : 70;
    const yH = height - padBottom - Math.max(0, Math.min(1, h / 100)) * chartHeight;
    humPts.push(`${x.toFixed(1)},${yH.toFixed(1)}`);

    // Scale Soil: 0% to 100%
    let sm = 68;
    if (r.soil_moisture !== undefined && r.soil_moisture !== null) {
      sm = r.soil_moisture <= 1.0 ? r.soil_moisture * 100 : r.soil_moisture;
    }
    const yS = height - padBottom - Math.max(0, Math.min(1, sm / 100)) * chartHeight;
    soilPts.push(`${x.toFixed(1)},${yS.toFixed(1)}`);
  });

  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.innerHTML = `
    <!-- Grid baseline -->
    <line x1="${padLeft}" y1="${height - padBottom}" x2="${width - padRight}" y2="${height - padBottom}" stroke="#cbd5e1" stroke-width="1"/>
    
    <!-- Humidity Polyline (Blue) -->
    <polyline points="${humPts.join(" ")}" fill="none" stroke="#0284c7" stroke-width="2" stroke-linejoin="round"/>
    
    <!-- Soil Moisture Polyline (Green) -->
    <polyline points="${soilPts.join(" ")}" fill="none" stroke="#059669" stroke-width="2" stroke-linejoin="round"/>

    <!-- Temperature Polyline (Orange) -->
    <polyline points="${tempPts.join(" ")}" fill="none" stroke="#ea580c" stroke-width="2" stroke-linejoin="round"/>
  `;
}

function renderExpertAlertDistribution(records) {
  const container = document.getElementById("expertRulesContainer");
  if (!container) return;

  const total = records.length;
  const ruleCounts = {
    "EVR-001 (Waterlogging Risk)": 0,
    "EVR-002 (Severe Desiccation)": 0,
    "EVR-003 (Atmospheric Pollution)": 0,
    "EVR-004 (Evidence Disagreement)": 0,
    "EVR-005 (Thermal Heat Stress)": 0,
    "EVR-006 (Nutrient Deficiency)": 0,
    "EVR-007 (Routine Safe Baseline)": 0
  };

  records.forEach(r => {
    let triggered = false;
    try {
      if (r.expert_veto_json) {
        const obj = JSON.parse(r.expert_veto_json);
        if (obj.triggered_rules && obj.triggered_rules.length > 0) {
          const rid = (obj.triggered_rules[0].rule_id || "").toUpperCase();
          const matchKey = Object.keys(ruleCounts).find(k => k.startsWith(rid));
          if (matchKey) {
            ruleCounts[matchKey]++;
            triggered = true;
          }
        }
      }
    } catch (_) {}

    if (!triggered) {
      ruleCounts["EVR-007 (Routine Safe Baseline)"]++;
    }
  });

  container.innerHTML = Object.entries(ruleCounts).map(([k, count]) => {
    const pct = total > 0 ? ((count / total) * 100).toFixed(0) : 0;
    const isBaseline = k.includes("EVR-007");
    const barColor = isBaseline ? "#059669" : "#d97706";

    return `
      <div class="hbar-row">
        <div class="hbar-meta">
          <span class="hbar-name" style="font-size:11.5px;">${k}</span>
          <span class="hbar-values">${count} sessions (${pct}%)</span>
        </div>
        <div class="hbar-track">
          <div class="hbar-fill" style="width:${pct}%; background:${barColor};"></div>
        </div>
      </div>
    `;
  }).join("");
}

// =========================================================
// 8. ROW 4: DETAILED ANALYSIS TABLE & SEARCH
// =========================================================

function handleTableSearch(val) {
  activeFilters.tableSearch = val.trim();
  tableCurrentPage = 1;
  applyAnalyticsFilters();
}

function changeTablePage(delta) {
  tableCurrentPage += delta;
  renderAnalyticsTable(filteredRecords);
}

function renderAnalyticsTable(records) {
  const tbody = document.getElementById("analyticsTableBody");
  const countSub = document.getElementById("tableRecordCountSub");
  const pageInfo = document.getElementById("tablePaginationInfo");
  const prevBtn = document.getElementById("tablePrevBtn");
  const nextBtn = document.getElementById("tableNextBtn");

  if (!tbody) return;

  const total = records.length;
  const totalPages = Math.ceil(total / tablePageSize) || 1;
  tableCurrentPage = Math.max(1, Math.min(tableCurrentPage, totalPages));

  if (countSub) countSub.textContent = `Showing ${total} verified historical records matching active slicers`;

  if (total === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align:center; padding:30px; color:#94a3b8;">
          No analysis sessions found matching current filter criteria.
        </td>
      </tr>
    `;
    if (pageInfo) pageInfo.textContent = "Showing 0 of 0 records";
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;
    return;
  }

  const startIdx = (tableCurrentPage - 1) * tablePageSize;
  const endIdx = Math.min(startIdx + tablePageSize, total);
  const pageRows = records.slice(startIdx, endIdx);

  if (pageInfo) pageInfo.textContent = `Showing ${startIdx + 1} to ${endIdx} of ${total} records (Page ${tableCurrentPage} of ${totalPages})`;
  if (prevBtn) prevBtn.disabled = tableCurrentPage <= 1;
  if (nextBtn) nextBtn.disabled = tableCurrentPage >= totalPages;

  tbody.innerHTML = pageRows.map(r => {
    const { label, pct } = getRecordVisualClass(r);
    const sev = r.stress_severity || "Low";
    const dt = new Date(r.created_at || Date.now()).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

    let fusionRel = "Aligned";
    try {
      if (r.fusion_json) {
        const fObj = JSON.parse(r.fusion_json);
        fusionRel = (fObj.relationship || "ALIGNED").replace(/_/g, " ");
      }
    } catch (_) {}

    return `
      <tr>
        <td style="font-size:11.5px; color:#64748b;">${dt}</td>
        <td style="font-family:monospace; font-weight:700; color:#0f172a;">${escapeHtml(r.record_uuid ? r.record_uuid.substring(0, 12) + '…' : '—')}</td>
        <td style="font-weight:600;">${escapeHtml(r.field_name || 'Field A')}</td>
        <td><span style="font-size:11px; background:#f1f5f9; padding:2px 6px; border-radius:4px;">${escapeHtml(r.growth_stage || 'Flowering')}</span></td>
        <td>
          <span style="font-weight:700; color:${label.toLowerCase().includes('healthy') ? '#059669' : '#dc2626'};">${label}</span>
          <span style="font-size:10.5px; color:#64748b;">(${pct.toFixed(0)}%)</span>
        </td>
        <td>
          <span style="font-size:11px; font-weight:700; padding:2px 8px; border-radius:999px; ${sev === 'High' ? 'background:#fee2e2; color:#dc2626;' : (sev === 'Moderate' ? 'background:#fef3c7; color:#d97706;' : 'background:#ecfdf5; color:#059669;')}">
            ${sev} Risk
          </span>
        </td>
        <td style="font-size:11px; font-weight:600; color:#475569;">${fusionRel}</td>
        <td>
          <div style="display:flex; gap:6px;">
            <a href="analysis_detail.html?uuid=${encodeURIComponent(r.record_uuid)}" class="chart-tool-btn" style="text-decoration:none;">Inspect</a>
            <a href="${getApiUrl('/api/v1/records/' + encodeURIComponent(r.record_uuid) + '/report')}" target="_blank" class="chart-tool-btn" style="text-decoration:none;">Report</a>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

// =========================================================
// 9. EXPORT CSV UTILITY
// =========================================================

function exportAnalyticsCSV() {
  if (!filteredRecords || filteredRecords.length === 0) {
    alert("No records to export.");
    return;
  }

  const headers = [
    "Analysis ID", "Field", "Timestamp", "Growth Stage", "Visual Class",
    "Confidence (%)", "Env Severity", "Temperature (°C)", "Humidity (%)",
    "Soil Moisture (%)", "Rainfall (mm)", "AQI", "Ozone (ppb)"
  ];

  const rows = filteredRecords.map(r => {
    const { label, pct } = getRecordVisualClass(r);
    let soil = 68;
    if (r.soil_moisture !== undefined && r.soil_moisture !== null) {
      soil = r.soil_moisture <= 1.0 ? Math.round(r.soil_moisture * 100) : Math.round(r.soil_moisture);
    }
    let ozone = 41;
    if (r.ozone !== undefined && r.ozone !== null) {
      ozone = r.ozone <= 1.0 ? Math.round(r.ozone * 1000) : Math.round(r.ozone);
    }

    return [
      `"${r.record_uuid || ''}"`,
      `"${r.field_name || 'Field A'}"`,
      `"${r.created_at || ''}"`,
      `"${r.growth_stage || 'Flowering'}"`,
      `"${label}"`,
      pct.toFixed(1),
      `"${r.stress_severity || 'Low'}"`,
      (r.temperature || 31.0).toFixed(1),
      (r.humidity || 70.0).toFixed(0),
      soil,
      (r.rainfall_mm || 0.0).toFixed(1),
      Math.round(r.aqi || 64),
      ozone
    ].join(",");
  });

  const csvContent = headers.join(",") + "\n" + rows.join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `agrovision_analytics_export_${new Date().toISOString().substring(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
