import { apiFetch } from "../lib/apiClient.js";

/**
 * Auth APIs（保持不变）
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
export async function apiMe() { return apiFetch("/api/auth/me"); }
export async function apiHealth() { return apiFetch("/api/health"); }

/**
 * Blocks
 * 后端若不支持 title 会忽略；若不允许空 content，会在外层调用处处理重试。
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
  if (!r || !r.block || !r.block.id) {
    throw Object.assign(new Error("Create block API returned invalid data"), { status: 500 });
  }
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
  if (!r || !r.block || !r.block.id) {
    throw Object.assign(new Error("Update block API returned invalid data"), { status: 500 });
  }
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
  if (!r || !r.image || !r.image.url) {
    throw Object.assign(new Error("Image upload API returned invalid data"), { status: 500 });
  }
  return r.image;
}
