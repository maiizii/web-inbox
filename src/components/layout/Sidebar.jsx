import React from "react";

export default function Sidebar({
  blocks,
  selectedId,
  onSelect,
  onCreate
}) {
  return (
    <aside className="h-full w-60 shrink-0 border-r border-slate-200 dark:border-slate-700 flex flex-col">
      <div className="p-3 border-b border-slate-200 dark:border-slate-700">
        <button
          onClick={onCreate}
          className="w-full btn btn-primary !py-1 !text-sm"
        >
          新建
        </button>
      </div>
      <div className="flex-1 overflow-auto custom-scroll">
        {blocks.length === 0 && (
          <div className="p-3 text-xs text-slate-400">
            还没有内容，点“新建”试试
          </div>
        )}
        <ul className="text-sm">
          {blocks.map(b => {
            const isActive = b.id === selectedId;
            const title =
              (b.title && b.title.trim()) ||
              (b.content
                ? (b.content.split("\n")[0] || "").replace(/^#+\s*/, "").slice(0, 60)
                : "") ||
              "(无标题)";
            return (
              <li key={b.id}>
                <button
                  onClick={() => onSelect(b.id)}
                  className={
                    "w-full text-left px-3 py-2 block border-l-2 transition-colors " +
                    (isActive
                      ? "bg-blue-50 dark:bg-slate-800/60 border-blue-500"
                      : "border-transparent hover:bg-slate-100/70 dark:hover:bg-slate-800/50")
                  }
                >
                  <div
                    className={
                      "truncate " +
                      (title === "(无标题)"
                        ? "text-slate-400 italic"
                        : "text-slate-700 dark:text-slate-200")
                    }
                  >
                    {title}
                  </div>
                  <div className="mt-0.5 text-[10px] text-slate-400">
                    {new Date(b.updated_at || b.created_at).toLocaleString()}
                    {b.optimistic && " · 保存中..."}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}
