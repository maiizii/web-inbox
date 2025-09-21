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

  const GAP_BG   = isDark ? "var(--color-bg)" : "#ffffff";
  const BOX_BG   = isDark ? "var(--color-surface)" : "#ffffff";
  const CARD_BG  = isDark ? "var(--color-surface-alt)" : "#ffffff";
  const HOVER_BG = isDark ? "#27425b" : "#f1f5f9";
  const BORDER   = isDark ? "var(--color-border)" : "#e2e8f0";

  return (
    <aside
      className="w-full md:w-72 shrink-0 rounded-lg overflow-hidden border-r border-slate-200 dark:border-slate-700 flex flex-col"
      style={{ backgroundColor: GAP_BG }}
    >
      <div
        className="p-2 border-b border-slate-200 dark:border-slate-700"
        style={{ backgroundColor: BOX_BG }}
      >
        <div className="flex items-center gap-2">
          <button onClick={onCreate} className="btn-primary-modern !px-3 !py-1 text-sm rounded-md">
            <Plus size={16} />
            新建
          </button>
          <div className="text-[12.5px] md:text-[13px] font-medium text-slate-500 dark:text-slate-200 ml-auto">
            <span className="hidden md:inline">可拖拽排序</span>
            <span className="md:hidden">可调整排序</span>
          </div>
        </div>
      </div>

      <div className="px-3 pt-2 pb-2" style={{ backgroundColor: BOX_BG }}>
        <input
          className="input-modern"
          placeholder="搜索..."
          value={query}
          onChange={e => onQueryChange(e.target.value)}
        />
      </div>

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
          const lastEdit = (b.updated_at || b.created_at || "").replace("T", " ").slice(5, 16);

          const base = "group rounded-md mb-1 text-left relative transition-colors select-none cursor-pointer border";
          const selCls = "bg-gradient-to-r from-indigo-500/90 to-blue-500/90 text-white border-transparent shadow-lg";
          const unselCls = "hover:bg-slate-100 dark:hover:brightness-110";

          return (
            <div
              key={b.id}
              draggable
              onDragStart={() => onDragStart && onDragStart(b.id)}
              onDragOver={e => onDragOver && onDragOver(e, b.id)}
              className={`${base} ${isSel ? selCls : unselCls} ${isDragging ? "opacity-60 ring-2 ring-indigo-400" : ""}`}
              style={isSel ? {} : { backgroundColor: CARD_BG, borderColor: BORDER }}
              onMouseEnter={e => { if (!isSel) e.currentTarget.style.backgroundColor = HOVER_BG; }}
              onMouseLeave={e => { if (!isSel) e.currentTarget.style.backgroundColor = CARD_BG; }}
              onClick={() => onSelect && onSelect(b.id)}
            >
              <div className="px-3 pt-2 pb-1 flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  {/* 强制未选中+深色下标题为浅白色 */}
                  <div
                    className={`font-medium truncate text-sm ${isSel ? "text-white" : "text-slate-900"}`}
                    style={!isSel && isDark ? { color: "rgba(241,245,249,0.92)" } : undefined}
                  >
                    {derivedTitle}
                  </div>
                  <div className={`${isSel ? "text-white/85" : "text-slate-400 dark:text-slate-300"} text-[10px] mt-1`}>
                    最后编辑：{lastEdit}
                  </div>
                </div>

                {/* 移动端上下按钮（卡片右侧） */}
                <div className="md:hidden shrink-0 flex flex-col items-center gap-1 pl-1" onClick={e => e.stopPropagation()}>
                  <button className="btn-outline-modern !px-1.5 !py-1" onClick={() => onMoveUp && onMoveUp(b.id)} title="上移">
                    <ChevronUp size={14} />
                  </button>
                  <button className="btn-outline-modern !px-1.5 !py-1" onClick={() => onMoveDown && onMoveDown(b.id)} title="下移">
                    <ChevronDown size={14} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        {!blocks.length && (
          <div className="text-xs text-slate-400 dark:text-slate-200 px-3 py-6 text-center">暂无内容</div>
        )}
      </div>
    </aside>
  );
}
