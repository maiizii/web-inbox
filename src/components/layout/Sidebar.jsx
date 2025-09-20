// src/components/layout/Sidebar.jsx
import React from "react";
import { Plus } from "lucide-react";
import { useTheme } from "../../context/ThemeContext.jsx";

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
  const { theme } = useTheme();
  const isDark = theme === "dark";

  // 调整为与编辑器同色系（深蓝/石板系）
  const GAP_BG   = isDark ? "var(--color-bg)" : "#ffffff";              // 外层缝隙
  const BOX_BG   = isDark ? "var(--color-surface)" : "#ffffff";         // 内部块
  const CARD_BG  = isDark ? "var(--color-surface-alt)" : "#ffffff";     // 未选中卡片
  const HOVER_BG = isDark ? "#27425b" : "#f1f5f9";                      // 悬停更亮
  const BORDER   = isDark ? "var(--color-border)" : "#e2e8f0";

  return (
    <aside
      className="w-72 shrink-0 rounded-lg overflow-hidden border-r border-slate-200 dark:border-slate-700 flex flex-col"
      style={{ backgroundColor: GAP_BG }}
    >
      {/* 顶部工具条 */}
      <div
        className="p-2 border-b border-slate-200 dark:border-slate-700"
        style={{ backgroundColor: BOX_BG }}
      >
        <div className="flex items-center gap-2">
          <button
            onClick={onCreate}
            className="btn-primary-modern !px-3 !py-1 text-sm rounded-md"
          >
            <Plus size={16} />
            新建
          </button>
          {/* 放大一些 */}
          <div className="text-[12.5px] md:text-[13px] font-medium text-slate-500 dark:text-slate-200 ml-auto">
            可拖拽排序
          </div>
        </div>
      </div>

      {/* 搜索区 */}
      <div className="px-3 pt-2 pb-2" style={{ backgroundColor: BOX_BG }}>
        <input
          className="input-modern"
          placeholder="搜索..."
          value={query}
          onChange={e => onQueryChange(e.target.value)}
        />
      </div>

      {/* 列表 */}
      <div
        className="flex-1 overflow-auto custom-scroll px-2 pb-4 mt-2"
        style={{ backgroundColor: BOX_BG }}
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
            "group rounded-md mb-1 text-left relative transition-colors select-none cursor-pointer border";
          const selCls =
            "bg-gradient-to-r from-indigo-500/90 to-blue-500/90 text-white border-transparent shadow-lg";
          const unselCls =
            "hover:bg-slate-100 dark:hover:brightness-110";

          return (
            <div
              key={b.id}
              draggable
              onDragStart={() => onDragStart && onDragStart(b.id)}
              onDragOver={e => onDragOver && onDragOver(e, b.id)}
              className={`${base} ${isSel ? selCls : unselCls} ${
                isDragging ? "opacity-60 ring-2 ring-indigo-400" : ""
              }`}
              style={
                isSel
                  ? {}
                  : { backgroundColor: CARD_BG, borderColor: BORDER }
              }
              onMouseEnter={e => {
                if (!isSel) e.currentTarget.style.backgroundColor = HOVER_BG;
              }}
              onMouseLeave={e => {
                if (!isSel) e.currentTarget.style.backgroundColor = CARD_BG;
              }}
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
