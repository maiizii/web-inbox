import React, { useState } from "react";
import { X, Loader2, ShieldCheck } from "lucide-react";
import { useToast } from "../../hooks/useToast.jsx";
import { apiChangePassword, apiLogin, apiMe } from "../../api/cloudflare.js";
import { useAuth } from "../../context/AuthContext.jsx";

export default function ChangePasswordModal({ open, onClose }) {
  const toast = useToast();
  const { user } = useAuth();
  const [oldPwd, setOldPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [dbg, setDbg] = useState("");

  if (!open) return null;

  function validate() {
    if (!oldPwd || !newPwd || !confirmPwd) return "请填写所有字段";
    if (newPwd.length < 8) return "新密码至少 8 位";
    if (newPwd === oldPwd) return "新旧密码不能相同";
    if (newPwd !== confirmPwd) return "两次输入不一致";
    return "";
  }

  // 调试动作 1：确认登录态是谁
  async function printIdentity() {
    try {
      const me = await apiMe();
      const email = me?.email || user?.email || "(unknown)";
      toast.push("当前登录：" + email, { type: "info" });
      setDbg(prev => `[ME] ${email}\n` + prev);
    } catch (e) {
      setDbg(prev => `[ME-ERR] ${e?.message || e}\n` + prev);
      toast.push("无法获取身份：" + (e?.message || ""), { type: "error" });
    }
  }

  // 调试动作 2：仅验证旧密码是否正确（用现有登录接口校验凭据）
  async function verifyOldPassword() {
    setErr("");
    try {
      const email = user?.email;
      if (!email) throw new Error("无法识别当前账号");
      await apiLogin(email, oldPwd); // 成功=旧密码正确；不会破坏现态
      toast.push("旧密码正确", { type: "success" });
      setDbg(prev => `[VERIFY] OK for ${email}\n` + prev);
    } catch (e) {
      setDbg(prev => `[VERIFY-ERR] ${e?.message || e}\n` + prev);
      setErr("请输入正确的当前密码");
    }
  }

  async function submit() {
    const v = validate();
    if (v) { setErr(v); return; }
    setErr(""); setLoading(true);
    try {
      const r = await apiChangePassword(oldPwd, newPwd);
      setDbg(prev => `[CHANGE] ${JSON.stringify(r)}\n` + prev);
      toast.push("密码已更新", { type: "success" });
      setOldPwd(""); setNewPwd(""); setConfirmPwd("");
      onClose && onClose();
    } catch (e) {
      const msg = e?.message || "请求失败";
      setErr(msg);
      setDbg(prev => `[CHANGE-ERR] ${msg}\n` + prev);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={onClose}
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
          <div className="text-base font-semibold">修改密码</div>
          <button className="btn-ghost-modern !px-2 !py-1" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="px-4 py-4 space-y-3">
          {/* 调试区：一键确认身份 / 校验旧密 */}
          <div className="flex items-center gap-2">
            <button className="btn-outline-modern !px-2.5 !py-1.5" onClick={printIdentity}>
              打印身份
            </button>
            <button className="btn-outline-modern !px-2.5 !py-1.5" onClick={verifyOldPassword}>
              <ShieldCheck size={14} className="mr-1" /> 验证旧密码
            </button>
          </div>

          <div>
            <div className="text-xs mb-1 text-slate-500 dark:text-slate-300">当前密码</div>
            <input
              type="password"
              className="input-modern"
              value={oldPwd}
              onChange={e => setOldPwd(e.target.value)}
              placeholder="输入当前密码"
              autoFocus
            />
          </div>
          <div>
            <div className="text-xs mb-1 text-slate-500 dark:text-slate-300">新密码</div>
            <input
              type="password"
              className="input-modern"
              value={newPwd}
              onChange={e => setNewPwd(e.target.value)}
              placeholder="至少 8 位，建议包含字母与数字"
            />
          </div>
          <div>
            <div className="text-xs mb-1 text-slate-500 dark:text-slate-300">确认新密码</div>
            <input
              type="password"
              className="input-modern"
              value={confirmPwd}
              onChange={e => setConfirmPwd(e.target.value)}
              placeholder="再次输入新密码"
              onKeyDown={e => { if (e.key === "Enter") submit(); }}
            />
          </div>

          {err && <div className="text-sm text-red-600 dark:text-red-400">{err}</div>}

          {/* 调试输出 */}
          {dbg && (
            <pre className="api-debug-entry mt-2">{dbg}</pre>
          )}
        </div>

        <div
          className="px-4 py-3 flex items-center justify-end gap-2 border-t"
          style={{ borderColor: "var(--color-border)" }}
        >
          <button className="btn-outline-modern" onClick={onClose}>取消</button>
          <button
            className="btn-primary-modern min-w-[96px] justify-center"
            onClick={submit}
            disabled={loading}
          >
            {loading ? <><Loader2 className="animate-spin" size={16} /> 保存中</> : "确定修改"}
          </button>
        </div>
      </div>
    </div>
  );
}
