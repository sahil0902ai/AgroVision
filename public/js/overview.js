/* =========================================================
   AgroVision — Farm Overview Logic
   Power BI Analytical Filter Bar & Reactive Dashboard
   Pulls verified records from /api/v1/records
   ========================================================= */

let rawAllRecords = [];
let latestRecordUuid = null;

// Filter state store
const currentFilters = {
  field: "all",
  dateRange: "all",
  customStart: "",
  customEnd: "",
  cropStage: "all",
  visualStress: "all",
  envStress: "all",
  expertAlert: "all",
  analysisStatus: "all",
  searchQuery: ""
};

// Auth check
const currentUser = typeof requireLogin === "function" ? requireLogin() : null;
if (currentUser && document.getElementById("welcomeMsg")) {
  const nameFirst = currentUser.name.split(" ")[0];
  document.getElementById("welcomeMsg").textContent = `Welcome back, ${nameFirst}`;
}

// Populate today's date
const today = new Date();
const formattedDate = today.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const todayDateEl = document.getElementById("todayDate");
if (todayDateEl) todayDateEl.textContent = formattedDate;
const globalHeaderDateEl = document.getElementById("globalHeaderDate");
if (globalHeaderDateEl) globalHeaderDateEl.textContent = formattedDate;

function getApiUrl(endpoint) {
  if (window.AGROVISION_CONFIG && typeof window.AGROVISION_CONFIG.getApiUrl === "function") {
    return window.AGROVISION_CONFIG.getApiUrl(endpoint);
  }
  return endpoint;
}

function selectParcel(zoneName) {
  const cards = document.querySelectorAll(".parcel-card");
  cards.forEach(card => card.classList.remove("active"));
  if (event && event.currentTarget) {
    event.currentTarget.classList.add("active");
  }
  
  const fieldFilter = document.getElementById("filterField");
  const fieldSelect = document.getElementById("fieldSelect");
  
  let targetVal = "all";
  if (zoneName.includes("1")) targetVal = "Field A";
  else if (zoneName.includes("2")) targetVal = "Field B";
  else if (zoneName.includes("3")) targetVal = "Field C";

  if (fieldFilter) {
    fieldFilter.value = targetVal;
    onFilterControlChange();
  }
  if (fieldSelect) {
    if (zoneName.includes("1")) fieldSelect.selectedIndex = 0;
    else if (zoneName.includes("2")) fieldSelect.selectedIndex = 1;
    else if (zoneName.includes("3")) fieldSelect.selectedIndex = 2;
  }
}

function openLatestOverviewReport() {
  if (latestRecordUuid) {
    window.open(getApiUrl(`/api/v1/records/${latestRecordUuid}/report`), "_blank");
  } else {
    alert("No recorded analysis sessions found to generate a report.");
  }
}

// =========================================================
// Filter Controller Functions
// =========================================================

function onDateRangePresetChange() {
  const datePreset = document.getElementById("filterDateRange")?.value || "all";
  const customRow = document.getElementById("customDateRow");
  
  if (datePreset === "custom") {
    if (customRow) customRow.style.display = "flex";
  } else {
    if (customRow) customRow.style.display = "none";
    const startInput = document.getElementById("customStartDate");
    const endInput = document.getElementById("customEndDate");
    if (startInput) startInput.value = "";
    if (endInput) endInput.value = "";
    currentFilters.customStart = "";
    currentFilters.customEnd = "";
  }
  
  onFilterControlChange();
}

function onFilterControlChange() {
  currentFilters.field = document.getElementById("filterField")?.value || "all";
  currentFilters.dateRange = document.getElementById("filterDateRange")?.value || "all";
  currentFilters.customStart = document.getElementById("customStartDate")?.value || "";
  currentFilters.customEnd = document.getElementById("customEndDate")?.value || "";
  currentFilters.cropStage = document.getElementById("filterCropStage")?.value || "all";
  currentFilters.visualStress = document.getElementById("filterVisualStress")?.value || "all";
  currentFilters.envStress = document.getElementById("filterEnvStress")?.value || "all";
  currentFilters.expertAlert = document.getElementById("filterExpertAlert")?.value || "all";
  currentFilters.analysisStatus = document.getElementById("filterAnalysisStatus")?.value || "all";

  renderActiveFilterChips();
  
  const filtered = filterRecords(rawAllRecords, currentFilters);
  renderFilteredDashboard(filtered);
}

function applyAnalyticsFilters() {
  onFilterControlChange();
}

