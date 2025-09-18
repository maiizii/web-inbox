import React, { useState } from "react";
import AuthForm from "../components/AuthForm.jsx";
import { useNavigate } from "react-router-dom";

export default function AuthPage() {
  const [mode, setMode] = useState("login");
  const nav = useNavigate();
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200">
      <div className="mb-4 flex gap-4">
        <button
          onClick={() => setMode("login")}
          className={`px-4 py-2 rounded ${mode === "login" ? "bg-blue-600 text-white" : "bg-white shadow"}`}
        >
          登录
        </button>
        <button
          onClick={() => setMode("register")}
          className={`px-4 py-2 rounded ${mode === "register" ? "bg-blue-600 text-white" : "bg-white shadow"}`}
        >
          注册
        </button>
      </div>
      <AuthForm mode={mode} onSuccess={() => nav("/")} />
    </div>
  );
}
