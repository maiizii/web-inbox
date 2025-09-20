// src/pages/InboxPage.jsx
import React, { useEffect, useState, useMemo } from "react";
import { apiListBlocks, apiCreateBlock, apiUpdateBlock, apiDeleteBlock, apiReorderBlocks } from "../api/cloudflare.js";
import { useToast } from "../hooks/useToast.jsx";
import Sidebar from "../components/layout/Sidebar.jsx";
import BlockEditorAuto from "../components/blocks/BlockEditorAuto.jsx";

function sortBlocksWithLatestOnTop(blocks, latestBlockId) {
  if (!latestBlockId) return blocks;
  const hit = blocks.find(b => b.id === latestBlockId);
  if (!hit) return blocks;
  const tMax = Math.max(...blocks.map(b => new Date(b.updated_at || b.created_at || "1970-01-01").getTime()));
  const tHit = new Date(hit.updated_at || hit.created_at || "1970-01-01").getTime();
  if (tHit === tMax) { const rest = blocks.filter(b => b.id !== latestBlockId); return [hit, ...rest]; }
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
    } finally { setLoading(false); }
  }
  useEffect(() => { loadBlocks(); }, []);

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    if (!kw) return blocks;
    return blocks.filter(b => (b.content || "").toLowerCase().includes(kw));
  }, [blocks, q]);

  const sorted = useMemo(() => {
    let list = filtered;
    if (manualOrder && manualOrder.length === list.length) list = manualOrder.map(id => list.find(b => b.id === id)).filter(Boolean);
    else if (lastEditedBlockId) list = sortBlocksWithLatestOnTop(list, lastEditedBlockId);
    return list;
  }, [filtered, manualOrder, lastEditedBlockId]);

  const selected = useMemo(() => blocks.find(b => b.id === selectedId) || null, [blocks, selectedId]);

  function optimisticChange(id, patch) { setBlocks(prev => prev.map(b => (b.id === id ? { ...b, ...patch } : b))); }
  async function persistUpdate(id, payload) {
    const real = await apiUpdateBlock(id, payload);
    setBlocks(prev => prev.map(b => (b.id === id ? { ...b, ...real } : b)));
    setLastEditedBlockId(id); setManualOrder(null);
    setBlocks(prev => {
      const hit = prev.find(b => b.id === id); if (!hit) return prev;
      const rest = prev.filter(b => b.id !== id);
      const next = [hit, ...rest];
      apiReorderBlocks(next.map((b, i) => ({ id: b.id, position: i + 1 })));
      return next;
    });
    return real;
  }
  async function createEmptyBlock() {
    const tmp = { id: "tmp-" + Date.now(), content: "", created_at: new Date().toISOString(), updated_at: new Date().toISOString(), position: (blocks[blocks.length - 1]?.position || blocks.length) + 1, optimistic: true };
    setBlocks(prev => [tmp, ...prev]); setSelectedId(tmp.id);
    try {
      const real = await apiCreateBlock("");
      setBlocks(prev => prev.map(b => (b.id === tmp.id ? { ...b, ...real, optimistic: false } : b)));
      setSelectedId(real.id); setLastEditedBlockId(real.id); setManualOrder(null);
      setBlocks(prev => {
        const hit = prev.find(b => b.id === real.id); if (!hit) return prev;
        const rest = prev.filter(b => b.id !== real.id);
        const next = [hit, ...rest];
        apiReorderBlocks(next.map((b, i) => ({ id: b.id, position: i + 1 })));
        return next;
      });
    } catch (e) { toast.push(e.message || "创建失败", { type: "error" }); setBlocks(prev => prev.filter(b => b.id !== tmp.id)); }
  }
  async function deleteBlock(id) {
    const snap = blocks; setBlocks(prev => prev.filter(b => b.id !== id));
    try {
      await apiDeleteBlock(id); toast.push("已删除", { type: "success" });
      if (selectedId === id) { const remain = snap.filter(b => b.id !== id); setSelectedId(remain.length ? remain[0].id : null); }
      if (lastEditedBlockId === id) setLastEditedBlockId(null);
      if (manualOrder) setManualOrder(manualOrder.filter(i => i !== id));
    } catch (e) { toast.push(e.message || "删除失败", { type: "error" }); setBlocks(snap); }
  }
  function onDragStart(id) { setDraggingId(id); }
  function onDragOver(e, overId) {
    e.preventDefault(); if (!draggingId || draggingId === overId) return;
    setBlocks(prev => {
      const list = [...prev]; const from = list.findIndex(b => b.id === draggingId); const to = list.findIndex(b => b.id === overId);
      if (from === -1 || to === -1) return prev;
      const [item] = list.splice(from, 1); list.splice(to, 0, item);
      setManualOrder(list.map(b => b.id)); setLastEditedBlockId(null); return list;
    });
  }
  async function onDrop() {
    if (!draggingId) return;
    const order = blocks.map((b, i) => ({ id: b.id, position: i + 1 }));
    try { await apiReorderBlocks(order); toast.push("顺序已保存", { type: "success" }); await loadBlocks(); }
    catch (e) { toast.push(e.message || "保存顺序失败", { type: "error" }); }
    finally { setDraggingId(null); }
  }

  return (
    <div className="flex flex-1 overflow-hidden rounded-lg gap-2">
      <Sidebar
        blocks={sorted}
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
      <div className="flex-1 min-h-0 rounded-lg overflow-hidden app-surface">
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
