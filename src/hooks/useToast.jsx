import React, { createContext, useContext, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

const ToastCtx = createContext(null);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);

  const push = useCallback((msg, opts = {}) => {
    const id = crypto.randomUUID();
    const toast = {
      id,
      msg,
      type: opts.type || "info",
      ttl: opts.ttl || 3000
    };
    setItems(ts => [...ts, toast]);
    setTimeout(() => {
      setItems(ts => ts.filter(t => t.id !== id));
    }, toast.ttl);
  }, []);

  const remove = useCallback(id => {
    setItems(ts => ts.filter(t => t.id !== id));
  }, []);

  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      {createPortal(
        <div className="fixed top-4 right-4 space-y-2 z-50">
          {items.map(t => (
            <div
              key={t.id}
              className={`px-4 py-2 rounded-md shadow text-sm flex items-start gap-2 fade-in ${
                t.type === "error"
                  ? "bg-red-600 text-white"
                  : t.type === "success"
                  ? "bg-green-600 text-white"
                  : "bg-slate-800 text-white"
              }`}
            >
              <div className="flex-1">{t.msg}</div>
              <button
                onClick={() => remove(t.id)}
                className="opacity-70 hover:opacity-100"
                aria-label="关闭通知"
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>,
        document.body
      )}
    </ToastCtx.Provider>
  );
}

export function useToast() {
  return useContext(ToastCtx);
}
