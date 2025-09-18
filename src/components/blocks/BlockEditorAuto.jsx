import React, { useEffect, useState, useRef, useCallback } from "react";
import { useDebouncedCallback } from "../../hooks/useDebouncedCallback.js";
import { apiUploadImage } from "../../api/cloudflare.js";
import { useToast } from "../../hooks/useToast.jsx";
import { renderMarkdown } from "../../lib/markdown.js";

export default function BlockEditorAuto({
  block,
  onChange,
  onDelete,
  onImmediateSave,
  safeUpdateFallback
}) {
  const toast = useToast();
  const [title, setTitle] = useState(block?.title || "");
  const [content, setContent] = useState(block?.content || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showPreview, setShowPreview] = useState(true);
  const [titleManuallyEdited, setTitleManuallyEdited] = useState(false);
  const textareaRef = useRef(null);
  const lastPersisted = useRef({ title: "", content: "" });
  const [previewHtml, setPreviewHtml] = useState("");

  // ---- 新增：焦点/光标管理 refs ----
  const userManuallyBlurredRef = useRef(false);      // 用户是否主动失焦
  const shouldRestoreFocusRef = useRef(false);       // 是否需要在保存后恢复焦点
  const selectionRef = useRef({ start: null, end: null }); // 记录光标位置

  // 预览
  useEffect(() => {
    if (showPreview) {
      setPreviewHtml(renderMarkdown(content));
    }
  }, [content, showPreview]);

  // block 切换
  useEffect(() => {
    setTitle(block?.title || "");
    setContent(block?.content || "");
    lastPersisted.current = {
      title: block?.title || "",
      content: block?.content || ""
    };
    setError("");
    setTitleManuallyEdited(!!(block && block.title));
    // 切换后重置焦点恢复意图
    shouldRestoreFocusRef.current = false;
    userManuallyBlurredRef.current = false;
  }, [block?.id]);

  // 标题自动一次性派生（前 10 字符）
  useEffect(() => {
    if (!block) return;
    if (!titleManuallyEdited && !title && content) {
      setTitle(content.slice(0, 10));
    }
  }, [content, title, titleManuallyEdited, block]);

  const dirty =
    block &&
    (title !== lastPersisted.current.title ||
      content !== lastPersisted.current.content);

  // ---- 光标工具 ----
  function captureSelection() {
    const ta = textareaRef.current;
    if (!ta) return;
    selectionRef.current = {
      start: ta.selectionStart,
      end: ta.selectionEnd
    };
  }
  function restoreSelection() {
    const ta = textareaRef.current;
    if (!ta) return;
    const { start, end } = selectionRef.current;
    if (start != null && end != null) {
      try {
        ta.setSelectionRange(start, end);
      } catch {}
    }
  }
  function ensureFocusAfterSave() {
    // 只有在用户没有主动 blur 且标记需要时恢复
    if (userManuallyBlurredRef.current) return;
    if (!shouldRestoreFocusRef.current) return;
    const ta = textareaRef.current;
    if (!ta) return;
    if (document.activeElement !== ta) {
      ta.focus();
      restoreSelection();
    }
  }

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
        } else throw e;
      }
      lastPersisted.current = { title, content };
    } catch (e) {
      setError(e.message || "保存失败");
    } finally {
      setSaving(false);
      // 保存完成后尝试恢复焦点
      requestAnimationFrame(() => {
        ensureFocusAfterSave();
      });
    }
  }

  const [debouncedSave, flushSave] = useDebouncedCallback(doSave, 800);

  useEffect(() => {
    if (dirty) debouncedSave();
  }, [title, content, debouncedSave, dirty]);

  function onBlur() {
    userManuallyBlurredRef.current = true;
    flushSave();
  }

  function onTitleFocus() {
    userManuallyBlurredRef.current = false;
    shouldRestoreFocusRef.current = true;
  }

  function onContentFocus() {
    userManuallyBlurredRef.current = false;
    shouldRestoreFocusRef.current = true;
    captureSelection();
  }

  function insertAtCursor(text) {
    const ta = textareaRef.current;
    if (!ta) {
      setContent(c => c + text);
      return;
    }
    captureSelection();
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    setContent(c => c.slice(0, start) + text + c.slice(end));
    requestAnimationFrame(() => {
      const pos = start + text.length;
      selectionRef.current = { start: pos, end: pos };
      if (document.activeElement === ta) {
        ta.selectionStart = ta.selectionEnd = pos;
      }
    });
  }

  function replaceOnce(target, replacement) {
    captureSelection();
    setContent(c => {
      const idx = c.indexOf(target);
      if (idx === -1) return c;
      const before = c.slice(0, idx);
      const after = c.slice(idx + target.length);
      const next = before + replacement + after;
      const pos = before.length + replacement.length;
      selectionRef.current = { start: pos, end: pos };
      return next;
    });
    requestAnimationFrame(() => {
      restoreSelection();
    });
  }

  const handlePaste = useCallback(async (e) => {
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
  }, [block]);

  const handleDrop = useCallback(async (e) => {
    if (!block) return;
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(f =>
      f.type.startsWith("image/")
    );
    if (!files.length) return;
    for (const file of files) {
      await uploadOne(file);
    }
  }, [block]);

  async function uploadOne(file) {
    if (!file) return;
    const tempId = "uploading-" + Date.now() + "-" + Math.random().toString(16).slice(2);
    const placeholder = `![${tempId}](uploading)\n`;
    insertAtCursor("\n" + placeholder);
    try {
      const img = await apiUploadImage(file);
      replaceOnce(placeholder, `![image](${img.url})\n`);
      flushSave();
      toast.push("图片已上传", { type: "success" });
    } catch (e) {
      replaceOnce(placeholder, `![失败](#)\n`);
      toast.push(e.message || "图片上传失败", { type: "error" });
    }
  }

  // 内容变化后如果应该保持焦点，尝试恢复（避免渲染造成的失焦）
  useEffect(() => {
    if (!block) return;
    requestAnimationFrame(() => {
      ensureFocusAfterSave();
    });
  }, [content, title, block?.id]);

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
          disabled={block.optimistic}
          onFocus={onTitleFocus}
          onChange={e => {
            setTitle(e.target.value);
            setTitleManuallyEdited(true);
            shouldRestoreFocusRef.current = true;
          }}
          onBlur={onBlur}
        />
        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setShowPreview(p => !p)}
            className="px-2 py-1 border rounded hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            {showPreview ? "隐藏预览" : "显示预览"}
          </button>
          <div className="text-slate-400 select-none min-w-[56px] text-right">
            {saving
              ? "保存中..."
              : error
              ? <button onClick={doSave} className="text-red-500 hover:underline">重试</button>
              : dirty
              ? "待保存..."
              : "已保存"}
          </div>
          <button
            onClick={() => {
              if (confirm("确定删除该 Block？")) onDelete && onDelete(block.id);
            }}
            className="btn btn-outline !py-1 !px-3 text-xs"
          >
            删除
          </button>
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        <div className={"flex-1 flex flex-col " + (showPreview ? "w-1/2" : "w-full")}>
          <textarea
            ref={textareaRef}
            className="flex-1 p-4 resize-none outline-none bg-transparent font-mono text-sm leading-5 custom-scroll"
            value={content}
            placeholder="输入 Markdown 内容 (支持粘贴 / 拖拽图片)"
            disabled={block.optimistic}
            onChange={e => {
              setContent(e.target.value);
              shouldRestoreFocusRef.current = true;
              userManuallyBlurredRef.current = false;
              captureSelection();
            }}
            onFocus={onContentFocus}
            onClick={captureSelection}
            onKeyUp={captureSelection}
            onBlur={onBlur}
          />
        </div>
        {showPreview && (
          <div className="w-1/2 border-l border-slate-200 dark:border-slate-700 overflow-auto custom-scroll p-4 prose prose-sm dark:prose-invert">
            <div
              dangerouslySetInnerHTML={{
                __html: previewHtml || "<p class='text-slate-400'>暂无内容</p>"
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
