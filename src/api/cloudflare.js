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
  const endpoints = [
    "/api/password",
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

    // 只有明确包含“未登录/请登录/not logged in/login required”才判未登录
    if ((status === 401 || status === 403) &&
        /(not\s*logged\s*in|login\s*required|请.*登录|未登录)/i.test(s)) {
      return "未登录，请重新登录";
    }

    // 其它 401/403、以及语义上的“旧/当前密码错误、用户不存在”→ 都当作当前密码错
    if (status === 401 || status === 403 ||
        /(wrong|invalid|incorrect).*(old|current).*(pass)/i.test(s) ||
        /旧密码|原密码|当前密码|user.*not.*found|no.*such.*user|账号不存在/i.test(s)) {
      return "请输入正确的当前密码";
    }

    if (status === 404) return "修改密码接口未部署";
    return text || `HTTP ${status}`;
  };

  let saw404 = false;

  for (const url of endpoints) {
    try {
      const data = await apiFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (data && typeof data === "object" && data.ok === false) {
        const msg = data.message || data.error || "";
        throw new Error(mapErr(400, msg));
      }
      return data || { ok: true, endpoint: url };
    } catch (e) {
      const msg = String(e?.message || "");
      if (/404/i.test(msg) || /not\s*found/i.test(msg)) { saw404 = true; continue; }
      const m = msg.match(/HTTP\s*(\d{3})/i);
      const status = m ? parseInt(m[1], 10) : 400;
      throw new Error(mapErr(status, msg));
    }
  }

  throw new Error(saw404 ? "修改密码接口未部署" : "修改密码失败");
}
