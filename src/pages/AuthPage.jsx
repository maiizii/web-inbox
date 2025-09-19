import React, { useState } from "react";
import { apiLogin, apiRegister } from "../api/cloudflare.js";
import { useToast } from "../hooks/useToast.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useNavigate } from "react-router-dom";

export default function AuthPage() {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
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
        await apiRegister(email, password, name, inviteCode);
        toast.push("注册成功", { type: "success" });
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
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-500 text-transparent bg-clip-text">
            Web Tips
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {mode === "login" ? "登录到你的知识小片段" : "创建你的账号（需要邀请码）"}
          </p>
        </div>

        <div className="flex bg-slate-100 dark:bg-slate-800 rounded-md p-1">
          <button
            onClick={() => setMode("login")}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition ${
              mode === "login"
                ? "bg-white dark:bg-slate-700 shadow text-slate-900 dark:text-white"
                : "text-slate-500"
            }`}
          >
            登录
          </button>
          <button
            onClick={() => setMode("register")}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition ${
              mode === "register"
                ? "bg-white dark:bg-slate-700 shadow text-slate-900 dark:text-white"
                : "text-slate-500"
            }`}
          >
            注册
          </button>
        </div>

        <form
          onSubmit={submit}
          className="space-y-5 bg-white dark:bg-slate-800/90 p-8 rounded-xl shadow-lg border border-slate-200/70 dark:border-slate-700/60 backdrop-blur"
        >
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
              邮箱
            </label>
            <input
              className="input-modern"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value.trim())}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
              密码
            </label>
            <input
              className="input-modern"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
          </div>

          {mode === "register" && (
            <>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  昵称（可选）
                </label>
                <input
                  className="input-modern"
                  value={name}
                  onChange={e => setName(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  邀请码
                </label>
                <input
                  className="input-modern"
                  required
                  value={inviteCode}
                  onChange={e => setInviteCode(e.target.value.trim())}
                  placeholder="请输入邀请码"
                />
              </div>
            </>
          )}

          {error && (
            <div className="text-xs text-red-500 bg-red-50 dark:bg-red-900/30 p-2 rounded">
              {error}
            </div>
          )}

          <button
            disabled={loading}
            className="btn-primary-modern w-full"
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
