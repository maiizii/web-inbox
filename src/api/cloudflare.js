// 通用 fetch 封装（你原本的 apiFetch 如果已有额外逻辑，可替换回去）
import { apiFetch } from "../lib/apiClient.js";

const DEBUG_API = false;

// 规范化：把各种返回结构统一成数组或 block 对象
function normalizeListResponse(r) {
  if (!r) return [];
  if (Array.isArray(r)) return r;
  if (Array.isArray(r.blocks)) return r.blocks;
  if (Array.isArray(r.data)) return r.data;
  // 有可能后端返回形如 { items:[...] }
  if (Array.isArray(r.items)) return r.items;
  return [];
}

function normalizeBlock(r) {
  if (!r) return null;
  if (r.block && typeof r.block === "object") {
    const b = r.block;
    if (b.id) return b;
  }
  // 扁平形式：直接是 block
  if (r.id && (r.content !== undefined || r.text !== undefined || r.body !== undefined)) {
    return r;
  }
  return null;
}

// 猜测内容字段名（从已知 block 对象）
export function guessContentFieldFromBlock(b) {
  if (!b) return "content";
  const priorities = ["content", "text", "body", "note", "value", "data"];
  for (const key of priorities) {
    if (typeof b[key] === "string") return key;
  }
  // fallback：找任意 string 且不是 id/title
  for (const [k, v] of Object.entries(b)) {
    if (typeof v === "string" && k !== "id" && k !== "title") return k;
  }
  return "content";
}

/* ================== Auth ================== */
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

/* ================== Blocks ================== */
export async function apiListBlocks() {
  const raw = await apiFetch("/api/blocks");
  const list = normalizeListResponse(raw);
  if (DEBUG_API) console.log("[apiListBlocks] raw=", raw, "normalized=", list);
  return list;
}

// 低级创建：直接发送 payload （payload 可能扁平或 {block:{}}）
async function apiCreateRaw(payload) {
  const raw = await apiFetch("/api/blocks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (DEBUG_API) console.log("[apiCreateRaw] payload=", payload, "resp=", raw);
  return raw;
}

// 自适应创建：尝试不同 payload 格式 / 字段名
export async function apiCreateAdaptive(baseContent = "", title = "") {
  // 允许空时用占位字符串
  const contentValue = baseContent && baseContent.trim() ? baseContent : " ";
  const candidatesFieldNames = ["content", "text", "body", "note", "value", "data"];
  const candidatesPayloads = [];

  for (const field of candidatesFieldNames) {
    const flat = { [field]: contentValue };
    if (title) flat.title = title;
    const flatNoTitle = { [field]: contentValue };
    const wrapped = { block: { ...flat } };
    const wrappedNoTitle = { block: { ...flatNoTitle } };
    candidatesPayloads.push(flat, flatNoTitle, wrapped, wrappedNoTitle);
  }

  const errors = [];

  for (const p of candidatesPayloads) {
    try {
      const resp = await apiCreateRaw(p);
      const block = normalizeBlock(resp);
      if (block && block.id) {
        if (DEBUG_API) console.log("[apiCreateAdaptive] success using payload", p);
        return block;
      }
      errors.push({ payload: p, error: "invalid shape" });
    } catch (e) {
      errors.push({ payload: p, error: e.message || String(e) });
    }
  }

  console.groupCollapsed("[apiCreateAdaptive] all attempts failed");
  console.table(
    errors.map(e => ({
      payload: JSON.stringify(e.payload),
      error: e.error
    }))
  );
  console.groupEnd();

  throw new Error("Unable to create block with adaptive strategy");
}

// 保持旧签名（如果后端恰好支持 content+title+{block:} 其中一种，上层也可继续用）
// 现在直接委托 adaptive
export async function apiCreateBlock(content, title) {
  return apiCreateAdaptive(content, title);
}

export async function apiUpdateBlock(id, payload) {
  // 我们不知道后端字段名，所以尝试：如果 payload.content 存在，则发两遍策略。
  const bodyCandidates = [];
  const baseFields = {};
  if (typeof payload.content === "string") {
    // 发送多种字段名
    ["content", "text", "body", "note", "value", "data"].forEach(fn => {
      bodyCandidates.push({ [fn]: payload.content, title: payload.title });
      bodyCandidates.push({ block: { [fn]: payload.content, title: payload.title } });
    });
  } else {
    bodyCandidates.push({ title: payload.title });
    bodyCandidates.push({ block: { title: payload.title } });
  }

  const errors = [];
  for (const b of bodyCandidates) {
    try {
      const raw = await apiFetch(`/api/blocks/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(b)
      });
      const block = normalizeBlock(raw);
      if (block && block.id) {
        if (DEBUG_API) console.log("[apiUpdateBlock adaptive] success with", b);
        return block;
      } else {
        errors.push({ payload: b, error: "invalid shape" });
      }
    } catch (e) {
      errors.push({ payload: b, error: e.message || String(e) });
    }
  }

  console.groupCollapsed("[apiUpdateBlock adaptive] all attempts failed");
  console.table(errors.map(e => ({
    payload: JSON.stringify(e.payload),
    error: e.error
  })));
  console.groupEnd();
  throw new Error("Unable to update block with adaptive strategy");
}

export async function apiDeleteBlock(id) {
  return apiFetch(`/api/blocks/${id}`, { method: "DELETE" });
}

/* ================== Image ================== */
export async function apiUploadImage(file) {
  const fd = new FormData();
  fd.append("file", file);
  const raw = await apiFetch("/api/images", { method: "POST", body: fd });
  if (raw && raw.image && raw.image.url) return raw.image;
  // 也许后端返回直接 {url:"..."}
  if (raw && raw.url) return { url: raw.url };
  throw new Error("Image upload response invalid");
}
