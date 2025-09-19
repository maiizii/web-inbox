import React, { useEffect, useState, useRef, useCallback } from "react";
import { useDebouncedCallback } from "../../hooks/useDebouncedCallback.js";
import { apiUploadImage } from "../../api/cloudflare.js";
import { useToast } from "../../hooks/useToast.jsx";
import { renderMarkdown } from "../../lib/markdown.js";

const DEBUG_IMG = false;

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
  const [previewMode, setPreviewMode] = useState(
    () => localStorage.getItem("previewMode") || "vertical"
  );

  useEffect(() => {
    localStorage.setItem("previewMode", previewMode);
  }, [previewMode]);

  const textareaRef = useRef(null);
  const lineNumbersInnerRef = useRef(null);
  const selectionRef = useRef({ start: null, end: null });
  const userManuallyBlurredRef = useRef(false);
  const shouldRestoreFocusRef = useRef(false);
  const lastPersisted = useRef({ title: "", content: "" });

  const [previewHtml, setPreviewHtml] = useState("");

  /* 预览 */
  useEffect(() => {
    if (showPreview) setPreviewHtml(renderMarkdown(content));
  }, [content, showPreview]);

  /* 切换 block */
  useEffect(() => {
    setTitle(block?.title || "");
    setContent(block?.content || "");
    lastPersisted.current = {
      title: block?.title || "",
      content: block?.content || ""
    };
    setError("");
    setTitleManuallyEdited(!!(block && block.title));
    userManuallyBlurredRef.current = false;
    shouldRestoreFocusRef.current = false;
    syncLineNumberPadTop();
  }, [block?.id]);

  /* 自动标题 */
  useEffect(() => {
    if (!block) return;
    if (!titleManuallyEdited && !title && content) {
      setTitle(content.split("\n")[0].slice(0, 10));
    }
  }, [content, title, titleManuallyEdited, block]);

  const dirty =
    block &&
    (title !== lastPersisted.current.title ||
      content !== lastPersisted.current.content);

  /* 选区/焦点 */
  function captureSel() {
    const ta = textareaRef.current;
    if (!ta) return;
    selectionRef.current = {
      start: ta.selectionStart,
      end: ta.selectionEnd
    };
  }
  function restoreSel() {
    const ta = textareaRef.current;
    if (!ta) return;
    const { start, end } = selectionRef.current;
    if (start != null && end != null) {
      try { ta.setSelectionRange(start, end); } catch {}
    }
  }
  function maybeRestoreFocus() {
    if (userManuallyBlurredRef.current) return;
    if (!shouldRestoreFocusRef.current) return;
    const ta = textareaRef.current;
    if (ta && document.activeElement !== ta) {
      ta.focus();
      restoreSel();
    }
  }

  /* 保存 */
  async function doSave() {
    if (!block || !dirty || block.optimistic) return;
    setSaving(true);
    setError("");
    const payload = { title, content };
    try {
      onChange && onChange(block.id, { ...payload });
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
      requestAnimationFrame(maybeRestoreFocus);
    }
  }
  const [debouncedSave, flushSave] = useDebouncedCallback(doSave, 800);
  useEffect(() => { if (dirty) debouncedSave(); }, [title, content, debouncedSave, dirty]);

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
    captureSel();
  }

  /* 行号 */
  function getLineNumbersString(text) {
    if (text === "") return "1";
    return text.split("\n").map((_, i) => i + 1).join("\n");
  }
  const lineNumbersString = getLineNumbersString(content);

  function syncLineNumberPadTop() {
    const ta = textareaRef.current;
    const inner = lineNumbersInnerRef.current;
    if (!ta || !inner) return;
    const padTop = parseFloat(getComputedStyle(ta).paddingTop) || 0;
    inner.style.top = padTop + "px";
  }
  function onTextareaScroll(e) {
    const scrollTop = e.target.scrollTop;
    if (lineNumbersInnerRef.current) {
      lineNumbersInnerRef.current.style.transform = `translateY(${-scrollTop}px)`;
    }
  }
  useEffect(() => {
    syncLineNumberPadTop();
    const onResize = () => syncLineNumberPadTop();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  /* 插入文本 */
  function insertAtCursor(text) {
    const ta = textareaRef.current;
    if (!ta) {
      setContent(c => c + text);
      return;
    }
    captureSel();
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

  /* 图片上传立即保存 */
  async function immediatePersistAfterImage(newContent) {
    if (!block || block.optimistic) return;
    try {
      onChange && onChange(block.id, { content: newContent, title });
      const payload = { title, content: newContent };
      let real;
      try {
        real = await onImmediateSave(block.id, payload);
      } catch (e) {
        if (safeUpdateFallback) {
          real = await safeUpdateFallback(block.id, payload, e);
        } else throw e;
      }
      lastPersisted.current = { title, content: newContent };
    } catch (e) {
      toast.push(e.message || "图片保存失败", { type: "error" });
    }
  }

  async function uploadOne(file) {
    if (!file || !block) return;
    const currentBlockId = block.id;
    const tempId = "uploading-" + Date.now() + "-" + Math.random().toString(16).slice(2);
    const placeholder = `![${tempId}](uploading)`;

    setContent(prev => {
      const needsLeadingNL = prev.length > 0 && !prev.endsWith("\n");
      const insertion = needsLeadingNL ? `\n${placeholder}` : placeholder;
      if (DEBUG_IMG) console.log("[img] insert placeholder", insertion);
      return prev + insertion + "\n";
    });

    try {
      const img = await apiUploadImage(file);
      if (DEBUG_IMG) console.log("[img] upload success", img);

      if (!block || block.id !== currentBlockId) {
        if (DEBUG_IMG) console.log("[img] block changed during upload, abort replace");
        return;
      }

      setContent(prev => {
        const re = new RegExp(`!\\[${tempId.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\]\\(uploading\\)`, "g");
        const replaced = prev.replace(re, `![image](${img.url})`);
        immediatePersistAfterImage(replaced);
        return replaced;
      });

      toast.push("图片已上传", { type: "success" });
    } catch (e) {
      if (DEBUG_IMG) console.error("[img] upload failed", e);
      setContent(prev => {
        const re = new RegExp(`!\\[${tempId.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\]\\(uploading\\)`, "g");
        const replaced = prev.replace(re, "![失败](#)");
        immediatePersistAfterImage(replaced);
        return replaced;
      });
      toast.push(e.message || "图片上传失败", { type: "error" });
    }
  }

  const handlePaste = useCallback(async (e) => {
    if (!block) return;
    const items = Array.from(e.clipboardData.items).filter(it => it.type.startsWith("image/"));
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
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/"));
    if (!files.length) return;
    for (const file of files) {
      await uploadOne(file);
    }
  }, [block]);

  useEffect(() => {
    if (!block) return;
    requestAnimationFrame(maybeRestoreFocus);
  }, [content, title, block?.id]);

  if (!block) {
    return <div className="flex items-center justify-center h-full text-sm text-slate-400">请选择左侧 Block 或点击“新建”</div>;
  }

  const disabledByCreation = !!(block.optimistic && String(block.id).startsWith("tmp-"));

  return (
    <div
      className="h-full flex flex-col"
      onPaste={handlePaste}
      onDrop={handleDrop}
      onDragOver={e => e.preventDefault()}
    >
      {/* 工具栏 */}
      <div className="flex items-center gap-3 py-3 px-4 border-b border-slate-200 dark:border-slate-700">
        <input
          className="text-xl font-semibold bg-transparent outline-none flex-1 placeholder-slate-400"
          placeholder="标题..."
          value={title}
          disabled={disabledByCreation}
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
          <button
            type="button"
            onClick={() => setPreviewMode(m => (m === "vertical" ? "horizontal" : "vertical"))}
            className="px-2 py-1 border rounded hover:bg-slate-100 dark:hover:bg-slate-800"
            title="切换预览布局"
          >
            {previewMode === "vertical" ? "上下预览" : "左右预览"}
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
            onClick={() => { if (confirm("确定删除该 Block？")) onDelete && onDelete(block.id); }}
            className="btn-outline-sm !py-1 !px-3"
          >
            删除
          </button>
        </div>
      </div>

      {/* 主体 */}
      <div className={`flex-1 flex min-h-0 ${
        showPreview
          ? previewMode === "vertical"
            ? ""
            : "flex-col"
          : ""
      }`}>
        {/* 编辑器 */}
        <div className={
          showPreview
            ? previewMode === "vertical"
              ? "flex-1 flex flex-col w-1/2"
              : "flex-1 flex flex-col h-1/2"
            : "flex-1 flex flex-col"
        }>
          <div className="editor-wrapper flex-1 flex flex-col">
            <div className="editor-code-area flex-1 relative flex">
              <div className="editor-line-numbers">
                <pre
                  ref={lineNumbersInnerRef}
                  className="editor-line-numbers-inner"
                  aria-hidden="true"
                >
                  {lineNumbersString}
                </pre>
              </div>
              <textarea
                ref={textareaRef}
                className="editor-textarea custom-scroll"
                value={content}
                placeholder="输入 Markdown 内容 (支持粘贴 / 拖拽图片)"
                disabled={disabledByCreation}
                wrap="off"
                onChange={e => {
                  setContent(e.target.value);
                  shouldRestoreFocusRef.current = true;
                  userManuallyBlurredRef.current = false;
                  captureSel();
                }}
                onScroll={onTextareaScroll}
                onFocus={onContentFocus}
                onClick={captureSel}
                onKeyUp={captureSel}
                onBlur={onBlur}
              />
            </div>
          </div>
        </div>

        {/* 预览 */}
        {showPreview && (
          <div className={
            previewMode === "vertical"
              ? "w-1/2 border-l border-slate-200 dark:border-slate-700 overflow-auto custom-scroll p-4 prose prose-sm dark:prose-invert"
              : "h-1/2 border-t border-slate-200 dark:border-slate-700 overflow-auto custom-scroll p-4 prose prose-sm dark:prose-invert"
          }>
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
