/* =========================================================
   AgroVision — Authentication Controller
   Manages client session and credentials.

   Security notes:
   - Passwords are never stored in plaintext: signup stores a
     per-user random salt + SHA-256 hash (WebCrypto). Legacy
     plaintext records are upgraded to salted hashes on their
     next successful login.
   - The dashboard is protected: requireLogin() redirects to
     the login page when no session exists.
   - This is client-side demo-grade auth; it must be replaced
     by server-side authentication before any real deployment.
   ========================================================= */

const USERS_KEY = "agrovision_users";
const SESSION_KEY = "agrovision_current_user";

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hashPassword(password, saltHex) {
  if (!window.crypto || !crypto.subtle) {
    throw new Error("Secure context required for password hashing. Open the app over HTTPS or localhost.");
  }
  const saltBytes = new Uint8Array(saltHex.match(/.{2}/g).map(h => parseInt(h, 16)));
  const material = new TextEncoder().encode(saltHex + ":" + password);
  const digest = await crypto.subtle.digest("SHA-256", concatBuffers(saltBytes, new Uint8Array(material)));
  return toHex(digest);
}

function concatBuffers(a, b) {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function randomSalt() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return toHex(bytes);
}

function getUsers() {
  return JSON.parse(localStorage.getItem(USERS_KEY) || "[]");
}

function saveUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function showTab(which) {
  const loginForm = document.getElementById("loginForm");
  const signupForm = document.getElementById("signupForm");
  const tabLogin = document.getElementById("tabLogin");
  const tabSignup = document.getElementById("tabSignup");
  const loginError = document.getElementById("loginError");
  const signupError = document.getElementById("signupError");

  if (loginError) loginError.classList.remove("show");
  if (signupError) signupError.classList.remove("show");

  if (which === "signup") {
    if (loginForm) loginForm.style.display = "none";
    if (signupForm) signupForm.style.display = "block";
    if (tabLogin) tabLogin.classList.remove("active");
    if (tabSignup) tabSignup.classList.add("active");
  } else {
    if (loginForm) loginForm.style.display = "block";
    if (signupForm) signupForm.style.display = "none";
    if (tabSignup) tabSignup.classList.remove("active");
    if (tabLogin) tabLogin.classList.add("active");
  }
}

function showAuthError(errorBox, message) {
  if (errorBox) {
    errorBox.textContent = message;
    errorBox.classList.add("show");
  }
}

async function handleSignup(event) {
  event.preventDefault();
  const nameInput = document.getElementById("signupName");
  const emailInput = document.getElementById("signupEmail");
  const passwordInput = document.getElementById("signupPassword");
  const errorBox = document.getElementById("signupError");

  const name = nameInput ? nameInput.value.trim() : "";
  const email = emailInput ? emailInput.value.trim().toLowerCase() : "";
  const password = passwordInput ? passwordInput.value : "";

  if (!name || !email || !password) {
    showAuthError(errorBox, "Please fill in all required fields.");
    return false;
  }

  const users = getUsers();
  if (users.some(u => u.email === email)) {
    showAuthError(errorBox, "An account with this email already exists. Try logging in instead.");
    return false;
  }

  let salt, hash;
  try {
    salt = randomSalt();
    hash = await hashPassword(password, salt);
  } catch (e) {
    showAuthError(errorBox, e.message);
    return false;
  }

  users.push({ name, email, salt, hash });
  saveUsers(users);

  // Auto-login upon registration
  localStorage.setItem(SESSION_KEY, JSON.stringify({ name, email }));
  window.location.href = "dashboard.html";
  return false;
}

async function handleLogin(event) {
  event.preventDefault();
  const emailInput = document.getElementById("loginEmail");
  const passwordInput = document.getElementById("loginPassword");
  const errorBox = document.getElementById("loginError");

  const email = emailInput ? emailInput.value.trim().toLowerCase() : "";
  const password = passwordInput ? passwordInput.value : "";

  if (!email || !password) {
    showAuthError(errorBox, "Please enter your email and password.");
    return false;
  }

  const users = getUsers();
  const match = users.find(u => u.email === email);

  if (!match) {
    showAuthError(errorBox, "Email or password is incorrect.");
    return false;
  }

  let valid = false;

  if (match.salt && match.hash) {
    // Current salted-hash format
    try {
      valid = (await hashPassword(password, match.salt)) === match.hash;
    } catch (e) {
      showAuthError(errorBox, e.message);
      return false;
    }
  } else if (typeof match.password === "string") {
    // Legacy plaintext record: verify once, then upgrade to salted hash
    valid = (match.password === password);
    if (valid) {
      const salt = randomSalt();
      match.salt = salt;
      match.hash = await hashPassword(password, salt);
      delete match.password;
      saveUsers(users);
    }
  }

  if (!valid) {
    showAuthError(errorBox, "Email or password is incorrect.");
    return false;
  }

  localStorage.setItem(SESSION_KEY, JSON.stringify({ name: match.name, email: match.email }));
  window.location.href = "dashboard.html";
  return false;
}

function logout() {
  localStorage.removeItem(SESSION_KEY);
  window.location.href = "login.html";
}

function requireLogin() {
  const session = localStorage.getItem(SESSION_KEY);
  if (!session) {
    // Protected route: no session means no access.
    window.location.href = "login.html";
    return null;
  }
  try {
    return JSON.parse(session);
  } catch (_) {
    localStorage.removeItem(SESSION_KEY);
    window.location.href = "login.html";
    return null;
  }
}

// On the login page: honor ?mode=signup
document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("tabSignup")) {
    const params = new URLSearchParams(window.location.search);
    if (params.get("mode") === "signup") {
      showTab("signup");
    }
  }
});
