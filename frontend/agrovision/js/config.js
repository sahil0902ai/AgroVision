/* =========================================================
   AgroVision — API & Environment Configuration
   Supports local FastAPI server, Vercel edge proxy, or remote backend.
   ========================================================= */

(function () {
  // Default to relative path (works with local FastAPI and Vercel proxy rewrites)
  const savedApiBase = localStorage.getItem("agrovision_api_base");
  
  window.AGROVISION_CONFIG = {
    // If backend is deployed on Render/Railway/Fly.io, set this or enter it via settings
    API_BASE: savedApiBase || "",
    
    // Helper to construct full API URL
    getApiUrl: function (path) {
      if (!path.startsWith("/")) path = "/" + path;
      return (this.API_BASE || "") + path;
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
