// API 客户端统一封装（带事件监听 + 严格错误抛出）
// 用法：
//   import { apiFetch, onApiEvent } from "../lib/apiClient";
//   onApiEvent(ev => console.log(ev));
//
// 变更:
//  - 遇到非 2xx/3xx 必定 throw Error（附 status, data）
//  - JSON 自动解析；非 JSON 保留 text
//  - 保留性能计时 & 事件广播
//  - error 时不会返回 data，调用方需 try/catch

const listeners = new Set();

export function onApiEvent(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function fire(event) {
  listeners.forEach(fn => {
    try { fn(event); } catch {}
  });
}

/**
 * 统一 fetch
 * @param {string} path
 * @param {RequestInit} options
 * @returns {Promise<any>}
 * @throws {Error} 带 { status, data }
 */
export async function apiFetch(path, options = {}) {
  const started = performance.now();
  let status = 0;
  let ok = false;
  let data;
  let text;
  let error;

  try {
    const res = await fetch(path, {
      credentials: "include",
      // 允许用户覆盖 method/headers/body
      ...options
    });

    status = res.status;
    const ct = res.headers.get("Content-Type") || "";

    if (ct.includes("application/json")) {
      // 解析 JSON
      try {
        data = await res.json();
      } catch {
        data = null;
      }
    } else {
      text = await res.text();
    }

    ok = res.ok;

    if (!res.ok) {
      const message =
        (data && (data.error || data.message)) ||
        text ||
        `HTTP ${res.status}`;
      error = new Error(message);
      error.status = res.status;
      // 兼容调用方需要查看后端 body
      error.data = data ?? text;
      throw error;
    }

    return data ?? text;
  } catch (e) {
    // 确保外层能捕获
    if (!(e instanceof Error)) {
      error = new Error(String(e));
    } else {
      error = e;
    }
    throw error;
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
