// src/components/layout/Sidebar.jsx
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
    // 外层：浅色=白；深色=50%灰，作为“缝隙/留白”底色
    <aside className="w-72 shrink-0 rounded-lg overflow-hidden border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-[#808080] flex flex-col">
      {/* 工具条：块内底色 30% 灰 */}
      <div className="p-2 bg-white dark:bg-[#4d4d4d] border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <button
            onClick={onCreate}
            className="btn-primary-modern !px-3 !py-1 text-sm rounded-md"
          >
            <Plus size={16} />
            新建
          </button>
          <div className="text-[11px] text-slate-500 dark:text-slate-300 ml-auto">
            可拖拽排序
          </div>
        </div>
      </div>

      {/* 搜索区：块内底色 30% 灰 */}
      <div className="px-3 pt-2 pb-2 bg-white dark:bg-[#4d4d4d]">
        <input
          className="input-modern"
          placeholder="搜索..."
          value={query}
          onChange={e => onQueryChange(e.target.value)}
        />
      </div>

      {/* 列表容器：块内底色 30% 灰；与工具条之间的“缝隙”由外层 50% 灰承接 */}
      <div
        className="flex-1 overflow-auto custom-scroll px-2 pb-4 mt-2 bg-white dark:bg-[#4d4d4d]"
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

          const base =
            "group rounded-md mb-1 border text-left relative transition-colors select-none cursor-pointer";
          const state = isSel
            ? // 选中：固定渐变，不随 hover 改色
              "bg-gradient-to-r from-indigo-500/90 to-blue-500/90 text-white border-transparent shadow-lg hover:!bg-transparent"
            : // 未选中：深色下更浅 (#6a6a6a)，悬停再浅一点；与 30% 灰容器有明确层级
              "bg-white dark:bg-[#6a6a6a] hover:bg-slate-100 dark:hover:bg-[#767676] border-slate-200/70 dark:border-[#5e5e5e]";

          return (
            <div
              key={b.id}
              draggable
              onDragStart={() => onDragStart && onDragStart(b.id)}
              onDragOver={e => onDragOver && onDragOver(e, b.id)}
              className={`${base} ${state} ${
                isDragging ? "opacity-60 ring-2 ring-indigo-400" : ""
              }`}
              onClick={() => onSelect && onSelect(b.id)}
            >
              <div className="px-3 pt-2 pb-1">
                <div className="font-medium truncate text-sm">{derivedTitle}</div>
                <div
                  className={`text-[10px] mt-1 ${
                    isSel ? "text-white/85" : "text-slate-400 dark:text-slate-200"
                  }`}
                >
                  最后编辑：{lastEdit}
                </div>
              </div>
            </div>
          );
        })}
        {!blocks.length && (
          <div className="text-xs text-slate-400 dark:text-slate-200 px-3 py-6 text-center">
            暂无内容
          </div>
        )}
      </div>
    </aside>
  );
}
