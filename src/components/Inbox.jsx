import React, { useEffect, useState } from "react";
import {
  apiListBlocks,
  apiCreateBlock,
  apiUploadImage,
  buildImageUrl
} from "../api/cloudflare.js";
import Block from "./Block.jsx";
import { useAuth } from "../context/AuthContext.jsx";

export default function Inbox() {
  const [blocks, setBlocks] = useState([]);
  const [newContent, setNewContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const { user, logout } = useAuth();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const data = await apiListBlocks();
        if (!cancelled) setBlocks(data);
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function create() {
    if (!newContent.trim()) return;
    setCreating(true);
    try {
      const b = await apiCreateBlock(newContent.trim());
      setBlocks(prev => [...prev, b]);
      setNewContent("");
    } catch (e) {
      alert(e.message);
    } finally {
      setCreating(false);
    }
  }

  function handleChanged(updated) {
    setBlocks(bs => bs.map(b => (b.id === updated.id ? { ...b, ...updated } : b)));
  }

  function handleDeleted(id) {
    setBlocks(bs => bs.filter(b => b.id !== id));
  }

  async function handleImage(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const img = await apiUploadImage(file);
      // 上传成功后插入一个内容块，内容中放一个图片 markdown
      const inserted = await apiCreateBlock(`![image](${img.url})`);
      setBlocks(prev => [...prev, inserted]);
    } catch (err) {
      alert(err.message);
    } finally {
      e.target.value = "";
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="flex items-center">
        <h1 className="text-2xl font-semibold flex-1">欢迎，{user?.email}</h1>
        <button
          onClick={logout}
          className="px-3 py-1 text-sm bg-gray-200 rounded hover:bg-gray-300"
        >
          退出
        </button>
      </div>

      <div className="bg-white p-4 rounded shadow space-y-3">
        <textarea
          className="w-full border rounded p-2 h-24"
          placeholder="输入新的文本块..."
          value={newContent}
          onChange={e => setNewContent(e.target.value)}
        />
        <div className="flex gap-2">
          <button
            onClick={create}
            disabled={creating}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {creating ? "创建中..." : "创建"}
          </button>
          <label className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 cursor-pointer">
            上传图片
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImage}
            />
          </label>
        </div>
      </div>

      {loading && <div>加载数据...</div>}
      {error && <div className="text-red-600">{error}</div>}

      <div className="space-y-4">
        {blocks.map(b => (
          <Block
            key={b.id}
            block={b}
            onChanged={handleChanged}
            onDeleted={handleDeleted}
          />
        ))}
      </div>
      {blocks.length === 0 && !loading && <div className="text-sm text-gray-500">暂无内容</div>}
      <div className="text-xs text-gray-400 pt-6">
        图片块用 Markdown 形式存储（直接使用 /api/images/:id URL）。
      </div>
    </div>
  );
}
