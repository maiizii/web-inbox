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
export async function apiListBlocks() {
  const raw = await apiFetch("/api/blocks");
  return normList(raw);
}
export async function apiCreateBlock(content = "") {
  const raw = await apiFetch("/api/blocks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content })
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

// 覆盖原有的 apiChangePassword —— 多端点探测 + 统一文案
export async function apiChangePassword(old_password, new_password) {
  const endpoints = [
    "/api/password",               // 推荐后端落点（Pages Functions 示例已给过）
    "/api/user/password",
    "/api/user/change-password",
    "/api/account/password",
    "/api/profile/password",
    "/api/auth/password",
    "/api/auth/change-password",
    "/api/change-password"
  ];
  const payload = { old_password, new_password };

  const mapErr = (status, text = "") => {
    const s = (text || "").toLowerCase();
    if (status === 401 || status === 403) return "请输入正确的当前密码";
    if (
      s.includes("wrong password") || s.includes("invalid password") ||
      s.includes("incorrect password") || s.includes("旧密码") ||
      s.includes("原密码") || s.includes("密码错误") || s.includes("current password")
    ) return "请输入正确的当前密码";
    if (s.includes("user not found") || s.includes("no such user")) return "请输入正确的当前密码";
    if (status === 404) return "修改密码接口未部署";
    return `HTTP ${status}${text ? " - " + text : ""}`;
  };

  let last404 = null;
  for (const url of endpoints) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload)
    });

    let bodyMsg = "";
    try {
      const j = await res.clone().json();
      bodyMsg = j?.message || j?.error || "";
    } catch {
      try { bodyMsg = await res.clone().text(); } catch { bodyMsg = ""; }
    }

    if (res.status === 404) { last404 = new Error("修改密码接口未部署"); continue; }
    if (!res.ok) throw new Error(mapErr(res.status, bodyMsg));
    return (bodyMsg && typeof bodyMsg === "object") ? bodyMsg : { ok: true, endpoint: url };
  }
  throw last404 || new Error("修改密码接口未部署");
}
