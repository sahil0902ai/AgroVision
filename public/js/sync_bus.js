/**
 * AgroVision — Real-Time State Synchronization Bus
 * Provides cross-tab and cross-component live synchronization without requiring full page reloads.
 * Uses Web BroadcastChannel API with window CustomEvent and localStorage fallback.
 */

(function (root) {
  const CHANNEL_NAME = "agrovision_sync_bus";
  let channel = null;
  try {
    if (typeof BroadcastChannel !== "undefined") {
      channel = new BroadcastChannel(CHANNEL_NAME);
    }
  } catch (e) {
    console.warn("BroadcastChannel not supported, falling back to window events.", e);
  }

  const listeners = new Map();

  const AgroVisionSync = {
    /**
     * Broadcast an event across all tabs and components
     * @param {string} type - Event type (e.g. 'analysisSaved', 'fieldChanged', 'reportGenerated', 'notifUpdated')
     * @param {any} data - Event payload
     */
    emit(type, data = {}) {
      const message = { type, data, timestamp: Date.now() };

      // 1. BroadcastChannel for other open browser tabs
      if (channel) {
        try {
          channel.postMessage(message);
        } catch (_) {}
      }

      // 2. Local storage event trigger for cross-tab fallback
      try {
        localStorage.setItem("agrovision_last_sync_event", JSON.stringify(message));
      } catch (_) {}

      // 3. Dispatch on current window for active page components
      window.dispatchEvent(new CustomEvent(`agrovision:${type}`, { detail: data }));
      window.dispatchEvent(new CustomEvent("agrovision:dataSync", { detail: message }));

      // 4. Run direct registered handlers
      if (listeners.has(type)) {
        listeners.get(type).forEach(cb => {
          try { cb(data); } catch (err) { console.error(`Sync handler error for ${type}:`, err); }
        });
      }
    },

    /**
     * Subscribe to a synchronization event
     * @param {string} type - Event type
     * @param {Function} callback - Handler function
     */
    on(type, callback) {
      if (typeof callback !== "function") return;
      if (!listeners.has(type)) {
        listeners.set(type, new Set());
      }
      listeners.get(type).add(callback);

      // Also listen to window CustomEvent
      window.addEventListener(`agrovision:${type}`, (e) => callback(e.detail));
    },

    /**
     * Remove event listener
     */
    off(type, callback) {
      if (listeners.has(type)) {
        listeners.get(type).delete(callback);
      }
    },

    /**
     * Get active field from local storage or default
     */
    getActiveField() {
      try {
        const stored = localStorage.getItem("agrovision_active_field");
        if (stored) return JSON.parse(stored);
      } catch (_) {}
      return {
        field_id: "field-a",
        field_name: "Field A — North Parcel",
        zone_label: "Zone 1 (Wardha / Sindi)",
        latitude: 20.9750,
        longitude: 78.7200,
        crop_stage: "Flowering",
        soil_type: "Deep Black Clay (Vertisol)"
      };
    },

    /**
     * Set active field and broadcast to all pages
     */
    setActiveField(fieldObj) {
      if (!fieldObj) return;
      try {
        localStorage.setItem("agrovision_active_field", JSON.stringify(fieldObj));
      } catch (_) {}
      this.emit("fieldChanged", fieldObj);
    }
  };

  // Listen to incoming messages from other tabs
  if (channel) {
    channel.onmessage = (event) => {
      const { type, data } = event.data || {};
      if (type && listeners.has(type)) {
        listeners.get(type).forEach(cb => {
          try { cb(data); } catch (err) { console.error(`Sync tab handler error for ${type}:`, err); }
        });
      }
      if (type) {
        window.dispatchEvent(new CustomEvent(`agrovision:${type}`, { detail: data }));
        window.dispatchEvent(new CustomEvent("agrovision:dataSync", { detail: event.data }));
      }
    };
  }

  // Cross-tab storage fallback listener
  window.addEventListener("storage", (e) => {
    if (e.key === "agrovision_last_sync_event" && e.newValue) {
      try {
        const { type, data } = JSON.parse(e.newValue);
        if (type && listeners.has(type)) {
          listeners.get(type).forEach(cb => cb(data));
        }
      } catch (_) {}
    }
  });

  // Re-sync data when user returns to tab
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      AgroVisionSync.emit("tabFocused", { timestamp: Date.now() });
    }
  });

  root.AgroVisionSync = AgroVisionSync;
})(typeof window !== "undefined" ? window : this);
