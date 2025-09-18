import { apiFetch } from "../lib/apiClient.js";

// 其它 auth 函数保持不变（略）

export async function apiListBlocks() {
  const r = await apiFetch("/api/blocks");
  return r.blocks || [];
}

export async function apiCreateRaw(payload) {
  // 直接发送指定 payload
  const r = await apiFetch("/api/blocks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return r;
}

// 原有签名保留（最简单模式）
export async function apiCreateBlock(content, title) {
  const body = { content };
  if (typeof title === "string") body.title = title;
  const r = await apiCreateRaw(body);
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

export async function apiUploadImage(file) {
  const fd = new FormData();
  fd.append("file", file);
  const r = await apiFetch("/api/images", { method: "POST", body: fd });
  if (!r || !r.image || !r.image.url) {
    throw Object.assign(new Error("Image upload API returned invalid data"), { status: 500 });
  }
  return r.image;
}
