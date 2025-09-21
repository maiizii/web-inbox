import React, { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { useToast } from "../../hooks/useToast.jsx";

/* 统一错误文案映射 */
function mapErrorMessage(status, text = "") {
  const msg = (text || "").toLowerCase();
  if (status === 401 || status === 403) return "请输入正确的当前密码";
  if (
    msg.includes("wrong password") ||
    msg.includes("invalid password") ||
    msg.includes("incorrect password") ||
    msg.includes("旧密码") ||
    msg.includes("原密码") ||
    msg.includes("密码错误") ||
    msg.includes("current password")
  ) {
    return "请输入正确的当前密码";
  }
  if (status === 404) return "修改密码接口未部署";
  return text || `请求失败 (HTTP ${status})`;
}

/* 多端点探测：命中非 404 即停止；将 401/403/语义错误映射为“请输入正确的当前密码” */
async function tryChangePassword(old_password, new_password) {
  const paths = [
    "/api/user/password",
    "/api/user/change-password",
    "/api/account/password",
    "/api/profile/password",
    "/api/auth/password",
    "/api/auth/change-password",
    "/api/change-password",
    "/api/password"
  ];
  const payload = { old_password, new_password };

  let last404 = null;
  for (const url of paths) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload)
    });

    let bodyText = "";
    try {
      // 尝试读取 json->message；失败再退回到纯文本
      const maybe = await res.clone().json();
      bodyText = maybe?.message || maybe?.error || "";
    } catch {
      try {
        bodyText = await res.clone().text();
      } catch {
        bodyText = "";
      }
    }

    if (res.status === 404) {
      last404 = new Error("修改密码接口未部署");
      continue;
    }
    if (!res.ok) {
      throw new Error(mapErrorMessage(res.status, bodyText));
    }
    return { ok: true, endpoint: url };
  }
  throw last404 || new Error("修改密码接口未部署");
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
      await tryChangePassword(oldPwd, newPwd);
      toast.push("密码已更新", { type: "success" });
      setOldPwd(""); setNewPwd(""); setConfirmPwd("");
      onClose && onClose();
    } catch (e) {
      setErr(e?.message || "请求失败");
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
