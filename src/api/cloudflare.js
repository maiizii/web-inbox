// 统一 API 客户端（适配后端）
// 扩展：注册时支持 inviteCode

import { apiFetch } from "../lib/apiClient.js";

const DEBUG_API = false;

/* ============== Normalizers ============== */
function normalizeListResponse(r) {
  if (!r) return [];
  if (Array.isArray(r)) return r;
  if (Array.isArray(r.blocks)) return r.blocks;
  if (Array.isArray(r.data)) return r.data;
  if (Array.isArray(r.items)) return r.items;
  return [];
}

function normalizeBlock(r) {
  if (!r) return null;
  if (r.block && typeof r.block === "object") {
    const b = r.block;
    if (b.id) return b;
  }
  if (r.id && (r.content !== undefined || r.text !== undefined || r.body !== undefined)) {
    return r;
  }
  return null;
}

/* ============== Auth ============== */
export async function apiRegister(email, password, name, inviteCode) {
  return apiFetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name, inviteCode })
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

/* ============== Blocks ============== */
export async function apiListBlocks() {
  const raw = await apiFetch("/api/blocks");
  const list = normalizeListResponse(raw);
  if (DEBUG_API) console.log("[apiListBlocks] raw=", raw, "normalized=", list);
  return list;
}

// Adaptive create (kept from earlier, but can simplify since backend fixed)
async function apiCreateRaw(payload) {
  const raw = await apiFetch("/api/blocks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return raw;
}

export async function apiCreateBlock(content, title) {
  // Title ignored by backend currently (no title column) – we just send content
  // Keep placeholder logic
  const normalized = (content && content.trim()) ? content : "";
  const resp = await apiCreateRaw({ content: normalized });
  const b = normalizeBlock(resp);
  if (!b) throw new Error("创建失败");
  return b;
}

export async function apiUpdateBlock(id, payload) {
  // Backend only accepts {content}; we keep 'title' optimistic in front-end only
  const body = { content: payload.content ?? "" };
  const raw = await apiFetch(`/api/blocks/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const block = normalizeBlock(raw);
  if (!block) throw new Error("更新失败");
  return block;
}

export async function apiDeleteBlock(id) {
  return apiFetch(`/api/blocks/${id}`, { method: "DELETE" });
}

/* ============== Images ============== */
export async function apiUploadImage(file) {
  const fd = new FormData();
  fd.append("file", file);
  const raw = await apiFetch("/api/images", { method: "POST", body: fd });
  if (raw && raw.image && raw.image.url) return raw.image;
  if (raw && raw.url) return { url: raw.url };
  throw new Error("Image upload response invalid");
}
