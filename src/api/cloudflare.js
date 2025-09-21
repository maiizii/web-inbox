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
// 彻底替换：由调用方传入 email；不再依赖 apiMe()
export async function apiChangePassword(old_password, new_password, email) {
  const endpoints = [
    "/api/auth/password",
    "/api/user/password",
    "/api/account/password",
    "/api/profile/password",
    "/api/user/change-password",
    "/api/auth/change-password",
    "/api/change-password",
    "/api/password" // Pages Functions 兜底
  ];

  const trace = [];
  if (!email) {
    trace.push("[PRE] no email from caller");
    throw Object.assign(new Error("未登录，请重新登录"), { _trace: trace.join("\n") });
  }
  trace.push(`[PRE] email=${email}`);

  const mapErr = (status, text = "") => {
    const s = (text || "").toLowerCase();
    if ((status === 401 || status === 403) && /(not\s*logged\s*in|login\s*required|请.*登录|未登录)/i.test(s))
      return "未登录，请重新登录";
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
      body: JSON.stringify({ email, old_password, new_password })
    });

    let bodyMsg = "";
    try {
      const j = await res.clone().json();
      bodyMsg = j?.message || j?.error || "";
      // 业务失败但 200
      if (res.ok && j && typeof j === "object" && j.ok === false) {
        throw Object.assign(new Error(mapErr(400, bodyMsg)), {});
      }
    } catch {
      try { bodyMsg = await res.clone().text(); } catch {}
    }

    trace.push(`${url} -> ${res.status}${bodyMsg ? ` | ${bodyMsg.slice(0,120)}` : ""}`);

    if (res.status === 404) { saw404 = true; continue; }
    if (res.ok) return { ok: true, _endpoint: url, _trace: trace.join("\n") };

    throw Object.assign(new Error(mapErr(res.status, bodyMsg)), { _trace: trace.join("\n") });
  }

  throw Object.assign(new Error(saw404 ? "修改密码接口未部署" : "修改密码失败"), { _trace: trace.join("\n") });
}
