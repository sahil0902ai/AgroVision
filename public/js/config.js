/* =========================================================
   AgroVision — API & Environment Configuration
   Supports local FastAPI server, Vercel edge proxy, or remote backend.
   ========================================================= */

(function () {
  const savedApiBase = localStorage.getItem("agrovision_api_base");
  
  let defaultBase = "";
  // Check if opened directly via file:// protocol
  if (window.location.protocol === "file:") {
    defaultBase = "http://127.0.0.1:8000";
  } 
  // Check if opened on localhost / 127.0.0.1 with port other than 8000 (e.g. Live Server port 5500, Vite port 3000/5173)
  else if ((window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") && window.location.port !== "8000") {
    defaultBase = "http://127.0.0.1:8000";
  }

  window.AGROVISION_CONFIG = {
    // API base URL
    API_BASE: (savedApiBase !== null && savedApiBase !== undefined) ? savedApiBase : defaultBase,
    
    // Helper to construct full API URL
    getApiUrl: function (path) {
      if (!path.startsWith("/")) path = "/" + path;
      const base = this.API_BASE || "";
      return base + path;
    },
    
    // Set custom API Base URL at runtime
    setApiBase: function (url) {
      if (url && url.endsWith("/")) url = url.slice(0, -1);
      this.API_BASE = url || "";
      if (url) {
        localStorage.setItem("agrovision_api_base", url);
      } else {
        localStorage.removeItem("agrovision_api_base");
      }
    }
  };
})();
