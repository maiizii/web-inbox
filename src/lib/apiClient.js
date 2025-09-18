// 统一封装 fetch，附带调试事件广播
const listeners = new Set();

export function onApiEvent(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

async function fire(event) {
  listeners.forEach(fn => {
    try { fn(event); } catch {}
  });
}

export async function apiFetch(path, options = {}) {
  const started = performance.now();
  let ok = false;
  let status = 0;
  let data, text, error;

  try {
    const res = await fetch(path, {
      credentials: "include",
      ...options
    });
    status = res.status;
    const ct = res.headers.get("Content-Type") || "";
    if (ct.includes("application/json")) {
      data = await res.json();
    } else {
      text = await res.text();
    }
    ok = res.ok;
    if (!res.ok) {
      error = new Error(data?.error || data?.message || text || `HTTP ${res.status}`);
    }
    return data ?? text;
  } catch (e) {
    error = e;
    throw e;
  } finally {
    const duration = Math.round(performance.now() - started);
    fire({
      ts: Date.now(),
      path,
      method: (options.method || "GET").toUpperCase(),
      status,
      ok,
      duration,
      request: {
        headers: options.headers,
        body: options.body
      },
      response: data ?? text,
      error: error ? (error.message || String(error)) : null
    });
  }
}
