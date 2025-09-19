import React from "react";
import { Plus, ArrowUpDown } from "lucide-react";

const SORT_LABEL = {
  position: "手动",
  created: "创建",
  updated: "编辑"
};

export default function Sidebar({
  blocks,
  selectedId,
  onSelect,
  onCreate,
  sortMode,
  onCycleSort,
  query,
  onQueryChange,
  draggingId,
  onDragStart,
  onDragOver,
  onDrop,
  manualMode
}) {
  return (
    <aside className="w-72 shrink-0 border-r border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/60 backdrop-blur flex flex-col">
      <div className="p-3 flex items-center gap-2 border-b border-slate-200 dark:border-slate-700">
        <button
          onClick={onCreate}
          className="btn-primary-modern flex items-center gap-1 !px-3 !py-2 text-sm"
        >
          <Plus size={16} />
          新建
        </button>
        <button
          onClick={onCycleSort}
          className="btn-outline-modern flex items-center gap-1 !px-3 !py-2 text-sm"
          title="切换排序（手动 / 创建 / 编辑）"
        >
          <ArrowUpDown size={16} />
          {SORT_LABEL[sortMode] || sortMode}
        </button>
      </div>
      <div className="px-3 pt-3">
        <input
          className="input-modern w-full"
          placeholder="搜索..."
          value={query}
          onChange={e => onQueryChange(e.target.value)}
        />
        {manualMode && (
          <div className="text-[10px] mt-1 text-slate-400">
            手动模式：可拖拽条目
          </div>
        )}
      </div>
      <div
        className="flex-1 overflow-auto custom-scroll px-2 pb-4 mt-2"
        onDragOver={e => e.preventDefault()}
        onDrop={onDrop}
      >
        {blocks.map((b, index) => {
          const firstLine = (b.content || "").split("\n")[0] || "(空)";
          const isSel = b.id === selectedId;
          const isDragging = b.id === draggingId;
          return (
            <div
              key={b.id}
              draggable={manualMode}
              onDragStart={() => onDragStart && onDragStart(b.id)}
              onDragOver={e => onDragOver && onDragOver(e, b.id)}
              className={`group rounded-lg mb-1 border text-left relative transition
                ${
                  isSel
                    ? "bg-gradient-to-r from-indigo-500/90 to-blue-500/90 text-white border-transparent shadow"
                    : "bg-white/70 dark:bg-slate-800/60 hover:bg-white dark:hover:bg-slate-800 border-slate-200/70 dark:border-slate-700/60"
                }
                ${isDragging ? "opacity-60 ring-2 ring-indigo-400" : ""}
              `}
            >
              <button
                onClick={() => onSelect && onSelect(b.id)}
                className="w-full text-left px-3 py-2"
              >
                <div className="font-medium truncate">
                  {firstLine.slice(0, 32)}
                </div>
                <div
                  className={`text-[10px] mt-1 flex justify-between ${
                    isSel ? "text-white/80" : "text-slate-400 dark:text-slate-500"
                  }`}
                >
                  <span>{(b.created_at || "").slice(5, 16).replace("T", " ")}</span>
                  <span>U:{(b.updated_at || "").slice(5, 16).replace("T", " ")}</span>
                </div>
              </button>
              {manualMode && (
                <div className="absolute left-1 top-1 text-[10px] text-slate-400 cursor-grab group-hover:opacity-100 opacity-70 select-none">
                  {index + 1}
                </div>
              )}
            </div>
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
