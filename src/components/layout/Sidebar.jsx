// src/components/layout/Sidebar.jsx
import React from "react";
import { Plus, ArrowUp, ArrowDown } from "lucide-react";
import { useTheme } from "../../context/ThemeContext.jsx";

function escapeHtml(s = "") {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function highlightHtml(text, kw) {
  if (!kw) return escapeHtml(text);
  const pat = new RegExp(`(${kw.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")})`, "gi");
  return escapeHtml(text).replace(pat, "<mark class='kw-hl'>$1</mark>");
}

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
  // 新增：移动端上下移动
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

  const isMobile = typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches;
  const sortTip = isMobile ? "可调整排序" : "可拖拽排序";

  return (
    <aside
      className="w-72 shrink-0 rounded-lg overflow-hidden border-r border-slate-200 dark:border-slate-700 flex flex-col"
      style={{ backgroundColor: GAP_BG }}
    >
      <style>{`
        .kw-hl {
          background: rgba(99,102,241,.28);
          color: inherit;
          padding: 0 .1em;
          border-radius: 3px;
        }
      `}</style>

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
            {sortTip}
          </div>
        </div>
      </div>

      {/* 搜索区（内阴影） */}
      <div className="px-3 pt-2 pb-2" style={{ backgroundColor: BOX_BG }}>
        <input
          className="input-modern"
          placeholder="搜索..."
          value={query}
          onChange={e => onQueryChange(e.target.value)}
          style={{
            boxShadow: "inset 0 1px 2px rgba(0,0,0,.12), inset 0 0 0 9999px transparent"
          }}
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

          const base = "group rounded-md mb-1 text-left relative transition-colors select-none cursor-pointer border";
          const selCls = "bg-gradient-to-r from-indigo-500/90 to-blue-500/90 text-white border-transparent shadow-lg";
          const unselCls = "hover:bg-slate-100 dark:hover:brightness-110";

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
              <div className="px-3 pt-2 pb-1 flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div
                    className={`font-medium truncate text-sm ${
                      isSel ? "text-white" : "text-slate-300 dark:text-slate-300"
                    }`}
                    dangerouslySetInnerHTML={{ __html: highlightHtml(derivedTitle, query.trim()) }}
                  />
                  <div className={`${isSel ? "text-white/85" : "text-slate-400 dark:text-slate-200"} text-[10px] mt-1`}>
                    最后编辑：{lastEdit}
                  </div>
                </div>

                {/* 移动端：右侧上下调整按钮（不占一行） */}
                {isMobile && (
                  <div className="flex flex-col gap-1 ml-1 shrink-0 pt-[2px]">
                    <button
                      className="btn-outline-modern !p-1"
                      title="上移"
                      onClick={e => { e.stopPropagation(); onMoveUp && onMoveUp(b.id); }}
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      className="btn-outline-modern !p-1"
                      title="下移"
                      onClick={e => { e.stopPropagation(); onMoveDown && onMoveDown(b.id); }}
                    >
                      <ArrowDown size={14} />
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
