/* =========================================================
   AgroVision — Analytics Dashboard Header & Global Shell Controller
   Handles:
   - Live Global Field Selector (connected to /api/v1/fields)
   - Real-time Global Search with Live Suggestion Overlay
   - Database-Driven Notifications & Unread Badge
   - Live System Status (connected to /api/health)
   - User Profile Dropdown & Session State
   ========================================================= */

function getApiUrl(endpoint) {
  if (window.AGROVISION_CONFIG && typeof window.AGROVISION_CONFIG.getApiUrl === "function") {
    return window.AGROVISION_CONFIG.getApiUrl(endpoint);
  }
  return endpoint;
}

function escapeHtml(text) {
  if (!text) return "";
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// =========================================================
// Dropdown Toggles
// =========================================================
function toggleProfileDropdown(event) {
  if (event) event.stopPropagation();
  const menu = document.getElementById("profileDropdownMenu");
  const notifMenu = document.getElementById("notifDropdownMenu");
  if (notifMenu) notifMenu.classList.remove("active");
  if (menu) menu.classList.toggle("active");
}

function toggleNotifDropdown(event) {
  if (event) event.stopPropagation();
  const notifMenu = document.getElementById("notifDropdownMenu");
  const profMenu = document.getElementById("profileDropdownMenu");
  if (profMenu) profMenu.classList.remove("active");
  if (notifMenu) notifMenu.classList.toggle("active");
}

function closeAllHeaderDropdowns() {
  const prof = document.getElementById("profileDropdownMenu");
  const notif = document.getElementById("notifDropdownMenu");
  const searchSuggest = document.getElementById("globalSearchSuggestions");
  if (prof) prof.classList.remove("active");
  if (notif) notif.classList.remove("active");
  if (searchSuggest) searchSuggest.style.display = "none";
}

// =========================================================
// Global Field Selector Management
// =========================================================
let userRegisteredFields = [];

async function loadGlobalHeaderFields() {
  const selector = document.getElementById("globalHeaderFieldSelector");
  if (!selector) return;

  try {
    const user = typeof requireLogin === "function" ? requireLogin() : null;
    const userEmailParam = user && user.email ? `?user_email=${encodeURIComponent(user.email)}` : "";
    const res = await fetch(getApiUrl(`/api/v1/fields${userEmailParam}`));
    if (!res.ok) throw new Error("Could not fetch user fields");

    const fields = await res.json();
    userRegisteredFields = Array.isArray(fields) && fields.length > 0 ? fields : [];

    selector.innerHTML = "";
    if (userRegisteredFields.length === 0) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "No field added yet";
      selector.appendChild(opt);
    } else {
      const activeField = window.AgroVisionSync ? window.AgroVisionSync.getActiveField() : null;
      let selectedFound = false;

      userRegisteredFields.forEach(f => {
        const opt = document.createElement("option");
        opt.value = f.field_id;
        opt.textContent = `${f.field_name} (${f.zone_label || 'Active'})`;
        opt.dataset.lat = f.latitude;
        opt.dataset.lon = f.longitude;
        opt.dataset.cropStage = f.crop_stage || "Flowering";
        opt.dataset.soilType = f.soil_type || "Vertisol";
        opt.dataset.fieldName = f.field_name;

        if (activeField && activeField.field_id === f.field_id) {
          opt.selected = true;
          selectedFound = true;
        }
        selector.appendChild(opt);
      });

      if (!selectedFound && userRegisteredFields.length > 0) {
        selector.selectedIndex = 0;
        const first = userRegisteredFields[0];
        if (window.AgroVisionSync) {
          window.AgroVisionSync.setActiveField(first);
        }
      }
    }

    // Update location badge in header
    updateHeaderLocationBadge();
  } catch (err) {
    console.warn("Could not load database fields for header:", err);
  }
}

function handleHeaderFieldChange(event) {
  const selector = event.target;
  const fieldId = selector.value;
  const selectedField = userRegisteredFields.find(f => f.field_id === fieldId);

  if (selectedField && window.AgroVisionSync) {
    window.AgroVisionSync.setActiveField(selectedField);
    updateHeaderLocationBadge();
  }
}

function updateHeaderLocationBadge() {
  const locBadge = document.getElementById("globalHeaderLocation");
  if (!locBadge) return;

  const activeField = window.AgroVisionSync ? window.AgroVisionSync.getActiveField() : null;
  if (activeField && activeField.field_name) {
    locBadge.innerHTML = `<span style="font-size:13px;">📍</span> <span>${escapeHtml(activeField.field_name)}</span>`;
  } else {
    locBadge.innerHTML = `<span style="font-size:13px;">📍</span> <span>Central Cotton Belt</span>`;
  }
}

