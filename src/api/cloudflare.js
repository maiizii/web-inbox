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

//  apiChangePassword 
export async function apiChangePassword(old_password, new_password) {
  // 明确拿当前账号
  let email = null;
  try {
    const me = await apiMe();
    email = me?.email || null;
  } catch {}
  if (!email) throw Object.assign(new Error("未登录，请重新登录"), { _trace: "[PRE] apiMe 无法获取 email" });

  const endpoints = [
    "/api/auth/password",
    "/api/user/password",
    "/api/account/password",
    "/api/profile/password",
    "/api/user/change-password",
    "/api/auth/change-password",
    "/api/change-password",
    "/api/password" // Pages Functions 兜底实现
  ];
  const payload = { email, old_password, new_password };

  const trace = [];
  const readBody = async (res) => {
    let json = null, text = "";
    try { json = await res.clone().json(); } catch {}
    try { text = await res.clone().text(); } catch {}
    return { json, text };
  };
  const mapErr = (status, text = "") => {
    const s = (text || "").toLowerCase();
    if ((status === 401 || status === 403) && /(not\s*logged\s*in|login\s*required|请.*登录|未登录)/i.test(s)) return "未登录，请重新登录";
    if (
      status === 401 || status === 403 ||
      /(wrong|invalid|incorrect).*(old|current).*(pass)/i.test(s) ||
      /旧密码|原密码|当前密码|user.*not.*found|no.*such.*user|账号不存在/i.test(s)
    ) return "请输入正确的当前密码";
    if (status === 404) return "修改密码接口未部署";
    return text || `HTTP ${status}`;
  };

  let saw404 = false;
  for (const url of endpoints) {
    const res = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const { json, text } = await readBody(res);
    const bodyMsg = (json && (json.message || json.error)) || text || "";
    trace.push(`${url} -> ${res.status}${bodyMsg ? ` | ${bodyMsg.slice(0,120)}` : ""}`);

    if (res.status === 404) { saw404 = true; continue; }
    if (res.ok) {
      if (json && typeof json === "object" && json.ok === false) {
        throw Object.assign(new Error(mapErr(400, bodyMsg)), { _trace: trace.join("\n") });
      }
      return Object.assign(json || { ok: true }, { _trace: trace.join("\n"), _endpoint: url });
    }
    throw Object.assign(new Error(mapErr(res.status, bodyMsg)), { _trace: trace.join("\n") });
  }
  throw Object.assign(new Error(saw404 ? "修改密码接口未部署" : "修改密码失败"), { _trace: trace.join("\n") });
}

