// Cloudflare Pages Functions - Unified handler for all routes
// 捕获所有路径：[[path]].js
// 仅处理以 /api/ 开头的请求，其他交给静态资源 (next())。
// SPA 回退由前端路由 & Pages 默认 index.html 提供。

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };
const SESSION_COOKIE = "sid";

// 入口
export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);

  try {
    if (url.pathname.startsWith("/api/")) {
      return await handleApi(request, env);
    }

    // 非 /api/ 交给静态资源与前端
    return await next();
  } catch (e) {
    console.error("API Fatal Error:", e);
    return json({ error: "Internal Error", detail: e.message }, 500);
  }
}

/* ================== API 路由 ================== */
async function handleApi(request, env) {
  const url = new URL(request.url);
  const { pathname } = url;
  const method = request.method.toUpperCase();

  // 无需会话的路由
  if (pathname === "/api/health" && method === "GET") {
    return json({ ok: true, ts: Date.now() });
  }

  // Session & User
  const session = await getSessionFromRequest(request, env);
  const user = session ? await getUserById(env, session.userId) : null;

  // Auth
  if (pathname === "/api/auth/register" && method === "POST") return register(request, env);
  if (pathname === "/api/auth/login" && method === "POST") return login(request, env);
  if (pathname === "/api/auth/logout" && method === "POST") {
    requireAuth(user);
    return logout(request, env);
  }
  if (pathname === "/api/auth/me" && method === "GET") {
    requireAuth(user);
    return json({ user: publicUser(user) });
  }

  // Blocks
  if (pathname === "/api/blocks" && method === "GET") {
    requireAuth(user);
    return listBlocks(env, user.id);
  }
  if (pathname === "/api/blocks" && method === "POST") {
    requireAuth(user);
    return createBlock(request, env, user.id);
  }
  const blockMatch = pathname.match(/^\/api\/blocks\/([^/]+)$/);
  if (blockMatch) {
    requireAuth(user);
    const blockId = blockMatch[1];
    if (method === "PUT") return updateBlock(request, env, user.id, blockId);
    if (method === "DELETE") return deleteBlock(env, user.id, blockId);
  }

  // Images
  if (pathname === "/api/images" && method === "POST") {
    requireAuth(user);
    return uploadImage(request, env, user.id);
  }
  const imageMatch = pathname.match(/^\/api\/images\/([^/]+)$/);
  if (imageMatch && method === "GET") {
    requireAuth(user);
    return getImage(env, user.id, imageMatch[1]);
  }

  return json({ error: "Not Found" }, 404);
}

/* ================== Auth ================== */

async function register(request, env) {
  const { email, password, name } = await parseJson(request);
  if (!email || !password) return json({ error: "缺少 email 或 password" }, 400);

  const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ?")
    .bind(email)
    .first();
  if (existing) return json({ error: "邮箱已注册" }, 400);

  const id = crypto.randomUUID();
  const password_hash = await hashPassword(password);
  const created_at = new Date().toISOString();

  await env.DB.prepare(
    "INSERT INTO users (id, email, password_hash, name, created_at) VALUES (?, ?, ?, ?, ?)"
  ).bind(id, email, password_hash, name || null, created_at).run();

  return json({ user: { id, email, name, created_at } }, 201);
}

async function login(request, env) {
  const { email, password } = await parseJson(request);
  if (!email || !password) return json({ error: "缺少 email 或 password" }, 400);

  const row = await env.DB.prepare(
    "SELECT id, email, password_hash, name, created_at FROM users WHERE email = ?"
  ).bind(email).first();

  if (!row) return json({ error: "用户不存在" }, 400);
  const ok = await verifyPassword(password, row.password_hash);
  if (!ok) return json({ error: "密码错误" }, 401);

  const token = generateToken();
  const ttlSec = parseInt(env.SESSION_TTL_SECONDS || "604800", 10);
  const exp = Date.now() + ttlSec * 1000;

  await env.KV.put(`session:${token}`, JSON.stringify({ userId: row.id, exp }), {
    expirationTtl: ttlSec
  });

  return json({ user: publicUser(row) }, 200, setSessionCookie(token, ttlSec));
}

async function logout(request, env) {
  const session = await getSessionFromRequest(request, env);
  if (session) {
    await env.KV.delete(`session:${session.token}`);
  }
  return json({ ok: true }, 200, clearSessionCookie());
}

/* ================== Blocks ================== */

async function listBlocks(env, userId) {
  const rs = await env.DB.prepare(
    "SELECT id, content, created_at, updated_at FROM blocks WHERE user_id = ? ORDER BY created_at ASC"
  ).bind(userId).all();
  return json({ blocks: rs.results || [] });
}

async function createBlock(request, env, userId) {
  const { content } = await parseJson(request);
  if (!content) return json({ error: "缺少 content" }, 400);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await env.DB.prepare(
    "INSERT INTO blocks (id, user_id, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
  ).bind(id, userId, content, now, now).run();

  return json({ block: { id, content, created_at: now, updated_at: now } }, 201);
}

