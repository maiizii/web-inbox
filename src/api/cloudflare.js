const API = "/api";

async function request(path, { method = "GET", body, form } = {}) {
  const opts = {
    method,
    credentials: "include",
    headers: {}
  };
  if (form) {
    opts.body = form;
  } else if (body) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(API + path, opts);
  const ct = res.headers.get("Content-Type") || "";
  let data = null;
  if (ct.includes("application/json")) {
    data = await res.json();
  } else {
    data = await res.text();
  }
  if (!res.ok) {
    const err = (data && data.error) || res.status + " Error";
    throw new Error(err);
  }
  return data;
}

/* Auth */
export async function apiRegister(email, password, name) {
  return request("/auth/register", { method: "POST", body: { email, password, name } });
}
export async function apiLogin(email, password) {
  return request("/auth/login", { method: "POST", body: { email, password } });
}
export async function apiLogout() {
  return request("/auth/logout", { method: "POST" });
}
export async function apiMe() {
  try {
    const data = await request("/auth/me");
    return data.user;
  } catch {
    return null;
  }
}

/* Blocks */
export async function apiListBlocks() {
  const data = await request("/blocks");
  return data.blocks;
}
export async function apiCreateBlock(content) {
  const data = await request("/blocks", { method: "POST", body: { content } });
  return data.block;
}
export async function apiUpdateBlock(id, content) {
  const data = await request(`/blocks/${id}`, { method: "PUT", body: { content } });
  return data.block;
}
export async function apiDeleteBlock(id) {
  await request(`/blocks/${id}`, { method: "DELETE" });
  return true;
}

/* Images */
export async function apiUploadImage(file) {
  const form = new FormData();
  form.append("file", file);
  const data = await request("/images", { method: "POST", form });
  return data.image;
}
export function buildImageUrl(id) {
  return `/api/images/${id}`;
}