function resetAllFilters() {
  // Reset select elements
  const filterField = document.getElementById("filterField");
  const filterDate = document.getElementById("filterDateRange");
  const filterCrop = document.getElementById("filterCropStage");
  const filterVisual = document.getElementById("filterVisualStress");
  const filterEnv = document.getElementById("filterEnvStress");
  const filterExpert = document.getElementById("filterExpertAlert");
  const filterStatus = document.getElementById("filterAnalysisStatus");
  const customRow = document.getElementById("customDateRow");
  const startInput = document.getElementById("customStartDate");
  const endInput = document.getElementById("customEndDate");
  const searchInput = document.getElementById("globalSearchInput");

  if (filterField) filterField.value = "all";
  if (filterDate) filterDate.value = "all";
  if (filterCrop) filterCrop.value = "all";
  if (filterVisual) filterVisual.value = "all";
  if (filterEnv) filterEnv.value = "all";
  if (filterExpert) filterExpert.value = "all";
  if (filterStatus) filterStatus.value = "all";
  if (customRow) customRow.style.display = "none";
  if (startInput) startInput.value = "";
  if (endInput) endInput.value = "";
  if (searchInput) searchInput.value = "";

  currentFilters.field = "all";
  currentFilters.dateRange = "all";
  currentFilters.customStart = "";
  currentFilters.customEnd = "";
  currentFilters.cropStage = "all";
  currentFilters.visualStress = "all";
  currentFilters.envStress = "all";
  currentFilters.expertAlert = "all";
  currentFilters.analysisStatus = "all";
  currentFilters.searchQuery = "";

  renderActiveFilterChips();
  renderFilteredDashboard(rawAllRecords);
}

function removeFilterChip(filterKey) {
  if (filterKey === "field") {
    const el = document.getElementById("filterField");
    if (el) el.value = "all";
    currentFilters.field = "all";
  } else if (filterKey === "dateRange") {
    const el = document.getElementById("filterDateRange");
    if (el) el.value = "all";
    const customRow = document.getElementById("customDateRow");
    if (customRow) customRow.style.display = "none";
    const startInput = document.getElementById("customStartDate");
    const endInput = document.getElementById("customEndDate");
    if (startInput) startInput.value = "";
    if (endInput) endInput.value = "";
    currentFilters.dateRange = "all";
    currentFilters.customStart = "";
    currentFilters.customEnd = "";
  } else if (filterKey === "cropStage") {
    const el = document.getElementById("filterCropStage");
    if (el) el.value = "all";
    currentFilters.cropStage = "all";
  } else if (filterKey === "visualStress") {
    const el = document.getElementById("filterVisualStress");
    if (el) el.value = "all";
    currentFilters.visualStress = "all";
  } else if (filterKey === "envStress") {
    const el = document.getElementById("filterEnvStress");
    if (el) el.value = "all";
    currentFilters.envStress = "all";
  } else if (filterKey === "expertAlert") {
    const el = document.getElementById("filterExpertAlert");
    if (el) el.value = "all";
    currentFilters.expertAlert = "all";
  } else if (filterKey === "analysisStatus") {
    const el = document.getElementById("filterAnalysisStatus");
    if (el) el.value = "all";
    currentFilters.analysisStatus = "all";
  } else if (filterKey === "searchQuery") {
    const el = document.getElementById("globalSearchInput");
    if (el) el.value = "";
    currentFilters.searchQuery = "";
  }

  onFilterControlChange();
}

