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

// 排序工具：置顶区按编辑时间倒序，未置顶区按拖拽或编辑时间倒序
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
    // 默认未置顶区最新编辑在前
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
      // setManualOrder(null);  // 不重置拖拽顺序
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

  // 渲染用排序
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

  // 内容保存时，自动排序未置顶区（最新编辑在最前），置顶区不变
  async function persistUpdate(id, payload) {
    const real = await apiUpdateBlock(id, payload);
    setBlocks(prev => {
      // 更新内容
      const updated = prev.map(b => b.id === id ? { ...b, ...real } : b);
      // 未置顶区自动排序（最新编辑在前），置顶区不变
      const pinned = updated.filter(b => b.pinned);
      let others = updated.filter(b => !b.pinned);
      others = others.sort((a, b) => {
        const ta = new Date(a.updated_at || a.created_at || "1970-01-01").getTime();
        const tb = new Date(b.updated_at || b.created_at || "1970-01-01").getTime();
        return tb - ta;
      });
      setManualOrder(null); // 清除拖拽顺序，改用自动排序
      return [...pinned, ...others];
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
      // 新建后如果需要刷新 blocks，才调用 loadBlocks
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
      // 删除后如果需要刷新 blocks，才调用 loadBlocks
    } catch (e) {
      toast.push(e.message || "删除失败", { type: "error" });
      setBlocks(snapshot);
    }
  }

  function onDragStart(id) {
    setDraggingId(id);
  }
  function onDragOver(e, overId) {
    e.preventDefault();
    if (!draggingId || draggingId === overId) return;
    setBlocks(prev => {
      const pinned = prev.filter(b => b.pinned);
      const notPinned = prev.filter(b => !b.pinned);
      const from = notPinned.findIndex(b => b.id === draggingId);
      const to = notPinned.findIndex(b => b.id === overId);
      if (from === -1 || to === -1) return prev;
      const newNotPinned = [...notPinned];
      const [item] = newNotPinned.splice(from, 1);
      newNotPinned.splice(to, 0, item);
      setManualOrder(newNotPinned.map(b => b.id));
      // 返回 pinned + 新排序的 notPinned（只是临时渲染，blocks实际顺序不变）
      return [...pinned, ...newNotPinned];
    });
  }
  async function onDrop() {
    if (!draggingId) return;
    // 只同步未置顶顺序
    const notPinnedBlocks = blocks.filter(b => !b.pinned);
    const order = manualOrder
      ? manualOrder.map((id, i) => ({ id, position: i + 1 }))
      : notPinnedBlocks.map((b, i) => ({ id: b.id, position: i + 1 }));
    try {
      await apiReorderBlocks(order);
      toast.push("顺序已保存", { type: "success" });
      // 不要 reload blocks，保持本地顺序和 pinned 状态
    } catch (e) {
      toast.push(e.message || "保存顺序失败", { type: "error" });
    } finally {
      setDraggingId(null);
    }
  }

  // 置顶/取消置顶需要同步后端（只改 pinned 字段，不能用 real 全覆盖！）
  async function onPin(id) {
    try {
      await apiUpdateBlock(id, { pinned: true });
      setBlocks(prev => prev.map(b => b.id === id ? { ...b, pinned: true } : b));
      setManualOrder(prev => prev ? prev.filter(i => i !== id) : prev);
    } catch (e) {
      toast.push(e.message || "置顶失败", { type: "error" });
    }
  }
  async function onUnpin(id) {
    try {
      await apiUpdateBlock(id, { pinned: false });
      setBlocks(prev => prev.map(b => b.id === id ? { ...b, pinned: false } : b));
      // 取消置顶后插入未置顶区首位
      setManualOrder(prev => {
        const notPinnedBlocks = blocks.filter(b => !b.pinned && b.id !== id).map(b => b.id);
        return [id, ...notPinnedBlocks];
      });
    } catch (e) {
      toast.push(e.message || "取消置顶失败", { type: "error" });
    }
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
