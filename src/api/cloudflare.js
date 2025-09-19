import { apiFetch } from "../lib/apiClient.js";

function normList(r) {
  if (!r) return [];
  if (Array.isArray(r)) return r;
  if (Array.isArray(r.blocks)) return r.blocks;
  return [];
}
function normBlock(r) {
  if (!r) return null;
  if (r.block) return r.block;
  if (r.id && "content" in r) return r;
  return null;
}

/* Auth */
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

/* Blocks */
export async function apiListBlocks(sortMode = "position") {
  const raw = await apiFetch(`/api/blocks?sort=${encodeURIComponent(sortMode)}`);
  return normList(raw);
}

export async function apiCreateBlock(content = "") {
  const raw = await apiFetch("/api/blocks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: content || "" })
  });
  const b = normBlock(raw);
  if (!b) throw new Error("创建失败");
  return b;
}

export async function apiUpdateBlock(id, { content }) {
  const raw = await apiFetch(`/api/blocks/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: content ?? "" })
  });
  const b = normBlock(raw);
  if (!b) throw new Error("更新失败");
  return b;
}

export async function apiDeleteBlock(id) {
  return apiFetch(`/api/blocks/${id}`, { method: "DELETE" });
}

export async function apiReorderBlocks(order) {
  return apiFetch("/api/blocks/reorder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ order })
  });
}

/* Images */
export async function apiUploadImage(file) {
  const fd = new FormData();
  fd.append("file", file);
  const raw = await apiFetch("/api/images", { method: "POST", body: fd });
  if (raw?.image?.url) return raw.image;
  if (raw?.url) return { url: raw.url };
  throw new Error("图片上传响应无效");
}