function renderActiveFilterChips() {
  const chipsListEl = document.getElementById("activeChipsList");
  const chipsRowEl = document.getElementById("activeFilterChipsRow");
  const badgeEl = document.getElementById("filterCountBadge");
  if (!chipsListEl || !chipsRowEl) return;

  const chips = [];

  if (currentFilters.field !== "all") {
    chips.push({ key: "field", label: `Field: ${currentFilters.field}` });
  }

  if (currentFilters.dateRange === "custom") {
    const start = currentFilters.customStart || "Start";
    const end = currentFilters.customEnd || "End";
    chips.push({ key: "dateRange", label: `Date: ${start} → ${end}` });
  } else if (currentFilters.dateRange !== "all") {
    const dateLabels = {
      today: "Today",
      "7days": "Past 7 Days",
      "30days": "Past 30 Days",
      season: "This Season (90d)"
    };
    chips.push({ key: "dateRange", label: `Date: ${dateLabels[currentFilters.dateRange] || currentFilters.dateRange}` });
  }

  if (currentFilters.cropStage !== "all") {
    chips.push({ key: "cropStage", label: `Stage: ${currentFilters.cropStage}` });
  }

  if (currentFilters.visualStress !== "all") {
    chips.push({ key: "visualStress", label: `Visual: ${currentFilters.visualStress}` });
  }

  if (currentFilters.envStress !== "all") {
    chips.push({ key: "envStress", label: `Env: ${currentFilters.envStress} Risk` });
  }

  if (currentFilters.expertAlert !== "all") {
    const alertLabel = currentFilters.expertAlert === "triggered" ? "Precaution / Alert" : "Clean Rules";
    chips.push({ key: "expertAlert", label: `Alert: ${alertLabel}` });
  }

  if (currentFilters.analysisStatus !== "all") {
    const statusLabels = {
      aligned: "Aligned",
      partially_aligned: "Partially Aligned",
      conflicting: "Conflicting"
    };
    chips.push({ key: "analysisStatus", label: `Fusion: ${statusLabels[currentFilters.analysisStatus] || currentFilters.analysisStatus}` });
  }

  if (currentFilters.searchQuery) {
    chips.push({ key: "searchQuery", label: `Search: "${currentFilters.searchQuery}"` });
  }

  if (chips.length > 0) {
    chipsRowEl.style.display = "flex";
    if (badgeEl) {
      badgeEl.style.display = "inline-block";
      badgeEl.textContent = `${chips.length} active`;
    }
    chipsListEl.innerHTML = chips.map(c => `
      <div class="filter-chip">
        <span>${c.label}</span>
        <button type="button" class="filter-chip-remove" onclick="removeFilterChip('${c.key}')" title="Remove filter">✕</button>
      </div>
    `).join("");
  } else {
    chipsRowEl.style.display = "none";
    if (badgeEl) badgeEl.style.display = "none";
    chipsListEl.innerHTML = "";
  }
}

// =========================================================
// Filter Matching Logic
// =========================================================

function filterRecords(records, filters) {
  if (!Array.isArray(records)) return [];

  const now = Date.now();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  return records.filter(r => {
    // 1. Field
    if (filters.field !== "all") {
      const recField = (r.field_name || "").toLowerCase();
      if (!recField.includes(filters.field.toLowerCase())) return false;
    }

    // 2. Date Range
    const createdAt = r.created_at ? new Date(r.created_at).getTime() : 0;
    if (filters.dateRange === "today") {
      if (createdAt < startOfToday.getTime()) return false;
    } else if (filters.dateRange === "7days") {
      if (createdAt < now - 7 * 24 * 60 * 60 * 1000) return false;
    } else if (filters.dateRange === "30days") {
      if (createdAt < now - 30 * 24 * 60 * 60 * 1000) return false;
    } else if (filters.dateRange === "season") {
      if (createdAt < now - 90 * 24 * 60 * 60 * 1000) return false;
    } else if (filters.dateRange === "custom") {
      if (filters.customStart) {
        const startTimestamp = new Date(filters.customStart + "T00:00:00").getTime();
        if (createdAt < startTimestamp) return false;
      }
      if (filters.customEnd) {
        const endTimestamp = new Date(filters.customEnd + "T23:59:59").getTime();
        if (createdAt > endTimestamp) return false;
      }
    }

    // 3. Crop Stage
    if (filters.cropStage !== "all") {
      const recStage = (r.growth_stage || "").replace(/_/g, " ").toLowerCase();
      const filterStage = filters.cropStage.toLowerCase();
      if (!recStage.includes(filterStage) && !filterStage.includes(recStage)) return false;
    }

    // 4. Visual Stress (CNN)
    let topCnnClass = "";
    try {
      if (r.cnn_predictions_json) {
        const cnnObj = JSON.parse(r.cnn_predictions_json);
        topCnnClass = Object.keys(cnnObj).reduce((a, b) => (cnnObj[a] > cnnObj[b] ? a : b), "").toLowerCase().replace(/_/g, " ");
      }
    } catch (_) {}

    if (filters.visualStress !== "all") {
      const targetVisual = filters.visualStress.toLowerCase();
      if (targetVisual === "healthy") {
        if (!topCnnClass.includes("healthy")) return false;
      } else if (targetVisual.includes("water")) {
        if (!topCnnClass.includes("water")) return false;
      } else if (targetVisual.includes("heat")) {
        if (!topCnnClass.includes("heat")) return false;
      } else if (targetVisual.includes("nutrient")) {
        if (!topCnnClass.includes("nutrient")) return false;
      } else if (targetVisual.includes("pollution")) {
        if (!topCnnClass.includes("pollution")) return false;
      }
    }

    // 5. Environmental Stress (SNN)
    if (filters.envStress !== "all") {
      const recSev = (r.stress_severity || "Moderate").toLowerCase();
      if (recSev !== filters.envStress.toLowerCase()) return false;
    }

    // 6. Expert Alert
    let hasAlert = false;
    if (r.expert_veto_rule_triggered) {
      hasAlert = true;
    } else {
      try {
        if (r.expert_veto_json) {
          const expObj = JSON.parse(r.expert_veto_json);
          if (
            (expObj.triggered_rules && expObj.triggered_rules.length > 0) ||
            (expObj.overall_status && expObj.overall_status !== "NO_RULE_TRIGGERED" && expObj.overall_status !== "No Rule Triggered")
          ) {
            hasAlert = true;
          }
        }
      } catch (_) {}
    }

    if (filters.expertAlert === "triggered" && !hasAlert) return false;
    if (filters.expertAlert === "clean" && hasAlert) return false;

    // 7. Analysis Status (Multimodal Fusion)
    let fusionRel = "aligned";
    try {
      if (r.fusion_json) {
        const fObj = JSON.parse(r.fusion_json);
        fusionRel = (fObj.relationship || "ALIGNED").toLowerCase().replace(/ /g, "_");
      }
    } catch (_) {}

    if (filters.analysisStatus !== "all") {
      if (filters.analysisStatus === "aligned" && !fusionRel.includes("aligned") && fusionRel !== "aligned") return false;
      if (filters.analysisStatus === "partially_aligned" && !fusionRel.includes("partially")) return false;
      if (filters.analysisStatus === "conflicting" && !fusionRel.includes("conflict")) return false;
    }

    // 8. Global Search Query
    if (filters.searchQuery) {
      const q = filters.searchQuery.toLowerCase();
      const matchUuid = (r.record_uuid || "").toLowerCase().includes(q);
      const matchField = (r.field_name || "").toLowerCase().includes(q);
      const matchStage = (r.growth_stage || "").toLowerCase().includes(q);
      const matchClass = topCnnClass.includes(q);
      const matchSev = (r.stress_severity || "").toLowerCase().includes(q);
      if (!matchUuid && !matchField && !matchStage && !matchClass && !matchSev) return false;
    }

    return true;
  });
}

