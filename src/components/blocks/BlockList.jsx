import React, { useRef } from "react";

/**
 * BlockList
 * - 默认按最新编辑时间降序排列
 * - manualOrder 数组优先（手动排序模式）
 * - 拖拽排序后调用 onManualSort(newOrderIdArray)
 */

export default function BlockList({ blocks, selectedId, onSelect, onManualSort, manualOrder }) {
  // 1. 计算排序
  let sortedBlocks;
  if (manualOrder && manualOrder.length === blocks.length) {
    sortedBlocks = manualOrder
      .map(id => blocks.find(b => b.id === id))
      .filter(Boolean);
  } else {
    sortedBlocks = [...blocks].sort((a, b) => {
      const ta = a.updatedAt || a.createdAt || 0;
      const tb = b.updatedAt || b.createdAt || 0;
      return tb - ta;
    });
  }

  // 2. 拖拽排序
  const dragId = useRef(null);

  function onDragStart(e, id) {
    dragId.current = id;
    e.dataTransfer.effectAllowed = "move";
  }
  function onDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }
  function onDrop(e, targetId) {
    e.preventDefault();
    const fromIdx = sortedBlocks.findIndex(b => b.id === dragId.current);
    const toIdx = sortedBlocks.findIndex(b => b.id === targetId);
    if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;
    const newOrder = [...sortedBlocks];
    const [moved] = newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, moved);
    onManualSort(newOrder.map(b => b.id));
    dragId.current = null;
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
              ? `编辑: ${new Date(block.updatedAt).toLocaleString()}`
              : `创建: ${new Date(block.createdAt).toLocaleString()}`}
          </div>
        </div>
      ))}
    </div>
  );
}
