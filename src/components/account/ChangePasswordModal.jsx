import React, { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { useToast } from "../../hooks/useToast.jsx";

/**
 * 自动探测多个常见端点，避免 Not Found：
 * 优先顺序从最“语义化”到最简短；命中非 404 即停止。
 */
async function tryChangePassword(old_password, new_password) {
  const paths = [
    "/api/user/password",
    "/api/user/change-password",
    "/api/auth/password",
    "/api/auth/change-password",
    "/api/change-password",
    "/api/password"
  ];
  const payload = { old_password, new_password };

  let lastErr = null;
  for (const url of paths) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload)
      });
      // 404 继续尝试下一个；其他错误直接抛
      if (res.status === 404) {
        lastErr = new Error("404 Not Found: " + url);
        continue;
      }
      let data = null;
      try { data = await res.json(); } catch {}
      if (!res.ok) {
        const msg = data?.message || data?.error || `HTTP ${res.status}`;
        throw new Error(msg);
      }
      return data || { ok: true, endpoint: url };
    } catch (e) {
      if (e.message?.startsWith("404 Not Found")) continue;
      throw e;
    }
  }
  throw lastErr || new Error("未找到可用的修改密码端点");
}

export default function ChangePasswordModal({ open, onClose }) {
  const toast = useToast();
  const [oldPwd, setOldPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  if (!open) return null;

  function validate() {
    if (!oldPwd || !newPwd || !confirmPwd) return "请填写所有字段";
    if (newPwd.length < 8) return "新密码至少 8 位";
    if (newPwd === oldPwd) return "新旧密码不能相同";
    if (newPwd !== confirmPwd) return "两次输入不一致";
    return "";
  }

  async function submit() {
    const v = validate();
    if (v) { setErr(v); return; }
    setErr("");
    setLoading(true);
    try {
      const r = await tryChangePassword(oldPwd, newPwd);
      toast.push("密码已更新", { type: "success" });
      setOldPwd(""); setNewPwd(""); setConfirmPwd("");
      onClose && onClose();
      // 可选：控制台输出命中的端点，方便你这种偷懒王下次别乱配
      // eslint-disable-next-line no-console
      console.log("Password changed via:", r?.endpoint || "(unknown)");
    } catch (e) {
      setErr(e?.message || "修改失败");
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
