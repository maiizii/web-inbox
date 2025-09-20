// src/pages/InboxPage.jsx
import React, { useEffect, useState, useMemo } from "react";
import {
  apiListBlocks,
  apiCreateBlock,
  apiUpdateBlock,
  apiDeleteBlock,
  apiReorderBlocks
} from "../api/cloudflare.js";
import { useToast } from "../hooks/useToast.jsx";
import Sidebar from "../components/layout/Sidebar.jsx";
import BlockEditorAuto from "../components/blocks/BlockEditorAuto.jsx";

function sortBlocksWithLatestOnTop(blocks, latestBlockId) {
  if (!latestBlockId) return blocks;
  const latestBlock = blocks.find(b => b.id === latestBlockId);
  if (!latestBlock) return blocks;
  const latestEditTime = Math.max(...blocks.map(b => new Date(b.updated_at || b.created_at || "1970-01-01").getTime()));
  const blockEditTime = new Date(latestBlock.updated_at || latestBlock.created_at || "1970-01-01").getTime();
  if (blockEditTime === latestEditTime) {
    const rest = blocks.filter(b => b.id !== latestBlockId);
    return [latestBlock, ...rest];
  }
  return blocks;
}

export default function InboxPage() {
  const toast = useToast();
  const [blocks, setBlocks] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [draggingId, setDraggingId] = useState(null);
  const [manualOrder, setManualOrder] = useState(null);
  const [lastEditedBlockId, setLastEditedBlockId] = useState(null);

  async function loadBlocks() {
    try {
      setLoading(true);
      const list = await apiListBlocks();
      setBlocks(list);
      if (!selectedId && list.length) setSelectedId(list[0].id);
      setManualOrder(null);
    } catch (e) {
      toast.push(e.message || "加载失败", { type: "error" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadBlocks(); }, []);

  const filteredBlocks = useMemo(() => {
    const kw = q.trim().toLowerCase();
    if (!kw) return blocks;
    return blocks.filter(b => (b.content || "").toLowerCase().includes(kw));
  }, [blocks, q]);

  const sortedBlocks = useMemo(() => {
    let list = filteredBlocks;
    if (manualOrder && manualOrder.length === list.length) {
      list = manualOrder.map(id => list.find(b => b.id === id)).filter(Boolean);
    } else if (lastEditedBlockId) {
      list = sortBlocksWithLatestOnTop(list, lastEditedBlockId);
    }
    return list;
  }, [filteredBlocks, manualOrder, lastEditedBlockId]);

  const selected = useMemo(() => blocks.find(b => b.id === selectedId) || null, [blocks, selectedId]);

  function optimisticChange(id, patch) {
    setBlocks(prev => prev.map(b => (b.id === id ? { ...b, ...patch } : b)));
  }

  async function persistUpdate(id, payload) {
    const real = await apiUpdateBlock(id, payload);
    setBlocks(prev => prev.map(b => (b.id === id ? { ...b, ...real } : b)));
    setLastEditedBlockId(id);
    setManualOrder(null);

    setBlocks(prev => {
      const latestBlock = prev.find(b => b.id === id);
      if (!latestBlock) return prev;
      const rest = prev.filter(b => b.id !== id);
      const newList = [latestBlock, ...rest];
      apiReorderBlocks(newList.map((b, i) => ({ id: b.id, position: i + 1 })));
      return newList;
    });

    return real;
  }

  async function createEmptyBlock() {
    const optimistic = {
      id: "tmp-" + Date.now(),
      content: "",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      position: (blocks[blocks.length - 1]?.position || blocks.length) + 1,
      optimistic: true
    };
    setBlocks(prev => [optimistic, ...prev]);
    setSelectedId(optimistic.id);
    try {
      const real = await apiCreateBlock("");
      setBlocks(prev => prev.map(b => (b.id === optimistic.id ? { ...b, ...real, optimistic: false } : b)));
      setSelectedId(real.id);
      setLastEditedBlockId(real.id);
      setManualOrder(null);

      setBlocks(prev => {
        const latestBlock = prev.find(b => b.id === real.id);
        if (!latestBlock) return prev;
        const rest = prev.filter(b => b.id !== real.id);
        const newList = [latestBlock, ...rest];
        apiReorderBlocks(newList.map((b, i) => ({ id: b.id, position: i + 1 })));
        return newList;
      });
    } catch (e) {
      toast.push(e.message || "创建失败", { type: "error" });
      setBlocks(prev => prev.filter(b => b.id !== optimistic.id));
    }
  }

  async function deleteBlock(id) {
    const snapshot = blocks;
    setBlocks(prev => prev.filter(b => b.id !== id));
    try {
      await apiDeleteBlock(id);
      toast.push("已删除", { type: "success" });
      if (selectedId === id) {
        const remain = snapshot.filter(b => b.id !== id);
        setSelectedId(remain.length ? remain[0].id : null);
      }
      if (lastEditedBlockId === id) setLastEditedBlockId(null);
      if (manualOrder) setManualOrder(manualOrder.filter(i => i !== id));
    } catch (e) {
      toast.push(e.message || "删除失败", { type: "error" });
      setBlocks(snapshot);
    }
  }

  function onDragStart(id) { setDraggingId(id); }
  function onDragOver(e, overId) {
    e.preventDefault();
    if (!draggingId || draggingId === overId) return;
    setBlocks(prev => {
      const list = [...prev];
      const from = list.findIndex(b => b.id === draggingId);
      const to = list.findIndex(b => b.id === overId);
      if (from === -1 || to === -1) return prev;
      const [item] = list.splice(from, 1);
      list.splice(to, 0, item);
      setManualOrder(list.map(b => b.id));
      setLastEditedBlockId(null);
      return list;
    });
  }
  async function onDrop() {
    if (!draggingId) return;
    const order = blocks.map((b, i) => ({ id: b.id, position: i + 1 }));
    try {
      await apiReorderBlocks(order);
      toast.push("顺序已保存", { type: "success" });
      await loadBlocks();
    } catch (e) {
      toast.push(e.message || "保存顺序失败", { type: "error" });
    } finally {
      setDraggingId(null);
    }
  }

  return (
    <div className="flex flex-1 overflow-hidden rounded-lg gap-2 bg-transparent">
      <Sidebar
        blocks={sortedBlocks}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onCreate={createEmptyBlock}
        query={q}
        onQueryChange={setQ}
        draggingId={draggingId}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={onDrop}
      />
      <div className="flex-1 min-h-0 rounded-lg overflow-hidden bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 p-2">
        <BlockEditorAuto
          block={selected}
          onChange={optimisticChange}
          onDelete={deleteBlock}
          onImmediateSave={persistUpdate}
        />
      </div>
    </div>
  );
}