function handleGlobalSearch(event) {
  if (event.key === "Enter" || event.type === "input") {
    currentFilters.searchQuery = event.target.value.trim();
    onFilterControlChange();
  }
}

// =========================================================
// Dashboard Rendering (KPIs, Hero, Matrix, Table)
// =========================================================

function renderFilteredDashboard(records) {
  const totalAnalyses = records.length;
  let healthyCount = 0;
  let stressedCount = 0;
  let alertsCount = 0;
  let recentWeekCount = 0;
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  records.forEach(r => {
    // Trend calculation
    const createdAt = r.created_at ? new Date(r.created_at).getTime() : 0;
    if (createdAt >= sevenDaysAgo) recentWeekCount++;

    // Parse CNN Visual Class
    let topClass = "";
    try {
      if (r.cnn_predictions_json) {
        const cnnObj = JSON.parse(r.cnn_predictions_json);
        topClass = Object.keys(cnnObj).reduce((a, b) => (cnnObj[a] > cnnObj[b] ? a : b), "").toLowerCase();
      }
    } catch (_) {}

    if (topClass === "healthy") {
      healthyCount++;
    } else if (topClass) {
      stressedCount++;
    } else if (r.stress_severity === "Low") {
      healthyCount++;
    } else if (r.stress_severity === "Moderate" || r.stress_severity === "High") {
      stressedCount++;
    }

    // Parse Expert Veto Alerts
    try {
      if (r.expert_veto_json) {
        const expObj = JSON.parse(r.expert_veto_json);
        if (
          (expObj.triggered_rules && expObj.triggered_rules.length > 0) ||
          (expObj.overall_status && expObj.overall_status !== "NO_RULE_TRIGGERED" && expObj.overall_status !== "No Rule Triggered")
        ) {
          alertsCount++;
        }
      }
    } catch (_) {}
  });

  // Toggle No Results State Banner
  const noResultsEl = document.getElementById("noResultsState");
  if (noResultsEl) {
    noResultsEl.style.display = (totalAnalyses === 0 && rawAllRecords.length > 0) ? "block" : "none";
  }

  // Populate KPI 1: Total Analyses
  const totalValEl = document.getElementById("statTotalScans");
  const totalSubEl = document.getElementById("kpiTotalSub");
  const totalTrendEl = document.getElementById("kpiTotalTrend");
  if (totalValEl) totalValEl.textContent = String(totalAnalyses);
  if (totalSubEl) {
    totalSubEl.textContent = totalAnalyses > 0 ? (totalAnalyses === rawAllRecords.length ? "Total verified sessions" : `Filtered from ${rawAllRecords.length} records`) : "No matching data";
  }
  if (totalTrendEl) {
    totalTrendEl.innerHTML = totalAnalyses > 0 
      ? `<span style="color:#059669; font-weight:700;">+${recentWeekCount}</span> past 7 days · Active filter`
      : `<span>●</span> No records in selection`;
  }

  // Populate KPI 2: Healthy Plants
  const healthyValEl = document.getElementById("statHealthyVal");
  const healthySubEl = document.getElementById("statHealthySub");
  const healthyBarEl = document.getElementById("statHealthyBar");
  if (healthyValEl) healthyValEl.textContent = String(healthyCount);
  if (healthySubEl) {
    healthySubEl.textContent = totalAnalyses > 0 
      ? `${((healthyCount / totalAnalyses) * 100).toFixed(1)}% of filtered` 
      : "No data";
  }
  if (healthyBarEl) {
    healthyBarEl.style.width = totalAnalyses > 0 ? `${Math.round((healthyCount / totalAnalyses) * 100)}%` : "0%";
  }

  // Populate KPI 3: Stressed Plants
  const stressedValEl = document.getElementById("statStressedVal");
  const stressedSubEl = document.getElementById("statStressedSub");
  const stressedBarEl = document.getElementById("statStressedBar");
  if (stressedValEl) stressedValEl.textContent = String(stressedCount);
  if (stressedSubEl) {
    stressedSubEl.textContent = totalAnalyses > 0 
      ? `${((stressedCount / totalAnalyses) * 100).toFixed(1)}% · Require Attention` 
      : "No data";
  }
  if (stressedBarEl) {
    stressedBarEl.style.width = totalAnalyses > 0 ? `${Math.round((stressedCount / totalAnalyses) * 100)}%` : "0%";
  }

  // Populate KPI 4: Expert Alerts
  const alertsValEl = document.getElementById("statAlertsVal");
  const alertsSubEl = document.getElementById("statAlertsSub");
  const alertsFooterEl = document.getElementById("statAlertsFooter");
  if (alertsValEl) alertsValEl.textContent = String(alertsCount);
  if (alertsSubEl) {
    alertsSubEl.textContent = totalAnalyses > 0 
      ? `${alertsCount} rule precautions flagged` 
      : "No data";
  }
  if (alertsFooterEl) {
    alertsFooterEl.innerHTML = totalAnalyses === 0
      ? `<span>🛡️</span> Rules EVR-001–005 Ready`
      : (alertsCount > 0 
          ? `<span style="color:#dc2626; font-weight:700;">⚠️ ${alertsCount} Precautions</span> Flagged`
          : `<span style="color:#059669; font-weight:700;">✓ Clean</span> No Rule Conflicts`);
  }

  // Populate Hero Latest Analysis Card & Telemetry
  if (records.length > 0) {
    const latest = records[0];
    latestRecordUuid = latest.record_uuid;

    // 1. Parse top CNN class
    let topClass = "Evaluated";
    let topPct = 0;
    try {
      if (latest.cnn_predictions_json) {
        const cnnObj = JSON.parse(latest.cnn_predictions_json);
        const topKey = Object.keys(cnnObj).reduce((a, b) => cnnObj[a] > cnnObj[b] ? a : b);
        topClass = topKey.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
        topPct = cnnObj[topKey];
      }
    } catch (_) {}

    // 2. Parse Multimodal Fusion & Expert Veto
    let fusionRel = "Aligned";
    let fusionSummary = "";
    try {
      if (latest.fusion_json) {
        const fObj = JSON.parse(latest.fusion_json);
        fusionRel = (fObj.relationship || "ALIGNED").replace(/_/g, " ");
        fusionSummary = fObj.summary || "";
      }
    } catch (_) {}

    let expertRule = null;
    try {
      if (latest.expert_veto_json) {
        const expObj = JSON.parse(latest.expert_veto_json);
        if (expObj.triggered_rules && expObj.triggered_rules.length > 0) {
          expertRule = expObj.triggered_rules[0];
        }
      }
    } catch (_) {}

    const sev = latest.stress_severity || "Moderate";

    // 3. Update Hero Latest Card
    const dateEl = document.getElementById("latestAnalysisDate");
    const classEl = document.getElementById("latestAnalysisClass");
    const sumEl = document.getElementById("latestAnalysisSummary");
    const uuidEl = document.getElementById("latestRecordUuid");
    const detailLinkEl = document.getElementById("latestDetailLink");
    const thumbEl = document.getElementById("latestThumbImg");
    const sevBadgeEl = document.getElementById("latestSeverityBadge");
    const alignBadgeEl = document.getElementById("latestAlignmentBadge");

    if (dateEl) {
      dateEl.textContent = `Recorded: ${new Date(latest.created_at || Date.now()).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
    }
    if (classEl) {
      classEl.textContent = `${topClass} (${topPct.toFixed(0)}% Visual)`;
      if (topClass.toLowerCase().includes("stress") || topClass.toLowerCase().includes("deficiency") || topClass.toLowerCase().includes("pollution")) {
        classEl.style.color = "#dc2626";
      } else {
        classEl.style.color = "#059669";
      }
    }
    if (sumEl) {
      sumEl.textContent = fusionSummary || `Visual ${topClass} observable under ${sev} environmental risk. Crop stage: ${(latest.growth_stage || 'Flowering').replace(/_/g, ' ')}.`;
    }
    if (uuidEl) uuidEl.textContent = `UUID: ${latest.record_uuid}`;
    if (detailLinkEl) detailLinkEl.href = `analysis_detail.html?uuid=${latest.record_uuid}`;
    if (thumbEl && latest.image_url) thumbEl.src = latest.image_url;

    if (sevBadgeEl) {
      sevBadgeEl.textContent = `${sev} Risk`;
      if (sev === "High") {
        sevBadgeEl.style.background = "#fee2e2";
        sevBadgeEl.style.color = "#dc2626";
      } else if (sev === "Low") {
        sevBadgeEl.style.background = "#ecfdf5";
        sevBadgeEl.style.color = "#059669";
      } else {
        sevBadgeEl.style.background = "#fef3c7";
        sevBadgeEl.style.color = "#d97706";
      }
    }

    if (alignBadgeEl) {
      alignBadgeEl.textContent = `${fusionRel}`;
    }

    // 4. Update KPI status
    const statLatestStatus = document.getElementById("statLatestStatus");
    const statLatestSub = document.getElementById("statLatestSub");
    if (statLatestStatus) {
      statLatestStatus.textContent = topClass;
      statLatestStatus.style.color = (topClass.toLowerCase().includes("stress") || topClass.toLowerCase().includes("deficiency")) ? "#d97706" : "#059669";
    }
    if (statLatestSub) {
      statLatestSub.textContent = `${sev} Environmental Risk`;
    }

    // 5. Update Telemetry Grid from latest record
    const tempVal = latest.temperature !== undefined ? `${latest.temperature.toFixed(1)}°C` : "31.0°C";
    const humVal = latest.humidity !== undefined ? `${latest.humidity.toFixed(0)}%` : "72%";
    const rainVal = latest.rainfall_mm !== undefined ? `${latest.rainfall_mm.toFixed(1)} mm` : "18.0 mm";
    
    let soilNum = 68;
    if (latest.soil_moisture !== undefined) {
      soilNum = latest.soil_moisture <= 1.0 ? Math.round(latest.soil_moisture * 100) : Math.round(latest.soil_moisture);
    }
    const soilVal = `${soilNum}%`;
    const aqiVal = latest.aqi !== undefined ? `${Math.round(latest.aqi)}` : "84";
    
    let ozoneNum = 41;
    if (latest.ozone !== undefined) {
      ozoneNum = latest.ozone <= 1.0 ? Math.round(latest.ozone * 1000) : Math.round(latest.ozone);
    }
    const ozoneVal = `${ozoneNum} ppb`;

    const tTemp = document.getElementById("telemetryTemp");
    const tHum = document.getElementById("telemetryHumidity");
    const tRain = document.getElementById("telemetryRainfall");
    const tSoil = document.getElementById("telemetrySoil");
    const tAqi = document.getElementById("telemetryAqi");
    const tOzone = document.getElementById("telemetryOzone");

    if (tTemp) tTemp.textContent = tempVal;
    if (tHum) tHum.textContent = humVal;
    if (tRain) tRain.textContent = rainVal;
    if (tSoil) tSoil.textContent = soilVal;
    if (tAqi) tAqi.textContent = aqiVal;
    if (tOzone) tOzone.textContent = ozoneVal;

    const statMicro = document.getElementById("statMicroclimateIndex");
    const statMicroSub = document.getElementById("statMicroclimateSub");
    if (statMicro) statMicro.textContent = sev === "High" ? "Elevated Risk" : (sev === "Moderate" ? "Moderate Alert" : "Stable Baseline");
    if (statMicroSub) statMicroSub.textContent = `${soilVal} Moisture · ${tempVal}`;

    // 6. Update Advisory Card
    const advTitle = document.getElementById("advisoryTitle");
    const advText = document.getElementById("advisoryText");
    if (expertRule && advTitle && advText) {
      advTitle.textContent = `🛡️ Rule: ${expertRule.rule_id} (${expertRule.name})`;
      advText.textContent = expertRule.precaution || expertRule.interpretation || "Precautions triggered by expert rules engine.";
    } else if (advTitle && advText) {
      advTitle.textContent = "🛡️ Normal Operational Baseline";
      advText.textContent = "Environmental metrics and soil parameters are within standard thresholds. Continue regular crop monitoring.";
    }

    // 7. Populate Recent Analysis History Table (Top 5)
    const recentTbody = document.getElementById("overviewRecentTbody");
    if (recentTbody) {
      const top5 = records.slice(0, 5);
      recentTbody.innerHTML = top5.map(r => {
        let rClass = "Evaluated";
        try {
          if (r.cnn_predictions_json) {
            const cObj = JSON.parse(r.cnn_predictions_json);
            const tKey = Object.keys(cObj).reduce((a, b) => cObj[a] > cObj[b] ? a : b);
            rClass = tKey.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
          }
        } catch (_) {}

        const rSev = r.stress_severity || "Moderate";
        const rSevPill = rSev === "High" ? `<span style="background:#fee2e2; color:#dc2626; font-size:10px; font-weight:700; padding:2px 7px; border-radius:999px;">🔴 High</span>`
          : (rSev === "Low" ? `<span style="background:#ecfdf5; color:#059669; font-size:10px; font-weight:700; padding:2px 7px; border-radius:999px;">🟢 Low</span>`
          : `<span style="background:#fef3c7; color:#d97706; font-size:10px; font-weight:700; padding:2px 7px; border-radius:999px;">🟡 Moderate</span>`);

        const rExpert = r.expert_veto_rule_triggered 
          ? `<span style="color:#d97706; font-weight:700; font-size:11px;">⚠️ Alert</span>`
          : `<span style="color:#059669; font-weight:700; font-size:11px;">✓ Normal</span>`;

        const dateShort = r.created_at ? new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "Recent";
        const imgUrl = r.image_url || "images/leaf_placeholder.jpg";

        return `
          <tr>
            <td style="color:#1e293b; font-weight:600; white-space:nowrap;">${dateShort}</td>
            <td>
              <a href="analysis_detail.html?uuid=${r.record_uuid}">
                <img src="${imgUrl}" alt="Leaf" style="width:34px; height:34px; border-radius:6px; object-fit:cover; border:1px solid #cbd5e1;" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'34\\' height=\\'34\\'><rect width=\\'34\\' height=\\'34\\' fill=\\'%23e2e8f0\\'/><text x=\\'50%\\' y=\\'55%\\' dominant-baseline=\\'middle\\' text-anchor=\\'middle\\' fill=\\'%2364748b\\' font-size=\\'14\\'>🌿</text></svg>'" />
              </a>
            </td>
            <td>
              <strong style="color:#0f172a; font-size:12px;">${rClass}</strong>
            </td>
            <td>${rSevPill}</td>
            <td>${rExpert}</td>
            <td style="text-align:right;">
              <a href="analysis_detail.html?uuid=${r.record_uuid}" class="action-link-btn" style="padding:4px 10px; font-size:11px; text-decoration:none;">
                View →
              </a>
            </td>
          </tr>
        `;
      }).join("");
    }

  } else {
    // 0 Records match state
    latestRecordUuid = null;
    const dateEl = document.getElementById("latestAnalysisDate");
    const classEl = document.getElementById("latestAnalysisClass");
    const sumEl = document.getElementById("latestAnalysisSummary");
    const uuidEl = document.getElementById("latestRecordUuid");
    const sevBadgeEl = document.getElementById("latestSeverityBadge");
    const alignBadgeEl = document.getElementById("latestAlignmentBadge");

    if (dateEl) dateEl.textContent = "No analyses match active filters";
    if (classEl) {
      classEl.textContent = "No Matching Scans";
      classEl.style.color = "#64748b";
    }
    if (sumEl) sumEl.textContent = "Adjust or reset your analytical filter criteria above to display records.";
    if (uuidEl) uuidEl.textContent = "UUID: N/A";
    if (sevBadgeEl) sevBadgeEl.textContent = "N/A";
    if (alignBadgeEl) alignBadgeEl.textContent = "N/A";

    const recentTbody = document.getElementById("overviewRecentTbody");
    if (recentTbody) {
      recentTbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align:center; padding:30px; color:#64748b;">
            <strong>No matching analyses found</strong>
            <p style="margin:4px 0 0; font-size:11.5px;">Try broadening your filter selection or click "Reset Filters" above.</p>
          </td>
        </tr>
      `;
    }
  }
}

