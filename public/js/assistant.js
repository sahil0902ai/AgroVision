/* =========================================================
   AgroVision — Grounded AI Assistant (Gemini 2.5 Flash)
   Grounded strictly in verified session & database telemetry
   ========================================================= */

let activeRecordUuid = null;
let latestContextRecord = null;
let conversationHistory = [];
let isSending = false;

function getApiUrl(endpoint) {
  if (window.AGROVISION_CONFIG && typeof window.AGROVISION_CONFIG.getApiUrl === "function") {
    return window.AGROVISION_CONFIG.getApiUrl(endpoint);
  }
  return endpoint;
}

// Auth check
const currentUser = typeof requireLogin === "function" ? requireLogin() : null;
if (currentUser && document.getElementById("welcomeMsg")) {
  document.getElementById("welcomeMsg").textContent = `Welcome back, ${currentUser.name.split(" ")[0]}`;
}

// Populate today's date in header
const today = new Date();
const formattedDate = today.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
const todayDateEl = document.getElementById("todayDate");
if (todayDateEl) todayDateEl.textContent = formattedDate;

// Parse URL params for record_id
document.addEventListener("DOMContentLoaded", () => {
  const urlParams = new URLSearchParams(window.location.search);
  activeRecordUuid = urlParams.get("record_id") || urlParams.get("id") || urlParams.get("uuid");

  fetchContextRecord(activeRecordUuid);
});

async function fetchContextRecord(uuid) {
  const bannerDesc = document.getElementById("chatContextDesc");
  const sessionBadge = document.getElementById("chatSessionBadge");

  try {
    const endpoint = uuid 
      ? `/api/v1/records/${encodeURIComponent(uuid)}` 
      : `/api/v1/records?limit=1`;

    const res = await fetch(getApiUrl(endpoint));
    if (res.ok) {
      const data = await res.json();
      const record = Array.isArray(data) ? data[0] : data;

      if (record && record.record_uuid) {
        latestContextRecord = record;
        activeRecordUuid = record.record_uuid;

        if (bannerDesc) {
          const stage = record.growth_stage || "Flowering";
          const field = record.field_name || "Field A (Wardha)";
          bannerDesc.innerHTML = `<strong>Active Context:</strong> Record <code>${record.record_uuid.substring(0, 16)}…</code> · <em>${field}</em> · Crop Stage: ${stage}`;
        }
        if (sessionBadge) {
          sessionBadge.textContent = "● Telemetry Grounded";
          sessionBadge.style.background = "#ecfdf5";
          sessionBadge.style.color = "#059669";
        }
        return;
      }
    }
  } catch (err) {
    console.warn("Could not fetch active analysis context:", err);
  }

  if (bannerDesc) {
    bannerDesc.textContent = "Using real-time farm agronomic knowledge base & OpenWeather macroclimate";
  }
  if (sessionBadge) {
    sessionBadge.textContent = "● Live Assistant";
  }
}

