import React, { useState } from "react";
import { RefreshCw, LogOut, Moon, Sun, KeyRound, User } from "lucide-react";
import { useAuth } from "../../context/AuthContext.jsx";
import { useTheme } from "../../context/ThemeContext.jsx";
import { useToast } from "../../hooks/useToast.jsx";
import { apiHealth } from "../../api/cloudflare.js";
import ChangePasswordModal from "../account/ChangePasswordModal.jsx";

export default function Navbar() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const toast = useToast();
  const [showPwd, setShowPwd] = useState(false);
  const [showUser, setShowUser] = useState(false);

  async function testHealth() {
    try { const r = await apiHealth(); toast.push("后端正常: " + (r.ts || ""), { type: "success" }); }
    catch (e) { toast.push(e.message || "后端异常", { type: "error" }); }
  }

  const headerStyle = theme === "dark"
    ? { backgroundColor: "var(--color-surface-alt)" }
    : { backgroundColor: "rgba(255,255,255,0.8)" };

  const iconBtn = "btn-outline-modern inline-flex items-center justify-center !px-2.5 !py-1.5";

  return (
    <>
      <header
        className="border-b border-slate-200/70 dark:border-slate-700/70 backdrop-blur-md shadow-sm"
        style={headerStyle}
      >
        <div className="w-full px-4 md:px-6 h-14 flex items-center gap-4">
          <img
            src="https://img.686656.xyz/images/i/2025/09/21/webtipslogo.png"
            alt="Web Tips"
            className="h-full w-auto select-none object-contain"
          />

          <div className="flex items-center gap-2">
            <button onClick={testHealth} className={iconBtn} title="测试后端">
              <RefreshCw size={16} />
            </button>
            <button onClick={toggleTheme} className={iconBtn} title="切换主题">
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>

          <div className="ml-auto flex items-center gap-3">
            {/* 手机端隐藏邮箱，留“用户信息”按钮查看 */}
            <span className="hidden sm:inline text-xs text-slate-500 dark:text-slate-400 truncate max-w-[160px]">
              {user?.email}
            </span>

            <button onClick={() => setShowUser(true)} className={iconBtn} title="用户信息">
              <User size={16} />
            </button>

            <button onClick={() => setShowPwd(true)} className={iconBtn} title="修改密码">
              <KeyRound size={16} />
            </button>

            <button
              onClick={logout}
              className="px-3 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition"
              title="退出登录"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      <ChangePasswordModal open={showPwd} onClose={() => setShowPwd(false)} />

      {/* 极简用户信息弹窗 */}
      {showUser && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowUser(false)} />
          <div className="relative bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg p-4 w-[90%] max-w-sm">
            <div className="text-lg font-semibold mb-2 text-slate-800 dark:text-slate-100">当前用户</div>
            <div className="text-sm text-slate-600 dark:text-slate-300 break-words">
              邮箱：{user?.email || "-"}
            </div>
            <div className="mt-4 flex justify-end">
              <button className="btn-outline-modern !px-3 !py-1.5" onClick={() => setShowUser(false)}>关闭</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
