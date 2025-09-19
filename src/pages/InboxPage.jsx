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

export default function InboxPage() {
  const toast = useToast();
  const [blocks, setBlocks] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [draggingId, setDraggingId] = useState(null);

  async function loadBlocks() {
    try {
      setLoading(true);
      const list = await apiListBlocks();
      setBlocks(list);
      if (!selectedId && list.length) setSelectedId(list[0].id);
    } catch (e) {
      toast.push(e.message || "加载失败", { type: "error" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadBlocks(); }, []); // eslint-disable-line

  const filteredBlocks = useMemo(() => {
    const kw = q.trim().toLowerCase();
    if (!kw) return blocks;
    return blocks.filter(b =>
      (b.content || "").toLowerCase().includes(kw)
    );
  }, [blocks, q]);

  const selected = useMemo(
    () => blocks.find(b => b.id === selectedId) || null,
    [blocks, selectedId]
  );

  function optimisticChange(id, patch) {
    setBlocks(prev => prev.map(b => (b.id === id ? { ...b, ...patch } : b)));
  }

  async function persistUpdate(id, payload) {
    const real = await apiUpdateBlock(id, payload);
    setBlocks(prev => prev.map(b => (b.id === id ? { ...b, ...real } : b)));
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
    // 新建后放在顶部视觉上更快定位用户
    setBlocks(prev => [optimistic, ...prev]);
    setSelectedId(optimistic.id);
    try {
      const real = await apiCreateBlock("");
      setBlocks(prev =>
        prev.map(b => (b.id === optimistic.id ? { ...b, ...real, optimistic: false } : b))
      );
      setSelectedId(real.id);
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
    } catch (e) {
      toast.push(e.message || "删除失败", { type: "error" });
      setBlocks(snapshot);
    }
  }

  // 拖拽处理
  function onDragStart(id) {
    setDraggingId(id);
  }
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
    <div className="flex flex-1 overflow-hidden">
      <Sidebar
        blocks={filteredBlocks}
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
      <div className="flex-1 min-h-0">
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
