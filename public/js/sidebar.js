/* =========================================================
   AgroVision — Professional Enterprise Sidebar Navigation
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
