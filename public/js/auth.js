/* =========================================================
   AgroVision — Authentication Controller
   Enterprise Database-Backed Authentication & Session Management
   Strictly connects to backend SQLite API: /api/auth/*
   ========================================================= */

const SESSION_KEY = "agrovision_current_user";

function getApiUrl(endpoint) {
  if (window.AGROVISION_CONFIG && typeof window.AGROVISION_CONFIG.getApiUrl === "function") {
    return window.AGROVISION_CONFIG.getApiUrl(endpoint);
  }
  return endpoint;
}

function getCurrentUser() {
  const session = localStorage.getItem(SESSION_KEY);
  if (!session) return null;
  try {
    return JSON.parse(session);
  } catch (_) {
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

function requireLogin() {
  const user = getCurrentUser();
  if (!user || !user.email) {
    window.location.href = "login.html";
    return null;
  }
  return user;
}

function logout() {
  const user = getCurrentUser();
  if (user && user.token) {
    fetch(getApiUrl("/api/auth/logout"), {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    }).catch(() => {});
  }
  localStorage.removeItem(SESSION_KEY);
  window.location.href = "login.html";
}

function showTab(which) {
  const loginForm = document.getElementById("loginForm");
  const signupForm = document.getElementById("signupForm");
  const forgotForm = document.getElementById("forgotForm");
  const tabLogin = document.getElementById("tabLogin");
  const tabSignup = document.getElementById("tabSignup");
  const tabForgot = document.getElementById("tabForgot");

  const loginError = document.getElementById("loginError");
  const signupError = document.getElementById("signupError");
  const forgotError = document.getElementById("forgotError");
  const forgotSuccess = document.getElementById("forgotSuccess");

  if (loginError) loginError.classList.remove("show");
  if (signupError) signupError.classList.remove("show");
  if (forgotError) forgotError.classList.remove("show");
  if (forgotSuccess) forgotSuccess.style.display = "none";

  if (loginForm) loginForm.style.display = which === "login" ? "block" : "none";
  if (signupForm) signupForm.style.display = which === "signup" ? "block" : "none";
  if (forgotForm) forgotForm.style.display = which === "forgot" ? "block" : "none";

  if (tabLogin) tabLogin.classList.toggle("active", which === "login");
  if (tabSignup) tabSignup.classList.toggle("active", which === "signup");
  if (tabForgot) tabForgot.classList.toggle("active", which === "forgot");
}

function showAuthError(errorBox, message) {
  if (errorBox) {
    errorBox.textContent = message;
    errorBox.classList.add("show");
  }
}

async function handleLogin(event) {
  event.preventDefault();
  const emailInput = document.getElementById("loginEmail");
  const passwordInput = document.getElementById("loginPassword");
  const errorBox = document.getElementById("loginError");
  const submitBtn = document.getElementById("loginSubmitBtn");

  const email = emailInput ? emailInput.value.trim().toLowerCase() : "";
  const password = passwordInput ? passwordInput.value : "";

  if (!email || !password) {
    showAuthError(errorBox, "Please enter your email and password.");
    return false;
  }

  if (errorBox) errorBox.classList.remove("show");
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = "Authenticating…";
  }

  try {
    const res = await fetch(getApiUrl("/api/auth/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.detail || data.message || "Invalid email or password.");
    }

    // Save authentic authenticated session
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      name: data.user.name,
      email: data.user.email,
      token: data.user.token
    }));

    window.location.href = "dashboard.html";
  } catch (err) {
    showAuthError(errorBox, err.message || "Login failed. Please verify your credentials.");
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = "Log In →";
    }
  }

  return false;
}

