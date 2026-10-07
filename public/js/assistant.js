/* =========================================================
   AgroVision — AI Farming Assistant (Gemini Grounded Intelligence)
   Strictly grounded in verified analysis data & OpenWeather telemetry
   ========================================================= */

// Auth check
if (typeof requireLogin === "function") {
  requireLogin();
}

function getApiUrl(endpoint) {
  if (window.AGROVISION_CONFIG && typeof window.AGROVISION_CONFIG.getApiUrl === "function") {
    return window.AGROVISION_CONFIG.getApiUrl(endpoint);
  }
  return endpoint;
}

let activeRecordUuid = null;
let activeContextRecord = null;
let conversationHistory = [];
let isSending = false;

document.addEventListener("DOMContentLoaded", async () => {
  const urlParams = new URLSearchParams(window.location.search);
  activeRecordUuid = urlParams.get("record_id") || urlParams.get("id") || urlParams.get("uuid");
  const initialQuery = urlParams.get("q") || urlParams.get("prompt") || urlParams.get("message");

  // 1. Fetch analysis context
  await loadActiveAnalysisContext(activeRecordUuid);

  // 2. Verify AI Health & Connectivity
  await checkAssistantHealth();

  // 3. Auto-send initial query if provided in URL
  if (initialQuery && initialQuery.trim()) {
    sendPrompt(initialQuery.trim());
  }
});

// =========================================================
// CONTEXT LOADING
// =========================================================

async function loadActiveAnalysisContext(uuid) {
  const titleEl = document.getElementById("contextTitle");
  const subEl = document.getElementById("contextSub");
  const sessionBadge = document.getElementById("contextSessionBadge");

  try {
    const endpoint = uuid
      ? `/api/v1/records/${encodeURIComponent(uuid)}`
      : `/api/v1/records?limit=1`;

    const res = await fetch(getApiUrl(endpoint));
    if (res.ok) {
      const data = await res.json();
      const record = Array.isArray(data) ? data[0] : data;

      if (record && record.record_uuid) {
        activeContextRecord = record;
        activeRecordUuid = record.record_uuid;

        let topClass = "Evaluated Condition";
        try {
          if (record.cnn_predictions_json) {
            const cnn = JSON.parse(record.cnn_predictions_json);
            if (Object.keys(cnn).length > 0) {
              const topKey = Object.keys(cnn).reduce((a, b) => (cnn[a] > cnn[b] ? a : b));
              topClass = topKey.replace("_", " ").replace(/\b\w/g, l => l.toUpperCase());
            }
          }
        } catch (_) {}

        const sev = record.stress_severity || "Moderate";
        const field = record.field_name || "Field A — Wardha Parcel";
        const growth = record.growth_stage || "Vegetative";

        if (titleEl) {
          titleEl.textContent = `Active Analysis Context: ${field}`;
        }
        if (subEl) {
          subEl.innerHTML = `Record <code>${record.record_uuid.substring(0, 14)}…</code> · Stage: <strong>${growth}</strong> · Finding: <strong>${topClass}</strong> (${sev} Risk)`;
        }
        if (sessionBadge) {
          sessionBadge.textContent = "● Telemetry Grounded";
          sessionBadge.className = "context-badge context-badge-active";
        }
        return;
      }
    }
  } catch (err) {
    console.warn("Could not load active analysis context:", err);
  }

  // Fallback to general farm knowledge context
  if (titleEl) titleEl.textContent = "Farm Knowledge Base & OpenWeather Telemetry";
  if (subEl) subEl.textContent = "No specific leaf scan attached. Providing general cotton agronomic decision support.";
  if (sessionBadge) {
    sessionBadge.textContent = "● Live Agronomic Advisory";
    sessionBadge.className = "context-badge";
  }
}

// =========================================================
// SERVICE HEALTH CHECK
// =========================================================

async function checkAssistantHealth() {
  const alertCard = document.getElementById("serviceUnavailableAlert");
  const notifBadge = document.getElementById("notifModelStatusBadge");

  try {
    const res = await fetch(getApiUrl("/api/health"));
    if (res.ok) {
      const health = await res.json();
      if (!health.gemini_api_configured && health.status === "degraded") {
        if (alertCard) alertCard.style.display = "block";
        if (notifBadge) {
          notifBadge.textContent = "Fallback Mode";
          notifBadge.style.background = "#fef3c7";
          notifBadge.style.color = "#d97706";
        }
      } else {
        if (alertCard) alertCard.style.display = "none";
        if (notifBadge) {
          notifBadge.textContent = "Gemini Active";
          notifBadge.style.background = "#ecfdf5";
          notifBadge.style.color = "#059669";
        }
      }
    }
  } catch (err) {
    console.warn("Health check error:", err);
  }
}