async function updateBlock(request, env, userId, blockId) {
  const { content } = await parseJson(request);
  if (!content) return json({ error: "缺少 content" }, 400);

  const owned = await env.DB.prepare(
    "SELECT id FROM blocks WHERE id = ? AND user_id = ?"
  ).bind(blockId, userId).first();
  if (!owned) return json({ error: "不存在或无权限" }, 404);

  const now = new Date().toISOString();
  await env.DB.prepare(
    "UPDATE blocks SET content = ?, updated_at = ? WHERE id = ?"
  ).bind(content, now, blockId).run();

  return json({ block: { id: blockId, content, updated_at: now } });
}

async function deleteBlock(env, userId, blockId) {
  await env.DB.prepare(
    "DELETE FROM blocks WHERE id = ? AND user_id = ?"
  ).bind(blockId, userId).run();
  return json({ ok: true });
}

/* ================== Images ================== */

async function uploadImage(request, env, userId) {
  const ct = request.headers.get("Content-Type") || "";
  if (!ct.startsWith("multipart/form-data"))
    return json({ error: "需要 multipart/form-data" }, 400);

  const formData = await request.formData();
  const file = formData.get("file");
  if (!file || typeof file === "string") return json({ error: "未找到文件" }, 400);

  const buf = await file.arrayBuffer();
  const size = buf.byteLength;
  if (size > 2 * 1024 * 1024) return json({ error: "文件过大 (>2MB)" }, 400);

  const id = crypto.randomUUID();
  const mime = file.type || "application/octet-stream";
  const created_at = new Date().toISOString();

  await env.DB.prepare(
    "INSERT INTO images (id, user_id, mime, size, created_at) VALUES (?, ?, ?, ?, ?)"
  ).bind(id, userId, mime, size, created_at).run();

  await env.KV.put(`image:${id}`, buf); // 二进制存 KV

  return json({ image: { id, mime, size, url: `/api/images/${id}`, created_at } }, 201);
}

async function getImage(env, userId, id) {
  const row = await env.DB.prepare(
    "SELECT mime, user_id FROM images WHERE id = ?"
  ).bind(id).first();
  if (!row) return json({ error: "不存在" }, 404);
  if (row.user_id !== userId) return json({ error: "无权限" }, 403);

  const data = await env.KV.get(`image:${id}`, "arrayBuffer");
  if (!data) return json({ error: "内容缺失" }, 404);

  return new Response(data, {
    headers: {
      "Content-Type": row.mime,
      "Cache-Control": "public, max-age=31536000, immutable"
    }
  });
}

/* ================== Session & User Helpers ================== */

async function getSessionFromRequest(request, env) {
  const cookie = parseCookie(request.headers.get("Cookie") || "");
  const token = cookie[SESSION_COOKIE];
  if (!token) return null;
  const raw = await env.KV.get(`session:${token}`);
  if (!raw) return null;
  const obj = JSON.parse(raw);
  if (Date.now() > obj.exp) {
    await env.KV.delete(`session:${token}`);
    return null;
  }
  return { token, ...obj };
}

async function getUserById(env, id) {
  if (!id) return null;
  return await env.DB.prepare(
    "SELECT id, email, name, created_at FROM users WHERE id = ?"
  ).bind(id).first();
}

function publicUser(u) {
  if (!u) return null;
  return { id: u.id, email: u.email, name: u.name, created_at: u.created_at };
}

function requireAuth(user) {
  if (!user) throw new HttpError(401, "未认证");
}

/* ================== Crypto (password) ================== */

async function hashPassword(password) {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    "raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveBits"]
  );
  const iterations = 150000;
  const hashBuffer = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    keyMaterial,
    256
  );
  const hash = new Uint8Array(hashBuffer);
  return `pbkdf2$${iterations}$${b64(salt)}$${b64(hash)}`;
}

async function verifyPassword(password, stored) {
  try {
    const [scheme, iterStr, saltB64, hashB64] = stored.split("$");
    if (scheme !== "pbkdf2") return false;
    const iterations = parseInt(iterStr, 10);
    const salt = b64ToBytes(saltB64);
    const hash = b64ToBytes(hashB64);
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      "raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveBits"]
    );
    const testBuffer = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
      keyMaterial,
      256
    );
    const testHash = new Uint8Array(testBuffer);
    return timingSafeEqual(hash, testHash);
  } catch {
    return false;
  }
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/* ================== Utils ================== */

function json(obj, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders }
  });
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function parseJson(request) {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, "JSON 解析失败");
  }
}

function parseCookie(str) {
  return Object.fromEntries(
    str.split(/;\s*/).filter(Boolean).map(c => {
      const eq = c.indexOf("=");
      if (eq === -1) return [c, ""];
      return [c.slice(0, eq), c.slice(eq + 1)];
    })
  );
}

function setSessionCookie(token, ttlSec) {
  const cookie = `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${ttlSec}`;
  return { "Set-Cookie": cookie };
}

function clearSessionCookie() {
  return { "Set-Cookie": `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0` };
}

function generateToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let str = btoa(String.fromCharCode(...bytes));
  return str.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64(u8) {
  return btoa(String.fromCharCode(...u8));
}

function b64ToBytes(b64str) {
  const bin = atob(b64str);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}
