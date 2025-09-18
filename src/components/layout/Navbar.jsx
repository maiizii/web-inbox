import React from "react";
import { useAuth } from "../../context/AuthContext.jsx";
import { useTheme } from "../../context/ThemeContext.jsx";
import { Sun, Moon, LogOut, RefreshCw } from "lucide-react";
import { apiHealth } from "../../api/cloudflare.js";
import { useToast } from "../../hooks/useToast.jsx";

export default function Navbar() {
  const { user, logout, refreshUser } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const toast = useToast();

  async function testHealth() {
    try {
      const h = await apiHealth();
      toast.push("Health OK: " + (h?.ts || ""), { type: "success" });
      await refreshUser();
    } catch (e) {
      toast.push("Health Fail: " + e.message, { type: "error" });
    }
  }

  return (
    <header className="border-b border-slate-200/70 dark:border-slate-700/70 bg-white/80 dark:bg-slate-900/70 backdrop-blur supports-[backdrop-filter]:bg-white/50 dark:supports-[backdrop-filter]:bg-slate-900/50">
      <div className="max-w-full mx-auto px-4 h-14 flex items-center gap-4">
        <span className="font-semibold text-blue-600">
          Web Inbox
        </span>
        <div className="flex items-center gap-2 text-xs">
          <button
            onClick={testHealth}
            className="btn btn-outline !py-1 !px-2"
            title="测试后端"
          >
            <RefreshCw size={14} />
          </button>
        </div>
        <div className="ml-auto flex items-center gap-3 text-sm">
          {user && (
            <span className="text-slate-600 dark:text-slate-300 truncate max-w-[160px]">
              {user.email}
            </span>
          )}
          <button
            onClick={toggleTheme}
            className="btn btn-outline !p-2"
            aria-label="切换主题"
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          {user && (
            <button
              onClick={logout}
              className="btn btn-outline !py-1 !px-3"
            >
              <LogOut size={16} className="mr-1" />
              退出
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
