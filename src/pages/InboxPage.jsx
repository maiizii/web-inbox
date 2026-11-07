// src/pages/InboxPage.jsx
import React, { useEffect, useState, useMemo } from "react";
import {
  apiListBlocks,
  apiCreateBlock,
  apiUpdateBlock,
  apiSetBlockStarred,
  apiDeleteBlock,
  apiReorderBlocks
} from "../api/cloudflare.js";
import { useToast } from "../hooks/useToast.jsx";
import Sidebar from "../components/layout/Sidebar.jsx";
import BlockEditorAuto from "../components/blocks/BlockEditorAuto.jsx";

// 与后端 listBlocks 完全一致的排序规则：position ASC, updated_at DESC, created_at DESC。
// 新建与保存都会把 position 归零（见 functions/[[path]].js），因此最近编辑/新建的记录
// 稳定置顶且跨刷新成立；不再使用“仅把最近一条临时浮顶”的 hack
// （那条 hack 在编辑其他记录、拖拽或刷新后会让记录掉回旧 position 的位置）。
function compareBlocks(a, b) {
  const pa = a.position ?? 0;
  const pb = b.position ?? 0;
  if (pa !== pb) return pa - pb;
  const ta = new Date(a.updated_at || a.created_at || 0).getTime();
  const tb = new Date(b.updated_at || b.created_at || 0).getTime();
  if (ta !== tb) return tb - ta;
  return (
    new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
  );
}

export default function InboxPage() {
  const toast = useToast();
  const [blocks, setBlocks] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [draggingId, setDraggingId] = useState(null);
  const [manualOrder, setManualOrder] = useState(null);
  const [starUpdatingIds, setStarUpdatingIds] = useState(() => new Set());

  // —— 移动端“列表/编辑”两屏
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(max-width: 768px)").matches
      : false
  );
  const [mobileStage, setMobileStage] = useState("list"); // list | editor
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 768px)");
    const handler = () => {
      const now = mq.matches;
      setIsMobile(now);
      if (now) setMobileStage("list");
    };
    handler();
    mq.addEventListener?.("change", handler);
    return () => mq.removeEventListener?.("change", handler);
  }, []);

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
    } else {
      list = [...list].sort(compareBlocks);
    }
    return list;
  }, [filteredBlocks, manualOrder]);

  const selected = useMemo(
    () => blocks.find(b => b.id === selectedId) || null,
    [blocks, selectedId]
  );

  function optimisticChange(id, patch) {
    setBlocks(prev => prev.map(b => (b.id === id ? { ...b, ...patch } : b)));
  }

  async function persistUpdate(id, payload) {
    const real = await apiUpdateBlock(id, payload);
    // 服务端在内容变化时已把 position 归零（real.position = 0），
    // 本地按真实排序规则重排后，最近编辑的记录稳定置顶，刷新后顺序不变
    setBlocks(prev => prev.map(b => (b.id === id ? { ...b, ...real } : b)));
    setManualOrder(null);
    return real;
  }

  async function createEmptyBlock() {
    const optimistic = {
      id: "tmp-" + Date.now(),
      content: "",
      format: "text",
      starred: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      position: 0,
      optimistic: true
    };
    setBlocks(prev => [optimistic, ...prev]);
    setSelectedId(optimistic.id);
    try {
      const real = await apiCreateBlock("", "text");
      // 后端新建固定 position=0（置顶），前端按真实排序规则重排即可
      setBlocks(prev => prev.map(b => (b.id === optimistic.id ? { ...b, ...real, optimistic: false } : b)));
      setSelectedId(real.id);
      setManualOrder(null);
      if (isMobile) setMobileStage("editor");
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
        if (isMobile) setMobileStage("list");
      }
      if (manualOrder) setManualOrder(manualOrder.filter(i => i !== id));
    } catch (e) {
      toast.push(e.message || "删除失败", { type: "error" });
      setBlocks(snapshot);
    }
  }

  async function toggleStarred(id) {
    const current = blocks.find(block => block.id === id);
    if (!current || current.optimistic || starUpdatingIds.has(id)) return;
    const next = !(current.starred === true || current.starred === 1);
    setStarUpdatingIds(previous => new Set(previous).add(id));
    optimisticChange(id, { starred: next ? 1 : 0 });
    try {
      const result = await apiSetBlockStarred(id, next);
      optimisticChange(id, { starred: result.starred ? 1 : 0 });
    } catch (e) {
      optimisticChange(id, { starred: current.starred ? 1 : 0 });
      toast.push(e.message || "收藏状态更新失败", { type: "error" });
    } finally {
      setStarUpdatingIds(previous => {
        const updated = new Set(previous);
        updated.delete(id);
        return updated;
      });
    }
  }

  // —— 移动端：卡片右侧上下按钮
  function moveBlock(id, dir) {
    let newOrder = null;
    setBlocks(prev => {
      const idx = prev.findIndex(b => b.id === id);
      if (idx < 0) return prev;
      const ni = idx + dir;
      if (ni < 0 || ni >= prev.length) return prev;
      const arr = [...prev];
      [arr[idx], arr[ni]] = [arr[ni], arr[idx]];
      newOrder = arr.map((b, i) => ({ id: b.id, position: i + 1 }));
      setManualOrder(arr.map(b => b.id));
      return arr;
    });
    if (newOrder) {
      apiReorderBlocks(newOrder)
        .then(() => toast.push("顺序已保存", { type: "success" }))
        .catch(e => toast.push(e.message || "保存顺序失败", { type: "error" }));
    }
  }
  const onMoveUp   = (id) => moveBlock(id, -1);
  const onMoveDown = (id) => moveBlock(id, +1);

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

  function handleSelect(id) {
    setSelectedId(id);
    if (isMobile) setMobileStage("editor");
  }

  return (
    <div className="flex flex-1 overflow-hidden rounded-lg gap-2 bg-transparent">
      {isMobile ? (
        mobileStage === "list" ? (
          <Sidebar
            blocks={sortedBlocks}
            selectedId={selectedId}
            onSelect={handleSelect}
            onCreate={createEmptyBlock}
            query={q}
            onQueryChange={setQ}
            draggingId={draggingId}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onMoveUp={onMoveUp}
            onMoveDown={onMoveDown}
          />
        ) : (
          <div className="flex-1 min-h-0 rounded-lg overflow-hidden app-surface p-2">
            <BlockEditorAuto
              block={selected}
              onChange={optimisticChange}
              onDelete={deleteBlock}
              onImmediateSave={persistUpdate}
              onToggleStarred={toggleStarred}
              starUpdating={starUpdatingIds.has(selected?.id)}
              searchQuery={q}
              onBackToList={() => setMobileStage("list")}
            />
          </div>
        )
      ) : (
        <>
          <Sidebar
            blocks={sortedBlocks}
            selectedId={selectedId}
            onSelect={handleSelect}
            onCreate={createEmptyBlock}
            query={q}
            onQueryChange={setQ}
            draggingId={draggingId}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onMoveUp={onMoveUp}
            onMoveDown={onMoveDown}
          />
          <div className="flex-1 min-h-0 rounded-lg overflow-hidden app-surface p-2">
            <BlockEditorAuto
              block={selected}
              onChange={optimisticChange}
              onDelete={deleteBlock}
              onImmediateSave={persistUpdate}
              onToggleStarred={toggleStarred}
              starUpdating={starUpdatingIds.has(selected?.id)}
              searchQuery={q}
            />
          </div>
        </>
      )}
    </div>
  );
}
