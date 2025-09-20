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

// 排序工具函数：置顶的 block 按编辑时间倒序，其余按手动排序或编辑时间倒序
function sortBlocks(blocks, manualOrder) {
  const pinned = blocks.filter(b => b.pinned)
    .sort((a, b) => {
      const ta = new Date(a.updated_at || a.created_at || "1970-01-01").getTime();
      const tb = new Date(b.updated_at || b.created_at || "1970-01-01").getTime();
      return tb - ta;
    });
  let others = blocks.filter(b => !b.pinned);
  if (manualOrder && manualOrder.length === others.length) {
    others = manualOrder
      .map(id => others.find(b => b.id === id))
      .filter(Boolean);
  } else {
    others = others.sort((a, b) => {
      const ta = new Date(a.updated_at || a.created_at || "1970-01-01").getTime();
      const tb = new Date(b.updated_at || b.created_at || "1970-01-01").getTime();
      return tb - ta;
    });
  }
  return [...pinned, ...others];
}

export default function InboxPage() {
  const toast = useToast();
  const [blocks, setBlocks] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [draggingId, setDraggingId] = useState(null);
  const [manualOrder, setManualOrder] = useState(null);

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

  useEffect(() => { loadBlocks(); }, []); // eslint-disable-line

  // 搜索过滤
  const filteredBlocks = useMemo(() => {
    const kw = q.trim().toLowerCase();
    if (!kw) return blocks;
    return blocks.filter(b =>
      (b.content || "").toLowerCase().includes(kw)
    );
  }, [blocks, q]);

  const sortedBlocks = useMemo(() => {
    return sortBlocks(filteredBlocks, manualOrder);
  }, [filteredBlocks, manualOrder]);

  const selected = useMemo(
    () => blocks.find(b => b.id === selectedId) || null,
    [blocks, selectedId]
  );

  function optimisticChange(id, patch) {
    setBlocks(prev => prev.map(b => (b.id === id ? { ...b, ...patch } : b)));
  }

  // 保存 block 内容时，刷新编辑时间
  async function persistUpdate(id, payload) {
    const real = await apiUpdateBlock(id, payload);
    setBlocks(prev => prev.map(b => (b.id === id ? { ...b, ...real } : b)));
    // 不影响 pinned 状态和拖拽顺序
    return real;
  }

  // 新建 block
  async function createEmptyBlock() {
    const optimistic = {
      id: "tmp-" + Date.now(),
      content: "",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      position: (blocks[blocks.length - 1]?.position || blocks.length) + 1,
      optimistic: true,
      pinned: false
    };
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
      if (manualOrder) setManualOrder(manualOrder.filter(i => i !== id));
    } catch (e) {
      toast.push(e.message || "删除失败", { type: "error" });
      setBlocks(snapshot);
    }
  }

  // 拖拽排序，仅限未置顶的 block
  function onDragStart(id) {
    setDraggingId(id);
  }
  function onDragOver(e, overId) {
    e.preventDefault();
    if (!draggingId || draggingId === overId) return;
    setBlocks(prev => {
      // pinned 状态必须保留
      const pinned = prev.filter(b => b.pinned);
      let notPinned = prev.filter(b => !b.pinned);
      const from = notPinned.findIndex(b => b.id === draggingId);
      const to = notPinned.findIndex(b => b.id === overId);
      if (from === -1 || to === -1) return prev;
      notPinned = [...notPinned];
      const [item] = notPinned.splice(from, 1);
      notPinned.splice(to, 0, item);
      setManualOrder(notPinned.map(b => b.id));
      // 返回 pinned + 新排序的 notPinned
      return [...pinned, ...notPinned];
    });
  }
  async function onDrop() {
    if (!draggingId) return;
    // 只同步未置顶顺序
    const order = sortedBlocks
      .filter(b => !b.pinned)
      .map((b, i) => ({ id: b.id, position: i + 1 }));
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

  // 置顶和取消置顶事件
  function onPin(id) {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, pinned: true } : b));
    setManualOrder(prev => {
      // 置顶后要从手动顺序里去掉该 block
      if (!prev) return null;
      return prev.filter(i => i !== id);
    });
  }
  function onUnpin(id) {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, pinned: false } : b));
    // 取消置顶后将其插入到未置顶区的首位，手动顺序需更新
    setManualOrder(prev => {
      const notPinnedBlocks = blocks.filter(b => !b.pinned && b.id !== id).map(b => b.id);
      return [id, ...notPinnedBlocks];
    });
  }

  return (
    <div className="flex flex-1 overflow-hidden">
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
        onPin={onPin}
        onUnpin={onUnpin}
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