async function handleSignup(event) {
  event.preventDefault();
  const nameInput = document.getElementById("signupName");
  const emailInput = document.getElementById("signupEmail");
  const passwordInput = document.getElementById("signupPassword");
  const errorBox = document.getElementById("signupError");
  const submitBtn = document.getElementById("signupSubmitBtn");

  const name = nameInput ? nameInput.value.trim() : "";
  const email = emailInput ? emailInput.value.trim().toLowerCase() : "";
  const password = passwordInput ? passwordInput.value : "";

  if (!name || !email || !password) {
    showAuthError(errorBox, "Please fill in all required fields.");
    return false;
  }

  if (password.length < 6) {
    showAuthError(errorBox, "Password must be at least 6 characters long.");
    return false;
  }

  if (errorBox) errorBox.classList.remove("show");
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = "Creating Account…";
  }

  try {
    const res = await fetch(getApiUrl("/api/auth/register"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.detail || data.message || "Registration failed.");
    }

    // Save authentic authenticated session
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      name: data.user.name,
      email: data.user.email,
      token: data.user.token
    }));

    window.location.href = "dashboard.html";
  } catch (err) {
    showAuthError(errorBox, err.message || "Could not register account.");
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = "Create Account →";
    }
  }

  return false;
}

async function handleForgotPassword(event) {
  event.preventDefault();
  const emailInput = document.getElementById("forgotEmail");
  const errorBox = document.getElementById("forgotError");
  const successBox = document.getElementById("forgotSuccess");
  const submitBtn = document.getElementById("forgotSubmitBtn");
  const resetSection = document.getElementById("resetPasswordSection");

  const email = emailInput ? emailInput.value.trim().toLowerCase() : "";
  if (!email) {
    showAuthError(errorBox, "Please enter your registered email address.");
    return false;
  }

  if (errorBox) errorBox.classList.remove("show");
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = "Requesting Code…";
  }

  try {
    const res = await fetch(getApiUrl("/api/auth/forgot-password"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });

    const data = await res.json();
    if (successBox) {
      successBox.textContent = data.message || "Reset instructions generated.";
      successBox.style.display = "block";
    }
    if (resetSection) {
      resetSection.style.display = "block";
      const codeInput = document.getElementById("resetCode");
      if (codeInput && data.reset_code_preview) {
        codeInput.value = data.reset_code_preview;
      }
    }
  } catch (err) {
    showAuthError(errorBox, err.message || "Failed to process password recovery.");
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = "Send Verification Code";
    }
  }

  return false;
}

async function handleResetPassword(event) {
  event.preventDefault();
  const emailInput = document.getElementById("forgotEmail");
  const codeInput = document.getElementById("resetCode");
  const newPasswordInput = document.getElementById("resetNewPassword");
  const errorBox = document.getElementById("forgotError");
  const successBox = document.getElementById("forgotSuccess");
  const resetBtn = document.getElementById("resetSubmitBtn");

  const email = emailInput ? emailInput.value.trim().toLowerCase() : "";
  const reset_code = codeInput ? codeInput.value.trim() : "";
  const new_password = newPasswordInput ? newPasswordInput.value : "";

  if (!email || !reset_code || !new_password) {
    showAuthError(errorBox, "Please enter email, reset code, and new password.");
    return false;
  }

  if (new_password.length < 6) {
    showAuthError(errorBox, "New password must be at least 6 characters.");
    return false;
  }

  if (errorBox) errorBox.classList.remove("show");
  if (resetBtn) {
    resetBtn.disabled = true;
    resetBtn.innerHTML = "Updating Password…";
  }

  try {
    const res = await fetch(getApiUrl("/api/auth/reset-password"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, reset_code, new_password })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.detail || data.message || "Failed to reset password.");
    }

    if (successBox) {
      successBox.textContent = "Password updated successfully! Please log in with your new password.";
      successBox.style.display = "block";
    }

    setTimeout(() => {
      showTab("login");
      const loginEmail = document.getElementById("loginEmail");
      if (loginEmail) loginEmail.value = email;
    }, 1500);

  } catch (err) {
    showAuthError(errorBox, err.message || "Password reset failed.");
  } finally {
    if (resetBtn) {
      resetBtn.disabled = false;
      resetBtn.innerHTML = "Reset Password →";
    }
  }

  return false;
}

// On page load: check query parameters for signup or forgot mode
document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get("mode");
  if (mode === "signup") {
    showTab("signup");
  } else if (mode === "forgot" || mode === "reset") {
    showTab("forgot");
  }
});
