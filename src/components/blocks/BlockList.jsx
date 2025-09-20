import React from "react";

// blocks: 数组，每个 block 有 id, title, updatedAt, createdAt, order(可选)
// onSelect, onDragSort 由父组件传入

export default function BlockList({ blocks, selectedId, onSelect, onDragSort }) {
  // 按时间+order综合排序
  const sortedBlocks = [...blocks].sort((a, b) => {
    // 优先最新编辑时间（没有则用创建时间），降序
    const timeA = a.updatedAt || a.createdAt || 0;
    const timeB = b.updatedAt || b.createdAt || 0;
    if (timeA !== timeB) return timeB - timeA;
    // 次优先：手动排序字段 order，升序
    if (typeof a.order === "number" && typeof b.order === "number") {
      return a.order - b.order;
    }
    return 0;
  });

  // 拖拽排序逻辑略（如需完整可补充）

  return (
    <div className="block-list">
      {sortedBlocks.map(block => (
        <div
          key={block.id}
          className={`block-item${block.id === selectedId ? " block-item-active" : ""}`}
          onClick={() => onSelect(block.id)}
        >
          <div className="block-title">{block.title}</div>
          <div className="block-meta">
            {block.updatedAt ? `编辑:${new Date(block.updatedAt).toLocaleString()}` : `创建:${new Date(block.createdAt).toLocaleString()}`}
          </div>
        </div>
      ))}
    </div>
  );
}
