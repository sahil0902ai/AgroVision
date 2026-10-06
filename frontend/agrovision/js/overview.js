/* =========================================================
   AgroVision — Farm Overview Logic
   Pulls verified records from /api/v1/records & live weather
   ========================================================= */

let rawAllRecords = [];
let latestRecordUuid = null;
let currentSearchQuery = "";

// Auth check
const currentUser = typeof requireLogin === "function" ? requireLogin() : null;
if (currentUser && document.getElementById("welcomeMsg")) {
  const nameFirst = (currentUser.name || "Farmer").split(" ")[0];
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

function openLatestOverviewReport() {
  if (latestRecordUuid) {
    window.open(getApiUrl(`/api/v1/records/${latestRecordUuid}/report`), "_blank");
  } else {
    alert("No recorded analysis sessions found to generate a report.");
  }
}

function handleGlobalSearch(event) {
  if (event.key === "Enter" || event.type === "input") {
    currentSearchQuery = (event.target.value || "").trim().toLowerCase();
    renderOverviewDashboard();
  }
}

// =========================================================
// Dashboard Rendering (KPIs, Hero, Matrix, Table)
// =========================================================

function renderOverviewDashboard() {
  let records = rawAllRecords;
  
  if (currentSearchQuery) {
    records = records.filter(r => {
      const q = currentSearchQuery;
      const matchUuid = (r.record_uuid || "").toLowerCase().includes(q);
      const matchStage = (r.growth_stage || "").toLowerCase().includes(q);
      const matchSev = (r.stress_severity || "").toLowerCase().includes(q);
      return matchUuid || matchStage || matchSev;
    });
  }

  if (currentCategoryFilter) {
    records = records.filter(r => {
      let topClass = "";
      try {
        if (r.cnn_predictions_json) {
          const cnnObj = JSON.parse(r.cnn_predictions_json);
          topClass = Object.keys(cnnObj).reduce((a, b) => (cnnObj[a] > cnnObj[b] ? a : b), "").toLowerCase();
        }
      } catch (_) {}
      if (!topClass) {
        topClass = (r.stress_severity || "").toLowerCase() === "low" ? "healthy" : "water_stress";
      }
      return topClass === currentCategoryFilter.toLowerCase() || topClass.replace("_", " ") === currentCategoryFilter.toLowerCase().replace("_", " ");
    });
  }

  if (currentEnvCategoryFilter) {
    records = records.filter(r => {
      const sev = (r.stress_severity || "").trim().toLowerCase();
      return sev === currentEnvCategoryFilter.toLowerCase();
    });
  }

  const totalAnalyses = records.length;
  let healthyCount = 0;
  let stressedCount = 0;
  let alertsCount = 0;
  let recentWeekCount = 0;
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  records.forEach(r => {
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

  // Populate KPI 1: Total Analyses
  const totalValEl = document.getElementById("statTotalScans");
  const totalSubEl = document.getElementById("kpiTotalSub");
  const totalTrendEl = document.getElementById("kpiTotalTrend");
  if (totalValEl) totalValEl.textContent = String(totalAnalyses);
  if (totalSubEl) {
    totalSubEl.textContent = totalAnalyses > 0 ? "Total verified sessions" : "No recorded scans yet";
  }
  if (totalTrendEl) {
    totalTrendEl.innerHTML = totalAnalyses > 0 
      ? `<span style="color:#059669; font-weight:700;">+${recentWeekCount}</span> this past week`
      : `<span>●</span> Ready for your first leaf check`;
  }

  // Populate KPI 2: Healthy Plants
  const healthyValEl = document.getElementById("statHealthyVal");
  const healthySubEl = document.getElementById("statHealthySub");
  const healthyBarEl = document.getElementById("statHealthyBar");
  if (healthyValEl) healthyValEl.textContent = String(healthyCount);
  if (healthySubEl) {
    healthySubEl.textContent = totalAnalyses > 0 
      ? `${((healthyCount / totalAnalyses) * 100).toFixed(0)}% optimal condition` 
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
      ? `${((stressedCount / totalAnalyses) * 100).toFixed(0)}% · Need attention` 
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
      ? `${alertsCount} actionable warnings` 
      : "No data";
  }
  if (alertsFooterEl) {
    alertsFooterEl.innerHTML = totalAnalyses === 0
      ? `<span>🛡️</span> Smart Advisory Ready`
      : (alertsCount > 0 
          ? `<span style="color:#dc2626; font-weight:700;">⚠️ ${alertsCount} Warnings</span> Active`
          : `<span style="color:#059669; font-weight:700;">✓ Safe</span> No critical farm hazards`);
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
      sumEl.textContent = fusionSummary || `Visual condition indicates ${topClass} under ${sev} weather risk.`;
    }
    if (uuidEl) uuidEl.textContent = `ID: ${latest.record_uuid.substring(0, 8)}…`;
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
    if (statMicro) statMicro.textContent = sev === "High" ? "Elevated Risk" : (sev === "Moderate" ? "Moderate Risk" : "Normal Baseline");
    if (statMicroSub) statMicroSub.textContent = `${soilVal} Moisture · ${tempVal}`;

    // 6. Update Advisory Card
    const advTitle = document.getElementById("advisoryTitle");
    const advText = document.getElementById("advisoryText");
    if (expertRule && advTitle && advText) {
      advTitle.textContent = `🛡️ Farmer Advice: ${expertRule.name || expertRule.rule_id}`;
      advText.textContent = expertRule.precaution || expertRule.interpretation || "Precautions recommended by farm advisory engine.";
    } else if (advTitle && advText) {
      advTitle.textContent = "🛡️ Normal Field Conditions";
      advText.textContent = "Environmental metrics and soil moisture are in healthy ranges. Continue regular crop care.";
    }

    // 7. Render Enterprise Power BI Analyses Table
    renderRecentAnalysesTable();

  } else {
    // 0 Records match state
    latestRecordUuid = null;
    const dateEl = document.getElementById("latestAnalysisDate");
    const classEl = document.getElementById("latestAnalysisClass");
    const sumEl = document.getElementById("latestAnalysisSummary");
    const uuidEl = document.getElementById("latestRecordUuid");
    const sevBadgeEl = document.getElementById("latestSeverityBadge");
    const alignBadgeEl = document.getElementById("latestAlignmentBadge");

    if (dateEl) dateEl.textContent = "No analysis scans yet";
    if (classEl) {
      classEl.textContent = "Ready For First Scan";
      classEl.style.color = "#64748b";
    }
    if (sumEl) sumEl.textContent = "Upload a cotton leaf in New Analysis to diagnose crop stress and get actionable advice.";
    if (uuidEl) uuidEl.textContent = "";
    if (sevBadgeEl) sevBadgeEl.textContent = "Ready";
    if (alignBadgeEl) alignBadgeEl.textContent = "Ready";

    renderRecentAnalysesTable();
  }
  }
}

async function loadOverviewData() {
  try {
    const response = await fetch(getApiUrl("/api/v1/records?limit=200"));
    if (!response.ok) throw new Error("API response error");

    const data = await response.json();
    rawAllRecords = Array.isArray(data) ? data : (data.records || []);

    renderOverviewDashboard();
    fetchVisualDistribution();
    fetchEnvironmentalDistribution();
  } catch (err) {
    console.error("Error loading farm overview data:", err);
  }
}

// Weather Integration for Overview
let currentOverviewLat = 20.975;
let currentOverviewLon = 78.72;

async function fetchOverviewWeather(lat, lon, forceRefresh = false) {
  const refreshBtn = document.getElementById("overviewWeatherRefreshBtn");
  const loadingBox = document.getElementById("overviewWeatherLoading");
  const errorBox = document.getElementById("overviewWeatherError");
  const errorMsg = document.getElementById("overviewWeatherErrorMsg");
  const gridEl = document.getElementById("overviewWeatherGrid");

  if (refreshBtn) {
    refreshBtn.textContent = "⌛ Refreshing…";
    refreshBtn.disabled = true;
  }
  if (loadingBox) loadingBox.style.display = "flex";
  if (errorBox) errorBox.style.display = "none";
  if (gridEl) gridEl.style.opacity = "0.6";

  try {
    const url = getApiUrl(`/api/weather/current?lat=${lat}&lon=${lon}&force_refresh=${forceRefresh}`);
    const res = await fetch(url);
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.detail || `HTTP ${res.status}: Could not fetch weather telemetry`);
    }

    const data = await res.json();
    if (!data || !data.current) {
      throw new Error("Invalid response format from Weather API service");
    }

    const stEl = document.getElementById("overviewWeatherStation");
    const coordsEl = document.getElementById("overviewWeatherCoords");
    const obsEl = document.getElementById("overviewWeatherObserved");
    const condEl = document.getElementById("overviewWeatherConditionBadge");

    const tEl = document.getElementById("ovTemp");
    const tSub = document.getElementById("ovTempSub");
    const hEl = document.getElementById("ovHum");
    const rEl = document.getElementById("ovRain");
    const rSub = document.getElementById("ovRainSub");
    const aEl = document.getElementById("ovAqi");
    const aSub = document.getElementById("ovAqiSub");
    const oEl = document.getElementById("ovOzone");
    const oSub = document.getElementById("ovOzoneSub");

    if (stEl) stEl.textContent = data.location?.name || "Wardha Farm Station";
    if (coordsEl && data.location?.latitude !== undefined && data.location?.longitude !== undefined) {
      coordsEl.textContent = `(${data.location.latitude.toFixed(3)}°N, ${data.location.longitude.toFixed(3)}°E)`;
    }
    if (obsEl) {
      const d = new Date(data.observed_at || Date.now());
      obsEl.textContent = `Updated: ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · Live Station`;
    }
    if (condEl) {
      const cond = data.current.weather_condition || "Clear Sky";
      condEl.textContent = cond;
    }

    // 1. Temperature
    if (tEl) tEl.textContent = `${data.current.temperature_c.toFixed(1)} °C`;
    if (tSub) tSub.textContent = data.current.weather_condition || "Observed Ambient";

    // 2. Humidity
    if (hEl) hEl.textContent = `${Math.round(data.current.humidity_percent)} %`;

    // 3. Rainfall
    if (rEl) rEl.textContent = `${data.current.rainfall_mm.toFixed(1)} mm`;
    if (rSub) {
      rSub.textContent = data.current.rainfall_mm > 0 ? "Precipitation Active" : "No Rain (Past 3h)";
    }

    // 4. AQI
    const aqiVal = data.air_quality ? Math.round(data.air_quality.aqi) : null;
    if (aEl) aEl.textContent = aqiVal !== null ? `${aqiVal} AQI` : "-- AQI";
    if (aSub) {
      if (aqiVal !== null) {
        aSub.textContent = aqiVal <= 50 ? "Good Air Quality" : (aqiVal <= 100 ? "Moderate Air Quality" : "Unhealthy Air");
      }
    }

    // 5. Ozone
    let ozoneVal = null;
    if (data.air_quality?.ozone_ppb !== undefined) {
      ozoneVal = Math.round(data.air_quality.ozone_ppb);
    } else if (data.air_quality?.ozone !== undefined) {
      ozoneVal = data.air_quality.ozone <= 1.0 ? Math.round(data.air_quality.ozone * 1000) : Math.round(data.air_quality.ozone);
    }
    if (oEl) oEl.textContent = ozoneVal !== null ? `${ozoneVal} ppb` : "-- ppb";
    if (oSub && ozoneVal !== null) {
      oSub.textContent = `${(ozoneVal / 1000).toFixed(3)} ppm Ground O₃`;
    }

    // 6. Render Weather Forecast Widget
    renderForecastWidget(data);

    if (errorBox) errorBox.style.display = "none";
  } catch (err) {
    console.warn("Overview weather error:", err);
    if (errorBox) {
      errorBox.style.display = "block";
      if (errorMsg) errorMsg.textContent = `${err.message || "Weather telemetry unavailable"}. Check internet connection or API settings and click Refresh.`;
    }
    const tEl = document.getElementById("ovTemp");
    const hEl = document.getElementById("ovHum");
    const rEl = document.getElementById("ovRain");
    const aEl = document.getElementById("ovAqi");
    const oEl = document.getElementById("ovOzone");
    if (tEl) tEl.textContent = "-- °C";
    if (hEl) hEl.textContent = "-- %";
    if (rEl) rEl.textContent = "-- mm";
    if (aEl) aEl.textContent = "-- AQI";
    if (oEl) oEl.textContent = "-- ppb";
  } finally {
    if (loadingBox) loadingBox.style.display = "none";
    if (gridEl) gridEl.style.opacity = "1";
    if (refreshBtn) {
      refreshBtn.textContent = "🔄 Refresh";
      refreshBtn.disabled = false;
    }
  }
}

