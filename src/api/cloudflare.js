import { apiFetch } from "../lib/apiClient.js";

export async function apiRegister(email, password, name) {
  return apiFetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name })
  });
}
export async function apiLogin(email, password) {
  return apiFetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
}
export async function apiLogout() {
  return apiFetch("/api/auth/logout", { method: "POST" });
}
export async function apiMe() {
  return apiFetch("/api/auth/me");
}
export async function apiHealth() {
  return apiFetch("/api/health");
}
export async function apiListBlocks() {
  const r = await apiFetch("/api/blocks");
  return r.blocks || [];
}
export async function apiCreateBlock(content) {
  const r = await apiFetch("/api/blocks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content })
  });
  return r.block;
}
export async function apiUpdateBlock(id, content) {
  const r = await apiFetch(`/api/blocks/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content })
  });
  return r.block;
}
export async function apiDeleteBlock(id) {
  return apiFetch(`/api/blocks/${id}`, { method: "DELETE" });
}
export async function apiUploadImage(file) {
  const fd = new FormData();
  fd.append("file", file);
  const r = await apiFetch("/api/images", {
    method: "POST",
    body: fd
  });
  return r.image;
}
