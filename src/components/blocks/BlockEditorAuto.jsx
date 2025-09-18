import React, { useEffect, useState, useRef } from "react";
import { useDebouncedCallback } from "../../hooks/useDebouncedCallback.js";

export default function BlockEditorAuto({
  block,
  onChange,          // (id, { content?, title? }) => void  (optimistic)
  onDelete,
  onImmediateSave,    // (id, payload) => Promise<void>  真正调用父级 update
  uploadingImage,     // 未来支持图片时可用
  onInsertImage       // 未来扩展
}) {
  const [title, setTitle] = useState(block?.title || "");
  const [content, setContent] = useState(block?.content || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const lastPersisted = useRef({ title: block?.title || "", content: block?.content || "" });

  // 当 block 切换
  useEffect(() => {
    setTitle(block?.title || "");
    setContent(block?.content || "");
    lastPersisted.current = {
      title: block?.title || "",
      content: block?.content || ""
    };
    setError("");
  }, [block?.id]);

  const dirty = (title !== lastPersisted.current.title) ||
                (content !== lastPersisted.current.content);

  async function doSave() {
    if (!block || !dirty) return;
    setSaving(true);
    setError("");
    const payload = { title, content };
    try {
      onChange && onChange(block.id, { ...payload, optimistic: true });
      await onImmediateSave(block.id, payload);
      lastPersisted.current = { title, content };
    } catch (e) {
      setError(e.message || "保存失败");
    } finally {
      setSaving(false);
    }
  }

  const [debouncedSave, flushSave] = useDebouncedCallback(doSave, 800);

  // 监听内容变化触发 debounce
  useEffect(() => {
    if (!block) return;
    if (dirty) debouncedSave();
  }, [title, content, block, debouncedSave, dirty]);

  function onBlur() {
    flushSave(); // 失焦立即保存
  }

  if (!block) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-slate-400">
        请选择左侧的 Block 或新建
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-3 py-3 px-4 border-b border-slate-200 dark:border-slate-700">
        <input
          className="text-xl font-semibold bg-transparent outline-none flex-1 placeholder-slate-400"
          placeholder="标题..."
          value={title}
          onChange={e => setTitle(e.target.value)}
          onBlur={onBlur}
        />
        <div className="text-xs text-slate-400">
          {saving
            ? "保存中..."
            : error
            ? <button
                onClick={doSave}
                className="text-red-500 hover:underline"
              >保存失败，重试</button>
            : dirty
            ? "待保存..."
            : "已保存"}
        </div>
        <button
          onClick={() => {
            if (confirm("确定删除该 Block？")) {
              onDelete && onDelete(block.id);
            }
          }}
          className="btn btn-outline !py-1 !px-3 text-xs"
        >
          删除
        </button>
      </div>

      <textarea
        className="flex-1 p-4 resize-none outline-none bg-transparent font-mono text-sm leading-5 custom-scroll"
        value={content}
        placeholder="输入 Markdown 内容..."
        onChange={e => setContent(e.target.value)}
        onBlur={onBlur}
      />
    </div>
  );
}