function toggleExtendedForecast() {
  const drawer = document.getElementById("forecastExtendedDrawer");
  const btnText = document.getElementById("toggleForecastBtnText");
  if (!drawer) return;
  const isHidden = drawer.style.display === "none" || drawer.style.display === "";
  drawer.style.display = isHidden ? "block" : "none";
  if (btnText) {
    btnText.textContent = isHidden ? "Hide Extended Forecast" : "View 7 Days";
  }
}

function renderForecastWidget(data) {
  if (!data || !data.forecast) return;
  const f = data.forecast;
  const daily = f.daily_forecast || [];

  const locEl = document.getElementById("forecastLocationName");
  const issuedEl = document.getElementById("forecastIssuedAt");
  if (locEl) locEl.textContent = data.location?.name || "Wardha Farm Station";
  if (issuedEl) {
    const d = new Date(data.observed_at || Date.now());
    issuedEl.textContent = `Issued: ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · 5-Day Outlook`;
  }

  // Populate 3 primary cards: 0 (Today), 1 (Tomorrow), 2 (Day After)
  for (let i = 0; i < 3; i++) {
    const day = daily[i];
    const lblEl = document.getElementById(`fDay${i}Label`);
    const dtEl = document.getElementById(`fDay${i}Date`);
    const iconEl = document.getElementById(`fDay${i}Icon`);
    const tempEl = document.getElementById(`fDay${i}Temp`);
    const rangeEl = document.getElementById(`fDay${i}Range`);
    const condEl = document.getElementById(`fDay${i}Cond`);
    const rainEl = document.getElementById(`fDay${i}Rain`);
    const popEl = document.getElementById(`fDay${i}Pop`);
    const popBarEl = document.getElementById(`fDay${i}PopBar`);
    const badgeEl = document.getElementById(`fDay${i}Badge`);
    const advEl = document.getElementById(`fDay${i}Advice`);

    if (day) {
      if (lblEl) lblEl.textContent = day.day_label || (i === 0 ? "Today" : (i === 1 ? "Tomorrow" : "Day After"));
      if (dtEl) dtEl.textContent = day.formatted_date || day.date_iso;
      if (iconEl) iconEl.textContent = day.icon || "☀️";
      if (tempEl) tempEl.textContent = `${day.temp_max_c.toFixed(1)} °C`;
      if (rangeEl) rangeEl.textContent = `H: ${day.temp_max_c.toFixed(0)}° / L: ${day.temp_min_c.toFixed(0)}°C`;
      if (condEl) condEl.textContent = day.weather_description || day.weather_condition;
      if (rainEl) rainEl.textContent = `${day.rainfall_total_mm.toFixed(1)} mm`;
      
      const popPct = Math.round((day.rain_probability_max || 0) * 100);
      if (popEl) popEl.textContent = `${popPct}%`;
      if (popBarEl) popBarEl.style.width = `${Math.min(100, Math.max(0, popPct))}%`;

      if (badgeEl) {
        badgeEl.className = `forecast-agri-badge ${day.agri_risk_level === "High" ? "agri-badge-high" : (day.agri_risk_level === "Moderate" ? "agri-badge-moderate" : "agri-badge-low")}`;
      }
      if (advEl) {
        advEl.textContent = day.agri_advice || (day.agri_risk_level === "High" ? "Elevated abiotic risk" : "Favorable conditions");
      }
    }
  }

  // Populate Extended Table
  const tbody = document.getElementById("forecastExtendedTbody");
  if (tbody) {
    if (daily.length > 0) {
      tbody.innerHTML = daily.map((d) => {
        const popPct = Math.round((d.rain_probability_max || 0) * 100);
        const riskClass = d.agri_risk_level === "High" ? "agri-badge-high" : (d.agri_risk_level === "Moderate" ? "agri-badge-moderate" : "agri-badge-low");
        return `
          <tr>
            <td><strong>${d.day_label}</strong></td>
            <td style="color:#64748b;">${d.formatted_date}</td>
            <td>
              <span style="font-size:14px; margin-right:4px;">${d.icon}</span>
              <span style="font-weight:600;">${d.weather_condition}</span>
            </td>
            <td><strong>${d.temp_max_c.toFixed(1)}°</strong> / ${d.temp_min_c.toFixed(1)}°C</td>
            <td><span style="color:#0284c7; font-weight:700;">${d.rainfall_total_mm.toFixed(1)} mm</span></td>
            <td>
              <div style="display:flex; align-items:center; gap:6px;">
                <span>${popPct}%</span>
                <div style="width:40px; height:4px; background:#e2e8f0; border-radius:999px; overflow:hidden;">
                  <div style="height:100%; width:${popPct}%; background:#0284c7;"></div>
                </div>
              </div>
            </td>
            <td>
              <span class="forecast-agri-badge ${riskClass}" style="display:inline-flex; padding:2px 6px;">
                ${d.agri_advice}
              </span>
            </td>
          </tr>
        `;
      }).join("");
    } else {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:16px; color:#64748b;">No extended forecast records available from station.</td></tr>`;
    }
  }
}

