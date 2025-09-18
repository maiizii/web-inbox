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
import { looksLikeTitleUnsupported } from "../lib/blockText.js";

export default function InboxPage() {
  const toast = useToast();
  const [blocks, setBlocks] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  // 初始化
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const list = await apiListBlocks();
        if (!cancelled) {
          setBlocks(list);
          if (list.length) setSelectedId(list[list.length - 1].id);
        }
      } catch (e) {
        toast.push(e.message, { type: "error" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [toast]);

  const selected = useMemo(
    () => blocks.find(b => b.id === selectedId),
    [blocks, selectedId]
  );

  function optimisticChange(id, patch) {
    setBlocks(prev =>
      prev.map(b => (b.id === id ? { ...b, ...patch } : b))
    );
  }

  async function safeUpdate(id, payload, originalError) {
    if (looksLikeTitleUnsupported(originalError)) {
      // 重试不带 title
      const { title: _ignore, ...rest } = payload;
      const real = await apiUpdateBlock(id, rest);
      setBlocks(prev => prev.map(b => (b.id === id ? real : b)));
      return real;
    }
    throw originalError;
  }

  async function persistUpdate(id, payload) {
    const real = await apiUpdateBlock(id, payload);
    setBlocks(prev => prev.map(b => (b.id === id ? real : b)));
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
      let real;
      try {
        real = await apiCreateBlock("", "");
      } catch (e) {
        if (looksLikeTitleUnsupported(e)) {
          real = await apiCreateBlock("");
        } else throw e;
      }
      setBlocks(prev =>
        prev.map(b => (b.id === optimistic.id ? real : b))
      );
      setSelectedId(real.id);
    } catch (e) {
      toast.push(e.message, { type: "error" });
      // 回滚
      setBlocks(prev => prev.filter(b => b.id !== optimistic.id));
      if (selectedId === optimistic.id) setSelectedId(null);
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
      toast.push(e.message, { type: "error" });
      setBlocks(snapshot); // 回滚
    }
  }

  const filteredBlocks = useMemo(() => {
    const kw = q.trim().toLowerCase();
    if (!kw) return blocks;
    return blocks.filter(b =>
      (b.title || "").toLowerCase().includes(kw) ||
      (b.content || "").toLowerCase().includes(kw)
    );
  }, [blocks, q]);

  return (
    <div className="h-[calc(100vh-56px)] flex">
      <Sidebar
        blocks={filteredBlocks}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onCreate={createEmptyBlock}
      />
      <main className="flex-1 flex flex-col">
        <div className="border-b border-slate-200 dark:border-slate-700 px-4 h-11 flex items-center gap-3">
          <input
            className="input !h-8 text-sm w-64"
            placeholder="搜索..."
            value={q}
            onChange={e => setQ(e.target.value)}
          />
          <div className="ml-auto text-xs text-slate-400">
            {loading ? "加载中..." : `${blocks.length} 个 Block`}
          </div>
        </div>
        <div className="flex-1 min-h-0">
          <BlockEditorAuto
            block={selected}
            onChange={optimisticChange}
            onDelete={deleteBlock}
            onImmediateSave={persistUpdate}
            safeUpdateFallback={safeUpdate}
          />
        </div>
      </main>
    </div>
  );
}
