import React, { useEffect, useState, useMemo } from "react";
import {
  apiListBlocks
} from "../api/cloudflare.js";
import Block from "./Block.jsx";
import BlockEditor from "./BlockEditor.jsx";
import ImageUploader from "./ImageUploader.jsx";
import Spinner from "./ui/Spinner.jsx";
import { useToast } from "../hooks/useToast.jsx";

export default function Inbox() {
  const [blocks, setBlocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const toast = useToast();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const data = await apiListBlocks();
        if (!cancelled) {
          setBlocks(data);
        }
      } catch (e) {
        toast.push(e.message, { type: "error" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [toast]);

  function handleCreated(newBlock, meta) {
    setBlocks(prev => {
      if (meta?.replace) {
        return prev.map(b => (b.id === meta.replace ? newBlock : b));
      }
      return [...prev, newBlock];
    });
  }

  function handleChanged(updated) {
    setBlocks(prev =>
      prev.map(b => (b.id === updated.id ? { ...b, ...updated } : b))
    );
  }

  function handleDeleted(id) {
    setBlocks(prev => prev.filter(b => b.id !== id));
  }

  function insertImageMarkdown(md) {
    // 追加到新建编辑器（可改成聚焦逻辑，这里简单演示：新建一个 block 编辑器已经用不上这个了）
    // 你也可以做成：创建一个新的 block 直接渲染:
    handleCreated({
      id: "optimistic-img-" + Date.now(),
      content: md,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      optimistic: true
    });
  }

  const filtered = useMemo(() => {
    if (!query.trim()) return blocks;
    return blocks.filter(b =>
      b.content.toLowerCase().includes(query.toLowerCase())
    );
  }, [blocks, query]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row gap-3 md:items-center">
        <div className="flex gap-2">
          <ImageUploader onInserted={insertImageMarkdown} />
        </div>
        <div className="flex-1 md:text-right">
          <input
            placeholder="搜索关键字..."
            className="input md:max-w-xs"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>
      </div>

      <BlockEditor onCreated={handleCreated} />

      {loading && (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Spinner size={18} />
          加载中...
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="text-sm text-slate-400">
          {query ? "没有匹配的结果" : "还没有内容，写点什么吧。"}
        </div>
      )}

      <div className="grid gap-4">
        {filtered.map(b => (
          <Block
            key={b.id}
            block={b}
            onChanged={handleChanged}
            onDeleted={handleDeleted}
          />
        ))}
      </div>
    </div>
  );
}
