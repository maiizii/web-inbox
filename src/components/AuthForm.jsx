import React, { useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";

export default function AuthForm({ mode = "login", onSuccess }) {
  const { login, register } = useAuth();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await register(email, password, name);
        await login(email, password);
      }
      onSuccess && onSuccess();
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 bg-white dark:bg-slate-800 p-6 shadow rounded w-full max-w-sm text-gray-900 dark:text-slate-100"
    >
      {/* Logo 区域 */}
      <div className="flex justify-center mb-4">
        <img
          src="https://img.686656.xyz/images/i/2025/09/20/68cea8557250f.png"
          alt="Web Tips Logo"
          className="h-12 w-auto"
        />
      </div>

      <h2 className="text-xl font-semibold text-center">
        {mode === "login" ? "登录" : "注册"}
      </h2>

      <div>
        <label className="block text-sm mb-1">邮箱</label>
        <input
          type="email"
          className="w-full border rounded px-3 py-2 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-gray-900 dark:text-slate-100"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
        />
      </div>

      {mode === "register" && (
        <div>
          <label className="block text-sm mb-1">昵称</label>
          <input
            className="w-full border rounded px-3 py-2 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-gray-900 dark:text-slate-100"
            value={name}
            onChange={e => setName(e.target.value)}
            required
          />
        </div>
      )}

      <div>
        <label className="block text-sm mb-1">密码</label>
        <input
          type="password"
          className="w-full border rounded px-3 py-2 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-gray-900 dark:text-slate-100"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
        />
      </div>

      {err && <div className="text-red-600 text-sm">{err}</div>}

      <button
        disabled={loading}
        className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? "处理中..." : mode === "login" ? "登录" : "注册"}
      </button>
    </form>
  );
}
