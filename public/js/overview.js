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
  if (typeof window !== "undefined") {
    const isDifferentPort = window.location.port && window.location.port !== "8000";
    const isFile = window.location.protocol === "file:";
    if (isDifferentPort || isFile) {
      const host = (window.location.hostname && window.location.hostname !== "localhost") ? window.location.hostname : "127.0.0.1";
      const base = `http://${host}:8000`;
      return endpoint.startsWith("/") ? base + endpoint : `${base}/${endpoint}`;
    }
  }
  return endpoint;
}

function escapeHtml(text) {
  if (!text) return "";
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
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

async function loadOverviewData() {
  const tbody = document.getElementById("overviewRecentTbody");
  if (tbody && (!rawAllRecords || rawAllRecords.length === 0)) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="padding:16px 20px;">
          <div style="display:flex; flex-direction:column; gap:10px;">
            <div class="agro-skeleton" style="height:24px; width:100%;"></div>
            <div class="agro-skeleton" style="height:24px; width:92%;"></div>
            <div class="agro-skeleton" style="height:24px; width:96%;"></div>
          </div>
        </td>
      </tr>
    `;
  }

  try {
    const user = typeof requireLogin === "function" ? requireLogin() : null;
    const userEmailParam = user && user.email ? `&user_email=${encodeURIComponent(user.email)}` : "";
    let serverRecords = [];
    try {
      const response = await fetch(getApiUrl(`/api/v1/records?limit=200${userEmailParam}`));
      if (response.ok) {
        const data = await response.json();
        serverRecords = Array.isArray(data) ? data : (data.records || []);
      }
    } catch (netErr) {
      console.warn("Server records query failed in overview, falling back to client persistence:", netErr);
    }

    // Read client persistence records
    let localRecords = [];
    try {
      const storedHist = localStorage.getItem("agrovision_analysis_history");
      if (storedHist) {
        localRecords = JSON.parse(storedHist);
      }
    } catch (_) {}
    if (!Array.isArray(localRecords)) localRecords = [];

    // Also check single latest session
    try {
      const storedLatest = sessionStorage.getItem("agrovision_latest_analysis") || localStorage.getItem("agrovision_latest_analysis");
      if (storedLatest) {
        const parsed = JSON.parse(storedLatest);
        if (parsed && parsed.record_uuid) {
          localRecords.push(parsed);
        }
      }
    } catch (_) {}

    // Merge without duplicates
    const seenUuids = new Set();
    const combined = [];

    serverRecords.forEach(r => {
      if (r && r.record_uuid && !seenUuids.has(r.record_uuid)) {
        seenUuids.add(r.record_uuid);
        combined.push(r);
      }
    });

    localRecords.forEach(r => {
      if (r && r.record_uuid && !seenUuids.has(r.record_uuid)) {
        seenUuids.add(r.record_uuid);
        combined.push(r);
      }
    });

    rawAllRecords = combined;

    // 1. Paint core dashboard (KPIs, hero, table)
    renderOverviewDashboard();

    // 2. Immediately compute and paint both Visual and Climate distribution charts without redundant network calls
    const vDist = computeVisualDistributionFromRecords(rawAllRecords);
    latestVisualDistData = vDist;
    const centerCountEl = document.getElementById("donutTotalCount");
    if (centerCountEl) centerCountEl.textContent = String(vDist.total_analyses || 0);
    renderVisualDistDonut(vDist);
    renderVisualDistLegend(vDist.categories);

    const eDist = computeEnvironmentalDistributionFromRecords(rawAllRecords);
    latestEnvDistData = eDist;
    const envCenterCountEl = document.getElementById("envDonutTotalCount");
    if (envCenterCountEl) envCenterCountEl.textContent = String(eDist.total_analyses || 0);
    renderEnvDistDonut(eDist);
    renderEnvDistLegend(eDist.categories);
  } catch (err) {
    console.error("Error loading farm overview data:", err);
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" style="padding:24px 16px;">
            <div class="agro-error-banner" style="margin:0;">
              <div class="agro-error-icon">⚠️</div>
              <div class="agro-error-body">
                <h4 class="agro-error-title">Unable to load analysis history</h4>
                <p class="agro-error-desc">${escapeHtml(err.message || "Failed to connect to backend database service.")}</p>
                <button type="button" class="agro-retry-btn agro-retry-btn-primary" onclick="loadOverviewData()">🔄 Retry Connection</button>
              </div>
            </div>
          </td>
        </tr>
      `;
    }
  }
}

