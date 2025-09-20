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
    <aside className="w-72 shrink-0 border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex flex-col rounded-lg">
      <div className="p-2 flex items-center gap-2 app-surface border-b border-slate-200 dark:border-slate-700">
        <button
          onClick={onCreate}
          className="btn-primary-modern !px-3 !py-1 text-sm rounded-md"
        >
          <Plus size={16} />
          新建
        </button>
        <div className="text-[11px] text-slate-500 dark:text-slate-400 ml-auto">
          可拖拽排序
        </div>
      </div>

      <div className="px-3 pt-2 pb-2">
        <input
          className="input-modern"
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
          const lastEdit = (b.updated_at || b.created_at || "")
            .replace("T", " ")
            .slice(5, 16);

          return (
            <div
              key={b.id}
              draggable
              onDragStart={() => onDragStart && onDragStart(b.id)}
              onDragOver={e => onDragOver && onDragOver(e, b.id)}
              className={`sidebar-card ${isSel ? "sidebar-card--active" : ""} ${
                isDragging ? "opacity-60 ring-2 ring-indigo-400" : ""
              } mb-1`}
              onClick={() => onSelect && onSelect(b.id)}
            >
              <div className="px-3 pt-2 pb-1">
                <div className="font-medium truncate text-sm">
                  {derivedTitle}
                </div>
                <div
                  className={`sidebar-card__time ${
                    isSel ? "!text-white/85" : ""
                  }`}
                >
                  最后编辑：{lastEdit}
                </div>
              </div>
            </div>
          );
        })}
        {!blocks.length && (
          <div className="text-xs text-slate-400 dark:text-slate-500 px-3 py-6 text-center">
            暂无内容
          </div>
        )}
      </div>
    </aside>
  );
}
