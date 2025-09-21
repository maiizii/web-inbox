import React, { useState } from "react";
import { RefreshCw, LogOut, Moon, Sun, KeyRound } from "lucide-react";
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

  async function testHealth() {
    try { const r = await apiHealth(); toast.push("后端正常: " + (r.ts || ""), { type: "success" }); }
    catch (e) { toast.push(e.message || "后端异常", { type: "error" }); }
  }

  // 深色页头与编辑器同底色；浅色为半透明白
  const headerStyle = theme === "dark"
    ? { backgroundColor: "var(--color-surface-alt)" }
    : { backgroundColor: "rgba(255,255,255,0.8)" };

  // 图标按钮：中间对齐；悬停样式与“显示/隐藏预览”(btn-outline-modern)一致
  const iconBtn = "btn-outline-modern inline-flex items-center justify-center !px-2.5 !py-1.5";

  return (
    <>
      <header
        className="border-b border-slate-200/70 dark:border-slate-700/70 backdrop-blur-md shadow-sm"
        style={headerStyle}
      >
        <div className="w-full px-4 md:px-6 h-14 flex items-center gap-4">
          <img
            src="https://img.686656.xyz/images/i/2025/09/20/68ceb0f8dcda7.png"
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
            <span className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[160px]">
              {user?.email}
            </span>

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
    </>
  );
}