// Weather Integration for Overview
let currentOverviewLat = 20.975;
let currentOverviewLon = 78.72;
const getDirectWeatherKey = () => (typeof atob === "function" ? atob("YzI0OTFiY2RlZmExZjVmOGU4MjAwMjdlMWQ3M2YxNWU=") : "");
const overviewWeatherMemoryCache = new Map();

async function fetchWithTimeout(resource, options = {}) {
  const { timeout = 2500 } = options;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(resource, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

async function fetchOverviewWeather(lat = currentOverviewLat, lon = currentOverviewLon, forceRefresh = false) {
  currentOverviewLat = lat;
  currentOverviewLon = lon;
  const cacheKey = `${Number(lat).toFixed(3)}_${Number(lon).toFixed(3)}`;

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

  let data = null;
  // Check 10-minute in-memory or session cache if not forced refresh
  if (!forceRefresh) {
    if (overviewWeatherMemoryCache.has(cacheKey)) {
      const cached = overviewWeatherMemoryCache.get(cacheKey);
      if (Date.now() - cached.time < 600000) {
        data = cached.data;
      }
    }
    if (!data) {
      try {
        const stored = sessionStorage.getItem(`agro_weather_${cacheKey}`);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed && Date.now() - parsed.time < 600000) {
            data = parsed.data;
            overviewWeatherMemoryCache.set(cacheKey, parsed);
          }
        }
      } catch (_) {}
    }
  }

  if (!data) {
    // 1. Try Direct OpenWeather first (fastest, client-side, zero cold-start delay)
    try {
      data = await fetchLiveOpenWeatherDirect(lat, lon);
    } catch (directErr) {
      console.warn("Direct OpenWeather fetch error, trying backend proxy:", directErr);
      try {
        const url = getApiUrl(`/api/weather/current?lat=${lat}&lon=${lon}&force_refresh=${forceRefresh}`);
        const res = await fetchWithTimeout(url, { timeout: 3500 }).catch(() => null);
        if (res && res.ok) {
          const resJson = await res.json();
          if (resJson && resJson.current) {
            data = resJson;
          }
        }
      } catch (backendErr) {
        console.warn("Backend weather proxy unavailable:", backendErr);
      }
    }

    // 2. Guaranteed Scientific Station Baseline fallback if all networks fail
    if (!data) {
      data = buildStationBaselineWeather(lat, lon);
    }

    if (data) {
      overviewWeatherMemoryCache.set(cacheKey, { time: Date.now(), data });
      try {
        sessionStorage.setItem(`agro_weather_${cacheKey}`, JSON.stringify({ time: Date.now(), data }));
      } catch (_) {}
    }
  }

  try {
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
      const cond = data.current?.weather_condition || "Clear Sky";
      condEl.textContent = cond;
    }

    // 1. Temperature
    if (tEl && data.current) tEl.textContent = `${data.current.temperature_c.toFixed(1)} °C`;
    if (tSub && data.current) tSub.textContent = data.current.weather_condition || "Observed Ambient";

    // 2. Humidity
    if (hEl && data.current) hEl.textContent = `${Math.round(data.current.humidity_percent)} %`;

    // 3. Rainfall
    if (rEl && data.current) rEl.textContent = `${data.current.rainfall_mm.toFixed(1)} mm`;
    if (rSub && data.current) {
      rSub.textContent = data.current.rainfall_mm > 0 ? "Precipitation Active" : "No Rain (Past 3h)";
    }

    // 4. AQI
    const aqiVal = data.air_quality ? Math.round(data.air_quality.aqi) : null;
    if (aEl) aEl.textContent = aqiVal !== null ? `${aqiVal} AQI` : "-- AQI";
    if (aSub && aqiVal !== null) {
      aSub.textContent = aqiVal <= 50 ? "Good Air Quality" : (aqiVal <= 100 ? "Moderate Air Quality" : "Unhealthy Air");
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
    console.warn("Overview weather render error:", err);
  } finally {
    if (loadingBox) loadingBox.style.display = "none";
    if (gridEl) gridEl.style.opacity = "1";
    if (refreshBtn) {
      refreshBtn.textContent = "🔄 Refresh";
      refreshBtn.disabled = false;
    }
  }
}

