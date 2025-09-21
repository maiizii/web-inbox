// /functions/api/password.js
export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const old_password = body?.old_password || "";
    const new_password = body?.new_password || "";
    const email =
      body?.email ||
      request.headers.get("Cf-Access-Authenticated-User-Email") ||
      request.headers.get("x-user-email") ||
      "";

    if (!email) return json({ error: "缺少 email" }, 400);
    if (!old_password || !new_password) return json({ error: "缺少参数" }, 400);

    const hasSalt = await tableHasColumn(env, "users", "salt");

    // 读取用户（根据是否有 salt 列选择查询）
    const row = hasSalt
      ? await env.DB.prepare(
          "SELECT email, password_hash, salt FROM users WHERE email = ?"
        ).bind(email).first()
      : await env.DB.prepare(
          "SELECT email, password_hash FROM users WHERE email = ?"
        ).bind(email).first();

    if (!row) return json({ error: "用户不存在" }, 404);

    // 校验旧密码（支持 pbkdf2 标准串；兼容旧 sha256 / 明文）
    const ok = await verifyPassword(old_password, row.password_hash, row.salt);
    if (!ok) return json({ error: "请输入正确的当前密码" }, 401);

    // 生成新密码（PBKDF2-SHA256；单列方案把完整 pbkdf2$iter$salt$hash 写进 password_hash 即可）
    const { hash, salt } = await pbkdf2Hash(new_password);

    if (hasSalt) {
      await env.DB.prepare(
        "UPDATE users SET password_hash = ?, salt = ? WHERE email = ?"
      ).bind(hash, salt, email).run();
    } else {
      await env.DB.prepare(
        "UPDATE users SET password_hash = ? WHERE email = ?"
      ).bind(hash, email).run();
    }

    return json({ ok: true });
  } catch (e) {
    return json({ error: e?.message || "内部错误" }, 500);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

// ---------- 工具：表结构探测 ----------
async function tableHasColumn(env, table, column) {
  const res = await env.DB.prepare(`PRAGMA table_info(${table})`).all();
  const cols = (res?.results || []).map(r => String(r.name || "").toLowerCase());
  return cols.includes(String(column).toLowerCase());
}

// ---------- 工具：PBKDF2 ----------
async function pbkdf2Hash(password, iter = 100_000) {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: iter }, key, 256);
  const hash = bufToBase64(bits);
  const saltB64 = bufToBase64(salt.buffer);
  // 单列模式：把完整串写进 password_hash；多列模式：同时写 salt 列
  return { hash: `pbkdf2$${iter}$${saltB64}$${hash}`, salt: saltB64 };
}

async function verifyPassword(input, storedHash, saltB64) {
  if (!storedHash) return false;

  // 新格式：pbkdf2$iter$salt$hash
  if (storedHash.startsWith("pbkdf2$")) {
    const [ , iterStr, saltInHash, hashInHash ] = storedHash.split("$");
    const iter = parseInt(iterStr, 10);
    const salt = base64ToBuf(saltInHash);
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", enc.encode(input), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: iter }, key, 256);
    const calc = bufToBase64(bits);
    return subtleEqual(calc, hashInHash);
  }

  // 兼容：旧实现 sha256(password + salt)
  if (saltB64) {
    const calc = await sha256b64(input + saltB64);
    return subtleEqual(calc, storedHash);
  }

  // 兼容：纯 sha256(password)
  const s1 = await sha256b64(input);
  if (subtleEqual(s1, storedHash)) return true;

  // 最后兜底：明文（别再这样存了）
  return input === storedHash;
}

async function sha256b64(text) {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return bufToBase64(buf);
}

function subtleEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
function bufToBase64(buf) {
  const bytes = new Uint8Array(buf); let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function base64ToBuf(b64) {
  const s = atob(b64); const arr = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) arr[i] = s.charCodeAt(i);
  return arr.buffer;
}
