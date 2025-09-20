import React from "react";
import { Plus } from "lucide-react";

export default function Sidebar({
  blocks,
  selectedId,
  onSelect,
  onCreate,
  query,
  onQueryChange,
  draggingId,
  onDragStart,
  onDragOver,
  onDrop
}) {
  return (
    <aside className="w-72 shrink-0 border-r border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/70 backdrop-blur-md flex flex-col">
      <div className="p-3 flex items-center gap-2 border-b border-slate-200 dark:border-slate-700">
        <button
          onClick={onCreate}
          className="flex items-center gap-1 !px-3 !py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition"
        >
          <Plus size={16} />
          新建
        </button>
        <div className="text-[11px] text-slate-500 dark:text-slate-400 ml-auto">
          可拖拽排序
        </div>
      </div>
      <div className="px-3 pt-3">
        <input
          className="w-full px-2 py-1 text-sm rounded-md border border-slate-300 dark:border-slate-700 bg-white/90 dark:bg-slate-800/80 text-gray-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="搜索..."
          value={query}
          onChange={e => onQueryChange(e.target.value)}
        />
      </div>
      <div
        className="flex-1 overflow-auto custom-scroll px-2 pb-4 mt-2"
        onDragOver={e => e.preventDefault()}
        onDrop={onDrop}
      >
        {blocks.map(b => {
          const firstLine = (b.content || "").split("\n")[0] || "(空)";
          const derivedTitle = firstLine.slice(0, 64) || "(空)";
          const isSel = b.id === selectedId;
          const isDragging = b.id === draggingId;
          const lastEdit = (b.updated_at || b.created_at || "").replace("T", " ").slice(5, 16);
          return (
            <div
              key={b.id}
              draggable
              onDragStart={() => onDragStart && onDragStart(b.id)}
              onDragOver={e => onDragOver && onDragOver(e, b.id)}
              className={`group rounded-lg mb-1 border text-left relative transition-all cursor-pointer
                ${
                  isSel
                    ? "bg-gradient-to-r from-indigo-500/90 to-blue-500/90 text-white border-transparent shadow-lg"
                    : "bg-white/70 dark:bg-slate-800/60 hover:bg-white dark:hover:bg-slate-800 border-slate-200/70 dark:border-slate-700/60"
                }
                ${isDragging ? "opacity-60 ring-2 ring-indigo-400" : ""}
              `}
              onClick={() => onSelect && onSelect(b.id)}
            >
              <div className="px-3 pt-2 pb-1">
                <div className="font-medium truncate text-sm">
                  {derivedTitle}
                </div>
                <div className={`text-[10px] mt-1 ${
                  isSel ? "text-white/80" : "text-slate-400 dark:text-slate-500"
                }`}>
                  最后编辑：{lastEdit}
                </div>
              </div>
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