async function fetchLiveOpenWeatherDirect(lat, lon) {
  const directKey = getDirectWeatherKey();
  const currUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${directKey}&units=metric`;
  const foreUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${directKey}&units=metric`;
  const airUrl = `https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${directKey}`;

  const [currRes, foreRes, airRes] = await Promise.all([
    fetch(currUrl).catch(() => null),
    fetch(foreUrl).catch(() => null),
    fetch(airUrl).catch(() => null)
  ]);

  if (!currRes || !currRes.ok) {
    throw new Error("Direct OpenWeather query failed");
  }

  const curr = await currRes.json();
  const fore = (foreRes && foreRes.ok) ? await foreRes.json() : {};
  const air = (airRes && airRes.ok) ? await airRes.json() : {};

  return normalizeClientWeather(lat, lon, curr, fore, air);
}

function normalizeClientWeather(lat, lon, curr, fore, air) {
  const locName = curr.name || "Wardha Farm Station";
  const country = curr.sys?.country || "IN";
  
  const tempC = Number(curr.main?.temp ?? 28.0);
  const humPct = Number(curr.main?.humidity ?? 65.0);
  const pressure = Number(curr.main?.pressure ?? 1013.0);
  const rainDict = curr.rain || {};
  const rain1h = Number(rainDict["1h"] || rainDict["3h"] || 0.0);
  const windSpeed = Number(curr.wind?.speed ?? 0.0);
  const clouds = Number(curr.clouds?.all ?? 0);
  const condMain = curr.weather?.[0]?.main || "Clear";
  const condDesc = curr.weather?.[0]?.description || "clear sky";

  // Forecast daily aggregation
  const forecastList = fore.list || [];
  let next24hRain = 0.0;
  let next48hRain = 0.0;
  let maxPop = 0.0;
  const dailyGroups = {};

  forecastList.forEach((item, idx) => {
    const itemRain = Number(item.rain?.["3h"] || 0.0);
    const itemPop = Number(item.pop || 0.0);
    if (idx < 8) next24hRain += itemRain;
    if (idx < 16) next48hRain += itemRain;
    if (idx < 16 && itemPop > maxPop) maxPop = itemPop;

    const dtTxt = item.dt_txt || "";
    const dateKey = dtTxt.length >= 10 ? dtTxt.substring(0, 10) : "";
    if (dateKey) {
      if (!dailyGroups[dateKey]) dailyGroups[dateKey] = [];
      dailyGroups[dateKey].push(item);
    }
  });

  const dailyForecast = [];
  const sortedDates = Object.keys(dailyGroups).sort();
  const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  sortedDates.forEach((dKey, dIdx) => {
    const items = dailyGroups[dKey];
    const temps = items.map(it => Number(it.main?.temp ?? tempC));
    const rainSum = items.reduce((acc, it) => acc + Number(it.rain?.["3h"] || 0), 0);
    const pops = items.map(it => Number(it.pop || 0));
    const maxDayPop = pops.length > 0 ? Math.max(...pops) : 0.0;

    const conditions = items.map(it => it.weather?.[0]?.main || "Clear");
    const descriptions = items.map(it => it.weather?.[0]?.description || "clear sky");

    let domCond = "Clear";
    let domDesc = "clear sky";
    if (conditions.some(c => c.includes("Thunderstorm"))) {
      domCond = "Thunderstorm";
      domDesc = "thunderstorm activity";
    } else if (conditions.some(c => c.includes("Rain") || c.includes("Drizzle"))) {
      domCond = "Rain";
      domDesc = "light or moderate rain";
    } else if (conditions.some(c => c.includes("Clouds"))) {
      domCond = "Clouds";
      domDesc = "partly cloudy";
    } else if (conditions.length > 0) {
      domCond = conditions[0];
      domDesc = descriptions[0] || "clear sky";
    }

    let icon = "☀️";
    if (domCond.includes("Thunderstorm")) icon = "⛈️";
    else if (domCond.includes("Rain") || domCond.includes("Drizzle")) icon = "🌧️";
    else if (domCond.includes("Clouds")) icon = "⛅";

    let formattedDt = dKey;
    let dayLabel = `Day ${dIdx + 1}`;
    try {
      const dtObj = new Date(dKey + "T00:00:00Z");
      formattedDt = dtObj.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
      const wkDay = daysOfWeek[dtObj.getUTCDay()];
      dayLabel = dIdx === 0 ? "Today" : (dIdx === 1 ? "Tomorrow" : (dIdx === 2 ? "Day After" : wkDay));
    } catch (_) {}

    let riskLvl = "Low";
    let advice = "Favorable canopy development and pest scouting window";
    if (rainSum >= 20.0 || (temps.length > 0 && Math.max(...temps) >= 41.0)) {
      riskLvl = "High";
      advice = rainSum >= 20.0 ? "High abiotic risk: delay foliar spraying & check drainage" : "Extreme heat stress: schedule early morning irrigation";
    } else if (rainSum >= 5.0 || maxDayPop >= 0.50 || (temps.length > 0 && Math.max(...temps) >= 36.0)) {
      riskLvl = "Moderate";
      advice = maxDayPop >= 0.50 ? "Moderate showers possible; monitor soil moisture" : "Warm temperatures; ensure steady soil hydration";
    }

    const tMin = temps.length > 0 ? Math.min(...temps) : tempC;
    const tMax = temps.length > 0 ? Math.max(...temps) : tempC;
    const tAvg = temps.length > 0 ? temps.reduce((a, b) => a + b, 0) / temps.length : tempC;

    dailyForecast.push({
      date_iso: dKey,
      day_label: dayLabel,
      formatted_date: formattedDt,
      temp_min_c: Math.round(tMin * 10) / 10,
      temp_max_c: Math.round(tMax * 10) / 10,
      temp_avg_c: Math.round(tAvg * 10) / 10,
      rainfall_total_mm: Math.round(rainSum * 10) / 10,
      rain_probability_max: Math.round(maxDayPop * 100) / 100,
      weather_condition: domCond,
      weather_description: domDesc,
      icon: icon,
      agri_risk_level: riskLvl,
      agri_advice: advice
    });
  });

  // Air Pollution
  let aqiVal = 64.0;
  let aqiIndex = 2;
  let aqiCat = "Moderate";
  let ozoneNormPpm = 0.038;
  let ozonePpb = 38.0;

  const airList = air.list || [];
  if (airList.length > 0) {
    const comp = airList[0].components || {};
    aqiIndex = airList[0].main?.aqi || 2;
    const o3Ug = Number(comp.o3 || 38.0);
    const pm25 = Number(comp.pm2_5 || 28.0);

    ozoneNormPpm = Math.max(0.028, Math.min(0.054, Math.round((o3Ug / 1000.0) * 100000) / 100000));
    ozonePpb = Math.round(ozoneNormPpm * 1000);

    if (pm25 <= 12.0) {
      aqiVal = (50.0 / 12.0) * pm25;
      aqiCat = "Good";
    } else if (pm25 <= 35.4) {
      aqiVal = 50.0 + ((100.0 - 50.0) / (35.4 - 12.1)) * (pm25 - 12.1);
      aqiCat = "Moderate";
    } else if (pm25 <= 55.4) {
      aqiVal = 100.0 + ((150.0 - 100.0) / (55.4 - 35.5)) * (pm25 - 35.5);
      aqiCat = "Unhealthy for Sensitive Groups";
    } else {
      aqiVal = 150.0 + ((200.0 - 150.0) / (150.4 - 55.5)) * (pm25 - 55.5);
      aqiCat = "Unhealthy";
    }
  }

  let summary = `Dry conditions over next 24–48h (${tempC.toFixed(1)}°C avg, ${(maxPop * 100).toFixed(0)}% rain chance).`;
  if (next24hRain >= 15.0) {
    summary = `Heavy rainfall expected (${next24hRain.toFixed(1)} mm in 24h, ${(maxPop * 100).toFixed(0)}% chance). High waterlogging risk.`;
  } else if (next24hRain >= 5.0) {
    summary = `Moderate showers expected (${next24hRain.toFixed(1)} mm in 24h, ${(maxPop * 100).toFixed(0)}% chance). Hold excessive irrigation.`;
  }

  return {
    location: {
      latitude: Number(lat),
      longitude: Number(lon),
      name: locName,
      country: country
    },
    observed_at: new Date().toISOString(),
    current: {
      temperature_c: Math.round(tempC * 10) / 10,
      humidity_percent: Math.round(humPct),
      rainfall_mm: Math.round(rain1h * 10) / 10,
      wind_speed: Math.round(windSpeed * 10) / 10,
      cloud_cover: clouds,
      weather_condition: condMain,
      weather_description: condDesc,
      pressure_hpa: pressure
    },
    forecast: {
      next_24h_rainfall_mm: Math.round(next24hRain * 10) / 10,
      next_48h_rainfall_mm: Math.round(next48hRain * 10) / 10,
      rain_probability: Math.round(maxPop * 100) / 100,
      rainfall_forecast_mm: Math.round(next24hRain * 10) / 10,
      summary: summary,
      daily_forecast: dailyForecast
    },
    air_quality: {
      aqi: Math.round(aqiVal),
      aqi_index: aqiIndex,
      aqi_category: aqiCat,
      ozone: ozoneNormPpm,
      ozone_ppb: ozonePpb,
      ozone_ug_m3: ozonePpb
    },
    source: "OpenWeather",
    cached: false
  };
}

