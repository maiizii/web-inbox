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
import {
  looksLikeTitleUnsupported,
  looksLikeEmptyContentRejected
} from "../lib/apiErrors.js";

export default function InboxPage() {
  const toast = useToast();
  const [blocks, setBlocks] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  // 初始化拉取
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

  async function createEmptyBlock() {
    // 1. 添加乐观 block
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
      // 尝试 1：空内容 + 空标题
      try {
        real = await apiCreateBlock("", "");
      } catch (e1) {
        // 尝试 2：title 不支持
        if (looksLikeTitleUnsupported(e1)) {
          try {
            real = await apiCreateBlock("");
          } catch (e2) {
            // 尝试 3：如果空内容被拒绝，用一个占位空格
            if (looksLikeEmptyContentRejected(e2)) {
              try {
                real = await apiCreateBlock(" ");
              } catch (e3) {
                // （可选）尝试发送 text 字段（如果后端接口命名不同）
                // try { real = await apiFetchFallbackTextField(" "); } catch(_) {}
                throw e3;
              }
            } else {
              throw e2;
            }
          }
        }
        // 如果不是 title 不支持，检查是否空内容被拒绝
        else if (looksLikeEmptyContentRejected(e1)) {
          try {
            real = await apiCreateBlock(" ");
          } catch (e4) {
            throw e4;
          }
        } else {
          throw e1;
        }
      }

      // 校验 real
      if (!real || !real.id) {
        throw new Error("创建接口返回数据不完整");
      }

      // 替换乐观 block
      setBlocks(prev =>
        prev.map(b => (b.id === optimistic.id ? real : b))
      );
      setSelectedId(real.id);
    } catch (err) {
      // 回滚
      setBlocks(prev => prev.filter(b => b.id !== optimistic.id));
      if (selectedId === optimistic.id) {
        // 选择回最后一个真实 block
        const realList = blocks.filter(b => b.id !== optimistic.id);
        setSelectedId(realList.length ? realList[realList.length - 1].id : null);
      }
      toast.push(err.message || "创建失败", { type: "error" });
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
