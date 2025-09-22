// src/components/layout/Sidebar.jsx
import React, { useMemo } from "react";
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
  onMoveDown,
}) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const GAP_BG   = isDark ? "var(--color-bg)" : "#ffffff";
  const BOX_BG   = isDark ? "var(--color-surface)" : "#ffffff";
  const CARD_BG  = isDark ? "var(--color-surface-alt)" : "#ffffff";
  const HOVER_BG = isDark ? "#27425b" : "#f1f5f9";
  const BORDER   = isDark ? "var(--color-border)" : "#e2e8f0";

  const INSET_SHADOW = isDark
    ? "inset 0 1px 4px rgba(0,0,0,.55), inset 0 0 0 1px rgba(255,255,255,.08)"
    : "inset 0 1px 4px rgba(0,0,0,.12), inset 0 0 0 1px rgba(0,0,0,.05)";

  const isMobile = useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(max-width: 768px)").matches;
  }, []);

  return (
    <aside
      className="
        w-full md:w-72 shrink-0 rounded-lg
        border-r border-slate-200 dark:border-slate-700
        flex flex-col min-h-0
      "
      style={{ backgroundColor: GAP_BG }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      {/* 顶部工具条 */}
      <div
        className="p-2 border-b border-slate-200 dark:border-slate-700 shrink-0"
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

      {/* 搜索区 */}
      <div className="px-3 pt-2 pb-2 shrink-0" style={{ backgroundColor: BOX_BG }}>
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
            onChange={(e) => onQueryChange(e.target.value)}
            style={{
              boxShadow: INSET_SHADOW,
              backgroundColor: isDark ? "var(--color-surface-alt)" : "#fff",
            }}
          />
        </div>
      </div>

      {/* 列表：占据剩余空间并可滚动 */}
      <div
        className="
          flex-1 min-h-0 overflow-y-auto overscroll-contain custom-scroll
          px-2 pb-4 mt-2
        "
        style={{
          backgroundColor: BOX_BG,
          // 防止滚动条出现/消失引起抖动
          scrollbarGutter: "stable",
        }}
      >
        {blocks.map((b) => {
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
          const unselCls = "hover:bg-slate-100 dark:hover:brightness-110";

          const titleCls = isSel
            ? "text-white"
            : isDark
            ? "text-slate-200"
            : "text-slate-900";

          return (
            <div
              key={b.id}
              draggable={!isMobile}
              onDragStart={() => onDragStart && onDragStart(b.id)}
              onDragOver={(e) => onDragOver && onDragOver(e, b.id)}
              className={`${base} ${isSel ? selCls : unselCls} ${
                isDragging ? "opacity-60 ring-2 ring-indigo-400" : ""
              }`}
              style={
                isSel ? {} : { backgroundColor: CARD_BG, borderColor: BORDER }
              }
              onMouseEnter={(e) => {
                if (!isSel) e.currentTarget.style.backgroundColor = HOVER_BG;
              }}
              onMouseLeave={(e) => {
                if (!isSel) e.currentTarget.style.backgroundColor = CARD_BG;
              }}
              onClick={() => onSelect && onSelect(b.id)}
            >
              <div className="px-3 pt-2 pb-1 flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className={`font-medium truncate text-sm ${titleCls}`}>
                    {derivedTitle}
                  </div>
                  <div
                    className={`text-[10px] mt-1 ${
                      isSel ? "text-white/85" : "text-slate-400 dark:text-slate-300"
                    }`}
                  >
                    最后编辑：{lastEdit}
                  </div>
                </div>

                {isMobile && (onMoveUp || onMoveDown) && (
                  <div className="flex flex-row items-center gap-1 ml-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onMoveUp && onMoveUp(b.id);
                      }}
                      className="btn-outline-modern !p-1"
                      title="上移"
                    >
                      <ChevronUp size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onMoveDown && onMoveDown(b.id);
                      }}
                      className="btn-outline-modern !p-1"
                      title="下移"
                    >
                      <ChevronDown size={16} />
                    </button>
                  </div>
                )}
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
