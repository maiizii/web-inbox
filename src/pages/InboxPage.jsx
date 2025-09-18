import React, { useEffect, useState, useMemo } from "react";
import {
  apiListBlocks,
  apiCreateBlock,
  apiCreateRaw,
  apiUpdateBlock,
  apiDeleteBlock
} from "../api/cloudflare.js";
import { useToast } from "../hooks/useToast.jsx";
import Sidebar from "../components/layout/Sidebar.jsx";
import BlockEditorAuto from "../components/blocks/BlockEditorAuto.jsx";
import { looksLikeTitleUnsupported } from "../lib/apiErrors.js";
import { guessContentField, buildCreatePayloadCandidates } from "../lib/contentFieldGuess.js";

export default function InboxPage() {
  const toast = useToast();
  const [blocks, setBlocks] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [contentField, setContentField] = useState("content");

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
            const field = guessContentField(list);
            setContentField(field);
            console.log("[Blocks] guessed content field =", field);
        }
      } catch (e) {
        toast.push(e.message || "加载失败", { type: "error" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [toast]);

  const selected = useMemo(
    () => blocks.find(b => b.id === selectedId) || null,
    [blocks, selectedId]
  );

  function optimisticChange(id, patch) {
    setBlocks(prev => prev.map(b => (b.id === id ? { ...b, ...patch } : b)));
  }

  async function safeUpdate(id, payload, originalError) {
    if (looksLikeTitleUnsupported(originalError)) {
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

  /**
   * 自适应创建：
   * 1. 基于推测字段名生成多套 payload（含包装、含/不含 title）
   * 2. 逐个尝试，首个返回 block.id 的即成功
   * 3. 全部失败：回滚 + 弹出错误（并在 console 列出每次失败的响应）
   */
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

    const candidates = buildCreatePayloadCandidates(contentField, "", "");
    const errors = [];

    let real = null;
    for (const payload of candidates) {
      try {
        // 每次尝试打印调试信息
        console.log("[Create Attempt] payload =", payload);
        const r = await apiCreateRaw(payload);
        if (r && r.block && r.block.id) {
          real = r.block;
          break;
        } else {
          errors.push({ payload, error: "invalid response shape" });
        }
      } catch (e) {
        errors.push({ payload, error: e.message || String(e) });
        // 如果 title 不支持，下一轮 payload 仍会覆盖掉 title，这里不额外处理
      }
    }

    if (!real) {
      // 回滚
      setBlocks(prev => prev.filter(b => b.id !== optimistic.id));
      if (selectedId === optimistic.id) {
        const remain = blocks.filter(b => b.id !== optimistic.id);
        setSelectedId(remain.length ? remain[remain.length - 1].id : null);
      }
      console.groupCollapsed("[Create Block Failure Details]");
      console.table(errors.map(e => ({
        payload: JSON.stringify(e.payload),
        error: e.error
      })));
      console.groupEnd();
      toast.push("创建失败（请查看控制台错误详情）", { type: "error" });
      return;
    }

    // 替换乐观
    setBlocks(prev =>
      prev.map(b => (b.id === optimistic.id ? real : b))
    );
    setSelectedId(real.id);
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

  const filteredBlocks = useMemo(() => {
    const kw = q.trim().toLowerCase();
    if (!kw) return blocks;
    return blocks.filter(b =>
      (b.title || "").toLowerCase().includes(kw) ||
      (b.content || "").toLowerCase().includes(kw) ||
      (typeof b[contentField] === "string" &&
        b[contentField].toLowerCase().includes(kw))
    );
  }, [blocks, q, contentField]);

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