function sendChip(promptText) {
  const input = document.getElementById("chatInput");
  if (input && !isSending) {
    input.value = promptText;
    sendMessage();
  }
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function renderMarkdown(md) {
  if (!md) return "";

  // Simple, robust Markdown parser
  let html = md;

  // Escape basic HTML except safe formatting
  html = html
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Headers
  html = html.replace(/^### (.*$)/gim, '<h4 style="margin:10px 0 4px; color:#0d3b2e; font-size:14px; font-weight:800;">$1</h4>');
  html = html.replace(/^## (.*$)/gim, '<h3 style="margin:12px 0 6px; color:#0d3b2e; font-size:15px; font-weight:800;">$1</h3>');
  html = html.replace(/^# (.*$)/gim, '<h2 style="margin:14px 0 8px; color:#0d3b2e; font-size:16px; font-weight:800;">$1</h2>');

  // Bold & Italics
  html = html.replace(/\*\*\*(.*?)\*\*\*/gim, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.*?)\*\*/gim, '<strong style="color:#0f172a;">$1</strong>');
  html = html.replace(/\*(.*?)\*/gim, '<em>$1</em>');

  // Inline Code
  html = html.replace(/`([^`]+)`/g, '<code style="background:#f1f5f9; color:#0f172a; padding:2px 6px; border-radius:4px; font-size:12px; font-family:monospace;">$1</code>');

  // Lists
  html = html.replace(/^\s*-\s+(.*$)/gim, '<li style="margin-left:18px; margin-bottom:4px; list-style-type:disc;">$1</li>');
  html = html.replace(/^\s*\*\s+(.*$)/gim, '<li style="margin-left:18px; margin-bottom:4px; list-style-type:disc;">$1</li>');
  html = html.replace(/^\s*(\d+)\.\s+(.*$)/gim, '<li style="margin-left:18px; margin-bottom:4px; list-style-type:decimal;">$2</li>');

  // Paragraph breaks
  html = html.replace(/\n\n+/g, '<br/><br/>');
  html = html.replace(/\n/g, '<br/>');

  return html;
}

async function sendMessage() {
  if (isSending) return;

  const input = document.getElementById("chatInput");
  const msgArea = document.getElementById("chatMessages");
  if (!input || !msgArea) return;

  const text = input.value.trim();
  if (!text) return;

  isSending = true;
  input.value = "";
  input.disabled = true;

  // Append user bubble
  const userBubble = document.createElement("div");
  userBubble.className = "chat-bubble chat-bubble-user";
  userBubble.textContent = text;
  msgArea.appendChild(userBubble);
  msgArea.scrollTop = msgArea.scrollHeight;

  // Append typing indicator bubble
  const typingBubble = document.createElement("div");
  typingBubble.className = "chat-bubble chat-bubble-assistant";
  typingBubble.id = "typingIndicator";
  typingBubble.innerHTML = `
    <div style="display:flex; align-items:center; gap:8px; color:#64748b; font-size:13px;">
      <span>🧠 Consulting Gemini &amp; Grounding Evidence…</span>
      <div style="display:inline-block; width:12px; height:12px; border:2px solid #059669; border-top-color:transparent; border-radius:50%; animation:spin 0.8s linear infinite;"></div>
    </div>
  `;
  msgArea.appendChild(typingBubble);
  msgArea.scrollTop = msgArea.scrollHeight;

  const fieldSelect = document.getElementById("fieldSelect");
  const fieldName = fieldSelect ? fieldSelect.options[fieldSelect.selectedIndex].text : "Field A — Wardha South";

  try {
    const payload = {
      message: text,
      record_uuid: activeRecordUuid,
      field_name: fieldName,
      history: conversationHistory.slice(-8)
    };

    const res = await fetch(getApiUrl("/api/chat"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      throw new Error(`Chat service returned status ${res.status}`);
    }

    const data = await res.json();
    const replyText = data.reply || "I am currently unable to process your request.";
    const modelUsed = data.model_used || "gemini-2.5-flash";
    const sources = data.sources || ["AgroVision Multimodal Engine"];

    // Update conversation history
    conversationHistory.push({ role: "user", text: text });
    conversationHistory.push({ role: "model", text: replyText });

    // Remove typing indicator
    if (typingBubble && typingBubble.parentNode) {
      typingBubble.parentNode.removeChild(typingBubble);
    }

    // Append Assistant response bubble
    const replyBubble = document.createElement("div");
    replyBubble.className = "chat-bubble chat-bubble-assistant";
    
    const formattedHtml = renderMarkdown(replyText);
    const sourceTags = sources.map(s => `<span style="background:#f1f5f9; color:#475569; padding:2px 8px; border-radius:999px; font-size:10px; font-weight:700;">${s}</span>`).join(" ");

    replyBubble.innerHTML = `
      <div style="font-size:13.5px; line-height:1.55; color:#1e293b;">
        ${formattedHtml}
      </div>
      <div style="margin-top:12px; padding-top:8px; border-top:1px solid #f1f5f9; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
        <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
          ${sourceTags}
        </div>
        <span style="font-size:10.5px; color:#059669; font-weight:700;">
          ✨ Powered by ${modelUsed}
        </span>
      </div>
    `;

    msgArea.appendChild(replyBubble);
    msgArea.scrollTop = msgArea.scrollHeight;

  } catch (err) {
    console.error("Chat error:", err);
    if (typingBubble && typingBubble.parentNode) {
      typingBubble.parentNode.removeChild(typingBubble);
    }

    const errorBubble = document.createElement("div");
    errorBubble.className = "chat-bubble chat-bubble-assistant";
    errorBubble.innerHTML = `
      <strong style="color:#dc2626;">Service Notification</strong>
      <p style="margin:4px 0 0; color:#334155;">
        ${err.message || "Could not reach Gemini service. Please verify server connectivity."}
      </p>
    `;
    msgArea.appendChild(errorBubble);
    msgArea.scrollTop = msgArea.scrollHeight;
  } finally {
    isSending = false;
    input.disabled = false;
    input.focus();
  }
}
