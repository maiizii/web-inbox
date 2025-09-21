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

  const pickMsg = (x) =>
    typeof x === "string" ? x : (x?.message || x?.error || x?.msg || "");

  const mapErr = (status, bodyOrText = "") => {
    const t = pickMsg(bodyOrText);
    const low = (t || "").toLowerCase();

    // 未登录 → 明确提示；不要混淆为密码错误
    if (status === 401 || status === 403) {
      if (/(unauth|not ?login|not logged in|未登录|未登入|token|session)/.test(low)) {
        return "未登录，请重新登录";
      }
      return "请输入正确的当前密码";
    }

    // 常见“旧/当前密码错误”语义
    if (status === 400 || status === 422) {
      if (
        /(wrong|invalid|incorrect).*(old|current).*(pass|password)/
          .test(low) ||
        /旧密码|原密码|当前密码/.test(low)
      ) {
        return "请输入正确的当前密码";
      }
    }

    // 账户不存在也统一按“请输入正确的当前密码”
    if (/user.*not.*found|no.*such.*user|账号不存在/.test(low)) {
      return "请输入正确的当前密码";
    }

    if (status === 404) return "修改密码接口未部署";
    return t || `HTTP ${status}`;
  };

  let last404 = null;

  for (const url of endpoints) {
    let res;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload)
      });
    } catch {
      // 网络异常：跳过尝试下一个
      continue;
    }

    let asJson = null;
    let asText = "";
    try { asJson = await res.clone().json(); } catch {}
    try { asText = await res.clone().text(); } catch {}

    if (res.status === 404) { last404 = new Error("修改密码接口未部署"); continue; }

    if (res.ok) {
      // 有些后端 200 但返回 { ok:false, message:"…" }
      if (asJson && typeof asJson === "object" && asJson.ok === false) {
        throw new Error(mapErr(400, asJson));
      }
      return asJson || { ok: true, endpoint: url };
    }

    throw new Error(mapErr(res.status, asJson || asText));
  }

  throw last404 || new Error("修改密码接口未部署");
}

