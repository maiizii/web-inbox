import React, { useState } from "react";
import { apiLogin, apiRegister } from "../api/cloudflare.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useNavigate } from "react-router-dom";
import { useToast } from "../hooks/useToast.jsx";

export default function AuthPage() {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { refreshUser, user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  async function submit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "register") {
        await apiRegister(email, password, inviteCode);
        toast.push("注册成功", { type: "success" });
        await apiLogin(email, password);
      } else {
        await apiLogin(email, password);
      }
      await refreshUser();
      setTimeout(() => {
        if (user || true) {
          navigate("/", { replace: true });
        }
      }, 50);
    } catch (err) {
      setError(err.message || "登录失败");
      toast.push(err.message || "失败", { type: "error" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <h1 className="mx-auto h-24 justify-center">
            <img
              src="https://img.811777.xyz/i/2025/10/04/68e11e37023d2.png"
              alt="笔记 bji.cc"
              className="h-full object-contain w-auto mx-auto"
            />
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 text-center">
            {mode === "login" ? "登录到你的笔记 bji.cc" : "创建你的账号（需要邀请码）"}
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
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">邮箱</label>
            <input
              className="input-modern"
              type="email"
              required
              value={email}
              autoComplete="email"
              onChange={e => setEmail(e.target.value.trim())}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">密码</label>
            <input
              className="input-modern"
              type="password"
              required
              value={password}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              onChange={e => setPassword(e.target.value)}
            />
          </div>

          {mode === "register" && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">邀请码</label>
              <input
                className="input-modern"
                required
                value={inviteCode}
                onChange={e => setInviteCode(e.target.value.trim())}
                placeholder="请输入邀请码"
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
            className="btn-primary-modern w-full"
          >
            {loading ? "处理中..." : mode === "login" ? "登录" : "注册并登录"}
          </button>
        </form>
      </div>
    </div>
  );
}
