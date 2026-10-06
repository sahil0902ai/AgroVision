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

    if (dateEl) dateEl.textContent = "No analysis scans yet";
    if (classEl) {
      classEl.textContent = "Ready For First Scan";
      classEl.style.color = "#64748b";
    }
    if (sumEl) sumEl.textContent = "Upload a cotton leaf in New Analysis to diagnose crop stress and get actionable advice.";
    if (uuidEl) uuidEl.textContent = "";
    if (sevBadgeEl) sevBadgeEl.textContent = "Ready";
    if (alignBadgeEl) alignBadgeEl.textContent = "Ready";

    const recentTbody = document.getElementById("overviewRecentTbody");
    if (recentTbody) {
      recentTbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align:center; padding:30px; color:#64748b;">
            <strong>No analysis records found</strong>
            <p style="margin:4px 0 0; font-size:11.5px;">Click "Launch New Leaf Check" to analyze your first cotton plant.</p>
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

    renderOverviewDashboard();
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
// ANALYSIS TREND (POWER BI-STYLE HISTORICAL LINE CHART)
// =========================================================

let currentTrendPeriod = "30d";
let trendStartDate = null;
let trendEndDate = null;
let trendChartInstance = null;
let trendHiddenSeries = { healthy: false, stressed: false };
let latestTrendData = null;

async function fetchAnalysisTrend(period = "30d", startDate = null, endDate = null) {
  currentTrendPeriod = period;
  const loadingEl = document.getElementById("trendLoadingState");
  const emptyEl = document.getElementById("trendEmptyState");
  const canvasWrapEl = document.getElementById("trendCanvasWrap");

  if (loadingEl) loadingEl.style.display = "flex";
  if (emptyEl) emptyEl.style.display = "none";
  if (canvasWrapEl) canvasWrapEl.style.opacity = "0.3";

  try {
    let url = getApiUrl(`/api/v1/analytics/trend?period=${encodeURIComponent(period)}`);
    if (period === "custom" && startDate) {
      url += `&start_date=${encodeURIComponent(startDate)}`;
      if (endDate) url += `&end_date=${encodeURIComponent(endDate)}`;
    }

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: Trend data could not be fetched.`);
    }

    const data = await res.json();
    latestTrendData = data;

    // Update Top Summary Badges & Totals
    const healthyBadge = document.getElementById("trendLegendHealthy");
    const stressedBadge = document.getElementById("trendLegendStressed");
    const totalSessions = document.getElementById("trendTotalSessions");
    const healthRatio = document.getElementById("trendHealthRatio");

    if (healthyBadge) healthyBadge.textContent = String(data.summary?.healthy_total || 0);
    if (stressedBadge) stressedBadge.textContent = String(data.summary?.stressed_total || 0);
    if (totalSessions) totalSessions.textContent = String(data.summary?.total || 0);
    if (healthRatio) {
      const tot = data.summary?.total || 0;
      const hCount = data.summary?.healthy_total || 0;
      healthRatio.textContent = tot > 0 ? `${Math.round((hCount / tot) * 100)}%` : "--%";
    }

    if (loadingEl) loadingEl.style.display = "none";

    // Handle Insufficient History / Zero Data State
    if (!data.has_sufficient_data || (data.total_records === 0)) {
      if (emptyEl) emptyEl.style.display = "flex";
      if (canvasWrapEl) canvasWrapEl.style.display = "none";
      if (trendChartInstance) {
        trendChartInstance.destroy();
        trendChartInstance = null;
      }
      return;
    }

    // Has real database records
    if (emptyEl) emptyEl.style.display = "none";
    if (canvasWrapEl) {
      canvasWrapEl.style.display = "block";
      canvasWrapEl.style.opacity = "1";
    }

    renderAnalysisTrendChart(data);

  } catch (err) {
    console.error("Analysis Trend fetch error:", err);
    if (loadingEl) loadingEl.style.display = "none";
    if (emptyEl) emptyEl.style.display = "flex";
    if (canvasWrapEl) canvasWrapEl.style.display = "none";
  }
}

function setTrendPeriod(period) {
  const pillsContainer = document.getElementById("trendFilterPills");
  if (pillsContainer) {
    const buttons = pillsContainer.querySelectorAll(".trend-pill-btn");
    buttons.forEach(btn => {
      if (btn.getAttribute("data-period") === period) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });
  }

  const customDatesWrap = document.getElementById("trendCustomDates");
  if (period === "custom") {
    if (customDatesWrap) {
      customDatesWrap.style.display = "flex";
      const startInput = document.getElementById("trendStartDate");
      const endInput = document.getElementById("trendEndDate");
      if (startInput && !startInput.value) {
        const d30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        startInput.value = d30.toISOString().split("T")[0];
      }
      if (endInput && !endInput.value) {
        endInput.value = new Date().toISOString().split("T")[0];
      }
    }
  } else {
    if (customDatesWrap) customDatesWrap.style.display = "none";
    fetchAnalysisTrend(period);
  }
}

function applyCustomTrendRange() {
  const startInput = document.getElementById("trendStartDate");
  const endInput = document.getElementById("trendEndDate");
  const startVal = startInput?.value;
  const endVal = endInput?.value;

  if (!startVal) {
    alert("Please select a valid start date.");
    return;
  }
  fetchAnalysisTrend("custom", startVal, endVal);
}

function toggleTrendSeries(seriesKey) {
  if (seriesKey === "healthy") {
    trendHiddenSeries.healthy = !trendHiddenSeries.healthy;
    const item = document.getElementById("legendItemHealthy");
    if (item) item.classList.toggle("hidden-series", trendHiddenSeries.healthy);
  } else if (seriesKey === "stressed") {
    trendHiddenSeries.stressed = !trendHiddenSeries.stressed;
    const item = document.getElementById("legendItemStressed");
    if (item) item.classList.toggle("hidden-series", trendHiddenSeries.stressed);
  }

  if (trendChartInstance) {
    const healthyDataset = trendChartInstance.data.datasets.find(ds => ds.label === "Healthy");
    const stressedDataset = trendChartInstance.data.datasets.find(ds => ds.label === "Stressed");
    if (healthyDataset) healthyDataset.hidden = trendHiddenSeries.healthy;
    if (stressedDataset) stressedDataset.hidden = trendHiddenSeries.stressed;
    trendChartInstance.update();
  }
}

function renderAnalysisTrendChart(data) {
  const canvas = document.getElementById("analysisTrendCanvas");
  if (!canvas) return;

  if (trendChartInstance) {
    trendChartInstance.destroy();
    trendChartInstance = null;
  }

  const ctx = canvas.getContext("2d");

  // Check if Chart.js is loaded
  if (typeof Chart !== "undefined") {
    // Gradient backgrounds for smooth line fills
    const healthyGradient = ctx.createLinearGradient(0, 0, 0, 240);
    healthyGradient.addColorStop(0, "rgba(5, 150, 105, 0.22)");
    healthyGradient.addColorStop(1, "rgba(5, 150, 105, 0.0)");

    const stressedGradient = ctx.createLinearGradient(0, 0, 0, 240);
    stressedGradient.addColorStop(0, "rgba(234, 88, 12, 0.22)");
    stressedGradient.addColorStop(1, "rgba(234, 88, 12, 0.0)");

    trendChartInstance = new Chart(ctx, {
      type: "line",
      data: {
        labels: data.series.dates,
        datasets: [
          {
            label: "Healthy",
            data: data.series.healthy,
            borderColor: "#059669",
            backgroundColor: healthyGradient,
            fill: true,
            tension: 0.35,
            pointRadius: 4,
            pointHoverRadius: 6,
            pointBackgroundColor: "#059669",
            pointBorderColor: "#ffffff",
            pointBorderWidth: 2,
            borderWidth: 2.5,
            hidden: trendHiddenSeries.healthy
          },
          {
            label: "Stressed",
            data: data.series.stressed,
            borderColor: "#ea580c",
            backgroundColor: stressedGradient,
            fill: true,
            tension: 0.35,
            pointRadius: 4,
            pointHoverRadius: 6,
            pointBackgroundColor: "#ea580c",
            pointBorderColor: "#ffffff",
            pointBorderWidth: 2,
            borderWidth: 2.5,
            hidden: trendHiddenSeries.stressed
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: "index",
          intersect: false
        },
        plugins: {
          legend: {
            display: false // Using custom Power BI analytical legend
          },
          tooltip: {
            backgroundColor: "#0f172a",
            titleFont: { size: 12, weight: "bold", family: "Inter, sans-serif" },
            bodyFont: { size: 11.5, family: "Inter, sans-serif" },
            padding: 10,
            cornerRadius: 8,
            boxPadding: 4,
            callbacks: {
              title: function(items) {
                if (!items.length) return "";
                const idx = items[0].dataIndex;
                const dp = data.data_points[idx];
                return dp ? `${dp.day_name}, ${dp.label} (${dp.date})` : items[0].label;
              },
              label: function(context) {
                const val = context.parsed.y || 0;
                return ` ${context.dataset.label}: ${val} scans`;
              },
              footer: function(items) {
                let total = 0;
                items.forEach(i => { total += (i.parsed.y || 0); });
                return total > 0 ? `Total: ${total} verified sessions` : "";
              }
            }
          }
        },
        scales: {
          x: {
            grid: {
              display: false
            },
            ticks: {
              color: "#64748b",
              font: { size: 11, family: "Inter, sans-serif" },
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: 12
            }
          },
          y: {
            beginAtZero: true,
            grid: {
              color: "#f1f5f9",
              borderDash: [3, 3]
            },
            ticks: {
              color: "#64748b",
              font: { size: 11, family: "Inter, sans-serif" },
              precision: 0,
              stepSize: 1
            }
          }
        }
      }
    });
  } else {
    // Lightweight canvas fallback if Chart.js is offline/unavailable
    renderCanvasTrendFallback(ctx, canvas, data);
  }
}

function renderCanvasTrendFallback(ctx, canvas, data) {
  const w = canvas.parentElement.clientWidth || 600;
  const h = 240;
  canvas.width = w * window.devicePixelRatio;
  canvas.height = h * window.devicePixelRatio;
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

  ctx.clearRect(0, 0, w, h);
  ctx.font = "11px Inter, sans-serif";

  const padding = { top: 20, right: 20, bottom: 30, left: 40 };
  const chartW = w - padding.left - padding.right;
  const chartH = h - padding.top - padding.bottom;

  const maxVal = Math.max(1, ...data.series.healthy, ...data.series.stressed);
  const n = data.series.dates.length;

  // Draw grid lines
  ctx.strokeStyle = "#f1f5f9";
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + (chartH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(w - padding.right, y);
    ctx.stroke();

    ctx.fillStyle = "#94a3b8";
    ctx.fillText(String(Math.round(maxVal * (1 - i / 4))), 8, y + 4);
  }
  ctx.setLineDash([]);

  // Draw Series Line Helper
  function drawLine(points, color) {
    if (points.length < 2) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    points.forEach((val, i) => {
      const x = padding.left + (i / (n - 1 || 1)) * chartW;
      const y = padding.top + (1 - val / maxVal) * chartH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Draw dots
    ctx.fillStyle = color;
    points.forEach((val, i) => {
      const x = padding.left + (i / (n - 1 || 1)) * chartW;
      const y = padding.top + (1 - val / maxVal) * chartH;
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  if (!trendHiddenSeries.healthy) drawLine(data.series.healthy, "#059669");
  if (!trendHiddenSeries.stressed) drawLine(data.series.stressed, "#ea580c");

    ctx.fillStyle = "#64748b";
  const step = Math.max(1, Math.floor(n / 6));
  for (let i = 0; i < n; i += step) {
    const x = padding.left + (i / (n - 1 || 1)) * chartW;
    ctx.fillText(data.series.dates[i], x - 12, h - 8);
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

document.addEventListener("DOMContentLoaded", () => {
  loadOverviewData();
  fetchAnalysisTrend("30d");
  fetchVisualDistribution();

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
