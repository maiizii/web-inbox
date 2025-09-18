import React, { useEffect, useState } from "react";
import { onApiEvent } from "../../lib/apiClient.js";

export default function ApiDebugger({ className = "" }) {
  const [events, setEvents] = useState([]);

  useEffect(() => {
    const off = onApiEvent(e => {
      setEvents(prev => {
        const next = [e, ...prev];
        if (next.length > 30) next.pop();
        return next;
      });
    });
    return off;
  }, []);

  return (
    <div
      className={`p-2 text-[10px] leading-relaxed overflow-auto max-h-72 custom-scroll ${className}`}
    >
      {!events.length && (
        <div className="text-slate-400">暂无请求...</div>
      )}
      {events.map(ev => (
        <div
          key={ev.ts + ev.path + ev.method}
          className="border-b border-slate-200 dark:border-slate-700 pb-1 mb-1"
        >
          <div className="flex justify-between">
            <span className="font-mono">
              {ev.method} {ev.path}
            </span>
            <span
              className={`${
                ev.ok ? "text-green-600" : "text-red-500"
              } font-medium`}
            >
              {ev.status || "-"} {ev.duration}ms
            </span>
          </div>
          {ev.error && (
            <div className="text-red-500 truncate">
              错误: {ev.error}
            </div>
          )}
          <details className="mt-1">
            <summary className="cursor-pointer text-slate-500">
              响应
            </summary>
            <pre className="whitespace-pre-wrap break-all font-mono">
{JSON.stringify(ev.response, null, 2)}
            </pre>
          </details>
        </div>
      ))}
    </div>
  );
}
