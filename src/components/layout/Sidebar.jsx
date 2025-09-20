import React, { useState, useEffect } from "react";
import BlockList from "../blocks/BlockList.jsx";

/**
 * Sidebar
 * 负责左侧 block 列表排序逻辑和拖拽/编辑排序切换。
 * 1. 默认按时间降序排序（block.updatedAt或createdAt）。
 * 2. 拖拽排序后，手动排序优先（manualOrder）。
 * 3. 一旦有block内容编辑/new，清空manualOrder并按最新时间排序。
 */

export default function Sidebar({
  blocks, // [{id, title, updatedAt, createdAt, ...}]
  selectedId,
  onSelect,
  onDelete,
  onBlockEdit, // block编辑/新建时调用
}) {
  // manualOrder: null 或 [blockId, ...]，手动排序优先
  const [manualOrder, setManualOrder] = useState(null);

  // 自动切换排序逻辑：只要有block编辑或新建，重置manualOrder为null
  useEffect(() => {
    // blocks每次更新时，检查是否有block.updatedAt比当前列表顺序更靠前
    // 或新建block（长度变化）
    if (!manualOrder || manualOrder.length !== blocks.length) {
      setManualOrder(null);
      return;
    }
    // 如果有block的updatedAt发生变化（即手动排序已失效），重置
    const sortedByTime = [...blocks].sort((a, b) => {
      const timeA = a.updatedAt || a.createdAt || 0;
      const timeB = b.updatedAt || b.createdAt || 0;
      return timeB - timeA;
    }).map(b => b.id);
    if (manualOrder.join(",") !== sortedByTime.join(",")) {
      setManualOrder(null);
    }
  }, [blocks]);

  // BlockList的onManualSort：设置手动顺序
  function handleManualSort(order) {
    setManualOrder(order);
  }

  // block内容编辑/new时被调用
  function handleBlockEdit(...args) {
    setManualOrder(null); // 清空手动排序，回到时间排序
    if (onBlockEdit) onBlockEdit(...args);
  }

  // BlockList渲染
  return (
    <aside className="sidebar">
      <BlockList
        blocks={blocks}
        selectedId={selectedId}
        onSelect={onSelect}
        onManualSort={handleManualSort}
        manualOrder={manualOrder}
      />
      {/* 如需新增、删除按钮可补充 */}
    </aside>
  );
}