// =========================================================
// VISUAL STRESS DISTRIBUTION (CNN) DONUT CHART
// =========================================================

let visualDistChartInstance = null;
let currentCategoryFilter = null;
let latestVisualDistData = null;

async function fetchVisualDistribution() {
  const loadingEl = document.getElementById("visualDistLoading");
  const emptyEl = document.getElementById("visualDistEmpty");
  const contentEl = document.getElementById("visualDistContent");

  if (loadingEl) loadingEl.style.display = "block";
  if (emptyEl) emptyEl.style.display = "none";
  if (contentEl) contentEl.style.opacity = "0.3";

  try {
    const res = await fetch(getApiUrl("/api/v1/analytics/visual-distribution"));
    if (!res.ok) throw new Error("Could not fetch visual distribution");

    const data = await res.json();
    latestVisualDistData = data;

    if (loadingEl) loadingEl.style.display = "none";

    const centerCountEl = document.getElementById("donutTotalCount");
    if (centerCountEl) {
      centerCountEl.textContent = String(data.total_analyses || 0);
    }

    if (!data.has_data || data.total_analyses === 0) {
      if (emptyEl) emptyEl.style.display = "block";
      if (contentEl) contentEl.style.display = "none";
      if (visualDistChartInstance) {
        visualDistChartInstance.destroy();
        visualDistChartInstance = null;
      }
      return;
    }

    if (emptyEl) emptyEl.style.display = "none";
    if (contentEl) {
      contentEl.style.display = "grid";
      contentEl.style.opacity = "1";
    }

    renderVisualDistDonut(data);
    renderVisualDistLegend(data.categories);

  } catch (err) {
    console.error("Visual distribution fetch error:", err);
    if (loadingEl) loadingEl.style.display = "none";
    if (emptyEl) emptyEl.style.display = "block";
    if (contentEl) contentEl.style.display = "none";
  }
}