// =========================================================
// Real-time Global Search & Suggestion Dropdown
// =========================================================
let searchDebounceTimer = null;

function handleGlobalSearchInput(event) {
  clearTimeout(searchDebounceTimer);
  const query = (event.target.value || "").trim();

  const suggestBox = document.getElementById("globalSearchSuggestions");
  if (!suggestBox) return;

  if (!query) {
    suggestBox.style.display = "none";
    return;
  }

  suggestBox.style.display = "block";
  suggestBox.innerHTML = `
    <div style="padding:12px 14px; font-size:11.5px; color:#64748b; display:flex; align-items:center; gap:8px;">
      <span class="status-pulse-dot" style="background:#059669;"></span>
      <span>Searching records, diagnostics &amp; farm parcels for "${escapeHtml(query)}"…</span>
    </div>
  `;

  searchDebounceTimer = setTimeout(async () => {
    try {
      const user = typeof requireLogin === "function" ? requireLogin() : null;
      const userEmailParam = user && user.email ? `&user_email=${encodeURIComponent(user.email)}` : "";
      const res = await fetch(getApiUrl(`/api/v1/records?limit=10&search=${encodeURIComponent(query)}${userEmailParam}`));
      if (!res.ok) throw new Error("Search request failed");
      const records = await res.json();

      renderSearchSuggestions(query, Array.isArray(records) ? records : []);
    } catch (err) {
      suggestBox.innerHTML = `
        <div style="padding:12px 14px; font-size:11.5px; color:#ef4444;">
          ⚠️ Search temporarily unavailable: ${escapeHtml(err.message)}
        </div>
      `;
    }
  }, 250);
}

function renderSearchSuggestions(query, records) {
  const suggestBox = document.getElementById("globalSearchSuggestions");
  if (!suggestBox) return;

  // Also match registered fields
  const matchingFields = userRegisteredFields.filter(f => 
    f.field_name.toLowerCase().includes(query.toLowerCase()) || 
    (f.zone_label && f.zone_label.toLowerCase().includes(query.toLowerCase()))
  );

  if (records.length === 0 && matchingFields.length === 0) {
    suggestBox.innerHTML = `
      <div style="padding:16px 14px; text-align:center; color:#64748b; font-size:11.5px;">
        <span style="font-size:18px; display:block; margin-bottom:4px;">🔍</span>
        <strong>No matching records found for "${escapeHtml(query)}"</strong>
        <p style="margin:2px 0 0; font-size:10.5px; color:#94a3b8;">Try searching a Record UUID, stress type (e.g. Water Stress), or field name.</p>
      </div>
    `;
    return;
  }

  let html = `<div style="max-height:360px; overflow-y:auto; padding:6px 0;">`;

  if (matchingFields.length > 0) {
    html += `<div style="padding:4px 12px; font-size:10px; font-weight:700; color:#94a3b8; text-transform:uppercase; letter-spacing:0.04em;">Farm Parcels</div>`;
    matchingFields.forEach(f => {
      html += `
        <div class="search-suggest-item" onclick="selectSearchField('${escapeHtml(f.field_id)}')" style="padding:8px 12px; cursor:pointer; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #f8fafc;">
          <div>
            <strong style="color:#0f172a; font-size:12px;">📍 ${escapeHtml(f.field_name)}</strong>
            <div style="font-size:10.5px; color:#64748b;">${escapeHtml(f.zone_label || 'Active Zone')} · ${escapeHtml(f.crop_stage || 'Flowering')}</div>
          </div>
          <span style="font-size:10.5px; color:#059669; font-weight:700; background:#ecfdf5; padding:2px 6px; border-radius:4px;">Select Field →</span>
        </div>
      `;
    });
  }

  if (records.length > 0) {
    html += `<div style="padding:6px 12px 4px; font-size:10px; font-weight:700; color:#94a3b8; text-transform:uppercase; letter-spacing:0.04em;">Analysis Records</div>`;
    records.slice(0, 6).forEach(r => {
      let topClass = "Evaluated";
      try {
        if (r.cnn_predictions_json) {
          const cnn = JSON.parse(r.cnn_predictions_json);
          topClass = Object.keys(cnn).reduce((a, b) => cnn[a] > cnn[b] ? a : b).replace(/_/g, " ");
        }
      } catch (_) {}

      const isStress = topClass.toLowerCase().includes("stress") || topClass.toLowerCase().includes("deficiency");
      const dateStr = new Date(r.created_at || Date.now()).toLocaleDateString("en-US", { month: "short", day: "numeric" });

      html += `
        <a href="analysis_detail.html?uuid=${r.record_uuid}" class="search-suggest-item" style="padding:8px 12px; display:flex; justify-content:space-between; align-items:center; text-decoration:none; border-bottom:1px solid #f8fafc;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:14px;">${isStress ? '⚠️' : '🌿'}</span>
            <div>
              <strong style="color:#0f172a; font-size:11.5px; text-transform:capitalize;">${escapeHtml(topClass)}</strong>
              <div style="font-size:10.5px; color:#64748b;">ID: ${escapeHtml(r.record_uuid)} · ${dateStr}</div>
            </div>
          </div>
          <span style="font-size:10.5px; font-weight:600; color:#2563eb; background:#eff6ff; padding:2px 6px; border-radius:4px;">View Details →</span>
        </a>
      `;
    });
  }

  html += `
    <div style="padding:8px 12px; background:#f8fafc; border-top:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
      <span style="font-size:11px; color:#64748b;">Press Enter for full archive search</span>
      <a href="history.html?search=${encodeURIComponent(query)}" style="font-size:11px; font-weight:700; color:#059669; text-decoration:none;">View All Results →</a>
    </div>
  </div>`;

  suggestBox.innerHTML = html;
}

