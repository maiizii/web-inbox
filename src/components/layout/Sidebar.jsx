import React from "react";
import { Plus } from "lucide-react";

// 工具函数：将 selected block（如果其编辑时间是最新）置顶
function sortBlocksWithSelectedOnTop(blocks, selectedId) {
  if (!blocks.length || !selectedId) return blocks;
  const selectedBlock = blocks.find(b => b.id === selectedId);
  if (!selectedBlock) return blocks;

  // 找到最新编辑的时间
  const latestEditTime = Math.max(
    ...blocks.map(b =>
      new Date(b.updated_at || b.created_at || "1970-01-01").getTime()
    )
  );
  const selectedEditTime = new Date(selectedBlock.updated_at || selectedBlock.created_at || "1970-01-01").getTime();

  // 只有当当前选中的 block 编辑时间是最新时才置顶
  if (selectedEditTime === latestEditTime) {
    // 其他顺序保持，只把 selectedBlock移到最前面
    const rest = blocks.filter(b => b.id !== selectedId);
    return [selectedBlock, ...rest];
  }
  return blocks;
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
  onDrop
}) {
  // 实时排序：被选中的 block 如果编辑时间最新，排最前
  const sortedBlocks = sortBlocksWithSelectedOnTop(blocks, selectedId);

  return (
    <aside className="w-[15rem] shrink-0 border-r border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/60 backdrop-blur flex flex-col">
      <div className="p-3 flex items-center gap-2 border-b border-slate-200 dark:border-slate-700">
        <button
          onClick={onCreate}
          className="btn-primary-modern flex items-center gap-1 !px-3 !py-2 text-sm"
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
          className="input-modern w-full"
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
        {sortedBlocks.map(b => {
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
              className={`group rounded-lg mb-1 border text-left relative transition cursor-pointer
                ${
                  isSel
                    ? "bg-gradient-to-r from-indigo-500/90 to-blue-500/90 text-white border-transparent shadow"
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
        {!sortedBlocks.length && (
          <div className="text-xs text-slate-400 px-3 py-6 text-center">
            暂无内容
          </div>
        )}
      </div>
    </aside>
  );
}
