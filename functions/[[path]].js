// Web Tips Cloudflare Pages Functions
// Features:
//  - Auth with sessions
//  - Invite code required (env.INVITE_CODE)
//  - Blocks CRUD + manual ordering (position) + reorder endpoint
//  - Ordering rule: position ASC, updated_at DESC, created_at DESC
//    (新建与内容保存都会把 position 归零，最近编辑/新建的记录因此自动置顶)
//  - Image upload
//  - PBKDF2 password hashing

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };
const SESSION_COOKIE = "sid";
let blockSchemaPromise = null;

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
    (str || "")
      .split(/;\s*/)
      .filter(Boolean)
      .map(p => {
        const i = p.indexOf("=");
        if (i < 0) return [p, ""];
        return [p.slice(0, i), p.slice(i + 1)];
      })
  );
}

function setSessionCookie(token, ttlSec) {
  return {
    "Set-Cookie": `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${ttlSec}`
  };
}
function clearSessionCookie() {
  return {
    "Set-Cookie": `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
  };
}
function generateToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let str = btoa(String.fromCharCode(...bytes));
  return str.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const b64 = u8 => btoa(String.fromCharCode(...u8));
function b64ToBytes(b64str) {
  const bin = atob(b64str);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/")) return next();
  try {
    return await route(request, env);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error("UNHANDLED ERROR:", e);
    return json({ error: "Internal Error" }, 500);
  }
}

async function route(request, env) {
  const url = new URL(request.url);
  const { pathname } = url;
  const method = request.method.toUpperCase();

  if (pathname === "/api/health" && method === "GET") {
    return json({ ok: true, ts: Date.now() });
  }

  const session = await getSession(request, env);
  const user = session ? await getUser(env, session.userId) : null;

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
  if (pathname === "/api/blocks/reorder" && method === "POST") {
    requireAuth(user);
    return reorderBlocks(request, env, user.id);
  }
  const blockStarredMatch = pathname.match(/^\/api\/blocks\/([^/]+)\/starred$/);
  if (blockStarredMatch && method === "PATCH") {
    requireAuth(user);
    return updateBlockStarred(request, env, user.id, blockStarredMatch[1]);
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

/* ================= Auth ================= */
async function register(request, env) {
  const { email, password, name, inviteCode } = await parseJson(request);
  if (!email || !password) throw new HttpError(400, "缺少 email 或 password");
  const required = env.INVITE_CODE;
  if (!required) throw new HttpError(500, "服务器未配置邀请码");
  if (!inviteCode || inviteCode !== required) throw new HttpError(400, "邀请码无效");

  const dup = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
  if (dup) throw new HttpError(400, "邮箱已注册");

  const id = crypto.randomUUID();
  const password_hash = await hashPassword(password, env);
  const created_at = new Date().toISOString();

  await env.DB.prepare(
    "INSERT INTO users (id, email, password_hash, name, created_at) VALUES (?, ?, ?, ?, ?)"
  ).bind(id, email, password_hash, name || null, created_at).run();

  return json({ user: { id, email, name, created_at } }, 201);
}

async function login(request, env) {
  const { email, password } = await parseJson(request);
  if (!email || !password) throw new HttpError(400, "缺少 email 或 password");
  const row = await env.DB.prepare(
    "SELECT id, email, password_hash, name, created_at FROM users WHERE email = ?"
  ).bind(email).first();
  if (!row) throw new HttpError(400, "用户不存在");
  const ok = await verifyPassword(password, row.password_hash);
  if (!ok) throw new HttpError(401, "密码错误");

  const token = generateToken();
  const ttlSec = parseInt(env.SESSION_TTL_SECONDS || "604800", 10);
  const exp = Date.now() + ttlSec * 1000;
  await env.KV.put(`session:${token}`, JSON.stringify({ userId: row.id, exp }), {
    expirationTtl: ttlSec
  });
  return json({ user: publicUser(row) }, 200, setSessionCookie(token, ttlSec));
}

async function logout(request, env) {
  const session = await getSession(request, env);
  if (session) await env.KV.delete(`session:${session.token}`);
  return json({ ok: true }, 200, clearSessionCookie());
}

/* ================= Blocks ================= */
async function ensureBlockSchema(env) {
  if (!blockSchemaPromise) {
    blockSchemaPromise = (async () => {
      const info = await env.DB.prepare("PRAGMA table_info(blocks)").all();
      const columns = new Set((info.results || []).map(row => row.name));
      const additions = [
        ["format", "ALTER TABLE blocks ADD COLUMN format TEXT NOT NULL DEFAULT 'text'"],
        ["starred", "ALTER TABLE blocks ADD COLUMN starred INTEGER NOT NULL DEFAULT 0"]
      ];
      for (const [column, sql] of additions) {
        if (columns.has(column)) continue;
        try {
          await env.DB.prepare(sql).run();
        } catch (error) {
          if (!/duplicate column/i.test(String(error?.message || error))) throw error;
        }
      }
    })().catch(error => {
      blockSchemaPromise = null;
      throw error;
    });
  }
  return blockSchemaPromise;
}

function normalizeBlockFormat(value) {
  return value === "markdown" ? "markdown" : "text";
}

/**
 * Ordering rule:
 *  1) position ASC (manual priority)
 *  2) updated_at DESC (recently edited)
 *  3) created_at DESC (recently created)
 */
async function listBlocks(env, userId) {
  await ensureBlockSchema(env);
  const rs = await env.DB.prepare(
    `SELECT id, content, format, starred, created_at, updated_at, position
     FROM blocks
     WHERE user_id = ?
     ORDER BY position ASC,
              COALESCE(updated_at, created_at) DESC,
              created_at DESC`
  ).bind(userId).all();
  return json({ blocks: rs.results || [] });
}

async function createBlock(request, env, userId) {
  await ensureBlockSchema(env);
  const body = await parseJson(request);
  if (!body || !Object.prototype.hasOwnProperty.call(body, "content")) {
    throw new HttpError(400, "缺少 content");
  }
  let content = body.content;
  if (content == null) content = "";
  if (typeof content !== "string") content = String(content);
  const format = normalizeBlockFormat(body.format);
  const starred = body.starred === true || body.starred === 1 ? 1 : 0;

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  // 新建固定 position=0：配合排序规则 position ASC + updated_at DESC，最新笔记自然置顶，
  // 无需再对全列表执行 reorder（省去 N 行 D1 写入）
  const position = 0;
  await env.DB.prepare(
    "INSERT INTO blocks (id, user_id, content, format, starred, created_at, updated_at, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(id, userId, content, format, starred, now, now, position).run();

  return json({ block: { id, content, format, starred, created_at: now, updated_at: now, position } }, 201);
}

async function updateBlock(request, env, userId, blockId) {
  await ensureBlockSchema(env);
  const body = await parseJson(request);
  if (!body || !Object.prototype.hasOwnProperty.call(body, "content")) {
    throw new HttpError(400, "缺少 content");
  }
  let content = body.content;
  if (content == null) content = "";
  if (typeof content !== "string") content = String(content);

  const owned = await env.DB.prepare(
    "SELECT id, content, format, starred, created_at, updated_at, position FROM blocks WHERE id = ? AND user_id = ?"
  ).bind(blockId, userId).first();
  if (!owned) throw new HttpError(404, "不存在或无权限");
  const format = Object.prototype.hasOwnProperty.call(body, "format")
    ? normalizeBlockFormat(body.format)
    : normalizeBlockFormat(owned.format);

  // 内容与格式均未变化时跳过写入，避免自动保存重复消耗 D1 行写入
  if (owned.content === content && normalizeBlockFormat(owned.format) === format) {
    return json({
      block: {
        id: blockId,
        content,
        format,
        starred: owned.starred,
        created_at: owned.created_at,
        updated_at: owned.updated_at ?? owned.created_at,
        position: owned.position
      }
    });
  }
  const now = new Date().toISOString();
  // 内容变化时把 position 一并归零（仍是同一行写入，无额外开销）：
  // 配合 "position ASC + updated_at DESC" 排序规则，最近编辑的记录稳定置顶且跨刷新持久，
  // 前端无需再发起全量 reorder
  await env.DB.prepare(
    "UPDATE blocks SET content = ?, format = ?, updated_at = ?, position = 0 WHERE id = ?"
  ).bind(content, format, now, blockId).run();

  return json({
    block: {
      id: blockId,
      content,
      format,
      starred: owned.starred,
      created_at: owned.created_at,
      updated_at: now,
      position: 0
    }
  });
}

async function updateBlockStarred(request, env, userId, blockId) {
  await ensureBlockSchema(env);
  const body = await parseJson(request);
  if (!body || !Object.prototype.hasOwnProperty.call(body, "starred")) {
    throw new HttpError(400, "缺少 starred");
  }
  const starred = body.starred === true || body.starred === 1 ? 1 : 0;
  const owned = await env.DB.prepare(
    "SELECT id FROM blocks WHERE id = ? AND user_id = ?"
  ).bind(blockId, userId).first();
  if (!owned) throw new HttpError(404, "不存在或无权限");
  await env.DB.prepare(
    "UPDATE blocks SET starred = ? WHERE id = ? AND user_id = ?"
  ).bind(starred, blockId, userId).run();
  return json({ block: { id: blockId, starred } });
}

async function deleteBlock(env, userId, blockId) {
  await env.DB.prepare(
    "DELETE FROM blocks WHERE id = ? AND user_id = ?"
  ).bind(blockId, userId).run();
  return json({ ok: true });
}

async function reorderBlocks(request, env, userId) {
  const body = await parseJson(request);
  if (!body || !Array.isArray(body.order)) {
    throw new HttpError(400, "缺少 order 数组");
  }
  for (const item of body.order) {
    if (!item || !item.id || typeof item.position !== "number") {
      throw new HttpError(400, "order 元素格式错误");
    }
  }

  // 只更新 position 真正发生变化的行，并用 batch 一次往返执行，大幅节省 D1 行写入
  const current = await env.DB.prepare(
    "SELECT id, position FROM blocks WHERE user_id = ?"
  ).bind(userId).all();
  const positionMap = new Map((current.results || []).map(row => [row.id, row.position]));

  const stmts = [];
  for (const item of body.order) {
    if (positionMap.get(item.id) === item.position) continue;
    stmts.push(
      env.DB.prepare(
        "UPDATE blocks SET position = ? WHERE id = ? AND user_id = ?"
      ).bind(item.position, item.id, userId)
    );
  }
  if (stmts.length > 0) {
    await env.DB.batch(stmts);
  }
  return listBlocks(env, userId);
}

/* ================= Images ================= */
async function uploadImage(request, env, userId) {
  const ct = request.headers.get("Content-Type") || "";
  if (!ct.startsWith("multipart/form-data"))
    throw new HttpError(400, "需要 multipart/form-data");
  const formData = await request.formData();
  const file = formData.get("file");
  if (!file || typeof file === "string") throw new HttpError(400, "未找到文件");
  const buf = await file.arrayBuffer();
  if (buf.byteLength > 2 * 1024 * 1024) throw new HttpError(400, "文件过大 (>2MB)");

  const id = crypto.randomUUID();
  const mime = file.type || "application/octet-stream";
  const created_at = new Date().toISOString();

  await env.DB.prepare(
    "INSERT INTO images (id, user_id, mime, size, created_at) VALUES (?, ?, ?, ?, ?)"
  ).bind(id, userId, mime, buf.byteLength, created_at).run();

  await env.KV.put(`image:${id}`, buf);
  return json({ image: { id, mime, size: buf.byteLength, url: `/api/images/${id}`, created_at } }, 201);
}

async function getImage(env, userId, id) {
  const row = await env.DB.prepare(
    "SELECT mime, user_id FROM images WHERE id = ?"
  ).bind(id).first();
  if (!row) throw new HttpError(404, "不存在");
  if (row.user_id !== userId) throw new HttpError(403, "无权限");
  const data = await env.KV.get(`image:${id}`, "arrayBuffer");
  if (!data) throw new HttpError(404, "内容缺失");
  return new Response(data, {
    headers: {
      "Content-Type": row.mime,
      "Cache-Control": "public, max-age=31536000, immutable"
    }
  });
}

/* ================= Session & User ================= */
async function getSession(request, env) {
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
async function getUser(env, id) {
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

/* ================= Crypto ================= */
function getIterations(env) {
  const raw = parseInt(env.PBKDF2_ITER || "100000", 10);
  return Math.min(raw > 0 ? raw : 100000, 100000);
}
async function hashPassword(password, env) {
  const iterations = getIterations(env);
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveBits"]);
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
    const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveBits"]);
    const testBuf = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
      keyMaterial,
      256
    );
    const testHash = new Uint8Array(testBuf);
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