function renderVisualDistDonut(data) {
  const canvas = document.getElementById("visualDistCanvas");
  if (!canvas) return;

  if (visualDistChartInstance) {
    visualDistChartInstance.destroy();
    visualDistChartInstance = null;
  }

  const ctx = canvas.getContext("2d");
  const categories = data.categories || [];

  const labels = categories.map(c => c.name);
  const counts = categories.map(c => c.count);
  const colors = categories.map(c => c.color);

  // Check if non-zero
  const hasNonZero = counts.some(c => c > 0);
  const chartData = hasNonZero ? counts : [1];
  const chartColors = hasNonZero ? colors : ["#e2e8f0"];

  if (typeof Chart !== "undefined") {
    visualDistChartInstance = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: labels,
        datasets: [
          {
            data: chartData,
            backgroundColor: chartColors,
            hoverBackgroundColor: chartColors,
            borderColor: "#ffffff",
            borderWidth: 2,
            hoverOffset: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "72%",
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            enabled: hasNonZero,
            backgroundColor: "#0f172a",
            titleFont: { size: 11.5, weight: "bold", family: "Inter, sans-serif" },
            bodyFont: { size: 11, family: "Inter, sans-serif" },
            padding: 8,
            cornerRadius: 6,
            callbacks: {
              label: function(context) {
                const idx = context.dataIndex;
                const cat = categories[idx];
                if (!cat) return "";
                return ` ${cat.name}: ${cat.count} scans (${cat.percentage}%)`;
              }
            }
          }
        },
        onClick: (event, elements) => {
          if (elements && elements.length > 0) {
            const idx = elements[0].index;
            const cat = categories[idx];
            if (cat) {
              toggleCategoryFilter(cat.key, cat.name);
            }
          }
        }
      }
    });
  } else {
    renderCanvasDonutFallback(ctx, canvas, categories, hasNonZero);
  }
}

function renderVisualDistLegend(categories) {
  const legendContainer = document.getElementById("visualDistLegend");
  if (!legendContainer) return;

  legendContainer.innerHTML = categories.map(cat => {
    const isActive = currentCategoryFilter === cat.key;
    return `
      <div
        class="dist-legend-row ${isActive ? 'active-filter' : ''}"
        onclick="toggleCategoryFilter('${cat.key}', '${cat.name}')"
        title="Click to filter recent list by ${cat.name}"
      >
        <div class="dist-legend-left">
          <span class="dist-dot" style="background:${cat.color};"></span>
          <span class="dist-legend-name">${cat.name}</span>
        </div>
        <div class="dist-legend-right">
          <span class="dist-count-badge">${cat.count}</span>
          <span class="dist-pct-tag">${cat.percentage}%</span>
        </div>
      </div>
    `;
  }).join("");
}

function toggleCategoryFilter(categoryKey, categoryName) {
  if (currentCategoryFilter === categoryKey) {
    currentCategoryFilter = null;
  } else {
    currentCategoryFilter = categoryKey;
  }

  // Update Active Filter Badge
  const badge = document.getElementById("visualDistActiveFilterBadge");
  const badgeText = document.getElementById("activeFilterBadgeText");
  if (badge && badgeText) {
    if (currentCategoryFilter) {
      badge.style.display = "inline-flex";
      badgeText.textContent = `${categoryName || categoryKey}`;
    } else {
      badge.style.display = "none";
    }
  }

  // Re-render legend highlight
  if (latestVisualDistData && latestVisualDistData.categories) {
    renderVisualDistLegend(latestVisualDistData.categories);
  }

  // Re-render dashboard table with active filter
  renderOverviewDashboard();
}

function clearCategoryFilter() {
  currentCategoryFilter = null;
  const badge = document.getElementById("visualDistActiveFilterBadge");
  if (badge) badge.style.display = "none";

  if (latestVisualDistData && latestVisualDistData.categories) {
    renderVisualDistLegend(latestVisualDistData.categories);
  }

  renderOverviewDashboard();
}

function renderCanvasDonutFallback(ctx, canvas, categories, hasData) {
  const size = 140;
  canvas.width = size * window.devicePixelRatio;
  canvas.height = size * window.devicePixelRatio;
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

  ctx.clearRect(0, 0, size, size);

  const cx = size / 2;
  const cy = size / 2;
  const outerRadius = size / 2 - 4;
  const innerRadius = outerRadius * 0.72;

  if (!hasData) {
    ctx.beginPath();
    ctx.arc(cx, cy, outerRadius, 0, Math.PI * 2);
    ctx.arc(cx, cy, innerRadius, Math.PI * 2, 0, true);
    ctx.fillStyle = "#e2e8f0";
    ctx.fill();
    return;
  }

  let total = categories.reduce((sum, c) => sum + c.count, 0) || 1;
  let startAngle = -Math.PI / 2;

  categories.forEach(cat => {
    if (cat.count === 0) return;
    const sliceAngle = (cat.count / total) * Math.PI * 2;
    const endAngle = startAngle + sliceAngle;

    ctx.beginPath();
    ctx.arc(cx, cy, outerRadius, startAngle, endAngle);
    ctx.arc(cx, cy, innerRadius, endAngle, startAngle, true);
    ctx.closePath();
    ctx.fillStyle = cat.color;
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    startAngle = endAngle;
  });
}

// =========================================================
// ENVIRONMENTAL STRESS DISTRIBUTION (SNN) DONUT CHART
// =========================================================

let envDistChartInstance = null;
let latestEnvDistData = null;

async function fetchEnvironmentalDistribution() {
  const loadingEl = document.getElementById("envDistLoading");
  const emptyEl = document.getElementById("envDistEmpty");
  const contentEl = document.getElementById("envDistContent");

  if (loadingEl) loadingEl.style.display = "block";
  if (emptyEl) emptyEl.style.display = "none";
  if (contentEl) contentEl.style.opacity = "0.3";

  try {
    const res = await fetch(getApiUrl("/api/v1/analytics/environmental-distribution"));
    if (!res.ok) throw new Error("Could not fetch environmental distribution");

    const data = await res.json();
    latestEnvDistData = data;

    if (loadingEl) loadingEl.style.display = "none";

    const centerCountEl = document.getElementById("envDonutTotalCount");
    if (centerCountEl) {
      centerCountEl.textContent = String(data.total_analyses || 0);
    }

    if (!data.has_data || data.total_analyses === 0) {
      if (emptyEl) emptyEl.style.display = "block";
      if (contentEl) contentEl.style.display = "none";
      if (envDistChartInstance) {
        envDistChartInstance.destroy();
        envDistChartInstance = null;
      }
      return;
    }

    if (emptyEl) emptyEl.style.display = "none";
    if (contentEl) {
      contentEl.style.display = "grid";
      contentEl.style.opacity = "1";
    }

    renderEnvDistDonut(data);
    renderEnvDistLegend(data.categories);

  } catch (err) {
    console.error("Environmental distribution fetch error:", err);
    if (loadingEl) loadingEl.style.display = "none";
    if (emptyEl) emptyEl.style.display = "block";
    if (contentEl) contentEl.style.display = "none";
  }
}

