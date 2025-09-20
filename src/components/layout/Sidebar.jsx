import React, { useState, useEffect } from "react";
import BlockList from "../blocks/BlockList.jsx";

/**
 * Sidebar
 * - 默认按时间排序（block.updatedAt/createdAt）
 * - 拖拽排序后进入手动排序模式
 * - 只要有block编辑或新建，自动回到时间排序
 */

export default function Sidebar({
  blocks,            // [{id, title, updatedAt, createdAt, ...}]
  selectedId,
  onSelect,
  onDelete,
  onBlockEdit,       // block编辑/新建时调用
}) {
  const [manualOrder, setManualOrder] = useState(null);
  const [lastBlocksSignature, setLastBlocksSignature] = useState("");

  // 生成blocks签名（id+时间），用于判断是否有编辑/新建
  function getBlocksSignature(blocks) {
    return blocks.map(b => `${b.id}-${b.updatedAt || b.createdAt || ""}`).join(",");
  }

  // 只要blocks顺序或时间变化，重置manualOrder为null（恢复时间排序）
  useEffect(() => {
    const sig = getBlocksSignature(blocks);
    if (lastBlocksSignature !== "" && sig !== lastBlocksSignature) {
      setManualOrder(null);
    }
    setLastBlocksSignature(sig);
  }, [blocks]);

  // 拖拽排序后切换到手动排序
  function handleManualSort(order) {
    setManualOrder(order);
  }

  // block内容编辑/new时被调用
  function handleBlockEdit(...args) {
    setManualOrder(null);
    if (onBlockEdit) onBlockEdit(...args);
  }

  return (
    <aside className="sidebar">
      <BlockList
        blocks={blocks}
        selectedId={selectedId}
        onSelect={onSelect}
        onManualSort={handleManualSort}
        manualOrder={manualOrder}
      />
      {/* 可加新建/删除按钮等 */}
    </aside>
  );
}
