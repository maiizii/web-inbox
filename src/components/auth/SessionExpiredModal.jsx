// src/components/auth/SessionExpiredModal.jsx
// 登录态失效的全局提示弹窗：
//  - 任意业务接口返回 401（apiClient 广播 session-expired）时立即弹出，
//    不再只靠编辑器顶栏的红色“重试”提示；
//  - 内嵌重新登录表单：弹窗期间编辑器保持挂载，正在输入的内容不会丢失，
//    同一账号重新登录成功后广播 session-restored，编辑器立即自动重试保存；
//  - 手动关闭后有短暂冷却，避免连续输入触发自动保存时反复弹窗打扰；
//  - 窗口重新聚焦/切回标签页时主动校验一次登录态，把“早已失效”的会话提前暴露出来。
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Loader2, X } from "lucide-react";
import { apiLogin, apiMe } from "../../api/cloudflare.js";
import { useAuth } from "../../context/AuthContext.jsx";
import {
  notifySessionExpired,
  notifySessionRestored,
  onSessionExpired
} from "../../lib/sessionEvents.js";

const RESHOW_COOLDOWN_MS = 30 * 1000;          // 手动关闭后重新弹窗的冷却时间
const FOCUS_CHECK_MIN_INTERVAL_MS = 60 * 1000; // 聚焦校验登录态的最小间隔

export default function SessionExpiredModal() {
  const { user, refreshUser } = useAuth();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const userRef = useRef(user);
  userRef.current = user;
  const prevUserIdRef = useRef(null); // 失效前登录的用户，用于判断重登是否切换了账号
  const dismissedAtRef = useRef(0);
  const lastFocusCheckRef = useRef(0);
  const checkingRef = useRef(false);

  // 全局 401 → 立即弹窗。
  // user 为空说明本来就未登录（如刚打开页面），交给 PrivateRoute 跳 /auth，不弹窗。
  useEffect(
    () =>
      onSessionExpired(() => {
        const current = userRef.current;
        if (!current) return;
        if (Date.now() - dismissedAtRef.current < RESHOW_COOLDOWN_MS) return;
        prevUserIdRef.current = current.id;
        setEmail(current.email || "");
        setError("");
        setOpen(true);
      }),
    []
  );

  // 窗口聚焦/切回标签页时校验登录态（节流）
  useEffect(() => {
    async function verify() {
      if (!userRef.current || checkingRef.current) return;
      const now = Date.now();
      if (now - lastFocusCheckRef.current < FOCUS_CHECK_MIN_INTERVAL_MS) return;
      lastFocusCheckRef.current = now;
      checkingRef.current = true;
      try {
        await apiMe();
      } catch (e) {
        if (e?.status === 401) notifySessionExpired();
      } finally {
        checkingRef.current = false;
      }
    }
    function onVisChange() {
      if (document.visibilityState === "visible") verify();
    }
    window.addEventListener("focus", verify);
    document.addEventListener("visibilitychange", onVisChange);
    return () => {
      window.removeEventListener("focus", verify);
      document.removeEventListener("visibilitychange", onVisChange);
    };
  }, []);

  function close() {
    dismissedAtRef.current = Date.now();
    setOpen(false);
  }

  async function submit(e) {
    e.preventDefault();
    if (loading) return;
    if (!email.trim() || !password) {
      setError("请输入邮箱和密码");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await apiLogin(email.trim(), password);
      await refreshUser();
      setOpen(false);
      setPassword("");
      if (userRef.current && userRef.current.id !== prevUserIdRef.current) {
        // 重新登录到了另一个账号：内存中的列表/编辑内容已不适用，整页刷新
        window.location.reload();
        return;
      }
      // 同一账号重新登录成功：广播恢复事件，编辑器会立即重试保存未保存的内容
      notifySessionRestored();
    } catch (err) {
      setError(err.message || "登录失败");
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={close}
    >
      <div
        className="w-full max-w-md rounded-xl shadow-lg border"
        style={{
          background: "var(--color-surface)",
          color: "var(--color-text)",
          borderColor: "var(--color-border)"
        }}
        onClick={e => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: "var(--color-border)" }}
        >
          <div className="flex items-center gap-2 text-base font-semibold">
            <AlertTriangle size={18} className="text-amber-500" />
            登录状态已失效
          </div>
          <button className="btn-ghost-modern !px-2 !py-1" onClick={close} aria-label="关闭">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={submit}>
          <div className="px-4 py-4 space-y-3">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              登录会话已过期，期间的修改<strong>没有保存到服务器</strong>。
              当前正在编辑的内容不会丢失，重新登录后会立即自动重试保存。
            </p>
            <div>
              <div className="text-xs mb-1 text-slate-500 dark:text-slate-300">邮箱</div>
              <input
                type="email"
                required
                className="input-modern"
                value={email}
                autoComplete="email"
                onChange={e => setEmail(e.target.value.trim())}
              />
            </div>
            <div>
              <div className="text-xs mb-1 text-slate-500 dark:text-slate-300">密码</div>
              <input
                type="password"
                required
                className="input-modern"
                value={password}
                autoComplete="current-password"
                onChange={e => setPassword(e.target.value)}
              />
            </div>
            {error && (
              <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 p-2 rounded">
                {error}
              </div>
            )}
          </div>

          <div
            className="px-4 py-3 flex items-center justify-end gap-2 border-t"
            style={{ borderColor: "var(--color-border)" }}
          >
            <button type="button" className="btn-outline-modern" onClick={close}>
              暂不登录
            </button>
            <button
              type="submit"
              className="btn-primary-modern min-w-[96px] justify-center"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin" size={16} /> 登录中
                </>
              ) : (
                "重新登录"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