function renderEnvDistDonut(data) {
  const canvas = document.getElementById("envDistCanvas");
  if (!canvas) return;

  if (envDistChartInstance) {
    envDistChartInstance.destroy();
    envDistChartInstance = null;
  }

  const ctx = canvas.getContext("2d");
  const categories = data.categories || [];

  const labels = categories.map(c => c.name);
  const counts = categories.map(c => c.count);
  const colors = categories.map(c => c.color);

  // Check if non-zero
  const hasNonZero = counts.some(c => c > 0);
  const chartData = hasNonZero ? counts : [1];
  const chartColors = hasNonZero ? colors : ["#e2e8f0"];

  if (typeof Chart !== "undefined") {
    envDistChartInstance = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: labels,
        datasets: [
          {
            data: chartData,
            backgroundColor: chartColors,
            hoverBackgroundColor: chartColors,
            borderColor: "#ffffff",
            borderWidth: 2,
            hoverOffset: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "72%",
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            enabled: hasNonZero,
            backgroundColor: "#0f172a",
            titleFont: { size: 11.5, weight: "bold", family: "Inter, sans-serif" },
            bodyFont: { size: 11, family: "Inter, sans-serif" },
            padding: 8,
            cornerRadius: 6,
            callbacks: {
              label: function(context) {
                const idx = context.dataIndex;
                const cat = categories[idx];
                if (!cat) return "";
                return ` ${cat.name}: ${cat.count} scans (${cat.percentage}%)`;
              }
            }
          }
        },
        onClick: (event, elements) => {
          if (elements && elements.length > 0) {
            const idx = elements[0].index;
            const cat = categories[idx];
            if (cat) {
              toggleEnvCategoryFilter(cat.name, cat.label || cat.name);
            }
          }
        }
      }
    });
  } else {
    renderCanvasEnvDonutFallback(ctx, canvas, categories, hasNonZero);
  }
}

function renderEnvDistLegend(categories) {
  const legendContainer = document.getElementById("envDistLegend");
  if (!legendContainer) return;

  legendContainer.innerHTML = categories.map(cat => {
    const isActive = currentEnvCategoryFilter && currentEnvCategoryFilter.toLowerCase() === cat.name.toLowerCase();
    return `
      <div
        class="dist-legend-row ${isActive ? 'active-filter' : ''}"
        onclick="toggleEnvCategoryFilter('${cat.name}', '${cat.label || cat.name}')"
        title="Click to filter recent list by ${cat.name} Environmental Risk"
      >
        <div class="dist-legend-left">
          <span class="dist-dot" style="background:${cat.color};"></span>
          <span class="dist-legend-name">${cat.name}</span>
        </div>
        <div class="dist-legend-right">
          <span class="dist-count-badge">${cat.count}</span>
          <span class="dist-pct-tag">${cat.percentage}%</span>
        </div>
      </div>
    `;
  }).join("");
}

function toggleEnvCategoryFilter(categoryKey, categoryLabel) {
  if (currentEnvCategoryFilter && currentEnvCategoryFilter.toLowerCase() === categoryKey.toLowerCase()) {
    currentEnvCategoryFilter = null;
  } else {
    currentEnvCategoryFilter = categoryKey;
  }

  // Update Active Filter Badge
  const badge = document.getElementById("envDistActiveFilterBadge");
  const badgeText = document.getElementById("activeEnvFilterBadgeText");
  if (badge && badgeText) {
    if (currentEnvCategoryFilter) {
      badge.style.display = "inline-flex";
      badgeText.textContent = `${categoryLabel || categoryKey}`;
    } else {
      badge.style.display = "none";
    }
  }

  // Re-render legend highlight
  if (latestEnvDistData && latestEnvDistData.categories) {
    renderEnvDistLegend(latestEnvDistData.categories);
  }

  // Re-render dashboard table with active filter
  renderOverviewDashboard();
}

function clearEnvCategoryFilter() {
  currentEnvCategoryFilter = null;
  const badge = document.getElementById("envDistActiveFilterBadge");
  if (badge) badge.style.display = "none";

  if (latestEnvDistData && latestEnvDistData.categories) {
    renderEnvDistLegend(latestEnvDistData.categories);
  }

  renderOverviewDashboard();
}

function renderCanvasEnvDonutFallback(ctx, canvas, categories, hasData) {
  const size = 140;
  canvas.width = size * window.devicePixelRatio;
  canvas.height = size * window.devicePixelRatio;
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

  ctx.clearRect(0, 0, size, size);

  const cx = size / 2;
  const cy = size / 2;
  const outerRadius = size / 2 - 4;
  const innerRadius = outerRadius * 0.72;

  if (!hasData) {
    ctx.beginPath();
    ctx.arc(cx, cy, outerRadius, 0, Math.PI * 2);
    ctx.arc(cx, cy, innerRadius, Math.PI * 2, 0, true);
    ctx.fillStyle = "#e2e8f0";
    ctx.fill();
    return;
  }

  let total = categories.reduce((sum, c) => sum + c.count, 0) || 1;
  let startAngle = -Math.PI / 2;

  categories.forEach(cat => {
    if (cat.count === 0) return;
    const sliceAngle = (cat.count / total) * Math.PI * 2;
    const endAngle = startAngle + sliceAngle;

    ctx.beginPath();
    ctx.arc(cx, cy, outerRadius, startAngle, endAngle);
    ctx.arc(cx, cy, innerRadius, endAngle, startAngle, true);
    ctx.closePath();
    ctx.fillStyle = cat.color;
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    startAngle = endAngle;
  });
}

document.addEventListener("DOMContentLoaded", () => {
  loadOverviewData();
  fetchVisualDistribution();
  fetchEnvironmentalDistribution();

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
      currentSearchQuery = (e.target.value || "").trim().toLowerCase();
      renderOverviewDashboard();
    });
  }
});

// =========================================================
// POWER BI RECENT ANALYSES TABLE (Sorting, Filtering, Pagination, Quick View)
// =========================================================

let tableCurrentPage = 1;
let tablePageSize = 5;
let currentSortColumn = 'date';
let currentSortDirection = 'desc';
let tableFilterSearchText = '';
let tableFilterVisualValue = '';
let tableFilterEnvValue = '';
let tableFilterExpertValue = '';

function handleTableFilterChange() {
  const searchInput = document.getElementById("tableFilterSearch");
  const clearSearchBtn = document.getElementById("clearTableSearchBtn");
  const visualSelect = document.getElementById("tableFilterVisual");
  const envSelect = document.getElementById("tableFilterEnv");
  const expertSelect = document.getElementById("tableFilterExpert");

  tableFilterSearchText = (searchInput?.value || "").trim().toLowerCase();
  if (clearSearchBtn) {
    clearSearchBtn.style.display = tableFilterSearchText ? "inline-block" : "none";
  }
  tableFilterVisualValue = visualSelect?.value || "";
  tableFilterEnvValue = envSelect?.value || "";
  tableFilterExpertValue = expertSelect?.value || "";

  tableCurrentPage = 1;
  renderRecentAnalysesTable();
}

