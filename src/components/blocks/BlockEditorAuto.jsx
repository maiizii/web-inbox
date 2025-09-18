import React, { useEffect, useState, useRef, useCallback } from "react";
import { useDebouncedCallback } from "../../hooks/useDebouncedCallback.js";
import { deriveTitle } from "../../lib/blockText.js";
import { apiUploadImage } from "../../api/cloudflare.js";
import { useToast } from "../../hooks/useToast.jsx";

/**
 * 自动保存 + 标题编辑 + 粘贴/拖拽图片上传
 * props:
 *  - block
 *  - onChange(id, patch)
 *  - onDelete(id)
 *  - onImmediateSave(id, payload) => Promise(realBlock)
 *  - safeUpdateFallback(id, payload, originalError?) => Promise(realBlock) (可选)
 */
export default function BlockEditorAuto({
  block,
  onChange,
  onDelete,
  onImmediateSave,
  safeUpdateFallback
}) {
  const toast = useToast();
  const [title, setTitle] = useState(block?.title || deriveTitle(block));
  const [content, setContent] = useState(block?.content || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const textareaRef = useRef(null);

  const lastPersisted = useRef({
    title: block?.title || deriveTitle(block),
    content: block?.content || ""
  });

  useEffect(() => {
    setTitle(block?.title || deriveTitle(block));
    setContent(block?.content || "");
    lastPersisted.current = {
      title: block?.title || deriveTitle(block),
      content: block?.content || ""
    };
    setError("");
  }, [block?.id]);

  const dirty =
    block &&
    (title !== lastPersisted.current.title ||
      content !== lastPersisted.current.content);

  async function doSave() {
    if (!block || !dirty || block.optimistic) return;
    setSaving(true);
    setError("");
    const payload = { title, content };
    try {
      onChange && onChange(block.id, { ...payload, optimistic: true });
      let real;
      try {
        real = await onImmediateSave(block.id, payload);
      } catch (e) {
        if (safeUpdateFallback) {
          real = await safeUpdateFallback(block.id, payload, e);
        } else {
          throw e;
        }
      }
      lastPersisted.current = { title, content };
    } catch (e) {
      setError(e.message || "保存失败");
    } finally {
      setSaving(false);
    }
  }

  const [debouncedSave, flushSave] = useDebouncedCallback(doSave, 800);

  useEffect(() => {
    if (dirty) debouncedSave();
  }, [title, content, debouncedSave, dirty]);

  function onBlur() {
    flushSave();
  }

  // 插入文本到光标处
  function insertAtCursor(text) {
    const ta = textareaRef.current;
    if (!ta) {
      setContent(c => c + text);
      return;
    }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    setContent(c => c.slice(0, start) + text + c.slice(end));
    requestAnimationFrame(() => {
      ta.selectionStart = ta.selectionEnd = start + text.length;
    });
  }

  function replaceOnce(target, replacement) {
    setContent(c => {
      const idx = c.indexOf(target);
      if (idx === -1) return c;
      return c.slice(0, idx) + replacement + c.slice(idx + target.length);
    });
  }

  const handlePaste = useCallback(
    async (e) => {
      if (!block) return;
      const items = Array.from(e.clipboardData.items).filter(it =>
        it.type.startsWith("image/")
      );
      if (!items.length) return;
      e.preventDefault();
      for (const it of items) {
        const file = it.getAsFile();
        await uploadOne(file);
      }
    },
    [block]
  );

  const handleDrop = useCallback(
    async (e) => {
      if (!block) return;
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files).filter(f =>
        f.type.startsWith("image/")
      );
      if (!files.length) return;
      for (const file of files) {
        await uploadOne(file);
      }
    },
    [block]
  );

  async function uploadOne(file) {
    if (!file) return;
    const tempId =
      "uploading-" + Date.now() + "-" + Math.random().toString(16).slice(2);
    const placeholder = `![${tempId}](uploading)\n`;
    insertAtCursor("\n" + placeholder);
    try {
      const img = await apiUploadImage(file);
      replaceOnce(placeholder, `![image](${img.url})\n`);
      flushSave(); // 立即保存
      toast.push("图片已上传", { type: "success" });
    } catch (e) {
      replaceOnce(placeholder, `![失败](#)\n`);
      toast.push(e.message || "图片上传失败", { type: "error" });
    }
  }

  if (!block) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-slate-400">
        请选择左侧 Block 或点击“新建”
      </div>
    );
  }

  return (
    <div
      className="h-full flex flex-col"
      onPaste={handlePaste}
      onDrop={handleDrop}
      onDragOver={e => e.preventDefault()}
    >
      <div className="flex items-center gap-3 py-3 px-4 border-b border-slate-200 dark:border-slate-700">
        <input
          className="text-xl font-semibold bg-transparent outline-none flex-1 placeholder-slate-400"
          placeholder="标题..."
          value={title}
          onChange={e => setTitle(e.target.value)}
          onBlur={onBlur}
        />
        <div className="text-xs text-slate-400 select-none">
          {saving
            ? "保存中..."
            : error
            ? (
              <button
                onClick={doSave}
                className="text-red-500 hover:underline"
              >
                重试
              </button>
            )
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
        ref={textareaRef}
        className="flex-1 p-4 resize-none outline-none bg-transparent font-mono text-sm leading-5 custom-scroll"
        value={content}
        placeholder="输入 Markdown 内容 (支持粘贴 / 拖拽图片)"
        onChange={e => setContent(e.target.value)}
        onBlur={onBlur}
      />
    </div>
  );
}