function selectSearchField(fieldId) {
  const selector = document.getElementById("globalHeaderFieldSelector");
  if (selector) {
    selector.value = fieldId;
    selector.dispatchEvent(new Event("change"));
  }
  const suggestBox = document.getElementById("globalSearchSuggestions");
  if (suggestBox) suggestBox.style.display = "none";
}

function handleGlobalSearch(event) {
  if (event.key === "Enter" || event.type === "submit") {
    const input = document.getElementById("globalSearchInput");
    const query = input ? input.value.trim() : "";
    if (!query) return;

    if (window.location.pathname.endsWith("history.html") && typeof applyHistoryFilter === "function") {
      const searchBox = document.getElementById("historySearch");
      if (searchBox) {
        searchBox.value = query;
        applyHistoryFilter();
      }
    } else {
      window.location.href = `history.html?search=${encodeURIComponent(query)}`;
    }
  }
}

// =========================================================
// Real Notifications Management
// =========================================================
async function loadHeaderNotifications() {
  const notifMenu = document.getElementById("notifDropdownMenu");
  const dot = document.querySelector(".header-notif-dot");
  if (!notifMenu) return;

  try {
    const user = typeof requireLogin === "function" ? requireLogin() : null;
    const userEmailParam = user && user.email ? `?user_email=${encodeURIComponent(user.email)}` : "";
    const res = await fetch(getApiUrl(`/api/v1/notifications${userEmailParam}`));
    if (!res.ok) throw new Error("Could not fetch notifications");

    const notifs = await res.json();
    const list = Array.isArray(notifs) ? notifs : [];
    const unreadCount = list.filter(n => n.is_read === 0).length;

    if (dot) {
      dot.style.display = unreadCount > 0 ? "block" : "none";
    }

    let headerHtml = `
      <div style="font-size:12px; font-weight:800; color:#0d3b2e; border-bottom:1px solid #f1f5f9; padding-bottom:8px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
        <span>System Alerts (${list.length})</span>
        <div style="display:flex; align-items:center; gap:6px;">
          ${unreadCount > 0 ? `<button type="button" onclick="markAllNotificationsAsRead()" style="background:none; border:none; color:#059669; font-size:10.5px; font-weight:700; cursor:pointer; padding:0;">Mark read</button>` : ''}
          <span style="font-size:10px; color:#059669; font-weight:700; background:#ecfdf5; padding:1px 6px; border-radius:4px;">Live</span>
        </div>
      </div>
    `;

    if (list.length === 0) {
      notifMenu.innerHTML = headerHtml + `
        <div style="padding:20px 10px; text-align:center; color:#64748b; font-size:11.5px;">
          <span>🔔</span>
          <p style="margin:4px 0 0;">No active alerts. All systems nominal.</p>
        </div>
      `;
      return;
    }

    let itemsHtml = `<div style="max-height:280px; overflow-y:auto; display:flex; flex-direction:column; gap:6px;">`;
    list.slice(0, 8).forEach(n => {
      const isUnread = n.is_read === 0;
      const icon = n.notif_type === "expert_veto" ? "⚠️" : (n.notif_type === "analysis" ? "🌿" : "🌤️");
      const timeAgo = formatTimeAgo(new Date(n.created_at || Date.now()));

      itemsHtml += `
        <a href="${n.link_url || 'overview.html'}" class="notif-item ${isUnread ? 'unread' : ''}" style="text-decoration:none; display:flex; align-items:start; gap:8px; padding:6px 8px; border-radius:6px; background:${isUnread ? '#f8fafc' : 'transparent'}; border-left:3px solid ${isUnread ? '#059669' : 'transparent'};">
          <span style="font-size:14px; margin-top:2px;">${icon}</span>
          <div style="flex:1; min-width:0;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <strong style="color:#0f172a; font-size:11.5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(n.title)}</strong>
              <span style="font-size:9.5px; color:#94a3b8; flex-shrink:0;">${timeAgo}</span>
            </div>
            <p style="margin:2px 0 0; color:#64748b; font-size:10.5px; line-height:1.3; overflow:hidden; text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;">${escapeHtml(n.message)}</p>
          </div>
        </a>
      `;
    });
    itemsHtml += `</div>`;

    notifMenu.innerHTML = headerHtml + itemsHtml;
  } catch (err) {
    console.warn("Could not load notifications:", err);
  }
}

