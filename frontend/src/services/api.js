import { API_BASE } from '../config.js';

// ==============================
// AUTH HELPERS
// ==============================

function getToken() {
  return localStorage.getItem("token");
}

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ==============================
// AUTH APIs
// ==============================

export async function registerUser({ name, email, password }) {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password }),
  });
  return res.json();
}

export async function loginUser({ email, password }) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const data = await res.json();

  if (data.success && data.token) {
    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));
  }

  return data;
}

// ==============================
// KYC PIPELINE (IMPORTANT)
// ==============================

export async function verifyDocument(identityFile, supportingFiles = []) {
  const formData = new FormData();
  formData.append("identity", identityFile);

  supportingFiles.forEach((file) => {
    formData.append("supporting", file);
  });

  const res = await fetch(`${API_BASE}/kyc/verify`, {
    method: "POST",
    headers: authHeaders(),
    body: formData,
  });

  return res.json();
}

// ==============================
// HISTORY
// ==============================

export async function getHistory() {
  const res = await fetch(`${API_BASE}/kyc/history`, {
    headers: authHeaders(),
  });
  return res.json();
}

// ==============================
// SESSION HELPERS
// ==============================

export function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
}

export function getCurrentUser() {
  const raw = localStorage.getItem("user");
  return raw ? JSON.parse(raw) : null;
}

export function isLoggedIn() {
  return !!getToken();
}