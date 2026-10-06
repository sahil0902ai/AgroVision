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
    records = rawAllRecords.filter(r => {
      const q = currentSearchQuery;
      const matchUuid = (r.record_uuid || "").toLowerCase().includes(q);
      const matchStage = (r.growth_stage || "").toLowerCase().includes(q);
      const matchSev = (r.stress_severity || "").toLowerCase().includes(q);
      return matchUuid || matchStage || matchSev;
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

document.addEventListener("DOMContentLoaded", () => {
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
});