async function markAllNotificationsAsRead() {
  try {
    const user = typeof requireLogin === "function" ? requireLogin() : null;
    const userEmailParam = user && user.email ? `?user_email=${encodeURIComponent(user.email)}` : "";
    await fetch(getApiUrl(`/api/v1/notifications/read-all${userEmailParam}`), { method: "PUT" });
    loadHeaderNotifications();
  } catch (err) {
    console.error("Failed to mark notifications read:", err);
  }
}

function formatTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// =========================================================
// Live System Health Check
// =========================================================
async function checkSystemHealth() {
  const badge = document.getElementById("globalFooterStatusBadge");
  if (!badge) return;

  try {
    const res = await fetch(getApiUrl("/api/health"), { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      const isOk = data.status === "ok";
      badge.className = "footer-status-badge " + (isOk ? "status-online" : "status-degraded");
      badge.innerHTML = `<span class="status-pulse-dot" style="background:${isOk ? '#059669' : '#eab308'};"></span> ${isOk ? 'System Online' : 'Degraded'}`;
    } else {
      badge.className = "footer-status-badge status-offline";
      badge.innerHTML = `<span class="status-pulse-dot" style="background:#ef4444;"></span> Offline`;
    }
  } catch (_) {
    badge.className = "footer-status-badge status-offline";
    badge.innerHTML = `<span class="status-pulse-dot" style="background:#ef4444;"></span> Offline`;
  }
}

// Global click listener to close dropdowns & suggestions
document.addEventListener("click", (e) => {
  const isInsideProfile = e.target.closest("#userProfileWidget") || e.target.closest("#profileDropdownMenu");
  const isInsideNotif = e.target.closest("#notifDropdownBtn") || e.target.closest("#notifDropdownMenu");
  const isInsideSearch = e.target.closest(".header-search-wrap") || e.target.closest("#globalSearchSuggestions");
  if (!isInsideProfile && !isInsideNotif && !isInsideSearch) {
    closeAllHeaderDropdowns();
  }
});

// Setup on DOM Ready
document.addEventListener("DOMContentLoaded", () => {
  // Update Date
  const dateEl = document.getElementById("globalHeaderDate");
  if (dateEl) {
    const now = new Date();
    dateEl.textContent = now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  }

  // Populate authenticated user info
  const session = localStorage.getItem("agrovision_current_user");
  let user = null;
  if (session) {
    try { user = JSON.parse(session); } catch (_) {}
  }

  const nameEl = document.getElementById("headerUserName");
  if (nameEl) nameEl.textContent = user && user.name ? user.name : "Farmer";

  const emailEl = document.getElementById("headerUserEmail");
  if (emailEl) emailEl.textContent = user && user.email ? user.email : "farmer@agrovision.org";

  const profNameEl = document.getElementById("profileMenuUserName");
  if (profNameEl) profNameEl.textContent = user && user.name ? user.name : "Farmer";

  const avatarEl = document.getElementById("headerUserAvatar");
  if (avatarEl) {
    const initials = (user && user.name ? user.name : "F")
      .split(" ")
      .map(p => p[0])
      .join("")
      .substring(0, 2)
      .toUpperCase();
    avatarEl.textContent = initials || "🌾";
  }

  // Initialize Field Selector, Notifications, and System Health
  loadGlobalHeaderFields();
  loadHeaderNotifications();
  checkSystemHealth();

  // Attach search listener for live suggestions
  const searchInput = document.getElementById("globalSearchInput");
  if (searchInput) {
    searchInput.addEventListener("input", handleGlobalSearchInput);
    searchInput.addEventListener("focus", handleGlobalSearchInput);
  }

  // Hook sync bus listeners
  if (window.AgroVisionSync) {
    window.AgroVisionSync.on("fieldChanged", () => {
      updateHeaderLocationBadge();
    });
    window.AgroVisionSync.on("analysisSaved", () => {
      loadHeaderNotifications();
    });
    window.AgroVisionSync.on("tabFocused", () => {
      loadHeaderNotifications();
      checkSystemHealth();
    });
  }
});
