/* =========================================================
   AgroVision — Farm Overview Logic
   Pulls real records from database
   ========================================================= */

// Protect page
const currentUser = typeof requireLogin === "function" ? requireLogin() : null;
if (currentUser) {
  const nameFirst = currentUser.name.split(" ")[0];
  if (document.getElementById("welcomeMsg")) {
    document.getElementById("welcomeMsg").textContent = `Welcome back, ${nameFirst}`;
  }
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

async function loadOverviewData() {
  try {
    const response = await fetch(getApiUrl("/api/v1/records"));
    if (!response.ok) return;

    const data = await response.json();
    const records = Array.isArray(data) ? data : (data.records || []);

    const totalScansEl = document.getElementById("statTotalScans");
    if (totalScansEl) totalScansEl.textContent = records.length;

    if (records.length > 0) {
      const latest = records[0];
      const dateEl = document.getElementById("latestAnalysisDate");
      const classEl = document.getElementById("latestAnalysisClass");
      const sumEl = document.getElementById("latestAnalysisSummary");
      const statusEl = document.getElementById("statLatestStatus");

      let topClass = "Healthy";
      let topPct = 90;
      try {
        if (latest.cnn_predictions_json) {
          const cnnObj = JSON.parse(latest.cnn_predictions_json);
          const topKey = Object.keys(cnnObj).reduce((a, b) => cnnObj[a] > cnnObj[b] ? a : b);
          topClass = topKey.replace("_", " ").replace(/\b\w/g, l => l.toUpperCase());
          topPct = cnnObj[topKey];
        }
      } catch (_) {}

      const sev = latest.stress_severity || "Moderate";

      if (dateEl) dateEl.textContent = `Recorded: ${new Date(latest.created_at || Date.now()).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
      if (classEl) classEl.textContent = `${topClass} (${topPct.toFixed(0)}% Visual Probability)`;
      if (sumEl) sumEl.textContent = `Multimodal finding: ${topClass}. Macro Environmental Stress: ${sev} Risk. Stage: ${(latest.growth_stage || 'Flowering').replace('_', ' ')}.`;
      if (statusEl) {
        statusEl.textContent = `${topClass}`;
        if (topClass.toLowerCase().includes("stress") || topClass.toLowerCase().includes("deficiency") || topClass.toLowerCase().includes("pollution")) {
          statusEl.style.color = "#d97706";
        } else {
          statusEl.style.color = "#059669";
        }
      }
    } else {
      const dateEl = document.getElementById("latestAnalysisDate");
      const classEl = document.getElementById("latestAnalysisClass");
      const sumEl = document.getElementById("latestAnalysisSummary");
      if (dateEl) dateEl.textContent = "No analyses yet";
      if (classEl) classEl.textContent = "Ready for First Scan";
      if (sumEl) sumEl.textContent = "Upload a cotton leaf image and provide field conditions to begin automated stress assessment.";
    }
  } catch (err) {
    console.error("Error loading overview telemetry:", err);
  }
}

document.addEventListener("DOMContentLoaded", loadOverviewData);
