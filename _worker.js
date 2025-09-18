// _worker.js 运行于 Cloudflare Pages Functions 环境
// 基本上延续之前 worker.js 的逻辑，只是加上静态资源回退部分。

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };
const SESSION_COOKIE = "sid";

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);

      if (url.pathname.startsWith("/api/")) {
        return await handleApi(request, env, ctx);
      }

      // 非 /api/ 的请求：尝试静态资源
      let res = await env.ASSETS.fetch(request);

      // 如果静态资源不存在且不是直接访问某些真实文件（例如带点号的文件），则返回 index.html 做 SPA 回退
      if (res.status === 404 && shouldSpaFallback(url.pathname)) {
        const indexReq = new Request(new URL("/index.html", request.url), request);
        res = await env.ASSETS.fetch(indexReq);
      }
      return res;
    } catch (e) {
      return json({ error: "Internal Error", detail: e.message }, 500);
    }
  }
};

function shouldSpaFallback(pathname) {
  if (pathname === "/" || pathname === "") return true;
  // 有扩展名（.js/.css/.png...）的不回退
  if (/\.[a-zA-Z0-9]{2,8}$/.test(pathname)) return false;
  return true;
}

// 下面的全部 handleApi / Auth / Blocks / Images 逻辑与之前 worker.js 基本一致
async function handleApi(request, env, ctx) {
  const url = new URL(request.url);
  const { pathname } = url;
  const method = request.method.toUpperCase();

  // Session
  const session = await getSessionFromRequest(request, env);
  const user = session ? await getUserById(env, session.userId) : null;

  // Health
  if (pathname === "/api/health") return json({ ok: true });

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

  // Blocks root
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
  const imgMatch = pathname.match(/^\/api\/images\/([^/]+)$/);
  if (imgMatch && method === "GET") {
    requireAuth(user);
    return getImage(env, user.id, imgMatch[1]);
  }

  return json({ error: "Not Found" }, 404);
}

/* ==== 以下与之前 worker.js 中的帮助函数一致（直接复用） ==== */
function json(obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...JSON_HEADERS, ...extra }
  });
}
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
function requireAuth(user) { if (!user) throw new HttpError(401, "未认证"); }

async function parseJson(request) {
  try { return await request.json(); } catch { throw new HttpError(400, "JSON 解析失败"); }
}
function parseCookie(str) {
  return Object.fromEntries(
    str.split(/;\s*/).filter(Boolean).map(pair => {
      const i = pair.indexOf("="); if (i === -1) return [pair, ""];
      return [pair.slice(0, i), pair.slice(i + 1)];
    })
  );
}
function setSessionCookie(token, ttlSec) {
  return { "Set-Cookie": `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${ttlSec}` };
}
function clearSessionCookie() {
  return { "Set-Cookie": `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0` };
}
function generateToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let s = btoa(String.fromCharCode(...bytes));
  return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function hashPassword(password) {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveBits"]);
  const iterations = 150000;
  const hashBuffer = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, keyMaterial, 256);
  return `pbkdf2$${iterations}$${b64(salt)}$${b64(new Uint8Array(hashBuffer))}`;
}
async function verifyPassword(password, stored) {
  try {
    const [scheme, itStr, saltB64, hashB64] = stored.split("$");
    if (scheme !== "pbkdf2") return false;
    const iterations = parseInt(itStr);
    const salt = b64ToBytes(saltB64);
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveBits"]);
    const testBuf = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, keyMaterial, 256);
    return timingSafeEqual(b64ToBytes(hashB64), new Uint8Array(testBuf));
  } catch { return false; }
}
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0; for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
function b64(u8) { return btoa(String.fromCharCode(...u8)); }
function b64ToBytes(str) {
  const bin = atob(str); const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* Session */
async function getSessionFromRequest(request, env) {
  const cookieObj = parseCookie(request.headers.get("Cookie") || "");
  const token = cookieObj[SESSION_COOKIE];
  if (!token) return null;
  const raw = await env.KV.get(`session:${token}`);
  if (!raw) return null;
  const obj = JSON.parse(raw);
  if (Date.now() > obj.exp) { await env.KV.delete(`session:${token}`); return null; }
  return { token, ...obj };
}

/* User queries */
async function getUserById(env, id) {
  return await env.DB.prepare(
    "SELECT id, email, name, created_at FROM users WHERE id = ?"
  ).bind(id).first();
}
function publicUser(u) {
  if (!u) return null;
  return { id: u.id, email: u.email, name: u.name, created_at: u.created_at };
}

/* Auth handlers */
async function register(request, env) {
  const { email, password, name } = await parseJson(request);
  if (!email || !password) return json({ error: "缺少 email 或 password" }, 400);
  const ex = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
  if (ex) return json({ error: "邮箱已注册" }, 400);
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
  const ttlSec = parseInt(env.SESSION_TTL_SECONDS || "604800");
  const exp = Date.now() + ttlSec * 1000;
  await env.KV.put(`session:${token}`, JSON.stringify({ userId: row.id, exp }), { expirationTtl: ttlSec });
  return json({ user: publicUser(row) }, 200, setSessionCookie(token, ttlSec));
}

async function logout(request, env) {
  const s = await getSessionFromRequest(request, env);
  if (s) await env.KV.delete(`session:${s.token}`);
  return json({ ok: true }, 200, clearSessionCookie());
}

/* Blocks handlers */
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
  const row = await env.DB.prepare("SELECT id FROM blocks WHERE id = ? AND user_id = ?")
    .bind(blockId, userId).first();
  if (!row) return json({ error: "不存在或无权限" }, 404);
  const now = new Date().toISOString();
  await env.DB.prepare("UPDATE blocks SET content = ?, updated_at = ? WHERE id = ?")
    .bind(content, now, blockId).run();
  return json({ block: { id: blockId, content, updated_at: now } });
}
async function deleteBlock(env, userId, blockId) {
  await env.DB.prepare("DELETE FROM blocks WHERE id = ? AND user_id = ?")
    .bind(blockId, userId).run();
  return json({ ok: true });
}

/* Images */
async function uploadImage(request, env, userId) {
  const ct = request.headers.get("Content-Type") || "";
  if (!ct.startsWith("multipart/form-data")) return json({ error: "需要 multipart/form-data" }, 400);
  const fd = await request.formData();
  const file = fd.get("file");
  if (!file || typeof file === "string") return json({ error: "未找到文件" }, 400);
  const buf = await file.arrayBuffer();
  const size = buf.byteLength;
  if (size > 2 * 1024 * 1024) return json({ error: "文件过大 >2MB" }, 400);
  const id = crypto.randomUUID();
  const mime = file.type || "application/octet-stream";
  const created_at = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO images (id, user_id, mime, size, created_at) VALUES (?, ?, ?, ?, ?)"
  ).bind(id, userId, mime, size, created_at).run();
  await env.KV.put(`image:${id}`, buf);
  return json({ image: { id, mime, size, url: `/api/images/${id}`, created_at } }, 201);
}
async function getImage(env, userId, id) {
  const row = await env.DB.prepare("SELECT mime, user_id FROM images WHERE id = ?")
    .bind(id).first();
  if (!row) return json({ error: "不存在" }, 404);
  if (row.user_id !== userId) return json({ error: "无权限" }, 403);
  const bin = await env.KV.get(`image:${id}`, "arrayBuffer");
  if (!bin) return json({ error: "内容缺失" }, 404);
  return new Response(bin, {
    headers: {
      "Content-Type": row.mime,
      "Cache-Control": "public, max-age=31536000, immutable"
    }
  });
}
