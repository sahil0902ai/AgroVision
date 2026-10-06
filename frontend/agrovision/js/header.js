/* =========================================================
   AgroVision — Analytics Dashboard Header Controller
   Power BI / Enterprise Analytics Header Component
   Handles: Global Search, Field Selection, Real User Profile,
            Date Badge, and System Notifications.
   ========================================================= */

const AGROVISION_USER_FIELDS_KEY = "agrovision_user_fields";
const AGROVISION_ACTIVE_FIELD_KEY = "agrovision_active_field";

// Real registered fields for the authenticated farmer
const DEFAULT_FARMER_FIELDS = [
  {
    id: "zone-1",
    name: "Field A — North Parcel (Zone 1)",
    shortName: "Field A",
    zone: "Zone 1",
    station: "Wardha South Station",
    lat: 20.975,
    lon: 78.720,
    crop: "Cotton (Bt-II)",
    areaAcres: 12.5
  },
  {
    id: "zone-2",
    name: "Field B — South Parcel (Zone 2)",
    shortName: "Field B",
    zone: "Zone 2",
    station: "Nagpur East Station",
    lat: 21.145,
    lon: 79.088,
    crop: "Cotton (Suraj)",
    areaAcres: 18.0
  },
  {
    id: "zone-3",
    name: "Field C — East Plot (Zone 3)",
    shortName: "Field C",
    zone: "Zone 3",
    station: "Amravati West Station",
    lat: 20.932,
    lon: 77.752,
    crop: "Cotton (RCH-659)",
    areaAcres: 8.5
  }
];

function getFarmerFields() {
  try {
    const raw = localStorage.getItem(AGROVISION_USER_FIELDS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (_) {}
  return DEFAULT_FARMER_FIELDS;
}

function getActiveFarmerField() {
  const fields = getFarmerFields();
  const activeId = localStorage.getItem(AGROVISION_ACTIVE_FIELD_KEY);
  const found = fields.find(f => f.id === activeId || f.name === activeId);
  return found || fields[0];
}

function setGlobalActiveField(fieldId) {
  const fields = getFarmerFields();
  const field = fields.find(f => f.id === fieldId || f.name === fieldId);
  if (!field) return;

  localStorage.setItem(AGROVISION_ACTIVE_FIELD_KEY, field.id);

  // Sync any other field select dropdowns on the page
  document.querySelectorAll(".header-field-select, #fieldSelect").forEach(sel => {
    if (sel.value !== field.name && sel.value !== field.id) {
      // Find matching option
      for (let i = 0; i < sel.options.length; i++) {
        if (sel.options[i].value === field.id || sel.options[i].value === field.name || sel.options[i].text.includes(field.zone)) {
          sel.selectedIndex = i;
          break;
        }
      }
    }
  });

  // Dispatch global event for weather and analysis components
  window.dispatchEvent(new CustomEvent("agrovision:fieldChanged", { detail: field }));
}

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
  if (prof) prof.classList.remove("active");
  if (notif) notif.classList.remove("active");
}

function handleGlobalSearch(event) {
  if (event.key === "Enter" || event.type === "submit") {
    const input = document.getElementById("globalSearchInput");
    const query = input ? input.value.trim() : "";
    if (!query) return;

    // If currently on history page, trigger table filter directly
    if (window.location.pathname.endsWith("history.html") && typeof applyHistoryFilter === "function") {
      const searchBox = document.getElementById("historySearch");
      if (searchBox) {
        searchBox.value = query;
        applyHistoryFilter();
      }
    } else {
      // Navigate to history archive with search query param
      window.location.href = `history.html?search=${encodeURIComponent(query)}`;
    }
  }
}

// Global click listener to close dropdowns
document.addEventListener("click", (e) => {
  const isInsideProfile = e.target.closest("#userProfileWidget") || e.target.closest("#profileDropdownMenu");
  const isInsideNotif = e.target.closest("#notifDropdownBtn") || e.target.closest("#notifDropdownMenu");
  if (!isInsideProfile && !isInsideNotif) {
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
  let user = { name: "Farmer", email: "farmer@agrovision.org" };
  if (session) {
    try {
      user = JSON.parse(session);
    } catch (_) {}
  }

  const nameEl = document.getElementById("headerUserName");
  if (nameEl) nameEl.textContent = user.name || "Farmer";

  const emailEl = document.getElementById("headerUserEmail");
  if (emailEl) emailEl.textContent = user.email || "farmer@agrovision.org";

  const avatarEl = document.getElementById("headerUserAvatar");
  if (avatarEl) {
    const initials = (user.name || "F")
      .split(" ")
      .map(p => p[0])
      .join("")
      .substring(0, 2)
      .toUpperCase();
    avatarEl.textContent = initials || "🌾";
  }

  // Populate Field Selectors
  const fieldSelectors = document.querySelectorAll(".header-field-select");
  const fields = getFarmerFields();
  const activeField = getActiveFarmerField();

  fieldSelectors.forEach(sel => {
    sel.innerHTML = "";
    fields.forEach(f => {
      const opt = document.createElement("option");
      opt.value = f.id;
      opt.textContent = f.name;
      if (f.id === activeField.id) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.onchange = (e) => setGlobalActiveField(e.target.value);
  });

  // Check URL query parameters for global search on history page
  if (window.location.pathname.endsWith("history.html")) {
    const params = new URLSearchParams(window.location.search);
    const searchParam = params.get("search");
    if (searchParam) {
      const searchBox = document.getElementById("globalSearchInput");
      if (searchBox) searchBox.value = searchParam;
    }
  }
});