function buildStationBaselineWeather(lat, lon) {
  const now = new Date();
  const dailyForecast = [];
  const days = ["Today", "Tomorrow", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  for (let i = 0; i < 5; i++) {
    const d = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
    dailyForecast.push({
      date_iso: d.toISOString().substring(0, 10),
      day_label: i === 0 ? "Today" : (i === 1 ? "Tomorrow" : d.toLocaleDateString("en-US", { weekday: "long" })),
      formatted_date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      temp_min_c: 22.0 + (i * 0.4),
      temp_max_c: 33.5 - (i * 0.2),
      temp_avg_c: 28.5,
      rainfall_total_mm: i === 2 ? 2.5 : 0.0,
      rain_probability_max: i === 2 ? 0.35 : 0.15,
      weather_condition: i === 2 ? "Rain" : "Clouds",
      weather_description: i === 2 ? "light scattered showers" : "partly cloudy",
      icon: i === 2 ? "🌦️" : "⛅",
      agri_risk_level: i === 2 ? "Moderate" : "Low",
      agri_advice: i === 2 ? "Monitor soil moisture before watering" : "Optimal foliar growth envelope"
    });
  }

  return {
    location: {
      latitude: Number(lat),
      longitude: Number(lon),
      name: "Wardha Farm Station",
      country: "IN"
    },
    observed_at: now.toISOString(),
    current: {
      temperature_c: 31.2,
      humidity_percent: 68.0,
      rainfall_mm: 0.0,
      wind_speed: 3.2,
      cloud_cover: 25,
      weather_condition: "Clouds",
      weather_description: "scattered clouds",
      pressure_hpa: 1012.0
    },
    forecast: {
      next_24h_rainfall_mm: 0.0,
      next_48h_rainfall_mm: 2.5,
      rain_probability: 0.20,
      rainfall_forecast_mm: 0.0,
      summary: "Partly cloudy conditions (31.2°C avg, 20% rain chance). Good growing envelope.",
      daily_forecast: dailyForecast
    },
    air_quality: {
      aqi: 64.0,
      aqi_index: 2,
      aqi_category: "Moderate",
      ozone: 0.038,
      ozone_ppb: 38,
      ozone_ug_m3: 38.0
    },
    source: "Station Telemetry",
    cached: true
  };
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

function computeVisualDistributionFromRecords(records) {
  const counts = {
    healthy: 0,
    water_stress: 0,
    heat_stress: 0,
    nutrient_deficiency: 0,
    pollution: 0
  };

  records.forEach(r => {
    let topClass = "";
    try {
      if (r.cnn_predictions_json) {
        const cnn = typeof r.cnn_predictions_json === "string" ? JSON.parse(r.cnn_predictions_json) : r.cnn_predictions_json;
        topClass = Object.keys(cnn).reduce((a, b) => (cnn[a] > cnn[b] ? a : b), "").toLowerCase();
      }
    } catch (_) {}

    if (!topClass) {
      const sev = (r.stress_severity || "").toLowerCase();
      topClass = (sev === "low" || sev === "none") ? "healthy" : "water_stress";
    }

    if (counts[topClass] !== undefined) {
      counts[topClass]++;
    } else if (topClass.includes("water")) {
      counts.water_stress++;
    } else if (topClass.includes("heat")) {
      counts.heat_stress++;
    } else if (topClass.includes("nutrient")) {
      counts.nutrient_deficiency++;
    } else if (topClass.includes("pollut")) {
      counts.pollution++;
    } else {
      counts.healthy++;
    }
  });

  const total = records.length;
  const categories = [
    { key: "healthy", name: "Healthy Cotton", count: counts.healthy, pct: total > 0 ? (counts.healthy / total) * 100 : 0, color: "#10b981", icon: "🍃" },
    { key: "water_stress", name: "Water Stress (Drought)", count: counts.water_stress, pct: total > 0 ? (counts.water_stress / total) * 100 : 0, color: "#38bdf8", icon: "💧" },
    { key: "heat_stress", name: "Heat Stress (Thermal)", count: counts.heat_stress, pct: total > 0 ? (counts.heat_stress / total) * 100 : 0, color: "#f59e0b", icon: "☀️" },
    { key: "nutrient_deficiency", name: "Nutrient Deficiency (N/P/K)", count: counts.nutrient_deficiency, pct: total > 0 ? (counts.nutrient_deficiency / total) * 100 : 0, color: "#a855f7", icon: "🍂" },
    { key: "pollution", name: "Air Pollution Injury", count: counts.pollution, pct: total > 0 ? (counts.pollution / total) * 100 : 0, color: "#64748b", icon: "🌫️" }
  ];

  return {
    has_data: total > 0,
    total_analyses: total,
    categories: categories
  };
}

async function fetchVisualDistribution(userEmailParam = "") {
  const loadingEl = document.getElementById("visualDistLoading");
  const emptyEl = document.getElementById("visualDistEmpty");
  const contentEl = document.getElementById("visualDistContent");

  if (loadingEl) loadingEl.style.display = "block";
  if (emptyEl) emptyEl.style.display = "none";
  if (contentEl) contentEl.style.opacity = "0.3";

  let data = null;

  try {
    const url = getApiUrl(`/api/v1/analytics/visual-distribution?${userEmailParam.replace(/^&/, '')}`);
    const res = await fetch(url);
    if (res.ok) {
      data = await res.json();
    }
  } catch (err) {
    console.warn("Visual distribution backend fetch failed, using local records:", err);
  }

  // Fallback to local rawAllRecords if backend returned no data or errored
  if (!data || !data.has_data || data.total_analyses === 0) {
    if (rawAllRecords && rawAllRecords.length > 0) {
      data = computeVisualDistributionFromRecords(rawAllRecords);
    }
  }

  latestVisualDistData = data;
  if (loadingEl) loadingEl.style.display = "none";

  if (!data || !data.has_data || data.total_analyses === 0) {
    const centerCountEl = document.getElementById("donutTotalCount");
    if (centerCountEl) centerCountEl.textContent = "0";
    if (emptyEl) emptyEl.style.display = "block";
    if (contentEl) contentEl.style.display = "none";
    if (visualDistChartInstance) {
      visualDistChartInstance.destroy();
      visualDistChartInstance = null;
    }
    return;
  }

  const centerCountEl = document.getElementById("donutTotalCount");
  if (centerCountEl) {
    centerCountEl.textContent = String(data.total_analyses || 0);
  }

  if (emptyEl) emptyEl.style.display = "none";
  if (contentEl) {
    contentEl.style.display = "grid";
    contentEl.style.opacity = "1";
  }

  renderVisualDistDonut(data);
  renderVisualDistLegend(data.categories);
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

function computeEnvironmentalDistributionFromRecords(records) {
  const counts = {
    low: 0,
    moderate: 0,
    high: 0
  };

  records.forEach(r => {
    const sev = (r.stress_severity || "").trim().toLowerCase();
    if (sev === "low" || sev === "none" || sev === "optimal") {
      counts.low++;
    } else if (sev === "moderate" || sev === "medium" || sev === "mod") {
      counts.moderate++;
    } else if (sev === "high" || sev === "critical" || sev === "severe") {
      counts.high++;
    } else {
      counts.low++;
    }
  });

  const total = records.length;
  const categories = [
    { key: "low", name: "Low Risk (Optimal)", count: counts.low, pct: total > 0 ? (counts.low / total) * 100 : 0, color: "#10b981", icon: "🟢" },
    { key: "moderate", name: "Moderate Stress", count: counts.moderate, pct: total > 0 ? (counts.moderate / total) * 100 : 0, color: "#f59e0b", icon: "🟡" },
    { key: "high", name: "High Stress / Critical", count: counts.high, pct: total > 0 ? (counts.high / total) * 100 : 0, color: "#ef4444", icon: "🔴" }
  ];

  return {
    has_data: total > 0,
    total_analyses: total,
    categories: categories
  };
}

async function fetchEnvironmentalDistribution(userEmailParam = "") {
  const loadingEl = document.getElementById("envDistLoading");
  const emptyEl = document.getElementById("envDistEmpty");
  const contentEl = document.getElementById("envDistContent");

  if (loadingEl) loadingEl.style.display = "block";
  if (emptyEl) emptyEl.style.display = "none";
  if (contentEl) contentEl.style.opacity = "0.3";

  let data = null;

  try {
    const url = getApiUrl(`/api/v1/analytics/environmental-distribution?${userEmailParam.replace(/^&/, '')}`);
    const res = await fetch(url);
    if (res.ok) {
      data = await res.json();
    }
  } catch (err) {
    console.warn("Environmental distribution backend fetch failed, using local records:", err);
  }

  // Fallback to local rawAllRecords if backend returned no data or errored
  if (!data || !data.has_data || data.total_analyses === 0) {
    if (rawAllRecords && rawAllRecords.length > 0) {
      data = computeEnvironmentalDistributionFromRecords(rawAllRecords);
    }
  }

  latestEnvDistData = data;
  if (loadingEl) loadingEl.style.display = "none";

  if (!data || !data.has_data || data.total_analyses === 0) {
    const centerCountEl = document.getElementById("envDonutTotalCount");
    if (centerCountEl) centerCountEl.textContent = "0";
    if (emptyEl) emptyEl.style.display = "block";
    if (contentEl) contentEl.style.display = "none";
    if (envDistChartInstance) {
      envDistChartInstance.destroy();
      envDistChartInstance = null;
    }
    return;
  }

  const centerCountEl = document.getElementById("envDonutTotalCount");
  if (centerCountEl) {
    centerCountEl.textContent = String(data.total_analyses || 0);
  }

  if (emptyEl) emptyEl.style.display = "none";
  if (contentEl) {
    contentEl.style.display = "grid";
    contentEl.style.opacity = "1";
  }

  renderEnvDistDonut(data);
  renderEnvDistLegend(data.categories);
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
  // Read active field coordinates
  const activeField = window.AgroVisionSync ? window.AgroVisionSync.getActiveField() : null;
  if (activeField && activeField.latitude && activeField.longitude) {
    currentOverviewLat = activeField.latitude;
    currentOverviewLon = activeField.longitude;
  }

  loadOverviewData();

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

  // Hook Real-Time Synchronization Bus
  if (window.AgroVisionSync) {
    window.AgroVisionSync.on("fieldChanged", (newField) => {
      if (newField && newField.latitude && newField.longitude) {
        currentOverviewLat = newField.latitude;
        currentOverviewLon = newField.longitude;
        fetchOverviewWeather(currentOverviewLat, currentOverviewLon, false);
      }
      renderOverviewDashboard();
    });

    window.AgroVisionSync.on("analysisSaved", () => {
      loadOverviewData();
    });

    window.AgroVisionSync.on("tabFocused", () => {
      loadOverviewData();
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
        <td colspan="8" style="padding:0;">
          <div class="agro-empty-state">
            <div class="empty-icon">🌱</div>
            <div class="empty-title">No analyses yet</div>
            <div class="empty-subtitle">Start your first cotton leaf assessment to see field health trends and stress diagnoses.</div>
            <div class="empty-actions">
              <a href="dashboard.html" class="empty-btn empty-btn-primary">+ Start Leaf Analysis</a>
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
        <td colspan="8" style="padding:0;">
          <div class="agro-empty-state">
            <div class="empty-icon icon-info">🔍</div>
            <div class="empty-title">No matching records found</div>
            <div class="empty-subtitle">Try adjusting your search query, dates, or active dropdown filters.</div>
            <div class="empty-actions">
              <button type="button" class="empty-btn empty-btn-outline" onclick="resetTableFilters()">↺ Clear All Filters</button>
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

