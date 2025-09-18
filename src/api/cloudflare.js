import { apiFetch } from "../lib/apiClient.js";

/**
 * Auth APIs
 */
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

/**
 * Blocks
 * - 后端若暂不支持 title，会忽略该字段；前端已做兼容。
 */

export async function apiListBlocks() {
  const r = await apiFetch("/api/blocks");
  return r.blocks || [];
}

export async function apiCreateBlock(content, title) {
  const body = { content };
  if (typeof title === "string") body.title = title;
  const r = await apiFetch("/api/blocks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return r.block;
}

export async function apiUpdateBlock(id, payload) {
  const body = {};
  if (typeof payload.content === "string") body.content = payload.content;
  if (typeof payload.title === "string") body.title = payload.title;
  const r = await apiFetch(`/api/blocks/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return r.block;
}

export async function apiDeleteBlock(id) {
  return apiFetch(`/api/blocks/${id}`, { method: "DELETE" });
}

/**
 * Image Upload
 */
export async function apiUploadImage(file) {
  const fd = new FormData();
  fd.append("file", file);
  const r = await apiFetch("/api/images", {
    method: "POST",
    body: fd
  });
  return r.image;
}
