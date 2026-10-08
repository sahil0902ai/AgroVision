/* =========================================================
   AgroVision — API & Environment Configuration
   Supports local FastAPI server, Vercel edge proxy, or remote backend.
   ========================================================= */

(function () {
  let defaultBase = "";
  if (typeof window !== "undefined") {
    const isFile = window.location.protocol === "file:";
    const isDifferentPort = window.location.port && window.location.port !== "8000";
    const isLocalHost = window.location.hostname === "localhost" || 
                        window.location.hostname === "127.0.0.1" || 
                        window.location.hostname === "0.0.0.0" || 
                        window.location.hostname.startsWith("192.168.") ||
                        window.location.hostname.startsWith("10.") ||
                        window.location.hostname.endsWith(".local");

    if (isFile || (isLocalHost && isDifferentPort)) {
      defaultBase = "http://127.0.0.1:8000";
    }
  }

  let effectiveBase = defaultBase;
  if (typeof localStorage !== "undefined") {
    const saved = localStorage.getItem("agrovision_api_base");
    if (saved && saved.trim()) {
      const isLocalUrl = saved.includes("localhost") || saved.includes("127.0.0.1") || saved.includes("0.0.0.0");
      const isLocalOrigin = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
      // Only permit localhost API base if actually running on a local development origin
      if (!isLocalUrl || isLocalOrigin) {
        effectiveBase = saved.trim();
      } else {
        localStorage.removeItem("agrovision_api_base");
      }
    }
  }

  window.AGROVISION_CONFIG = {
    // Effective API base URL
    API_BASE: effectiveBase,
    
    // Helper to construct full API URL
    getApiUrl: function (path) {
      if (!path) return this.API_BASE || "";
      if (!path.startsWith("/")) path = "/" + path;
      const base = this.API_BASE ? this.API_BASE.replace(/\/+$/, "") : "";
      return base + path;
    },
    
    // Set custom API Base URL at runtime
    setApiBase: function (url) {
      if (url && url.endsWith("/")) url = url.slice(0, -1);
      this.API_BASE = url || "";
      if (url && url.trim()) {
        localStorage.setItem("agrovision_api_base", url.trim());
      } else {
        localStorage.removeItem("agrovision_api_base");
      }
    }
  };
})();