function clearTableSearch() {
  const searchInput = document.getElementById("tableFilterSearch");
  if (searchInput) searchInput.value = "";
  handleTableFilterChange();
}

function handlePageSizeChange() {
  const pageSizeSelect = document.getElementById("tablePageSize");
  if (pageSizeSelect) {
    tablePageSize = parseInt(pageSizeSelect.value, 10) || 5;
  }
  tableCurrentPage = 1;
  renderRecentAnalysesTable();
}

function resetTableFilters() {
  const searchInput = document.getElementById("tableFilterSearch");
  const visualSelect = document.getElementById("tableFilterVisual");
  const envSelect = document.getElementById("tableFilterEnv");
  const expertSelect = document.getElementById("tableFilterExpert");
  const clearSearchBtn = document.getElementById("clearTableSearchBtn");

  if (searchInput) searchInput.value = "";
  if (visualSelect) visualSelect.value = "";
  if (envSelect) envSelect.value = "";
  if (expertSelect) expertSelect.value = "";
  if (clearSearchBtn) clearSearchBtn.style.display = "none";

  tableFilterSearchText = '';
  tableFilterVisualValue = '';
  tableFilterEnvValue = '';
  tableFilterExpertValue = '';
  tableCurrentPage = 1;

  renderRecentAnalysesTable();
}

function sortTableBy(column) {
  if (currentSortColumn === column) {
    currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
  } else {
    currentSortColumn = column;
    currentSortDirection = (column === 'date' || column === 'confidence') ? 'desc' : 'asc';
  }
  updateSortHeaderIndicators();
  renderRecentAnalysesTable();
}

function updateSortHeaderIndicators() {
  const columns = ['date', 'visual', 'confidence', 'env', 'expert', 'final'];
  columns.forEach(col => {
    const iconId = `sortIcon${col.charAt(0).toUpperCase() + col.slice(1)}`;
    const iconEl = document.getElementById(iconId);
    const thEl = iconEl?.closest("th");
    if (iconEl) {
      if (currentSortColumn === col) {
        iconEl.textContent = currentSortDirection === 'asc' ? '▲' : '▼';
        if (thEl) thEl.classList.add("active-sort");
      } else {
        iconEl.textContent = '⇅';
        if (thEl) thEl.classList.remove("active-sort");
      }
    }
  });
}

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

function changeTablePage(delta) {
  tableCurrentPage += delta;
  renderRecentAnalysesTable();
}

function setTablePage(pageNum) {
  tableCurrentPage = pageNum;
  renderRecentAnalysesTable();
}

