/**
 * AgroVision — My Monitored Fields Management Script
 * Handles real-time field listing, registration, editing, and deletion from SQLite database.
 */

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

let allUserFields = [];
let currentEditingFieldId = null;

document.addEventListener("DOMContentLoaded", async () => {
  // 1. Verify authentication
  if (typeof checkAuth === "function") {
    checkAuth();
  }

  // 2. Load fields
  await loadUserFields();

  // 3. Listen for cross-tab sync events
  if (window.AgroVisionSync) {
    AgroVisionSync.on("fieldChanged", () => {
      loadUserFields(true);
    });
  }
});

async function loadUserFields(silent = false) {
  const loadingEl = document.getElementById("fieldsLoadingState");
  const emptyEl = document.getElementById("fieldsEmptyState");
  const errorEl = document.getElementById("fieldsErrorState");
  const gridEl = document.getElementById("fieldsCardsGrid");

  if (!silent && loadingEl) {
    loadingEl.style.display = "block";
    if (emptyEl) emptyEl.style.display = "none";
    if (errorEl) errorEl.style.display = "none";
    if (gridEl) gridEl.style.display = "none";
  }

  const userEmail = (typeof getAuthUserEmail === "function" ? getAuthUserEmail() : "") || "default_farmer@agrovision.org";

  try {
    const res = await fetch(getApiUrl(`/api/v1/fields?user_email=${encodeURIComponent(userEmail)}`));
    if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch fields`);

    const fields = await res.json();
    allUserFields = Array.isArray(fields) ? fields : [];

    renderFieldsKPIs(allUserFields);
    renderFieldsGrid(allUserFields);

    if (loadingEl) loadingEl.style.display = "none";
    if (errorEl) errorEl.style.display = "none";

    if (allUserFields.length === 0) {
      if (emptyEl) emptyEl.style.display = "block";
      if (gridEl) gridEl.style.display = "none";
    } else {
      if (emptyEl) emptyEl.style.display = "none";
      if (gridEl) gridEl.style.display = "grid";
    }
  } catch (err) {
    console.error("Failed to load fields:", err);
    if (loadingEl) loadingEl.style.display = "none";
    if (emptyEl) emptyEl.style.display = "none";
    if (gridEl) gridEl.style.display = "none";
    if (errorEl) {
      errorEl.style.display = "block";
      const msg = document.getElementById("fieldsErrorMessage");
      if (msg) msg.textContent = err.message || "Failed to connect to field database service.";
    }
  }
}

function renderFieldsKPIs(fields) {
  const countEl = document.getElementById("kpiFieldCount");
  const acreageEl = document.getElementById("kpiTotalAcreage");
  const stationsEl = document.getElementById("kpiWeatherStations");
  const soilEl = document.getElementById("kpiSoilProfiles");

  if (countEl) countEl.textContent = fields.length;

  const totalAcreage = fields.reduce((acc, f) => acc + (parseFloat(f.acreage) || 0), 0);
  if (acreageEl) acreageEl.textContent = totalAcreage.toFixed(1);

  if (stationsEl) stationsEl.textContent = fields.length;

  if (soilEl && fields.length > 0) {
    const uniqueSoils = new Set(fields.map(f => f.soil_type).filter(Boolean));
    soilEl.textContent = uniqueSoils.size > 1 ? `${uniqueSoils.size} Types` : (fields[0].soil_type || "Vertisol");
  }
}

function renderFieldsGrid(fields) {
  const grid = document.getElementById("fieldsCardsGrid");
  if (!grid) return;

  grid.innerHTML = "";

  fields.forEach(f => {
    const card = document.createElement("div");
    card.className = "field-parcel-card";
    
    const lat = parseFloat(f.latitude) || 20.975;
    const lon = parseFloat(f.longitude) || 78.720;
    const stage = f.crop_stage || "Flowering";
    const dss = f.days_since_sowing || 60;
    const soil = f.soil_type || "Deep Black Clay";
    const acreage = f.acreage ? `${f.acreage} Acres` : "Standard Parcel";

    card.innerHTML = `
      <div>
        <div class="field-parcel-header">
          <div>
            <h3 class="field-parcel-title">
              <span>🌾</span> ${escapeHtml(f.field_name)}
            </h3>
            <span style="font-size:11px; color:#64748b; margin-top:2px; display:block;">
              ID: <code style="font-size:10.5px; color:#0f172a;">${escapeHtml(f.field_id)}</code>
            </span>
          </div>
          <span class="field-zone-badge">${escapeHtml(f.zone_label || "Active Zone")}</span>
        </div>

        <table class="field-meta-table">
          <tr>
            <td class="field-meta-label">GPS Coordinates</td>
            <td><strong>${lat.toFixed(4)}°N, ${lon.toFixed(4)}°E</strong></td>
          </tr>
          <tr>
            <td class="field-meta-label">Crop Growth Stage</td>
            <td><strong>${escapeHtml(stage.replace(/_/g, " "))}</strong> (${dss} days)</td>
          </tr>
          <tr>
            <td class="field-meta-label">Soil Composition</td>
            <td><strong>${escapeHtml(soil)}</strong></td>
          </tr>
          <tr>
            <td class="field-meta-label">Total Acreage</td>
            <td><strong>${escapeHtml(acreage)}</strong></td>
          </tr>
        </table>
      </div>

      <div class="field-actions-row">
        <button type="button" class="btn-field-action btn-field-primary" onclick="startAnalysisForField('${escapeHtml(f.field_id)}')">
          <span>🚀</span> Analyze Field
        </button>
        <button type="button" class="btn-field-action btn-field-outline" onclick="openEditFieldModal('${escapeHtml(f.field_id)}')">
          <span>✏️</span> Edit
        </button>
        <button type="button" class="btn-field-action btn-field-danger" onclick="deleteField('${escapeHtml(f.field_id)}', '${escapeHtml(f.field_name)}')" title="Delete field">
          🗑️
        </button>
      </div>
    `;

    grid.appendChild(card);
  });
}

function startAnalysisForField(fieldId) {
  const target = allUserFields.find(f => f.field_id === fieldId);
  if (target && window.AgroVisionSync) {
    AgroVisionSync.setActiveField(target);
  }
  window.location.href = `dashboard.html?field=${encodeURIComponent(fieldId)}`;
}

function openNewFieldModal() {
  currentEditingFieldId = null;
  const modal = document.getElementById("fieldModal");
  const title = document.getElementById("fieldModalTitle");
  const form = document.getElementById("fieldForm");
  const btn = document.getElementById("fieldSubmitBtn");

  if (title) title.innerHTML = "🌾 Register New Field";
  if (btn) btn.textContent = "Register Field";
  if (form) form.reset();

  const idField = document.getElementById("fieldFormId");
  if (idField) idField.value = "";

  // Set standard defaults
  const latInput = document.getElementById("fieldLatInput");
  const lonInput = document.getElementById("fieldLonInput");
  if (latInput && !latInput.value) latInput.value = "20.9750";
  if (lonInput && !lonInput.value) lonInput.value = "78.7200";

  if (modal) modal.classList.add("active");
}

function openEditFieldModal(fieldId) {
  const target = allUserFields.find(f => f.field_id === fieldId);
  if (!target) return;

  currentEditingFieldId = fieldId;
  const modal = document.getElementById("fieldModal");
  const title = document.getElementById("fieldModalTitle");
  const btn = document.getElementById("fieldSubmitBtn");

  if (title) title.innerHTML = "✏️ Edit Monitored Field";
  if (btn) btn.textContent = "Update Field";

  const idField = document.getElementById("fieldFormId");
  if (idField) idField.value = target.field_id;

  const nameInput = document.getElementById("fieldNameInput");
  if (nameInput) nameInput.value = target.field_name || "";

  const zoneInput = document.getElementById("fieldZoneInput");
  if (zoneInput) zoneInput.value = target.zone_label || "";

  const latInput = document.getElementById("fieldLatInput");
  if (latInput) latInput.value = target.latitude || 20.9750;

  const lonInput = document.getElementById("fieldLonInput");
  if (lonInput) lonInput.value = target.longitude || 78.7200;

  const stageInput = document.getElementById("fieldStageInput");
  if (stageInput) stageInput.value = target.crop_stage || "Flowering";

  const daysInput = document.getElementById("fieldDaysInput");
  if (daysInput) daysInput.value = target.days_since_sowing || 60;

  const soilInput = document.getElementById("fieldSoilInput");
  if (soilInput) soilInput.value = target.soil_type || "Deep Black Clay (Vertisol)";

  const acreageInput = document.getElementById("fieldAcreageInput");
  if (acreageInput) acreageInput.value = target.acreage || 10.0;

  if (modal) modal.classList.add("active");
}

function closeFieldModal() {
  const modal = document.getElementById("fieldModal");
  if (modal) modal.classList.remove("active");
  currentEditingFieldId = null;
}

async function handleFieldFormSubmit(event) {
  event.preventDefault();

  const name = document.getElementById("fieldNameInput")?.value.trim();
  const zone = document.getElementById("fieldZoneInput")?.value.trim() || "Active Zone";
  const lat = parseFloat(document.getElementById("fieldLatInput")?.value) || 20.975;
  const lon = parseFloat(document.getElementById("fieldLonInput")?.value) || 78.720;
  const stage = document.getElementById("fieldStageInput")?.value || "Flowering";
  const days = parseInt(document.getElementById("fieldDaysInput")?.value, 10) || 60;
  const soil = document.getElementById("fieldSoilInput")?.value.trim() || "Deep Black Clay (Vertisol)";
  const acreage = parseFloat(document.getElementById("fieldAcreageInput")?.value) || 10.0;

  if (!name) {
    alert("Please enter a field name.");
    return;
  }

  const userEmail = (typeof getAuthUserEmail === "function" ? getAuthUserEmail() : "") || "default_farmer@agrovision.org";

  const payload = {
    field_name: name,
    zone_label: zone,
    latitude: lat,
    longitude: lon,
    crop_stage: stage,
    days_since_sowing: days,
    soil_type: soil,
    acreage: acreage,
  };

  const btn = document.getElementById("fieldSubmitBtn");
  const origText = btn ? btn.textContent : "Save";
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Saving…";
  }

  try {
    let endpoint = `/api/v1/fields?user_email=${encodeURIComponent(userEmail)}`;
    let method = "POST";

    if (currentEditingFieldId) {
      endpoint = `/api/v1/fields/${encodeURIComponent(currentEditingFieldId)}?user_email=${encodeURIComponent(userEmail)}`;
      method = "PUT";
    }

    const res = await fetch(getApiUrl(endpoint), {
      method: method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail || `Server error ${res.status}`);
    }

    const savedField = await res.json();

    closeFieldModal();
    await loadUserFields(true);

    if (window.AgroVisionSync) {
      AgroVisionSync.emit("fieldChanged", savedField);
    }
  } catch (err) {
    alert(`Could not save field: ${err.message}`);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = origText;
    }
  }
}

async function deleteField(fieldId, fieldName) {
  if (!confirm(`Are you sure you want to remove "${fieldName}" from your monitored fields?`)) {
    return;
  }

  const userEmail = (typeof getAuthUserEmail === "function" ? getAuthUserEmail() : "") || "default_farmer@agrovision.org";

  try {
    const res = await fetch(getApiUrl(`/api/v1/fields/${encodeURIComponent(fieldId)}?user_email=${encodeURIComponent(userEmail)}`), {
      method: "DELETE"
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail || `Failed to delete field (${res.status})`);
    }

    await loadUserFields(true);

    if (window.AgroVisionSync) {
      AgroVisionSync.emit("fieldChanged", { field_id: fieldId, deleted: true });
    }
  } catch (err) {
    alert(`Error deleting field: ${err.message}`);
  }
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
