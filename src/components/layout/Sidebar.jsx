import React from "react";
import { deriveTitle, deriveExcerpt } from "../../lib/blockText.js";

export default function Sidebar({
  blocks,
  selectedId,
  onSelect,
  onCreate
}) {
  return (
    <aside className="h-full w-64 shrink-0 border-r border-slate-200 dark:border-slate-700 flex flex-col">
      <div className="p-3 border-b border-slate-200 dark:border-slate-700 flex gap-2">
        <button
          onClick={onCreate}
          className="flex-1 btn btn-primary !py-1 !text-sm"
        >
          新建
        </button>
      </div>
      <div className="flex-1 overflow-auto custom-scroll">
        {blocks.length === 0 && (
          <div className="p-3 text-xs text-slate-400">
            暂无内容
          </div>
        )}
        <ul className="text-sm">
          {blocks.map(b => {
            const isActive = b.id === selectedId;
            const title = deriveTitle(b) || "(无标题)";
            const excerpt = deriveExcerpt(b);
            const time = new Date(b.updated_at || b.created_at).toLocaleString();
            return (
              <li key={b.id}>
                <button
                  onClick={() => onSelect(b.id)}
                  className={
                    "w-full text-left px-3 py-2 block border-l-2 transition-colors group " +
                    (isActive
                      ? "bg-blue-50 dark:bg-slate-800/60 border-blue-500"
                      : "border-transparent hover:bg-slate-100/70 dark:hover:bg-slate-800/50")
                  }
                >
                  <div
                    className={
                      "truncate font-medium " +
                      (title === "(无标题)"
                        ? "text-slate-400 italic"
                        : "text-slate-700 dark:text-slate-200")
                    }
                  >
                    {title}{b.optimistic && " · …"}
                  </div>
                  <div className="mt-0.5 text-[10px] text-slate-400 flex justify-between gap-2">
                    <span className="truncate max-w-[110px]">{excerpt}</span>
                    <span className="shrink-0">{time}</span>
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