function retryGeminiConnection() {
  const alertCard = document.getElementById("serviceUnavailableAlert");
  if (alertCard) alertCard.style.display = "none";
  checkAssistantHealth();
}

// =========================================================
// CHAT INTERACTION & MESSAGE STREAM
// =========================================================

function sendPrompt(promptText) {
  const input = document.getElementById("chatInputField");
  if (input && !isSending) {
    input.value = promptText;
    handleSendMessage();
  }
}

function handleInputKeydown(event) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    handleSendMessage();
  }
}

async function handleSendMessage() {
  if (isSending) return;

  const input = document.getElementById("chatInputField");
  const stream = document.getElementById("messagesStream");
  const welcomeState = document.getElementById("chatWelcomeState");
  const sendBtn = document.getElementById("chatSendBtn");
  const scrollArea = document.getElementById("chatConversationArea");

  if (!input || !stream) return;

  const text = input.value.trim();
  if (!text) return;

  isSending = true;
  input.value = "";
  input.disabled = true;
  if (sendBtn) sendBtn.disabled = true;

  // Hide empty welcome state on first message
  if (welcomeState) {
    welcomeState.style.display = "none";
  }

  // 1. Render User Message Bubble
  const userRow = document.createElement("div");
  userRow.className = "message-row user-row";
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  userRow.innerHTML = `
    <div class="message-bubble user-bubble">
      <div>${escapeHtml(text)}</div>
      <div style="font-size:10px; color:rgba(255,255,255,0.85); text-align:right; margin-top:4px;">
        ${timeStr}
      </div>
    </div>
  `;
  stream.appendChild(userRow);
  if (scrollArea) scrollArea.scrollTop = scrollArea.scrollHeight;

  // 2. Render Typing Indicator
  const typingRow = document.createElement("div");
  typingRow.className = "message-row assistant-row";
  typingRow.id = "typingIndicatorRow";
  typingRow.innerHTML = `
    <div class="message-bubble assistant-bubble">
      <div style="display:flex; align-items:center; gap:8px; color:#475569; font-size:12.5px;">
        <span>🧠 Consulting Gemini &amp; grounding telemetry…</span>
        <div style="display:inline-block; width:12px; height:12px; border:2px solid #059669; border-top-color:transparent; border-radius:50%; animation:spin 0.8s linear infinite;"></div>
      </div>
    </div>
  `;
  stream.appendChild(typingRow);
  if (scrollArea) scrollArea.scrollTop = scrollArea.scrollHeight;

  // 3. Dispatch to /api/chat
  try {
    const payload = {
      message: text,
      record_uuid: activeRecordUuid,
      field_name: activeContextRecord?.field_name || "Wardha Field",
      history: conversationHistory.slice(-8)
    };

    const res = await fetch(getApiUrl("/api/chat"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      if (res.status === 503) {
        throw new Error("503 Service Unavailable: Gemini AI model is currently under high demand. Deterministic screening remains fully active.");
      }
      throw new Error(`Chat service error (${res.status}): ${res.statusText}`);
    }

    const data = await res.json();
    const replyText = data.reply || "I evaluated your inquiry against verified agricultural data.";
    const modelUsed = data.model_used || "gemini-2.5-flash";
    const status = data.status || "ok";

    // Update conversation history
    conversationHistory.push({ role: "user", content: text });
    conversationHistory.push({ role: "assistant", content: replyText });

    // Remove typing indicator
    const typingIndicator = document.getElementById("typingIndicatorRow");
    if (typingIndicator) typingIndicator.remove();

    // 4. Render Assistant Reply Bubble
    const assistantRow = document.createElement("div");
    assistantRow.className = "message-row assistant-row";

    const formattedHtml = renderMarkdown(replyText);
    const sourceBadgesHtml = `
      <span class="source-tag">CNN Visual</span>
      <span class="source-tag">SNN Telemetry</span>
      <span class="source-tag">OpenWeather</span>
      <span class="source-tag">Expert Rules</span>
    `;

    const modelBadge = status === "fallback"
      ? `<span style="color:#d97706; font-weight:700;">🛡️ Grounded Rule Engine</span>`
      : `<span style="color:#059669; font-weight:700;">✨ Powered by ${modelUsed}</span>`;

    assistantRow.innerHTML = `
      <div class="message-bubble assistant-bubble">
        <div style="font-size:13px; line-height:1.55; color:#0f172a;">
          ${formattedHtml}
        </div>
        <div class="message-footer">
          <div style="display:flex; align-items:center; gap:4px; flex-wrap:wrap;">
            ${sourceBadgesHtml}
          </div>
          <div>${modelBadge} · ${timeStr}</div>
        </div>
      </div>
    `;

    stream.appendChild(assistantRow);
    if (scrollArea) scrollArea.scrollTop = scrollArea.scrollHeight;

  } catch (err) {
    console.error("Chat failure:", err);

    // Remove typing indicator
    const typingIndicator = document.getElementById("typingIndicatorRow");
    if (typingIndicator) typingIndicator.remove();

    // Render Error Bubble / Service Unavailable Alert
    const errorRow = document.createElement("div");
    errorRow.className = "message-row assistant-row";
    errorRow.innerHTML = `
      <div class="message-bubble assistant-bubble" style="border-color:#fecaca; background:#fef2f2;">
        <strong style="color:#991b1b; font-size:13px; display:block; margin-bottom:4px;">⚠️ Service Notification</strong>
        <p style="margin:0; font-size:12.5px; color:#334155; line-height:1.45;">
          ${escapeHtml(err.message || "Could not complete request with Gemini. Please verify server connectivity.")}
        </p>
      </div>
    `;
    stream.appendChild(errorRow);
    if (scrollArea) scrollArea.scrollTop = scrollArea.scrollHeight;

    // Show top alert
    const alertCard = document.getElementById("serviceUnavailableAlert");
    if (alertCard) alertCard.style.display = "block";

  } finally {
    isSending = false;
    input.disabled = false;
    if (sendBtn) sendBtn.disabled = false;
    input.focus();
  }
}

function clearChatConversation() {
  conversationHistory = [];
  const stream = document.getElementById("messagesStream");
  const welcomeState = document.getElementById("chatWelcomeState");
  if (stream) stream.innerHTML = "";
  if (welcomeState) welcomeState.style.display = "flex";
  const alertCard = document.getElementById("serviceUnavailableAlert");
  if (alertCard) alertCard.style.display = "none";
}

// =========================================================
// MARKDOWN & HTML FORMATTING
// =========================================================

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function renderMarkdown(md) {
  if (!md) return "";

  let html = md;

  // Escape HTML tags to prevent XSS
  html = html
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Headers
  html = html.replace(/^### (.*$)/gim, '<h4 style="margin:10px 0 4px; color:#0d3b2e; font-size:13.5px; font-weight:800;">$1</h4>');
  html = html.replace(/^## (.*$)/gim, '<h3 style="margin:12px 0 6px; color:#0d3b2e; font-size:14.5px; font-weight:800;">$1</h3>');
  html = html.replace(/^# (.*$)/gim, '<h2 style="margin:14px 0 8px; color:#0d3b2e; font-size:15.5px; font-weight:800;">$1</h2>');

  // Bold & Italics
  html = html.replace(/\*\*\*(.*?)\*\*\*/gim, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.*?)\*\*/gim, '<strong style="color:#0f172a;">$1</strong>');
  html = html.replace(/\*(.*?)\*/gim, '<em>$1</em>');

  // Inline Code
  html = html.replace(/`([^`]+)`/g, '<code style="background:#f1f5f9; color:#0f172a; padding:2px 6px; border-radius:4px; font-size:11.5px; font-family:monospace;">$1</code>');

  // Unordered Lists
  html = html.replace(/^\s*-\s+(.*$)/gim, '<li style="margin-left:18px; margin-bottom:4px; list-style-type:disc;">$1</li>');
  html = html.replace(/^\s*\*\s+(.*$)/gim, '<li style="margin-left:18px; margin-bottom:4px; list-style-type:disc;">$1</li>');

  // Numbered Lists
  html = html.replace(/^\s*(\d+)\.\s+(.*$)/gim, '<li style="margin-left:18px; margin-bottom:4px; list-style-type:decimal;">$2</li>');

  // Paragraph breaks
  html = html.replace(/\n\n+/g, '<br/><br/>');
  html = html.replace(/\n/g, '<br/>');

  return html;
}
