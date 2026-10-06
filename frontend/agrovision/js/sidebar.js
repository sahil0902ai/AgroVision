/* =========================================================
   AgroVision — Professional Enterprise Sidebar & Settings Modal
   Unified Navigation System across all pages
   ========================================================= */

function toggleMobileSidebar() {
  const sidebar = document.querySelector(".sidebar");
  const backdrop = document.getElementById("sidebarBackdrop");
  if (sidebar) {
    sidebar.classList.toggle("open");
  }
  if (backdrop) {
    backdrop.classList.toggle("active");
  }
}

function closeMobileSidebar() {
  const sidebar = document.querySelector(".sidebar");
  const backdrop = document.getElementById("sidebarBackdrop");
  if (sidebar) sidebar.classList.remove("open");
  if (backdrop) backdrop.classList.remove("active");
}

function openSettingsModal() {
  closeMobileSidebar();
  let modal = document.getElementById("settingsModalOverlay");
  if (!modal) {
    modal = createSettingsModal();
    document.body.appendChild(modal);
  }
  modal.classList.add("active");
}

function closeSettingsModal() {
  const modal = document.getElementById("settingsModalOverlay");
  if (modal) {
    modal.classList.remove("active");
  }
}

function saveFarmSettings(event) {
  if (event) event.preventDefault();
  const defZone = document.getElementById("settingsDefZone")?.value || "Zone 1";
  const defTempUnit = document.getElementById("settingsTempUnit")?.value || "celsius";
  const weatherSync = document.getElementById("settingsWeatherSync")?.checked ?? true;

  localStorage.setItem("agrovision_settings", JSON.stringify({
    defaultZone: defZone,
    tempUnit: defTempUnit,
    weatherSync: weatherSync,
    updatedAt: new Date().toISOString()
  }));

  const saveBtn = document.getElementById("settingsSaveBtn");
  if (saveBtn) {
    const orig = saveBtn.textContent;
    saveBtn.textContent = "✓ Settings Saved";
    saveBtn.style.background = "#059669";
    setTimeout(() => {
      saveBtn.textContent = orig;
      saveBtn.style.background = "";
      closeSettingsModal();
    }, 600);
  } else {
    closeSettingsModal();
  }
}

function createSettingsModal() {
  const overlay = document.createElement("div");
  overlay.className = "settings-modal-overlay";
  overlay.id = "settingsModalOverlay";
  overlay.onclick = (e) => {
    if (e.target === overlay) closeSettingsModal();
  };

  let saved = { defaultZone: "Zone 1", tempUnit: "celsius", weatherSync: true };
  try {
    const raw = localStorage.getItem("agrovision_settings");
    if (raw) saved = JSON.parse(raw);
  } catch (_) {}

  overlay.innerHTML = `
    <div class="settings-modal-card" onclick="event.stopPropagation()">
      <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #e2e8f0; padding-bottom:14px; margin-bottom:18px;">
        <div style="display:flex; align-items:center; gap:10px;">
          <span style="font-size:20px;">⚙️</span>
          <div>
            <h3 style="margin:0; font-size:1.15rem; color:#0d3b2e; font-weight:800;">Farm &amp; System Preferences</h3>
            <div style="font-size:11px; color:#64748b;">AgroVision Agricultural Analytics Configuration</div>
          </div>
        </div>
        <button onclick="closeSettingsModal()" style="background:none; border:none; font-size:22px; color:#94a3b8; cursor:pointer; padding:0 4px; line-height:1;">&times;</button>
      </div>

      <form onsubmit="saveFarmSettings(event)">
        
        <!-- Section 1: Telemetry & Region -->
        <div style="margin-bottom:16px;">
          <label style="display:block; font-size:11px; font-weight:700; text-transform:uppercase; color:#475569; letter-spacing:0.04em; margin-bottom:6px;">
            Default Monitored Parcel / Zone
          </label>
          <select id="settingsDefZone" style="width:100%; padding:9px 12px; border:1px solid #cbd5e1; border-radius:8px; font-size:13px; font-weight:600; color:#1e293b; background:#ffffff;">
            <option value="Zone 1" ${saved.defaultZone === 'Zone 1' ? 'selected' : ''}>Field A — North Parcel (Zone 1 · Wardha / Sindi)</option>
            <option value="Zone 2" ${saved.defaultZone === 'Zone 2' ? 'selected' : ''}>Field B — South Parcel (Zone 2 · Nagpur East)</option>
            <option value="Zone 3" ${saved.defaultZone === 'Zone 3' ? 'selected' : ''}>Field C — East Plot (Zone 3 · Amravati West)</option>
            <option value="Zone 4" ${saved.defaultZone === 'Zone 4' ? 'selected' : ''}>Field D — Research Plot (Zone 4 · Akola North)</option>
          </select>
        </div>

        <!-- Section 2: Units & Sync -->
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:16px;">
          <div>
            <label style="display:block; font-size:11px; font-weight:700; text-transform:uppercase; color:#475569; letter-spacing:0.04em; margin-bottom:6px;">
              Temperature Unit
            </label>
            <select id="settingsTempUnit" style="width:100%; padding:9px 12px; border:1px solid #cbd5e1; border-radius:8px; font-size:13px; color:#1e293b; background:#ffffff;">
              <option value="celsius" selected>Celsius (°C)</option>
              <option value="fahrenheit">Fahrenheit (°F)</option>
            </select>
          </div>
          <div>
            <label style="display:block; font-size:11px; font-weight:700; text-transform:uppercase; color:#475569; letter-spacing:0.04em; margin-bottom:6px;">
              Soil Moisture Source
            </label>
            <input type="text" value="In-Field Soil Probe" readonly style="width:100%; padding:9px 12px; border:1px solid #e2e8f0; border-radius:8px; font-size:12px; font-weight:600; color:#059669; background:#f0fdf4;" />
          </div>
        </div>

        <!-- Section 3: AI Model & Weather Engine -->
        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:18px;">
          <div style="font-size:11px; font-weight:700; color:#334155; text-transform:uppercase; margin-bottom:6px;">Integrated AI Services</div>
          <div style="display:flex; justify-content:space-between; font-size:12px; color:#475569; margin-bottom:4px;">
            <span>Weather Telemetry Engine:</span>
            <strong style="color:#059669;">OpenWeather Live API (15-min Cache)</strong>
          </div>
          <div style="display:flex; justify-content:space-between; font-size:12px; color:#475569;">
            <span>Grounded Agronomic LLM:</span>
            <strong style="color:#059669;">Google Gemini 2.5 Flash</strong>
          </div>
        </div>

        <!-- Footer Buttons -->
        <div style="display:flex; justify-content:flex-end; gap:10px; padding-top:10px; border-top:1px solid #f1f5f9;">
          <button type="button" onclick="closeSettingsModal()" class="btn btn-action-outline" style="padding:8px 16px; font-size:12px; border-radius:8px;">
            Cancel
          </button>
          <button type="submit" id="settingsSaveBtn" class="btn btn-primary" style="padding:8px 18px; font-size:12px; border-radius:8px;">
            Save Preferences
          </button>
        </div>

      </form>
    </div>
  `;

  return overlay;
}

// Global auto-init for mobile backdrop
document.addEventListener("DOMContentLoaded", () => {
  if (!document.getElementById("sidebarBackdrop")) {
    const bd = document.createElement("div");
    bd.className = "sidebar-backdrop";
    bd.id = "sidebarBackdrop";
    bd.onclick = closeMobileSidebar;
    document.body.appendChild(bd);
  }
});
