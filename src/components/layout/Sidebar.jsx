import React from "react";
import { Plus, ArrowUpDown } from "lucide-react";

export default function Sidebar({
  blocks,
  selectedId,
  onSelect,
  onCreate,
  sortMode,
  onToggleSort,
  query,
  onQueryChange
}) {
  return (
    <aside className="w-72 shrink-0 border-r border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/60 backdrop-blur flex flex-col">
      <div className="p-3 flex items-center gap-2 border-b border-slate-200 dark:border-slate-700">
        <button
          onClick={onCreate}
          className="btn-primary-modern flex items-center gap-1 !px-3 !py-1.5"
        >
          <Plus size={16} />
          新建
        </button>
        <button
          onClick={onToggleSort}
          className="btn-outline-modern flex items-center gap-1 !px-3 !py-1.5"
          title="切换排序"
        >
            <ArrowUpDown size={16} />
            {sortMode === "created" ? "创建" : "编辑"}
        </button>
      </div>
      <div className="p-3">
        <input
          className="input-modern w-full"
          placeholder="搜索..."
          value={query}
          onChange={e => onQueryChange(e.target.value)}
        />
      </div>
      <div className="flex-1 overflow-auto custom-scroll px-2 pb-4">
        {blocks.map(b => {
          const firstLine = (b.content || "").split("\n")[0] || "(空)";
          const isSel = b.id === selectedId;
          return (
            <button
              key={b.id}
              onClick={() => onSelect && onSelect(b.id)}
              className={`w-full text-left rounded-lg px-3 py-2 mb-1 text-sm transition group border
                ${
                  isSel
                    ? "bg-gradient-to-r from-indigo-500/90 to-blue-500/90 text-white border-transparent shadow"
                    : "bg-white/70 dark:bg-slate-800/60 hover:bg-white dark:hover:bg-slate-800 border-slate-200/70 dark:border-slate-700/60"
                }`}
            >
              <div className="font-medium truncate">
                {firstLine.slice(0, 24)}
              </div>
              <div className={`text-[10px] mt-1 flex justify-between ${
                isSel ? "text-white/80" : "text-slate-400 dark:text-slate-500"
              }`}>
                <span>{(b.created_at || "").slice(5, 16).replace("T", " ")}</span>
                <span>U:{(b.updated_at || "").slice(5, 16).replace("T", " ")}</span>
              </div>
            </button>
          );
        })}

        {!blocks.length && (
          <div className="text-xs text-slate-400 px-3 py-6 text-center">
            暂无内容
          </div>
        )}
      </div>
    </aside>
  );
}
