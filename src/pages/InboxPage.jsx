import React, { useEffect, useState, useMemo } from "react";
import {
  apiListBlocks,
  apiCreateBlock,
  apiUpdateBlock,
  apiDeleteBlock
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
  const [sortMode, setSortMode] = useState(
    () => localStorage.getItem("sortMode") || "created"
  );

  useEffect(() => {
    localStorage.setItem("sortMode", sortMode);
  }, [sortMode]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const list = await apiListBlocks();
        if (!cancelled) {
          setBlocks(list);
          if (list.length) setSelectedId(prev => prev || list[list.length - 1].id);
        }
      } catch (e) {
        toast.push(e.message || "加载失败", { type: "error" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [toast]);

  const sortedBlocks = useMemo(() => {
    const arr = [...blocks];
    if (sortMode === "updated") {
      arr.sort((a, b) => new Date(a.updated_at || 0) - new Date(b.updated_at || 0));
    } else {
      arr.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
    }
    return arr;
  }, [blocks, sortMode]);

  const filteredBlocks = useMemo(() => {
    const kw = q.trim().toLowerCase();
    if (!kw) return sortedBlocks;
    return sortedBlocks.filter(b =>
      (b.title || "").toLowerCase().includes(kw) ||
      (b.content || "").toLowerCase().includes(kw)
    );
  }, [sortedBlocks, q]);

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
      title: "",
      content: "",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      optimistic: true
    };
    setBlocks(prev => [...prev, optimistic]);
    setSelectedId(optimistic.id);
    try {
      const real = await apiCreateBlock("");
      setBlocks(prev => prev.map(b => (b.id === optimistic.id ? { ...b, ...real, optimistic: false } : b)));
      setSelectedId(real.id);
    } catch (e) {
      toast.push(e.message || "创建失败", { type: "error" });
      setBlocks(prev => prev.filter(b => b.id !== optimistic.id));
      if (selectedId === optimistic.id) {
        const remain = blocks.filter(b => b.id !== optimistic.id);
        setSelectedId(remain.length ? remain[remain.length - 1].id : null);
      }
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
        setSelectedId(remain.length ? remain[remain.length - 1].id : null);
      }
    } catch (e) {
      toast.push(e.message || "删除失败", { type: "error" });
      setBlocks(snapshot);
    }
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <Sidebar
        blocks={filteredBlocks}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onCreate={createEmptyBlock}
        sortMode={sortMode}
        onToggleSort={() =>
          setSortMode(m => (m === "created" ? "updated" : "created"))
        }
        query={q}
        onQueryChange={setQ}
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
