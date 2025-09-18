import React from "react";
import { useAuth } from "../../context/AuthContext.jsx";
import { useTheme } from "../../context/ThemeContext.jsx";
import { Sun, Moon, LogOut } from "lucide-react";

export default function Navbar() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="border-b border-slate-200/70 dark:border-slate-700/70 bg-white/80 dark:bg-slate-900/70 backdrop-blur supports-[backdrop-filter]:bg-white/50 dark:supports-[backdrop-filter]:bg-slate-900/50">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-4">
        <span className="font-semibold text-blue-600">Web Inbox</span>
        <div className="ml-auto flex items-center gap-3 text-sm">
          {user && (
            <span className="text-slate-600 dark:text-slate-300 truncate max-w-[140px]">
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
            <button onClick={logout} className="btn btn-outline">
              <LogOut size={16} className="mr-1" />
              退出
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
