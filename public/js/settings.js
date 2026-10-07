/* =========================================================
   AgroVision — Settings & Preferences Controller
   Exact implementation connecting 8 analytical settings sections
   Integrated with SQLite backend and WebCrypto security
   ========================================================= */

let currentUser = null;
let initialSettingsState = null;

function getApiUrl(endpoint) {
  if (window.AGROVISION_CONFIG && typeof window.AGROVISION_CONFIG.getApiUrl === "function") {
    return window.AGROVISION_CONFIG.getApiUrl(endpoint);
  }
  return endpoint;
}

// User Profile dropdown
function toggleProfileDropdown(e) {
  if (e) {
    e.stopPropagation();
    e.preventDefault();
  }
  const menu = document.getElementById("profileDropdownMenu");
  if (menu) {
    menu.classList.toggle("show");
  }
}

document.addEventListener("click", (e) => {
  const menu = document.getElementById("profileDropdownMenu");
  const widget = document.getElementById("userProfileWidget");
  if (menu && menu.classList.contains("show") && widget && !widget.contains(e.target)) {
    menu.classList.remove("show");
  }
});

function toggleMobileSidebar() {
  const sidebar = document.querySelector(".sidebar");
  if (sidebar) {
    sidebar.classList.toggle("mobile-open");
  }
}

function activateNav(el, e) {
  if (e) e.preventDefault();
  document.querySelectorAll(".settings-nav-item").forEach(item => item.classList.remove("active"));
  el.classList.add("active");
  const targetId = el.getAttribute("href");
  if (targetId) {
    const targetEl = document.querySelector(targetId);
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }
}

