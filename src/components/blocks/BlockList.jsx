import React, { useRef } from "react";

/**
 * BlockList
 * 1. 默认按 block.updatedAt（无则createdAt）降序排，最新在最前。
 * 2. 支持拖拽排序（手动排序优先，区分manualOrder字段）。
 * 3. 只要有block编辑或新建，自动回到最新时间排序（manualOrder清空）。
 * 4. 拖拽排序后，manualOrder变为当前显示顺序，后续新建/编辑会覆盖排序。
 */

export default function BlockList({ blocks, selectedId, onSelect, onManualSort, manualOrder }) {
  // manualOrder: 数组 [blockId, ...]，手动顺序优先；否则按时间降序排
  // blocks: [{id, title, updatedAt, createdAt, ...}]

  // 计算最终排序
  let sortedBlocks;
  if (manualOrder && manualOrder.length === blocks.length) {
    // 手动排序优先
    sortedBlocks = manualOrder
      .map(id => blocks.find(b => b.id === id))
      .filter(Boolean);
  } else {
    // 默认时间排序
    sortedBlocks = [...blocks].sort((a, b) => {
      const timeA = a.updatedAt || a.createdAt || 0;
      const timeB = b.updatedAt || b.createdAt || 0;
      return timeB - timeA;
    });
  }

  // 拖拽排序逻辑
  const draggingIdRef = useRef(null);

  function onDragStart(e, id) {
    draggingIdRef.current = id;
    e.dataTransfer.effectAllowed = "move";
  }
  function onDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }
  function onDrop(e, targetId) {
    e.preventDefault();
    const draggingId = draggingIdRef.current;
    if (draggingId === targetId) return;
    const fromIdx = sortedBlocks.findIndex(b => b.id === draggingId);
    const toIdx = sortedBlocks.findIndex(b => b.id === targetId);
    if (fromIdx < 0 || toIdx < 0) return;
    const newOrder = [...sortedBlocks];
    const [moved] = newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, moved);
    // 更新manualOrder
    onManualSort(newOrder.map(b => b.id));
    draggingIdRef.current = null;
  }

  return (
    <div className="block-list">
      {sortedBlocks.map(block => (
        <div
          key={block.id}
          className={`block-item${block.id === selectedId ? " block-item-active" : ""}`}
          onClick={() => onSelect(block.id)}
          draggable
          onDragStart={e => onDragStart(e, block.id)}
          onDragOver={onDragOver}
          onDrop={e => onDrop(e, block.id)}
        >
          <div className="block-title">{block.title}</div>
          <div className="block-meta">
            {block.updatedAt
              ? `编辑:${new Date(block.updatedAt).toLocaleString()}`
              : `创建:${new Date(block.createdAt).toLocaleString()}`}
          </div>
        </div>
      ))}
    </div>
  );
}
