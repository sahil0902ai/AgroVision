/* =========================================================
   AgroVision — Farm Overview Logic
   Pulls verified records from /api/v1/records
   ========================================================= */

let latestRecordUuid = null;

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

function getApiUrl(endpoint) {
  if (window.AGROVISION_CONFIG && typeof window.AGROVISION_CONFIG.getApiUrl === "function") {
    return window.AGROVISION_CONFIG.getApiUrl(endpoint);
  }
  return endpoint;
}

function selectParcel(zoneName) {
  const cards = document.querySelectorAll(".parcel-card");
  cards.forEach(card => card.classList.remove("active"));
  event.currentTarget.classList.add("active");
  const fieldSelect = document.getElementById("fieldSelect");
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

async function loadOverviewData() {
  try {
    const response = await fetch(getApiUrl("/api/v1/records?limit=10"));
    if (!response.ok) throw new Error("API response error");

    const data = await response.json();
    const records = Array.isArray(data) ? data : (data.records || []);

    const totalScansEl = document.getElementById("statTotalScans");
    if (totalScansEl) totalScansEl.textContent = `${records.length} Scans`;

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
          topClass = topKey.replace("_", " ").replace(/\b\w/g, l => l.toUpperCase());
          topPct = cnnObj[topKey];
        }
      } catch (_) {}

      // 2. Parse Multimodal Fusion & Expert Veto
      let fusionRel = "Aligned";
      let fusionSummary = "";
      try {
        if (latest.fusion_json) {
          const fObj = JSON.parse(latest.fusion_json);
          fusionRel = (fObj.relationship || "ALIGNED").replace("_", " ");
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
        sumEl.textContent = fusionSummary || `Visual ${topClass} observable under ${sev} environmental risk. Crop stage: ${(latest.growth_stage || 'Flowering').replace('_', ' ')}.`;
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
              rClass = tKey.replace("_", " ").replace(/\b\w/g, l => l.toUpperCase());
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
                  <img src="${imgUrl}" alt="Leaf" style="width:34px; height:34px; border-radius:6px; object-fit:cover; border:1px solid #cbd5e1;" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\\'http://www.w3.org/2000/svg\\\' width=\\\'34\\\' height=\\\'34\\\'><rect width=\\\'34\\\' height=\\\'34\\\' fill=\\\'%23e2e8f0\\\'/><text x=\\\'50%\\\' y=\\\'55%\\\' dominant-baseline=\\\'middle\\\' text-anchor=\\\'middle\\\' fill=\\\'%2364748b\\\' font-size=\\\'14\\\'>🌿</text></svg>'" />
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
      // Empty state
      const totalScansEl = document.getElementById("statTotalScans");
      if (totalScansEl) totalScansEl.textContent = "0 Scans";
      const dateEl = document.getElementById("latestAnalysisDate");
      const classEl = document.getElementById("latestAnalysisClass");
      const sumEl = document.getElementById("latestAnalysisSummary");
      if (dateEl) dateEl.textContent = "No analysis sessions recorded";
      if (classEl) classEl.textContent = "Ready for First Scan";
      if (sumEl) sumEl.textContent = "Upload a cotton leaf photo and set field conditions to generate initial multi-modal intelligence.";
      const recentTbody = document.getElementById("overviewRecentTbody");
      if (recentTbody) {
        recentTbody.innerHTML = `
          <tr>
            <td colspan="6" style="text-align:center; padding:30px; color:#64748b;">
              <strong>No analysis records found</strong>
              <p style="margin:4px 0 0; font-size:11.5px;">Click "+ New Analysis" above to perform your first leaf scan.</p>
            </td>
          </tr>
        `;
      }
    }
  } catch (err) {
    console.error("Error loading farm overview data:", err);
  }
}

document.addEventListener("DOMContentLoaded", loadOverviewData);
