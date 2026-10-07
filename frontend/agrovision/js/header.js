/* =========================================================
   AgroVision — Analytics Dashboard Header Controller
   Power BI / Enterprise Analytics Header Component
   Handles: Global Search, Farm Location, Real User Profile,
            Date Badge, and System Notifications.
   ========================================================= */

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
  let user = null;
  if (session) {
    try {
      user = JSON.parse(session);
    } catch (_) {}
  }

  const nameEl = document.getElementById("headerUserName");
  if (nameEl) nameEl.textContent = user && user.name ? user.name : "Farmer";

  const emailEl = document.getElementById("headerUserEmail");
  if (emailEl) emailEl.textContent = user && user.email ? user.email : "Not provided";

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

  // Populate notification empty state if no active alerts
  const notifList = document.getElementById("notifList");
  if (notifList && (!notifList.children || notifList.children.length === 0)) {
    notifList.innerHTML = `
      <div class="agro-empty-state" style="padding: 24px 16px; border:none; margin:0; background:transparent;">
        <div class="empty-icon" style="width:38px; height:38px; font-size:18px; margin-bottom:8px;">🔔</div>
        <div class="empty-title" style="font-size:13px; margin-bottom:2px;">No notifications</div>
        <div class="empty-subtitle" style="font-size:11.5px; margin:0;">You're all caught up with your field alerts.</div>
      </div>
    `;
  }

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
