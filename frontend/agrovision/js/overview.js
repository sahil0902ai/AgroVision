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

async function loadOverviewData() {
  try {
    const response = await fetch("/api/v1/records");
    if (!response.ok) return;

    const data = await response.json();
    const records = data.records || [];

    const totalScansEl = document.getElementById("statTotalScans");
    if (totalScansEl) totalScansEl.textContent = records.length;

    if (records.length > 0) {
      const latest = records[0];
      const dateEl = document.getElementById("latestAnalysisDate");
      const classEl = document.getElementById("latestAnalysisClass");
      const sumEl = document.getElementById("latestAnalysisSummary");
      const statusEl = document.getElementById("statLatestStatus");

      if (dateEl) dateEl.textContent = `Recorded: ${new Date(latest.timestamp || latest.created_at).toLocaleString()}`;
      if (classEl) classEl.textContent = `${latest.cnn_class || latest.visual_class || 'Visual Analysis'} (${((latest.cnn_confidence || latest.confidence || 0.85)*100).toFixed(0)}% Confidence)`;
      if (sumEl) sumEl.textContent = latest.summary || `Multimodal finding: ${latest.final_finding || latest.cnn_class}. Environmental severity: ${latest.snn_severity || 'Moderate'}.`;
      if (statusEl) {
        statusEl.textContent = latest.final_finding || latest.cnn_class || "Active";
        if (statusEl.textContent.toLowerCase().includes("stress")) {
          statusEl.style.color = "#d97706";
        }
      }
    }
  } catch (err) {
    console.error("Error loading overview telemetry:", err);
  }
}

document.addEventListener("DOMContentLoaded", loadOverviewData);
