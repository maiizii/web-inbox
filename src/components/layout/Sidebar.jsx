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
    // 1) 顶部圆角：overflow-hidden + rounded-lg；2) 缝隙灰：dark:bg-[#808080] (≈50%灰)
    // 4) 左栏底色：内部盒子统一 dark:bg-[#4d4d4d] (≈30%灰)
    <aside className="sidebar w-72 shrink-0 border-r border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden bg-white dark:bg-[#808080] flex flex-col">
      {/* 顶部工具条，同步圆角视觉：放在 30% 灰盒子里 */}
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

      {/* 搜索框容器：30% 灰盒子，缝隙由外层 50% 灰承接 */}
      <div className="px-3 pt-2 pb-2 bg-white dark:bg-[#4d4d4d]">
        <input
          className="input-modern"
          placeholder="搜索..."
          value={query}
          onChange={e => onQueryChange(e.target.value)}
        />
      </div>

      {/* 列表容器：30% 灰盒子；缝隙=顶部 mt-2 显示 50% 灰 */}
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

          // 2) 悬停变手型；选中项悬停不变色（去掉 hover 覆盖）
          const cardBase =
            "group rounded-md mb-1 border text-left relative transition-all select-none cursor-pointer";
          const cardState = isSel
            ? // 选中：固定渐变，禁用 hover 变色
              "bg-gradient-to-r from-indigo-500/90 to-blue-500/90 text-white border-transparent shadow-lg"
            : // 未选中：浅色/深色下各自 hover；深色底色略浅于 30% 灰 → #5a5a5a
              "bg-white dark:bg-[#5a5a5a] hover:bg-slate-100 dark:hover:bg-[#6b6b6b] border-slate-200/70 dark:border-slate-700/60";

          return (
            <div
              key={b.id}
              draggable
              onDragStart={() => onDragStart && onDragStart(b.id)}
              onDragOver={e => onDragOver && onDragOver(e, b.id)}
              className={`${cardBase} ${cardState} ${
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
          <div className="text-xs text-slate-400 dark:text-slate-300 px-3 py-6 text-center">
            暂无内容
          </div>
        )}
      </div>
    </aside>
  );
}
