// src/components/layout/Sidebar.jsx
import React from "react";
import { Plus, ChevronUp, ChevronDown } from "lucide-react";
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
  onDrop,
  onMoveUp,
  onMoveDown
}) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  // 与编辑器同色系
  const GAP_BG   = isDark ? "var(--color-bg)" : "#ffffff";          // 外层缝隙
  const BOX_BG   = isDark ? "var(--color-surface)" : "#ffffff";     // 容器
  const CARD_BG  = isDark ? "var(--color-surface-alt)" : "#ffffff"; // 未选卡片
  const HOVER_BG = isDark ? "#27425b" : "#f1f5f9";                  // 悬停
  const BORDER   = isDark ? "var(--color-border)" : "#e2e8f0";

  return (
    <aside
      // 关键：手机 w-full，桌面 md:w-72；手机用下边框，桌面右边框
      className="w-full md:w-72 shrink-0 rounded-lg overflow-hidden border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-700 flex flex-col"
      style={{ backgroundColor: GAP_BG }}
    >
      {/* 顶部工具条 */}
      <div
        className="p-2 border-b border-slate-200 dark:border-slate-700"
        style={{ backgroundColor: BOX_BG }}
      >
        <div className="flex items-center gap-2">
          <button onClick={onCreate} className="btn-primary-modern !px-3 !py-1 text-sm rounded-md">
            <Plus size={16} />
            新建
          </button>
          {/* PC 显示“可拖拽排序”，移动端显示“可调整排序” */}
          <div className="text-[12.5px] md:text-[13px] font-medium text-slate-500 dark:text-slate-200 ml-auto">
            <span className="hidden md:inline">可拖拽排序</span>
            <span className="md:hidden">可调整排序</span>
          </div>
        </div>
      </div>

      {/* 搜索区：w-full + 内阴影 */}
     <div className="px-3 pt-2 pb-2" style={{ backgroundColor: BOX_BG }}>
        <div className="relative">
          <input
            className="
              input-modern w-full appearance-none
              focus:outline-none focus:ring-2 focus:ring-indigo-500/50 dark:focus:ring-indigo-400/50
              border border-black/5 dark:border-white/10
              rounded-md
            "
            placeholder="搜索..."
            value={query}
            onChange={e => onQueryChange(e.target.value)}
            style={{
              boxShadow: INSET_SHADOW,
              backgroundColor: isDark ? "var(--color-surface-alt)" : "#fff"
            }}
          />
        </div>
      </div>

      {/* 列表 */}
      <div
        className="flex-1 overflow-auto custom-scroll px-2 pb-4 mt-2"
        style={{ backgroundColor: BOX_BG }}
        onDragOver={e => e.preventDefault()}
        onDrop={onDrop}
      >
        {blocks.map((b, idx) => {
          const firstLine = (b.content || "").split("\n")[0] || "(空)";
          const derivedTitle = firstLine.slice(0, 64) || "(空)";
          const isSel = b.id === selectedId;
          const isDragging = b.id === draggingId;
          const lastEdit = (b.updated_at || b.created_at || "")
            .replace("T", " ")
            .slice(5, 16);

          const base =
            "group rounded-md mb-2 text-left relative transition-colors select-none cursor-pointer border";
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
              style={isSel ? {} : { backgroundColor: CARD_BG, borderColor: BORDER }}
              onMouseEnter={e => { if (!isSel) e.currentTarget.style.backgroundColor = HOVER_BG; }}
              onMouseLeave={e => { if (!isSel) e.currentTarget.style.backgroundColor = CARD_BG; }}
              onClick={() => onSelect && onSelect(b.id)}
            >
              <div className="px-3 pt-2 pb-2">
                <div
                  className={`font-medium truncate text-sm ${
                    isSel
                      ? "text-white"
                      : "text-slate-600 dark:text-slate-200/80" // 深色下浅色标题
                  }`}
                >
                  {derivedTitle}
                </div>
                <div className={`${isSel ? "text-white/85" : "text-slate-400 dark:text-slate-300"} text-[10px] mt-1`}>
                  最后编辑：{lastEdit}
                </div>
              </div>

              {/* 移动端：卡片右侧 上/下 调整按钮；桌面隐藏 */}
              {(onMoveUp || onMoveDown) && (
                <div className="absolute right-1 top-1 flex md:hidden gap-1">
                  <button
                    type="button"
                    className="btn-outline-modern !p-1"
                    onClick={(e) => { e.stopPropagation(); onMoveUp && onMoveUp(b.id, idx); }}
                    title="上移"
                  >
                    <ChevronUp size={14} />
                  </button>
                  <button
                    type="button"
                    className="btn-outline-modern !p-1"
                    onClick={(e) => { e.stopPropagation(); onMoveDown && onMoveDown(b.id, idx); }}
                    title="下移"
                  >
                    <ChevronDown size={14} />
                  </button>
                </div>
              )}
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