function showAlert(type, message) {
  const box = document.getElementById("settingsAlertBox");
  const icon = document.getElementById("settingsAlertIcon");
  const text = document.getElementById("settingsAlertText");

  if (!box || !icon || !text) return;

  text.textContent = message;
  box.style.display = "block";

  if (type === "success") {
    box.style.background = "#ecfdf5";
    box.style.color = "#065f46";
    box.style.border = "1px solid #a7f3d0";
    icon.textContent = "✓";
  } else if (type === "error") {
    box.style.background = "#fee2e2";
    box.style.color = "#991b1b";
    box.style.border = "1px solid #fca5a5";
    icon.textContent = "⚠️";
  } else {
    box.style.background = "#eff6ff";
    box.style.color = "#1e40af";
    box.style.border = "1px solid #bfdbfe";
    icon.textContent = "ℹ️";
  }

  // Auto scroll to alert if needed
  box.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function dismissAlert() {
  const box = document.getElementById("settingsAlertBox");
  if (box) box.style.display = "none";
}

// Load and populate settings
async function loadUserSettings() {
  currentUser = typeof requireLogin === "function" ? requireLogin() : null;
  if (!currentUser || !currentUser.email) return;

  const email = currentUser.email.toLowerCase().trim();
  const name = currentUser.name || "Operator";

  // Bind Top Header Profile Details
  const headerName = document.getElementById("headerUserName");
  const headerEmail = document.getElementById("headerUserEmail");
  const headerAvatar = document.getElementById("headerUserAvatar");
  const menuName = document.getElementById("profileMenuUserName");
  const headerRole = document.getElementById("headerUserRole");

  if (headerName) headerName.textContent = name;
  if (headerEmail) headerEmail.textContent = email;
  if (headerAvatar) headerAvatar.textContent = name.charAt(0).toUpperCase();
  if (menuName) menuName.textContent = name;

  // Set today date
  const today = new Date();
  const dateStr = today.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const todayEl = document.getElementById("todayDate");
  if (todayEl) todayEl.textContent = dateStr;

  // Bind email to account card
  const accEmail = document.getElementById("accEmail");
  if (accEmail) accEmail.value = email;

  try {
    const res = await fetch(getApiUrl(`/api/settings?email=${encodeURIComponent(email)}`));
    if (!res.ok) throw new Error("Could not fetch user settings from server.");

    const data = await res.json();
    if (data && data.settings) {
      initialSettingsState = data.settings;
      populateForm(data.settings, name);
      
      const lastSavedText = document.getElementById("settingsLastSavedText");
      if (lastSavedText && data.last_updated) {
        const d = new Date(data.last_updated);
        lastSavedText.textContent = `Last persisted: ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      }
    }
  } catch (err) {
    console.warn("Error fetching settings:", err);
    showAlert("error", `Could not connect to settings service: ${err.message}. Using active session defaults.`);
    // Populate with basic session info
    populateForm({ email: email, full_name: name }, name);
  }
}

function populateForm(s, defaultName) {
  // 1. Account
  const accRole = document.getElementById("accRole");
  if (accRole && s.account_role) accRole.value = s.account_role;
  const headerRole = document.getElementById("headerUserRole");
  if (headerRole) headerRole.textContent = s.account_role || "Lead Farmer";

  // 2. Profile
  const profFullName = document.getElementById("profFullName");
  const profPhone = document.getElementById("profPhone");
  const profFarmName = document.getElementById("profFarmName");
  const profLocation = document.getElementById("profLocation");
  const profAcreage = document.getElementById("profAcreage");

  if (profFullName) profFullName.value = s.full_name || defaultName || "";
  if (profPhone) profPhone.value = s.phone || "";
  if (profFarmName) profFarmName.value = s.farm_name || "";
  if (profLocation) profLocation.value = s.farm_location || "";
  if (profAcreage) profAcreage.value = s.total_acreage !== null && s.total_acreage !== undefined ? s.total_acreage : "";

  // 3. Field Preferences
  const fieldDefName = document.getElementById("fieldDefName");
  const fieldLat = document.getElementById("fieldLat");
  const fieldLon = document.getElementById("fieldLon");
  const fieldSoilType = document.getElementById("fieldSoilType");
  const fieldIrrigation = document.getElementById("fieldIrrigation");
  const unitTemp = document.getElementById("unitTemp");
  const unitRain = document.getElementById("unitRain");

  if (fieldDefName) fieldDefName.value = s.default_field_name || "Field A — Wardha South Station";
  if (fieldLat) fieldLat.value = s.default_field_lat !== undefined ? s.default_field_lat : 20.975;
  if (fieldLon) fieldLon.value = s.default_field_lon !== undefined ? s.default_field_lon : 78.72;
  if (fieldSoilType && s.soil_type) fieldSoilType.value = s.soil_type;
  if (fieldIrrigation && s.irrigation_type) fieldIrrigation.value = s.irrigation_type;
  if (unitTemp && s.temp_unit) unitTemp.value = s.temp_unit;
  if (unitRain && s.rainfall_unit) unitRain.value = s.rainfall_unit;

  const headerStation = document.getElementById("headerStationName");
  if (headerStation && s.default_field_name) headerStation.textContent = s.default_field_name;

  // 4. Notifications
  const notifEmail = document.getElementById("notifEmailAlerts");
  const notifSms = document.getElementById("notifSmsAlerts");
  const notifVeto = document.getElementById("notifVetoAlerts");
  const notifDaily = document.getElementById("notifDailyDigest");
  const notifWeekly = document.getElementById("notifWeeklyReport");

  if (notifEmail) notifEmail.checked = s.email_alerts !== undefined ? Boolean(s.email_alerts) : true;
  if (notifSms) notifSms.checked = s.sms_alerts !== undefined ? Boolean(s.sms_alerts) : false;
  if (notifVeto) notifVeto.checked = s.expert_veto_alerts !== undefined ? Boolean(s.expert_veto_alerts) : true;
  if (notifDaily) notifDaily.checked = s.daily_weather_digest !== undefined ? Boolean(s.daily_weather_digest) : true;
  if (notifWeekly) notifWeekly.checked = s.weekly_report !== undefined ? Boolean(s.weekly_report) : true;

  // 5. Data Preferences
  const dataAuto = document.getElementById("dataAutoSync");
  const dataSqlite = document.getElementById("dataSqliteCache");
  const dataBandwidth = document.getElementById("dataLowBandwidth");
  const dataRetention = document.getElementById("dataRetention");

  if (dataAuto) dataAuto.checked = s.auto_telemetry_sync !== undefined ? Boolean(s.auto_telemetry_sync) : true;
  if (dataSqlite) dataSqlite.checked = s.sqlite_caching !== undefined ? Boolean(s.sqlite_caching) : true;
  if (dataBandwidth) dataBandwidth.checked = s.low_bandwidth_mode !== undefined ? Boolean(s.low_bandwidth_mode) : false;
  if (dataRetention && s.data_retention_days !== undefined) dataRetention.value = String(s.data_retention_days);

  // 6. AI Assistant
  const aiModel = document.getElementById("aiModel");
  const aiDepth = document.getElementById("aiDepth");
  const aiAutoSuggest = document.getElementById("aiAutoSuggest");

  if (aiModel && s.gemini_model) aiModel.value = s.gemini_model;
  if (aiDepth && s.ai_depth) aiDepth.value = s.ai_depth;
  if (aiAutoSuggest) aiAutoSuggest.checked = s.auto_suggest_questions !== undefined ? Boolean(s.auto_suggest_questions) : true;

  // 7. Language & Region
  const langSelect = document.getElementById("langSelect");
  const tzSelect = document.getElementById("tzSelect");
  const dateFormatSelect = document.getElementById("dateFormatSelect");

  if (langSelect && s.language) langSelect.value = s.language;
  if (tzSelect && s.timezone) tzSelect.value = s.timezone;
  if (dateFormatSelect && s.date_format) dateFormatSelect.value = s.date_format;

  // 8. Security
  const sec2FA = document.getElementById("sec2FA");
  const secTimeout = document.getElementById("secTimeout");

  if (sec2FA) sec2FA.checked = s.two_factor_enabled !== undefined ? Boolean(s.two_factor_enabled) : false;
  if (secTimeout && s.session_timeout_minutes !== undefined) secTimeout.value = String(s.session_timeout_minutes);
}

// Collect form inputs into payload
function collectFormPayload() {
  const email = currentUser?.email?.toLowerCase().trim() || "";
  const profFullName = document.getElementById("profFullName")?.value.trim() || null;
  const profPhone = document.getElementById("profPhone")?.value.trim() || null;
  const accRole = document.getElementById("accRole")?.value || "Lead Farmer";
  const profFarmName = document.getElementById("profFarmName")?.value.trim() || null;
  const profLocation = document.getElementById("profLocation")?.value.trim() || null;
  const profAcreageVal = document.getElementById("profAcreage")?.value.trim();
  const totalAcreage = profAcreageVal ? parseFloat(profAcreageVal) : null;

  const defaultFieldName = document.getElementById("fieldDefName")?.value.trim() || "Field A — Wardha South Station";
  const defaultFieldLatVal = document.getElementById("fieldLat")?.value.trim();
  const defaultFieldLat = defaultFieldLatVal ? parseFloat(defaultFieldLatVal) : 20.975;
  const defaultFieldLonVal = document.getElementById("fieldLon")?.value.trim();
  const defaultFieldLon = defaultFieldLonVal ? parseFloat(defaultFieldLonVal) : 78.72;

  const soilType = document.getElementById("fieldSoilType")?.value || "Black Cotton Soil (Vertisol)";
  const irrigationType = document.getElementById("fieldIrrigation")?.value || "Drip Irrigation";
  const tempUnit = document.getElementById("unitTemp")?.value || "Celsius (°C)";
  const rainfallUnit = document.getElementById("unitRain")?.value || "Millimeters (mm)";
  const moistureUnit = document.getElementById("unitMoisture")?.value || "Percentage (%)";

  const emailAlerts = Boolean(document.getElementById("notifEmailAlerts")?.checked);
  const smsAlerts = Boolean(document.getElementById("notifSmsAlerts")?.checked);
  const expertVetoAlerts = Boolean(document.getElementById("notifVetoAlerts")?.checked);
  const dailyWeatherDigest = Boolean(document.getElementById("notifDailyDigest")?.checked);
  const weeklyReport = Boolean(document.getElementById("notifWeeklyReport")?.checked);

  const autoTelemetrySync = Boolean(document.getElementById("dataAutoSync")?.checked);
  const sqliteCaching = Boolean(document.getElementById("dataSqliteCache")?.checked);
  const lowBandwidthMode = Boolean(document.getElementById("dataLowBandwidth")?.checked);
  const dataRetentionDays = parseInt(document.getElementById("dataRetention")?.value || "365", 10);

  const geminiModel = document.getElementById("aiModel")?.value || "gemini-2.5-flash";
  const aiDepth = document.getElementById("aiDepth")?.value || "Technical Agronomic";
  const aiGrounding = document.getElementById("aiGrounding")?.value || "Strict Deterministic Model & Veto Grounding";
  const autoSuggestQuestions = Boolean(document.getElementById("aiAutoSuggest")?.checked);

  const language = document.getElementById("langSelect")?.value || "English (Default)";
  const timezone = document.getElementById("tzSelect")?.value || "Asia/Kolkata (IST - UTC+5:30)";
  const dateFormat = document.getElementById("dateFormatSelect")?.value || "DD/MM/YYYY";

  const twoFactorEnabled = Boolean(document.getElementById("sec2FA")?.checked);
  const sessionTimeoutMinutes = parseInt(document.getElementById("secTimeout")?.value || "60", 10);

  return {
    email: email,
    full_name: profFullName,
    phone: profPhone,
    account_role: accRole,
    farm_name: profFarmName,
    farm_location: profLocation,
    total_acreage: totalAcreage,
    default_field_name: defaultFieldName,
    default_field_lat: defaultFieldLat,
    default_field_lon: defaultFieldLon,
    soil_type: soilType,
    irrigation_type: irrigationType,
    temp_unit: tempUnit,
    rainfall_unit: rainfallUnit,
    moisture_unit: moistureUnit,
    email_alerts: emailAlerts,
    sms_alerts: smsAlerts,
    expert_veto_alerts: expertVetoAlerts,
    daily_weather_digest: dailyWeatherDigest,
    weekly_report: weeklyReport,
    auto_telemetry_sync: autoTelemetrySync,
    sqlite_caching: sqliteCaching,
    data_retention_days: dataRetentionDays,
    low_bandwidth_mode: lowBandwidthMode,
    gemini_model: geminiModel,
    ai_depth: aiDepth,
    ai_grounding: aiGrounding,
    auto_suggest_questions: autoSuggestQuestions,
    language: language,
    timezone: timezone,
    date_format: dateFormat,
    two_factor_enabled: twoFactorEnabled,
    session_timeout_minutes: sessionTimeoutMinutes
  };
}

// Handle Save Changes Submit
async function handleSaveSettings(event) {
  if (event) event.preventDefault();
  dismissAlert();

  const saveBtn = document.getElementById("btnSaveSettings");
  const spinner = document.getElementById("btnSaveSpinner");
  const btnText = document.getElementById("btnSaveText");
  const statusPill = document.getElementById("settingsSaveStatusPill");
  const lastSavedText = document.getElementById("settingsLastSavedText");

  if (saveBtn) saveBtn.disabled = true;
  if (spinner) spinner.style.display = "inline";
  if (btnText) btnText.textContent = "Saving Preferences…";
  if (statusPill) {
    statusPill.className = "settings-status-pill saving";
    statusPill.textContent = "⌛ Saving to SQLite Database…";
  }

  const payload = collectFormPayload();

  try {
    const response = await fetch(getApiUrl("/api/settings"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.detail || `HTTP ${response.status}: Failed to save preferences.`);
    }

    const data = await response.json();
    if (!data.success) {
      throw new Error(data.message || "Failed to persist preferences.");
    }

    // Success State
    initialSettingsState = data.settings;
    if (statusPill) {
      statusPill.className = "settings-status-pill saved";
      statusPill.textContent = "✓ Saved & Persisted";
    }

    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (lastSavedText) {
      lastSavedText.textContent = `Last saved: Today at ${timeStr}`;
    }

    // Update session info if full name changed
    if (payload.full_name && currentUser) {
      currentUser.name = payload.full_name;
      localStorage.setItem("agrovision_current_user", JSON.stringify(currentUser));
      const headerName = document.getElementById("headerUserName");
      const menuName = document.getElementById("profileMenuUserName");
      const headerAvatar = document.getElementById("headerUserAvatar");
      if (headerName) headerName.textContent = payload.full_name;
      if (menuName) menuName.textContent = payload.full_name;
      if (headerAvatar) headerAvatar.textContent = payload.full_name.charAt(0).toUpperCase();
    }

    const headerRole = document.getElementById("headerUserRole");
    if (headerRole) headerRole.textContent = payload.account_role || "Lead Farmer";

    const headerStation = document.getElementById("headerStationName");
    if (headerStation && payload.default_field_name) headerStation.textContent = payload.default_field_name;

    showAlert("success", "Settings and operational preferences have been saved and persisted to the database.");

  } catch (err) {
    console.error("Save settings error:", err);
    if (statusPill) {
      statusPill.className = "settings-status-pill error";
      statusPill.textContent = "⚠️ Save Failed";
    }
    showAlert("error", `Error saving preferences: ${err.message}`);
  } finally {
    if (saveBtn) saveBtn.disabled = false;
    if (spinner) spinner.style.display = "none";
    if (btnText) btnText.textContent = "💾 Save Changes";
  }
}

// Reset form to latest saved database state
function handleResetSettings() {
  if (initialSettingsState) {
    populateForm(initialSettingsState, currentUser?.name);
    showAlert("info", "Form restored to latest saved database settings.");
    const statusPill = document.getElementById("settingsSaveStatusPill");
    if (statusPill) {
      statusPill.className = "settings-status-pill saved";
      statusPill.textContent = "✓ Restored";
    }
  } else {
    loadUserSettings();
  }
}

// Handle Password Change
async function handleChangePassword(event) {
  if (event) event.preventDefault();
  dismissAlert();

  const pwdCurrent = document.getElementById("pwdCurrent");
  const pwdNew = document.getElementById("pwdNew");
  const pwdConfirm = document.getElementById("pwdConfirm");
  const btn = document.getElementById("btnChangePassword");

  const curVal = pwdCurrent ? pwdCurrent.value : "";
  const newVal = pwdNew ? pwdNew.value : "";
  const confVal = pwdConfirm ? pwdConfirm.value : "";

  if (!curVal || !newVal || !confVal) {
    showAlert("error", "Please fill in all password fields (Current, New, and Confirm).");
    return;
  }

  if (newVal.length < 6) {
    showAlert("error", "New password must contain at least 6 characters.");
    return;
  }

  if (newVal !== confVal) {
    showAlert("error", "New password and Confirm password do not match.");
    return;
  }

  if (btn) btn.disabled = true;

  try {
    const users = typeof getUsers === "function" ? getUsers() : JSON.parse(localStorage.getItem("agrovision_users") || "[]");
    const userEmail = currentUser?.email?.toLowerCase().trim();
    const userIdx = users.findIndex(u => u.email === userEmail);

    if (userIdx === -1) {
      throw new Error("Active user record not found in credentials store.");
    }

    const userRec = users[userIdx];
    let isCurrentValid = false;

    if (userRec.salt && userRec.hash) {
      isCurrentValid = (await hashPassword(curVal, userRec.salt)) === userRec.hash;
    } else if (userRec.password) {
      isCurrentValid = userRec.password === curVal;
    }

    if (!isCurrentValid) {
      throw new Error("The Current Password you entered is incorrect.");
    }

    // Generate new random salt and salted hash
    const newSalt = typeof randomSalt === "function" ? randomSalt() : Math.random().toString(36).substring(2);
    const newHash = await hashPassword(newVal, newSalt);

    userRec.salt = newSalt;
    userRec.hash = newHash;
    delete userRec.password;

    users[userIdx] = userRec;
    if (typeof saveUsers === "function") {
      saveUsers(users);
    } else {
      localStorage.setItem("agrovision_users", JSON.stringify(users));
    }

    // Clear inputs
    if (pwdCurrent) pwdCurrent.value = "";
    if (pwdNew) pwdNew.value = "";
    if (pwdConfirm) pwdConfirm.value = "";

    showAlert("success", "Password updated successfully with salted SHA-256 encryption.");

  } catch (err) {
    console.error("Password change error:", err);
    showAlert("error", err.message || "Failed to update password.");
  } finally {
    if (btn) btn.disabled = false;
  }
}

/* =========================================================
   LIVE FIELD MANAGEMENT & REST API SYNC
   ========================================================= */

let userFieldsList = [];

async function loadUserFields() {
  const email = currentUser?.email?.toLowerCase().trim();
  if (!email) return;

  const tableBody = document.getElementById("settingsFieldsTableBody");
  if (!tableBody) return;

  try {
    const res = await fetch(getApiUrl(`/api/v1/fields?email=${encodeURIComponent(email)}`));
    if (!res.ok) throw new Error("Could not load farm fields.");

    const data = await res.json();
    userFieldsList = (data && data.fields) ? data.fields : [];
    renderFieldsTable(userFieldsList);
  } catch (err) {
    console.warn("Failed to load user fields:", err);
    tableBody.innerHTML = `<tr><td colspan="6" style="padding:14px; text-align:center; color:#ef4444;">Failed to load fields: ${err.message}</td></tr>`;
  }
}

function renderFieldsTable(fields) {
  const tableBody = document.getElementById("settingsFieldsTableBody");
  if (!tableBody) return;

  if (!fields || fields.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="6" style="padding:20px; text-align:center; color:#64748b;">No registered farm fields found. Click <strong>+ Add New Field</strong> above to register your first plot.</td></tr>`;
    return;
  }

  const activeFieldId = localStorage.getItem("agrovision_active_field_id");

  tableBody.innerHTML = fields.map(f => {
    const isDefault = f.is_default || f.id === activeFieldId;
    return `
      <tr style="border-bottom:1px solid #f1f5f9; background:${isDefault ? '#f0fdf4' : 'transparent'};">
        <td style="padding:10px 12px; font-weight:700; color:#0f172a;">
          <div style="display:flex; align-items:center; gap:6px;">
            <span>🌱</span>
            <span>${escapeHtml(f.name)}</span>
            ${isDefault ? '<span style="font-size:9.5px; background:#ecfdf5; color:#059669; border:1px solid #a7f3d0; padding:1px 6px; border-radius:999px; font-weight:800;">ACTIVE</span>' : ''}
          </div>
          <div style="font-size:10px; color:#64748b; margin-top:2px;">ID: ${escapeHtml(f.station_id || f.id)}</div>
        </td>
        <td style="padding:10px 12px; color:#334155;">${escapeHtml(f.location || '-')}</td>
        <td style="padding:10px 12px; color:#334155;">${f.area_acres ? f.area_acres + ' ac' : '-'}</td>
        <td style="padding:10px 12px; color:#334155;">
          <span style="display:block; font-weight:600; font-size:11px;">${escapeHtml(f.soil_type || 'Vertisol')}</span>
          <span style="font-size:10.5px; color:#64748b;">${escapeHtml(f.irrigation_type || 'Drip')}</span>
        </td>
        <td style="padding:10px 12px; font-family:'JetBrains Mono', monospace; font-size:10.5px; color:#475569;">
          ${f.latitude.toFixed(4)}°N, ${f.longitude.toFixed(4)}°E
        </td>
        <td style="padding:10px 12px; text-align:right; white-space:nowrap;">
          ${!isDefault ? `
            <button type="button" onclick="handleSetActiveField('${escapeHtml(f.id)}')" class="btn btn-outline" style="padding:4px 8px; font-size:10.5px; font-weight:700; margin-right:4px;">
              Set Active
            </button>
          ` : ''}
          <button type="button" onclick="handleDeleteField('${escapeHtml(f.id)}', '${escapeHtml(f.name)}')" class="btn btn-outline" style="padding:4px 8px; font-size:10.5px; color:#ef4444; border-color:#fecaca;" title="Delete Field">
            🗑️
          </button>
        </td>
      </tr>
    `;
  }).join("");
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str).replace(/[&<>"']/g, m => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[m]);
}

function openAddFieldModal() {
  const modal = document.getElementById("addFieldModal");
  if (modal) {
    modal.style.display = "flex";
    const nameInput = document.getElementById("newFieldName");
    if (nameInput) {
      nameInput.value = "";
      nameInput.focus();
    }
  }
}

function closeAddFieldModal() {
  const modal = document.getElementById("addFieldModal");
  if (modal) modal.style.display = "none";
}

async function handleCreateField(e) {
  if (e) e.preventDefault();
  const email = currentUser?.email?.toLowerCase().trim();
  if (!email) {
    showAlert("error", "You must be logged in to register a field.");
    return;
  }

  const name = document.getElementById("newFieldName")?.value.trim();
  const location = document.getElementById("newFieldLocation")?.value.trim();
  const areaVal = document.getElementById("newFieldArea")?.value.trim();
  const latVal = document.getElementById("newFieldLat")?.value.trim();
  const lonVal = document.getElementById("newFieldLon")?.value.trim();
  const soil = document.getElementById("newFieldSoil")?.value;
  const irrigation = document.getElementById("newFieldIrrigation")?.value;

  if (!name || !location || !latVal || !lonVal) {
    showAlert("error", "Please fill in all required field information.");
    return;
  }

  const payload = {
    user_email: email,
    name: name,
    location: location,
    area_acres: areaVal ? parseFloat(areaVal) : null,
    latitude: parseFloat(latVal),
    longitude: parseFloat(lonVal),
    soil_type: soil,
    irrigation_type: irrigation,
    is_default: userFieldsList.length === 0
  };

  const submitBtn = document.getElementById("btnSubmitNewField");
  if (submitBtn) submitBtn.disabled = true;

  try {
    const res = await fetch(getApiUrl("/api/v1/fields"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Failed to create field.");
    }

    const newField = await res.json();
    closeAddFieldModal();
    showAlert("success", `Field "${newField.name}" successfully registered and saved to database.`);

    if (window.AgroVisionSync && typeof window.AgroVisionSync.emitFieldChanged === "function") {
      window.AgroVisionSync.emitFieldChanged({ field_id: newField.id, name: newField.name, field: newField });
    }

    await loadUserFields();

    // If this was first field, populate default field inputs
    const fieldDefName = document.getElementById("fieldDefName");
    if (fieldDefName && (!fieldDefName.value || fieldDefName.value.includes("Field A"))) {
      fieldDefName.value = newField.name;
    }
  } catch (err) {
    console.error("Create field error:", err);
    showAlert("error", `Error registering field: ${err.message}`);
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

async function handleDeleteField(fieldId, fieldName) {
  if (!confirm(`Are you sure you want to remove field "${fieldName}"? Historical analyses will remain in database.`)) {
    return;
  }

  const email = currentUser?.email?.toLowerCase().trim();
  if (!email) return;

  try {
    const res = await fetch(getApiUrl(`/api/v1/fields/${encodeURIComponent(fieldId)}?email=${encodeURIComponent(email)}`), {
      method: "DELETE"
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Failed to delete field.");
    }

    showAlert("success", `Field "${fieldName}" has been removed.`);

    if (window.AgroVisionSync && typeof window.AgroVisionSync.emitFieldChanged === "function") {
      window.AgroVisionSync.emitFieldChanged({ field_id: null, action: "deleted" });
    }

    await loadUserFields();
  } catch (err) {
    console.error("Delete field error:", err);
    showAlert("error", `Could not delete field: ${err.message}`);
  }
}

function handleSetActiveField(fieldId) {
  const targetField = userFieldsList.find(f => f.id === fieldId);
  if (!targetField) return;

  localStorage.setItem("agrovision_active_field_id", targetField.id);
  localStorage.setItem("agrovision_selected_field", targetField.name);

  const fieldDefName = document.getElementById("fieldDefName");
  const fieldLat = document.getElementById("fieldLat");
  const fieldLon = document.getElementById("fieldLon");
  const fieldSoilType = document.getElementById("fieldSoilType");
  const fieldIrrigation = document.getElementById("fieldIrrigation");
  const headerStation = document.getElementById("headerStationName");

  if (fieldDefName) fieldDefName.value = targetField.name;
  if (fieldLat) fieldLat.value = targetField.latitude;
  if (fieldLon) fieldLon.value = targetField.longitude;
  if (fieldSoilType && targetField.soil_type) fieldSoilType.value = targetField.soil_type;
  if (fieldIrrigation && targetField.irrigation_type) fieldIrrigation.value = targetField.irrigation_type;
  if (headerStation) headerStation.textContent = targetField.name;

  renderFieldsTable(userFieldsList);
  showAlert("info", `Active monitoring station set to "${targetField.name}".`);

  if (window.AgroVisionSync && typeof window.AgroVisionSync.emitFieldChanged === "function") {
    window.AgroVisionSync.emitFieldChanged({ field_id: targetField.id, name: targetField.name, field: targetField });
  }
}

// Initialize on page load
document.addEventListener("DOMContentLoaded", () => {
  loadUserSettings();
  loadUserFields();

  if (window.AgroVisionSync && typeof window.AgroVisionSync.onFieldChanged === "function") {
    window.AgroVisionSync.onFieldChanged(() => {
      loadUserFields();
    });
  }
});
