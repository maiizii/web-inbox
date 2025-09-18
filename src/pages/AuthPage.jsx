import React, { useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { useNavigate } from "react-router-dom";
import { apiLogin, apiRegister } from "../api/cloudflare.js";
import { useToast } from "../hooks/useToast.jsx";

export default function AuthPage() {
  const [mode, setMode] = useState("login"); // login | register
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const { refreshUser } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "register") {
        await apiRegister(email, password, name);
        toast.push("注册成功", { type: "success" });
        // 注册后自动登录
        await apiLogin(email, password);
      } else {
        await apiLogin(email, password);
      }
      await refreshUser();
      navigate("/", { replace: true });
    } catch (err) {
      setError(err.message);
      toast.push(err.message, { type: "error" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-semibold">Web Inbox</h1>
          <p className="text-sm text-slate-500">
            {mode === "login" ? "登录你的账户" : "创建一个新账户"}
          </p>
        </div>

        <div className="flex bg-slate-100 dark:bg-slate-800 rounded-md p-1">
          <button
            onClick={() => setMode("login")}
            className={`flex-1 py-2 rounded-md text-sm font-medium ${
              mode === "login"
                ? "bg-white dark:bg-slate-700 shadow"
                : "text-slate-500"
            }`}
          >
            登录
          </button>
          <button
            onClick={() => setMode("register")}
            className={`flex-1 py-2 rounded-md text-sm font-medium ${
              mode === "register"
                ? "bg-white dark:bg-slate-700 shadow"
                : "text-slate-500"
            }`}
          >
            注册
          </button>
        </div>

        <form
          onSubmit={submit}
          className="space-y-4 bg-white dark:bg-slate-800 p-6 rounded-lg shadow border border-slate-200/70 dark:border-slate-700/60"
        >
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Email
            </label>
            <input
              className="input"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value.trim())}
            />
          </div>
            <div className="space-y-1">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Password
            </label>
            <input
              className="input"
              type="password"
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
          </div>

          {mode === "register" && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
                昵称（可选）
              </label>
              <input
                className="input"
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </div>
          )}

          {error && (
            <div className="text-xs text-red-500 bg-red-50 dark:bg-red-900/30 p-2 rounded">
              {error}
            </div>
          )}

          <button
            disabled={loading}
            className="btn btn-primary w-full"
            type="submit"
          >
            {loading
              ? "处理中..."
              : mode === "login"
              ? "登录"
              : "注册并登录"}
          </button>
        </form>

        <p className="text-center text-xs text-slate-400">
          当前模式：{mode === "login" ? "登录" : "注册"}
        </p>
      </div>
    </div>
  );
}
