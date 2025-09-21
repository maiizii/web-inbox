// src/components/layout/Sidebar.jsx
import React, { useEffect, useState } from "react";
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

  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(max-width: 768px)").matches
      : false
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 768px)");
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  // 与编辑器同色系
  const GAP_BG   = isDark ? "var(--color-bg)" : "#ffffff";
  const BOX_BG   = isDark ? "var(--color-surface)" : "#ffffff";
  const CARD_BG  = isDark ? "var(--color-surface-alt)" : "#ffffff";
  const HOVER_BG = isDark ? "#27425b" : "#f1f5f9";
  const BORDER   = isDark ? "var(--color-border)" : "#e2e8f0";

  // 搜索框内阴影（亮/暗两套）
  const INSET_SHADOW = isDark
    ? "inset 0 2px 6px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.04)"
    : "inset 0 2px 6px rgba(15,23,42,.10), inset 0 1px 0 rgba(255,255,255,.75)";

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
          <div className="text-[12.5px] md:text-[13px] font-medium text-slate-500 dark:text-slate-200 ml-auto">
            {isMobile ? "可调整排序" : "可拖拽排序"}
          </div>
        </div>
      </div>

      {/* 搜索区（加入内阴影） */}
      <div className="px-3 pt-2 pb-2" style={{ backgroundColor: BOX_BG }}>
        <div className="relative">
          <input
            className="input-modern w-full shadow-inner focus:outline-none focus:ring-2 focus:ring-indigo-500/50 dark:focus:ring-indigo-400/50"
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

          const titleColor = isSel
            ? "text-white"
            : isDark
            ? "text-slate-200"
            : "text-slate-800";

          return (
            <div
              key={b.id}
              draggable={!isMobile} // 移动端用按钮调整顺序
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
              <div className="px-3 pt-2 pb-1 pr-12">
                <div className={`font-medium truncate text-sm ${titleColor}`}>
                  {derivedTitle}
                </div>
                <div
                  className={`text-[10px] mt-1 ${
                    isSel ? "text-white/85" : "text-slate-400 dark:text-slate-200"
                  }`}
                >
                  最后编辑：{lastEdit}
                </div>
              </div>

              {/* 移动端：卡片右侧上下按钮 */}
              {isMobile && (onMoveUp || onMoveDown) && (
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1"
                     onClick={e => e.stopPropagation()}>
                  <button
                    className="btn-outline-modern !px-2 !py-1"
                    title="上移"
                    onClick={() => onMoveUp && onMoveUp(b.id)}
                  >
                    <ChevronUp size={16} />
                  </button>
                  <button
                    className="btn-outline-modern !px-2 !py-1"
                    title="下移"
                    onClick={() => onMoveDown && onMoveDown(b.id)}
                  >
                    <ChevronDown size={16} />
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
