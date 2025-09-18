import React, { useEffect, useState, useMemo } from "react";
import {
  apiListBlocks,
  apiCreateBlock,
  apiUpdateBlock,
  apiDeleteBlock,
  apiHealth,
  apiMe
} from "../api/cloudflare.js";
import { useToast } from "../hooks/useToast.jsx";
import BlockList from "../components/blocks/BlockList.jsx";
import BlockEditorPanel from "../components/blocks/BlockEditorPanel.jsx";
import ApiDebugger from "../components/debug/ApiDebugger.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { renderMarkdown } from "../lib/markdown.js";

export default function InboxPage() {
  const toast = useToast();
  const { user } = useAuth();
  const [blocks, setBlocks] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [health, setHealth] = useState(null);
  const [meInfo, setMeInfo] = useState(null);
  const [showDebugger, setShowDebugger] = useState(true);

  // 初始化数据
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const [list, h, me] = await Promise.all([
          apiListBlocks(),
          apiHealth().catch(() => null),
          apiMe().catch(() => null)
        ]);
        if (!cancelled) {
            setBlocks(list);
          setHealth(h);
          setMeInfo(me);
          if (list.length) setSelectedId(list[list.length - 1].id);
        }
      } catch (e) {
        toast.push(e.message, { type: "error" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  function optimisticAdd(rawBlock) {
    setBlocks(prev => [...prev, rawBlock]);
    setSelectedId(rawBlock.id);
  }

  async function createBlock(content) {
    const optimistic = {
      id: "tmp-" + Date.now(),
      content,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      optimistic: true
    };
    optimisticAdd(optimistic);
    try {
      const real = await apiCreateBlock(content);
      setBlocks(prev =>
        prev.map(b => (b.id === optimistic.id ? real : b))
      );
      toast.push("已创建", { type: "success" });
      setSelectedId(real.id);
    } catch (e) {
      toast.push(e.message, { type: "error" });
      setBlocks(prev => prev.filter(b => b.id !== optimistic.id));
    }
  }

  async function updateBlock(id, content) {
    const old = blocks.find(b => b.id === id);
    setBlocks(prev =>
      prev.map(b => (b.id === id ? { ...b, content, optimistic: true } : b))
    );
    try {
      const real = await apiUpdateBlock(id, content);
      setBlocks(prev => prev.map(b => (b.id === id ? real : b)));
      toast.push("已保存", { type: "success" });
    } catch (e) {
      toast.push(e.message, { type: "error" });
      // 回滚
      setBlocks(prev => prev.map(b => (b.id === id ? old : b)));
    }
  }

  async function deleteBlock(id) {
    const backup = blocks;
    setBlocks(prev => prev.filter(b => b.id !== id));
    try {
      await apiDeleteBlock(id);
      toast.push("已删除", { type: "success" });
      if (selectedId === id) setSelectedId(null);
    } catch (e) {
      toast.push(e.message, { type: "error" });
      setBlocks(backup);
    }
  }

  const filtered = useMemo(() => {
    if (!q.trim()) return blocks;
    return blocks.filter(b =>
      b.content.toLowerCase().includes(q.toLowerCase())
    );
  }, [blocks, q]);

  const selected = useMemo(
    () => filtered.find(b => b.id === selectedId) || null,
    [filtered, selectedId]
  );

  return (
    <div className="h-[calc(100vh-56px)] flex gap-4">
      {/* 左侧：搜索 + 列表 */}
      <div className="w-64 flex-shrink-0 flex flex-col gap-3 overflow-hidden">
        <div className="card p-3 space-y-2">
          <input
            placeholder="搜索..."
            className="input"
            value={q}
            onChange={e => setQ(e.target.value)}
          />
          <div className="text-xs text-slate-500 flex justify-between">
            <span>总数: {blocks.length}</span>
            <span>筛选: {filtered.length}</span>
          </div>
        </div>
        <div className="flex-1 min-h-0">
          <BlockList
            blocks={filtered}
            selectedId={selectedId}
            onSelect={id => setSelectedId(id)}
            onDelete={deleteBlock}
          />
        </div>
      </div>

      {/* 中间：编辑器 */}
      <div className="flex-1 flex flex-col gap-4 overflow-hidden">
        <BlockEditorPanel
          selected={selected}
          onCreate={createBlock}
          onUpdate={updateBlock}
        />
        {loading && (
          <div className="text-sm text-slate-500">加载中...</div>
        )}
        {!loading && !filtered.length && (
          <div className="text-sm text-slate-400">
            {q ? "没有匹配结果" : "空空如也，写点什么吧。"}
          </div>
        )}
      </div>

      {/* 右侧：详情 + 调试 */}
      <div className="w-80 flex-shrink-0 flex flex-col gap-3 overflow-hidden">
        <div className="card p-3 space-y-2 text-xs">
          <div className="font-medium text-slate-600 dark:text-slate-300">
            当前用户
          </div>
          {user ? (
            <div className="space-y-1">
              <div>Email: {user.email}</div>
              <div>ID: {user.id}</div>
            </div>
          ) : (
            <div>未登录</div>
          )}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
            <div className="font-medium mb-1">系统状态</div>
            <div>
              Health:{" "}
              {health ? (
                <span className="text-green-600">OK</span>
              ) : (
                <span className="text-red-500">失败</span>
              )}
            </div>
            <div>
              /me:{" "}
              {meInfo?.user ? (
                <span className="text-green-600">OK</span>
              ) : (
                <span className="text-red-500">无</span>
              )}
            </div>
          </div>
        </div>

        <div className="card p-3 space-y-2 overflow-auto text-xs max-h-64">
          <div className="font-medium">选中 Block</div>
          {selected ? (
            <>
              <div className="text-slate-500 break-all">
                ID: {selected.id}
              </div>
              <div>
                创建:{" "}
                {new Date(selected.created_at).toLocaleString()}
              </div>
              <div>
                修改:{" "}
                {new Date(selected.updated_at).toLocaleString()}
              </div>
              <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                <div className="font-medium mb-1">预览 HTML</div>
                <div
                  className="prose prose-xs dark:prose-invert max-w-none"
                  dangerouslySetInnerHTML={{
                    __html: renderMarkdown(selected.content)
                  }}
                />
              </div>
            </>
          ) : (
            <div className="text-slate-400">未选中</div>
          )}
        </div>

        <div className="card p-0 flex flex-col overflow-hidden">
          <button
            onClick={() => setShowDebugger(s => !s)}
            className="text-left px-3 py-2 text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700"
          >
            调试面板 {showDebugger ? "▾" : "▸"}
          </button>
          {showDebugger && <ApiDebugger className="flex-1 min-h-0" />}
        </div>
      </div>
    </div>
  );
}