function renderRecentAnalysesTable() {
  const tbody = document.getElementById("overviewRecentTbody");
  const countBadge = document.getElementById("recentAnalysesCountBadge");
  const paginationInfo = document.getElementById("tablePaginationInfo");
  const pageNumbersContainer = document.getElementById("tablePageNumbers");
  const prevBtn = document.getElementById("tablePrevBtn");
  const nextBtn = document.getElementById("tableNextBtn");

  if (!tbody) return;

  // 1. If database is completely empty:
  if (!rawAllRecords || rawAllRecords.length === 0) {
    if (countBadge) countBadge.textContent = "0 Scans";
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align:center; padding:36px 16px; color:#64748b;">
          <div style="font-size:32px; margin-bottom:8px;">🍃</div>
          <h4 style="font-size:14px; font-weight:700; color:#0f172a; margin:0 0 4px;">No analysis records yet.</h4>
          <p style="font-size:12px; color:#64748b; margin:0 0 14px;">Start your first analysis to diagnose foliar health and environmental conditions.</p>
          <a href="dashboard.html" class="btn btn-primary" style="font-size:12px; padding:7px 16px; border-radius:8px; text-decoration:none; display:inline-flex; align-items:center; gap:5px;">
            <span>Start your first analysis</span>
            <span>→</span>
          </a>
        </td>
      </tr>
    `;
    if (paginationInfo) paginationInfo.textContent = "Showing 0 to 0 of 0 records";
    if (pageNumbersContainer) pageNumbersContainer.innerHTML = "";
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;
    return;
  }

  // 2. Filter records
  let filtered = [...rawAllRecords];

  // Visual Category Filter from donut click
  if (currentCategoryFilter) {
    filtered = filtered.filter(r => {
      const { topClass } = getRecordTopClass(r);
      const formatted = topClass.toLowerCase().replace(/\s+/g, "_");
      return formatted.includes(currentCategoryFilter.toLowerCase()) || currentCategoryFilter.toLowerCase().includes(formatted);
    });
  }

  // Env Category Filter from donut click
  if (currentEnvCategoryFilter) {
    filtered = filtered.filter(r => {
      const sev = (r.stress_severity || "").trim().toLowerCase();
      return sev === currentEnvCategoryFilter.toLowerCase();
    });
  }

  // Table-specific text search
  if (tableFilterSearchText) {
    const q = tableFilterSearchText;
    filtered = filtered.filter(r => {
      const { topClass } = getRecordTopClass(r);
      const { ruleName } = getRecordExpertStatus(r);
      const uuidMatch = (r.record_uuid || "").toLowerCase().includes(q);
      const classMatch = topClass.toLowerCase().includes(q);
      const sevMatch = (r.stress_severity || "").toLowerCase().includes(q);
      const ruleMatch = ruleName.toLowerCase().includes(q);
      return uuidMatch || classMatch || sevMatch || ruleMatch;
    });
  }

  // Table-specific visual dropdown
  if (tableFilterVisualValue) {
    filtered = filtered.filter(r => {
      const { topClass } = getRecordTopClass(r);
      const val = tableFilterVisualValue.toLowerCase().replace(/_/g, " ");
      return topClass.toLowerCase().includes(val);
    });
  }

  // Table-specific env dropdown
  if (tableFilterEnvValue) {
    filtered = filtered.filter(r => {
      return (r.stress_severity || "").toLowerCase() === tableFilterEnvValue.toLowerCase();
    });
  }

  // Table-specific expert dropdown
  if (tableFilterExpertValue) {
    filtered = filtered.filter(r => {
      const { isAlert } = getRecordExpertStatus(r);
      return tableFilterExpertValue === "alert" ? isAlert : !isAlert;
    });
  }

  if (countBadge) {
    countBadge.textContent = `${filtered.length} Scans`;
  }

  // If filtered set is empty
  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align:center; padding:32px 16px; color:#64748b;">
          <div style="font-size:26px; margin-bottom:6px;">🔍</div>
          <strong style="font-size:13px; color:#334155; display:block;">No records match your filter criteria</strong>
          <p style="font-size:11.5px; color:#64748b; margin:4px 0 12px;">Try clearing search keywords or resetting visual/environmental filters.</p>
          <button type="button" class="btn-reset-filters" onclick="resetTableFilters()">Reset Filters</button>
        </td>
      </tr>
    `;
    if (paginationInfo) paginationInfo.textContent = "Showing 0 to 0 of 0 records";
    if (pageNumbersContainer) pageNumbersContainer.innerHTML = "";
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;
    return;
  }

  // 3. Sort records
  filtered.sort((a, b) => {
    let valA, valB;
    if (currentSortColumn === 'date') {
      valA = new Date(a.created_at || 0).getTime();
      valB = new Date(b.created_at || 0).getTime();
    } else if (currentSortColumn === 'visual') {
      valA = getRecordTopClass(a).topClass;
      valB = getRecordTopClass(b).topClass;
    } else if (currentSortColumn === 'confidence') {
      valA = getRecordTopClass(a).topPct;
      valB = getRecordTopClass(b).topPct;
    } else if (currentSortColumn === 'env') {
      const rank = { "high": 3, "moderate": 2, "low": 1 };
      valA = rank[(a.stress_severity || "low").toLowerCase()] || 0;
      valB = rank[(b.stress_severity || "low").toLowerCase()] || 0;
    } else if (currentSortColumn === 'expert') {
      valA = getRecordExpertStatus(a).isAlert ? 1 : 0;
      valB = getRecordExpertStatus(b).isAlert ? 1 : 0;
    } else if (currentSortColumn === 'final') {
      valA = getRecordFinalAssessment(a).relationship;
      valB = getRecordFinalAssessment(b).relationship;
    }

    if (valA < valB) return currentSortDirection === 'asc' ? -1 : 1;
    if (valA > valB) return currentSortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  // 4. Pagination
  const totalRecords = filtered.length;
  const totalPages = Math.ceil(totalRecords / tablePageSize) || 1;
  tableCurrentPage = Math.max(1, Math.min(tableCurrentPage, totalPages));

  const startIdx = (tableCurrentPage - 1) * tablePageSize;
  const endIdx = Math.min(startIdx + tablePageSize, totalRecords);
  const pageRecords = filtered.slice(startIdx, endIdx);

  // Update pagination info
  if (paginationInfo) {
    paginationInfo.textContent = `Showing ${startIdx + 1} to ${endIdx} of ${totalRecords} records (Page ${tableCurrentPage} of ${totalPages})`;
  }

  if (prevBtn) prevBtn.disabled = tableCurrentPage <= 1;
  if (nextBtn) nextBtn.disabled = tableCurrentPage >= totalPages;

  if (pageNumbersContainer) {
    let pagesHtml = "";
    const maxVisiblePages = 5;
    let startP = Math.max(1, tableCurrentPage - Math.floor(maxVisiblePages / 2));
    let endP = Math.min(totalPages, startP + maxVisiblePages - 1);
    if (endP - startP + 1 < maxVisiblePages) {
      startP = Math.max(1, endP - maxVisiblePages + 1);
    }
    for (let p = startP; p <= endP; p++) {
      pagesHtml += `
        <button type="button" class="page-num-btn ${p === tableCurrentPage ? 'active' : ''}" onclick="setTablePage(${p})">
          ${p}
        </button>
      `;
    }
    pageNumbersContainer.innerHTML = pagesHtml;
  }

  // 5. Render Rows
  tbody.innerHTML = pageRecords.map(r => {
    const { topClass, topPct } = getRecordTopClass(r);
    const { isAlert, ruleName } = getRecordExpertStatus(r);
    const { relationship } = getRecordFinalAssessment(r);

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

    // Expert Check Badge
    let expertBadge = `<span style="background:#f8fafc; color:#475569; border:1px solid #e2e8f0; font-size:10.5px; font-weight:600; padding:2px 7px; border-radius:6px; white-space:nowrap;" title="Verified by Agronomic Rules">🛡️ Normal</span>`;
    if (isAlert) {
      const shortRule = ruleName.length > 15 ? `${ruleName.substring(0, 14)}…` : ruleName;
      expertBadge = `<span style="background:#fffbeb; color:#b45309; border:1px solid #fed7aa; font-size:10.5px; font-weight:700; padding:2px 7px; border-radius:6px; white-space:nowrap;" title="${ruleName}">⚠️ ${shortRule}</span>`;
    }

    // Final Assessment Badge
    let finalBadge = `<span style="background:#ecfdf5; color:#059669; border:1px solid #a7f3d0; font-size:10.5px; font-weight:700; padding:2px 7px; border-radius:6px; white-space:nowrap;">⚖️ Aligned</span>`;
    if (relationship.includes("DIVERGENT") || relationship.includes("CONFLICT")) {
      finalBadge = `<span style="background:#fef3c7; color:#d97706; border:1px solid #fde68a; font-size:10.5px; font-weight:700; padding:2px 7px; border-radius:6px; white-space:nowrap;">⚡ Divergent</span>`;
    } else if (relationship.includes("VETO") || relationship.includes("OVERRULE") || relationship.includes("CRITICAL")) {
      finalBadge = `<span style="background:#fee2e2; color:#dc2626; border:1px solid #fecaca; font-size:10.5px; font-weight:700; padding:2px 7px; border-radius:6px; white-space:nowrap;">🛡️ Safety Veto</span>`;
    }

    // Date & Time
    const dt = r.created_at ? new Date(r.created_at) : new Date();
    const dateFormatted = dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const timeFormatted = dt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    const uuidShort = (r.record_uuid || "").substring(0, 8);
    const imgUrl = r.image_url || "images/leaf_placeholder.jpg";
    const reportUrl = getApiUrl(`/api/v1/records/${r.record_uuid}/report`);

    return `
      <tr class="table-row-compact">
        <td>
          <div style="font-weight:700; color:#0f172a; white-space:nowrap;">${dateFormatted}</div>
          <div style="font-size:10px; color:#64748b; margin-top:1px; display:flex; align-items:center; gap:4px;">
            <span>${timeFormatted}</span>
            <span>·</span>
            <span style="font-family:monospace; color:#94a3b8;">${uuidShort}</span>
          </div>
        </td>
        <td style="text-align:center;">
          <img
            src="${imgUrl}"
            alt="Leaf"
            class="leaf-thumb-compact"
            onclick="openQuickViewModal('${r.record_uuid}')"
            title="Click for quick preview"
            onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'36\\' height=\\'36\\'><rect width=\\'36\\' height=\\'36\\' fill=\\'%23e2e8f0\\'/><text x=\\'50%\\' y=\\'55%\\' dominant-baseline=\\'middle\\' text-anchor=\\'middle\\' fill=\\'%2364748b\\' font-size=\\'14\\'>🌿</text></svg>'"
          />
        </td>
        <td>
          ${classBadge}
        </td>
        <td>
          <div style="font-weight:700; color:#0f172a; font-size:11.5px;">${topPct.toFixed(1)}%</div>
          <div class="evidence-bar-wrap">
            <div class="evidence-bar-fill" style="width:${Math.min(100, Math.max(10, Math.round(topPct)))}%; background:${classColor};"></div>
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
        <td style="text-align:right;">
          <div class="table-actions-group">
            <button type="button" class="tbl-action-btn view-btn" onclick="openQuickViewModal('${r.record_uuid}')" title="Quick preview modal">
              👁️ View
            </button>
            <a href="analysis_detail.html?uuid=${r.record_uuid}" class="tbl-action-btn open-btn" title="Open full analysis page">
              Open →
            </a>
            <a href="${reportUrl}" target="_blank" class="tbl-action-btn report-btn" title="Generate & view official PDF agronomic report">
              PDF ↗
            </a>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

function openQuickViewModal(uuid) {
  const modal = document.getElementById("quickViewModal");
  const modalTitle = document.getElementById("qvModalTitle");
  const modalDate = document.getElementById("qvModalDate");
  const modalBody = document.getElementById("qvModalBody");
  const openDetailBtn = document.getElementById("qvModalOpenDetailBtn");
  const reportBtn = document.getElementById("qvModalReportBtn");

  if (!modal) return;

  const record = (rawAllRecords || []).find(r => r.record_uuid === uuid);
  if (!record) return;

  const { topClass, topPct } = getRecordTopClass(record);
  const { isAlert, ruleName, rulePrecaution } = getRecordExpertStatus(record);
  const { relationship, summary } = getRecordFinalAssessment(record);

  const dt = record.created_at ? new Date(record.created_at) : new Date();
  if (modalTitle) modalTitle.textContent = `${topClass} Assessment`;
  if (modalDate) modalDate.textContent = `Recorded: ${dt.toLocaleString()} · ID: ${record.record_uuid}`;
  if (openDetailBtn) openDetailBtn.href = `analysis_detail.html?uuid=${record.record_uuid}`;
  if (reportBtn) reportBtn.href = getApiUrl(`/api/v1/records/${record.record_uuid}/report`);

  let recsList = [];
  try {
    if (record.recommendations_json) {
      recsList = JSON.parse(record.recommendations_json);
    }
  } catch (_) {}
  if (!Array.isArray(recsList) || recsList.length === 0) {
    recsList = [
      "Inspect leaf symptoms under natural daylight",
      "Review soil moisture and irrigation scheduling",
      "Monitor ambient temperature and microclimate trends"
    ];
  }

  if (modalBody) {
    modalBody.innerHTML = `
      <div style="display:grid; grid-template-columns:110px 1fr; gap:14px; align-items:start; margin-bottom:14px;">
        <img
          src="${record.image_url || 'images/leaf_placeholder.jpg'}"
          alt="Leaf scan"
          style="width:110px; height:110px; border-radius:10px; object-fit:cover; border:1px solid #cbd5e1;"
          onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'110\\' height=\\'110\\'><rect width=\\'110\\' height=\\'110\\' fill=\\'%23e2e8f0\\'/><text x=\\'50%\\' y=\\'55%\\' dominant-baseline=\\'middle\\' text-anchor=\\'middle\\' fill=\\'%2364748b\\' font-size=\\'30\\'>🌿</text></svg>'"
        />
        <div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <strong style="font-size:1.15rem; color:#0d3b2e;">${topClass}</strong>
            <span style="font-size:11px; font-weight:700; color:#059669; background:#ecfdf5; padding:2px 8px; border-radius:999px; border:1px solid #a7f3d0;">${topPct.toFixed(1)}% CNN Evidence</span>
          </div>
          <p style="font-size:12px; color:#475569; margin:0 0 10px; line-height:1.45;">
            ${summary || `Foliar image evaluated as ${topClass} under ${record.stress_severity || 'Moderate'} environmental stress risk.`}
          </p>
          <div style="display:flex; gap:6px; flex-wrap:wrap;">
            <span style="font-size:10.5px; font-weight:700; background:#f1f5f9; color:#334155; padding:3px 8px; border-radius:6px;">
              🌡️ ${record.temperature !== undefined ? record.temperature.toFixed(1) : 31}°C
            </span>
            <span style="font-size:10.5px; font-weight:700; background:#f1f5f9; color:#334155; padding:3px 8px; border-radius:6px;">
              💧 ${record.humidity !== undefined ? record.humidity.toFixed(0) : 72}% RH
            </span>
            <span style="font-size:10.5px; font-weight:700; background:#f1f5f9; color:#334155; padding:3px 8px; border-radius:6px;">
              🌱 ${record.soil_moisture !== undefined ? (record.soil_moisture <= 1 ? Math.round(record.soil_moisture * 100) : Math.round(record.soil_moisture)) : 68}% Soil
            </span>
          </div>
        </div>
      </div>

      <!-- Expert Veto & Agronomic Precaution -->
      <div style="background:${isAlert ? '#fffbeb' : '#f8fafc'}; border:1px solid ${isAlert ? '#fed7aa' : '#e2e8f0'}; border-radius:10px; padding:12px 14px; margin-bottom:14px;">
        <div style="display:flex; align-items:center; gap:6px; font-size:12px; font-weight:700; color:${isAlert ? '#9a3412' : '#0d3b2e'}; margin-bottom:4px;">
          <span>${isAlert ? '⚠️' : '🛡️'}</span>
          <span>Expert Check: ${ruleName}</span>
        </div>
        <p style="margin:0; font-size:11.5px; color:#475569; line-height:1.45;">
          ${rulePrecaution || 'Sensor metrics and visual markers verified against cotton agronomic thresholds. No hazardous anomalies detected.'}
        </p>
      </div>

      <!-- Farmer Action Checklist -->
      <div>
        <strong style="font-size:12px; color:#0d3b2e; display:block; margin-bottom:6px;">Actionable Next Steps:</strong>
        <ul style="margin:0; padding-left:18px; font-size:11.5px; color:#334155; display:flex; flex-direction:column; gap:4px;">
          ${recsList.slice(0, 3).map(rec => `<li>${rec}</li>`).join("")}
        </ul>
      </div>
    `;
  }

  modal.style.display = "flex";
}

function closeQuickViewModal() {
  const modal = document.getElementById("quickViewModal");
  if (modal) modal.style.display = "none";
}

function exportOverviewTableCsv() {
  let url = getApiUrl("/api/v1/records/export/csv");
  window.open(url, "_blank");
}

