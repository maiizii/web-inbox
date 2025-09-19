import React from "react";
import { RefreshCw, LogOut, Moon, Sun } from "lucide-react";
import { useAuth } from "../../context/AuthContext.jsx";
import { useTheme } from "../../context/ThemeContext.jsx";
import { useToast } from "../../hooks/useToast.jsx";
import { apiHealth } from "../../api/cloudflare.js";

export default function Navbar() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const toast = useToast();

  async function testHealth() {
    try {
      const r = await apiHealth();
      toast.push("后端正常: " + (r.ts || ""), { type: "success" });
    } catch (e) {
      toast.push(e.message || "后端异常", { type: "error" });
    }
  }

  return (
    <header className="border-b border-slate-200/70 dark:border-slate-700/70 bg-white/85 dark:bg-slate-900/80 backdrop-blur">
      <div className="w-full px-4 h-14 flex items-center gap-4">
        <span className="font-semibold text-lg tracking-wide bg-gradient-to-r from-blue-600 to-indigo-500 text-transparent bg-clip-text select-none">
          Web Tips
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={testHealth}
            className="btn-outline-modern !px-3 !py-2"
            title="测试后端"
          >
            <RefreshCw size={16} />
          </button>
          <button
            onClick={toggleTheme}
            className="btn-outline-modern !px-3 !py-2"
            title="切换主题"
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[150px]">
            {user?.email}
          </span>
          <button
            onClick={logout}
            className="btn-danger-modern !px-3 !py-2"
            title="退出登录"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </header>
  );
}