async function loadOverviewData() {
  try {
    const response = await fetch(getApiUrl("/api/v1/records?limit=200"));
    if (!response.ok) throw new Error("API response error");

    const data = await response.json();
    rawAllRecords = Array.isArray(data) ? data : (data.records || []);

    const filtered = filterRecords(rawAllRecords, currentFilters);
    renderFilteredDashboard(filtered);
    renderActiveFilterChips();
  } catch (err) {
    console.error("Error loading farm overview data:", err);
  }
}

// OpenWeather Integration for Overview
const OVERVIEW_FIELD_COORDINATES = {
  0: { lat: 20.975, lon: 78.72, name: "Field A — Wardha South Station" },
  1: { lat: 21.1458, lon: 79.0882, name: "Field B — Nagpur East Station" },
  2: { lat: 20.9320, lon: 77.7523, name: "Field C — Amravati West Station" }
};

let currentOverviewLat = 20.975;
let currentOverviewLon = 78.72;

async function fetchOverviewWeather(lat, lon, forceRefresh = false) {
  const refreshBtn = document.getElementById("overviewWeatherRefreshBtn");
  if (refreshBtn) {
    refreshBtn.textContent = "⌛ Refreshing…";
    refreshBtn.disabled = true;
  }

  try {
    const url = getApiUrl(`/api/weather/current?lat=${lat}&lon=${lon}&force_refresh=${forceRefresh}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error("Could not fetch weather");

    const data = await res.json();
    const stEl = document.getElementById("overviewWeatherStation");
    const obsEl = document.getElementById("overviewWeatherObserved");
    const tEl = document.getElementById("ovTemp");
    const hEl = document.getElementById("ovHum");
    const rEl = document.getElementById("ovRain");
    const wEl = document.getElementById("ovWind");
    const aEl = document.getElementById("ovAqi");
    const fEl = document.getElementById("ovForecastRain");

    if (stEl) stEl.textContent = `${data.location?.name || "Wardha"} (${data.location?.latitude?.toFixed(3)}°N, ${data.location?.longitude?.toFixed(3)}°E)`;
    if (obsEl) {
      const d = new Date(data.observed_at || Date.now());
      obsEl.textContent = `Observed: ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · Live Station`;
    }

    if (tEl && data.current) tEl.textContent = `${data.current.temperature_c.toFixed(1)} °C`;
    if (hEl && data.current) hEl.textContent = `${Math.round(data.current.humidity_percent)} %`;
    if (rEl && data.current) rEl.textContent = `${data.current.rainfall_mm.toFixed(1)} mm`;
    if (wEl && data.current) wEl.textContent = `${data.current.wind_speed.toFixed(1)} m/s`;
    if (aEl && data.air_quality) aEl.textContent = `${Math.round(data.air_quality.aqi)} AQI`;
    if (fEl && data.forecast) fEl.textContent = `${data.forecast.rainfall_forecast_mm.toFixed(1)} mm`;

  } catch (err) {
    console.warn("Overview weather error:", err);
  } finally {
    if (refreshBtn) {
      refreshBtn.textContent = "🔄 Refresh";
      refreshBtn.disabled = false;
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadOverviewData();

  if (typeof getActiveFarmerField === "function") {
    const active = getActiveFarmerField();
    if (active) {
      currentOverviewLat = active.lat;
      currentOverviewLon = active.lon;
    }
  }

  const refreshBtn = document.getElementById("overviewWeatherRefreshBtn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
      fetchOverviewWeather(currentOverviewLat, currentOverviewLon, true);
    });
  }

  fetchOverviewWeather(currentOverviewLat, currentOverviewLon, false);

  // Bind Header Search Input
  const searchInput = document.getElementById("globalSearchInput");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      currentFilters.searchQuery = e.target.value.trim();
      onFilterControlChange();
    });
  }

  // Bind Header Field Selector to Filter Toolbar
  const headerFieldSelect = document.getElementById("fieldSelect");
  if (headerFieldSelect) {
    headerFieldSelect.addEventListener("change", (e) => {
      const val = e.target.value;
      const filterField = document.getElementById("filterField");
      if (filterField) {
        if (val === "zone-1") filterField.value = "Field A";
        else if (val === "zone-2") filterField.value = "Field B";
        else if (val === "zone-3") filterField.value = "Field C";
        else filterField.value = "all";
        onFilterControlChange();
      }
    });
  }
});

// Global field listener from Analytics Header
window.addEventListener("agrovision:fieldChanged", (e) => {
  const f = e.detail;
  if (f) {
    currentOverviewLat = f.lat;
    currentOverviewLon = f.lon;
    fetchOverviewWeather(currentOverviewLat, currentOverviewLon, false);
    
    // Also sync filter toolbar field
    const filterField = document.getElementById("filterField");
    if (filterField) {
      if (f.id === "zone-1") filterField.value = "Field A";
      else if (f.id === "zone-2") filterField.value = "Field B";
      else if (f.id === "zone-3") filterField.value = "Field C";
      onFilterControlChange();
    }
  }
});
