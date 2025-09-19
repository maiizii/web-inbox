import React, {
  useEffect,
  useState,
  useRef,
  useCallback
} from "react";
import { useDebouncedCallback } from "../../hooks/useDebouncedCallback.js";
import { apiUploadImage } from "../../api/cloudflare.js";
import { useToast } from "../../hooks/useToast.jsx";
import { renderMarkdown } from "../../lib/markdown.js";

/**
 * BlockEditorAuto (readonly title + draggable split + markdown shortcuts)
 */
export default function BlockEditorAuto({
  block,
  onChange,
  onDelete,
  onImmediateSave,
  safeUpdateFallback
}) {
  const toast = useToast();

  /* ================= State ================= */
  const [content, setContent] = useState(block?.content || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showPreview, setShowPreview] = useState(true);
  const [previewMode, setPreviewMode] = useState(
    () => localStorage.getItem("previewMode") || "vertical"
  ); // vertical=左右 horizontal=上下
  // 分割比例（0~1）
  const [splitRatio, setSplitRatio] = useState(() => {
    const key = previewMode === "vertical" ? "editorSplit_vertical" : "editorSplit_horizontal";
    const raw = localStorage.getItem(key);
    const v = raw ? parseFloat(raw) : 0.5;
    return isNaN(v) ? 0.5 : Math.min(0.85, Math.max(0.15, v));
  });
  const [lineNumbers, setLineNumbers] = useState("1");
  const [previewHtml, setPreviewHtml] = useState("");

  // 拖拽状态
  const [draggingSplit, setDraggingSplit] = useState(false);

  /* ================= Refs ================= */
  const textareaRef = useRef(null);
  const lineNumbersInnerRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const selectionRef = useRef({ start: null, end: null });
  const userManuallyBlurredRef = useRef(false);
  const shouldRestoreFocusRef = useRef(false);
  const lastPersisted = useRef({ content: "" });
  const dragInfoRef = useRef(null);

  /* ================= Derived ================= */
  const dirty = !!block && content !== lastPersisted.current.content;
  const derivedTitle = (block?.content || "")
    .split("\n")[0]
    .slice(0, 64) || "(空)";

  /* ================= Effects: Block 切换 ================= */
  useEffect(() => {
    setContent(block?.content || "");
    lastPersisted.current = { content: block?.content || "" };
    setError("");
    updateLineNumbers(block?.content || "");
    requestAnimationFrame(syncLineNumbersPadding);
  }, [block?.id]);

  /* ================= Effects: Preview ================= */
  useEffect(() => {
    if (showPreview) setPreviewHtml(renderMarkdown(content));
  }, [content, showPreview]);

  /* ================= Effects: Preview mode changes ================= */
  useEffect(() => {
    // 切换模式时加载各自的 ratio
    const key = previewMode === "vertical" ? "editorSplit_vertical" : "editorSplit_horizontal";
    const raw = localStorage.getItem(key);
    const v = raw ? parseFloat(raw) : splitRatio;
    setSplitRatio(isNaN(v) ? 0.5 : Math.min(0.85, Math.max(0.15, v)));
    localStorage.setItem("previewMode", previewMode);
  }, [previewMode]);

  /* ================= 行号生成 ================= */
  function updateLineNumbers(text) {
    if (text === "") { setLineNumbers("1"); return; }
    const lines = text.split("\n");
    setLineNumbers(lines.map((_, i) => i + 1).join("\n"));
  }
  useEffect(() => { updateLineNumbers(content); }, [content]);

  /* ================= 选区 / 焦点 ================= */
  function captureSel() {
    const ta = textareaRef.current;
    if (!ta) return;
    selectionRef.current = { start: ta.selectionStart, end: ta.selectionEnd };
  }
  function restoreSel() {
    const ta = textareaRef.current;
    if (!ta) return;
    const { start, end } = selectionRef.current;
    if (start == null || end == null) return;
    try { ta.setSelectionRange(start, end); } catch {}
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

  useEffect(() => {
    if (!block) return;
    requestAnimationFrame(maybeRestoreFocus);
  }, [block?.id]);

  /* ================= 保存逻辑 ================= */
  async function doSave() {
    if (!block || block.optimistic) return;
    if (!dirty) return;
    setSaving(true);
    setError("");
    const payload = { content };
    try {
      onChange && onChange(block.id, { content });
      let real;
      try {
        real = await onImmediateSave(block.id, payload);
      } catch (err) {
        if (safeUpdateFallback) real = await safeUpdateFallback(block.id, payload, err);
        else throw err;
      }
      lastPersisted.current = { content };
    } catch (err) {
      setError(err.message || "保存失败");
    } finally {
      setSaving(false);
      requestAnimationFrame(maybeRestoreFocus);
    }
  }
  const [debouncedSave, flushSave] = useDebouncedCallback(doSave, 800);
  useEffect(() => { if (dirty) debouncedSave(); }, [content, debouncedSave, dirty]);
  function onBlur() {
    userManuallyBlurredRef.current = true;
    flushSave();
  }
  function onContentFocus() {
    userManuallyBlurredRef.current = false;
    shouldRestoreFocusRef.current = true;
    captureSel();
  }

  /* ================= 行号同步 ================= */
  function syncLineNumbersPadding() {
    const ta = textareaRef.current;
    const inner = lineNumbersInnerRef.current;
    if (!ta || !inner) return;
    const padTop = parseFloat(getComputedStyle(ta).paddingTop) || 0;
    inner.style.top = padTop + "px";
  }
  function handleEditorScroll(e) {
    const st = e.target.scrollTop;
    if (lineNumbersInnerRef.current) {
      lineNumbersInnerRef.current.style.transform = `translateY(${-st}px)`;
    }
  }
  useEffect(() => {
    syncLineNumbersPadding();
    const r = () => syncLineNumbersPadding();
    window.addEventListener("resize", r);
    return () => window.removeEventListener("resize", r);
  }, []);

  /* ================= 图片上传 ================= */
  async function immediatePersistAfterImage(newContent) {
    if (!block || block.optimistic) return;
    try {
      onChange && onChange(block.id, { content: newContent });
      const payload = { content: newContent };
      let real;
      try {
        real = await onImmediateSave(block.id, payload);
      } catch (e) {
        if (safeUpdateFallback) real = await safeUpdateFallback(block.id, payload, e);
        else throw e;
      }
      lastPersisted.current = { content: newContent };
    } catch (e) {
      toast.push(e.message || "图片保存失败", { type: "error" });
    }
  }
  async function uploadOne(file) {
    if (!file || !block) return;
    const currentId = block.id;
    const tempId = "uploading-" + Date.now() + "-" + Math.random().toString(16).slice(2);
    const placeholder = `![${tempId}](uploading)`;
    setContent(prev => {
      const nl = prev.length > 0 && !prev.endsWith("\n") ? "\n" : "";
      return prev + nl + placeholder + "\n";
    });
    try {
      const img = await apiUploadImage(file);
      if (!block || block.id !== currentId) return;
      setContent(prev => {
        const re = new RegExp(
          `!\\[${tempId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\]\\(uploading\\)`,
          "g"
        );
        const replaced = prev.replace(re, `![image](${img.url})`);
        immediatePersistAfterImage(replaced);
        return replaced;
      });
      toast.push("图片已上传", { type: "success" });
    } catch (err) {
      setContent(prev => {
        const re = new RegExp(
          `!\\[${tempId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\]\\(uploading\\)`,
          "g"
        );
        const replaced = prev.replace(re, "![失败](#)");
        immediatePersistAfterImage(replaced);
        return replaced;
      });
      toast.push(err.message || "图片上传失败", { type: "error" });
    }
  }
  const handlePaste = useCallback(async e => {
    if (!block) return;
    const items = Array.from(e.clipboardData.items).filter(it =>
      it.type.startsWith("image/")
    );
    if (!items.length) return;
    e.preventDefault();
    for (const it of items) {
      const file = it.getAsFile();
      if (file) await uploadOne(file);
    }
  }, [block]);
  const handleDrop = useCallback(async e => {
    if (!block) return;
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(f =>
      f.type.startsWith("image/")
    );
    if (!files.length) return;
    for (const f of files) await uploadOne(f);
  }, [block]);

  /* ================= Markdown 快捷插入 ================= */
  function replaceSelection(modifierFn) {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const before = content.slice(0, start);
    const sel = content.slice(start, end);
    const after = content.slice(end);
    const { text, newStart, newEnd } = modifierFn(sel, { start, end });
    const newContent = before + text + after;
    setContent(newContent);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(newStart, newEnd);
      captureSel();
    });
  }

  function insertBold() {
    replaceSelection((sel) => {
      if (!sel) {
        return { text: "**粗体**", newStart: content.length + 2, newEnd: content.length + 4 };
      }
      const wrapped = sel.startsWith("**") && sel.endsWith("**")
        ? sel.slice(2, -2)
        : `**${sel}**`;
      const newStart = selectionRef.current.start + (wrapped.startsWith("**") ? 2 : 0);
      const newEnd = newStart + (sel.startsWith("**") && sel.endsWith("**") ? wrapped.length : sel.length);
      return { text: wrapped, newStart, newEnd };
    });
  }

  function insertCodeBlock() {
    replaceSelection((sel) => {
      if (!sel.includes("\n") && sel) {
        const wrapped = "`" + sel + "`";
        return {
          text: wrapped,
            newStart: selectionRef.current.start + 1,
          newEnd: selectionRef.current.start + 1 + sel.length
        };
      }
      const block = "```\n" + (sel || "code") + "\n```";
      const base = selectionRef.current.start;
      const newStart = base + 4;
      const newEnd = newStart + (sel || "code").length;
      return { text: block, newStart, newEnd };
    });
  }

  function insertHeading() {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    // 找到当前行
    const beforeAll = content.slice(0, start);
    const lineStart = beforeAll.lastIndexOf("\n") + 1;
    const lineEnd = content.indexOf("\n", start) === -1 ? content.length : content.indexOf("\n", start);
    const line = content.slice(lineStart, lineEnd);
    const match = line.match(/^(#{1,6})\s+/);
    let newLine;
    if (!match) {
      newLine = "# " + line;
    } else {
      const hashes = match[1];
      if (hashes.length === 6) {
        newLine = "# " + line.replace(/^#{1,6}\s+/, "");
      } else {
        newLine = "#".repeat(hashes.length + 1) + " " + line.replace(/^#{1,6}\s+/, "");
      }
    }
    const newContent = content.slice(0, lineStart) + newLine + content.slice(lineEnd);
    setContent(newContent);
    requestAnimationFrame(() => {
      const pos = lineStart + newLine.length;
      ta.focus();
      ta.setSelectionRange(pos, pos);
      captureSel();
    });
  }

  /* ================= Tab / Shift+Tab 缩进 ================= */
  function handleKeyDown(e) {
    if (e.key === "Tab") {
      const ta = textareaRef.current;
      if (!ta) return;
      e.preventDefault();
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const before = content.slice(0, start);
      const sel = content.slice(start, end);
      const after = content.slice(end);
      const INDENT = "  "; // 两空格缩进

      if (e.shiftKey) {
        // 反缩进：处理多行
        const lines = sel.split("\n");
        let removed = 0;
        const newLines = lines.map(l => {
          if (l.startsWith(INDENT)) {
            removed += INDENT.length;
            return l.slice(INDENT.length);
          } else if (l.startsWith(" ")) {
            removed += 1;
            return l.slice(1);
          }
          return l;
        });
        const newSel = newLines.join("\n");
        const newContent = before + newSel + after;
        setContent(newContent);
        requestAnimationFrame(() => {
          ta.focus();
          ta.setSelectionRange(start, start + newSel.length);
          captureSel();
        });
      } else {
        // 正向缩进
        if (sel.includes("\n")) {
          const lines = sel.split("\n");
          const newLines = lines.map(l => INDENT + l);
          const newSel = newLines.join("\n");
          const newContent = before + newSel + after;
          setContent(newContent);
          requestAnimationFrame(() => {
            ta.focus();
            ta.setSelectionRange(start + INDENT.length, start + newSel.length);
            captureSel();
          });
        } else {
          const newContent = before + INDENT + sel + after;
          setContent(newContent);
          requestAnimationFrame(() => {
            ta.focus();
            const pos = start + INDENT.length;
            ta.setSelectionRange(pos, pos);
            captureSel();
          });
        }
      }
    }
  }

  /* ================= 分割条拖动 ================= */
  function startDrag(e) {
    e.preventDefault();
    setDraggingSplit(true);
    dragInfoRef.current = {
      startX: e.clientX,
      startY: e.clientY
    };
    window.addEventListener("mousemove", onDragMove);
    window.addEventListener("mouseup", stopDrag);
  }
  function onDragMove(e) {
    if (!draggingSplit) return;
    if (previewMode === "vertical") {
      // 横向拖：取相对宽度
      const container = e.target.ownerDocument.querySelector(".editor-split-root");
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;
      const clamped = Math.min(0.85, Math.max(0.15, ratio));
      setSplitRatio(clamped);
    } else {
      // vertical=上下? 此处 horizontal=上下
      const container = e.target.ownerDocument.querySelector(".editor-split-root");
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const ratio = (e.clientY - rect.top) / rect.height;
      const clamped = Math.min(0.85, Math.max(0.15, ratio));
      setSplitRatio(clamped);
    }
  }
  function stopDrag() {
    setDraggingSplit(false);
    window.removeEventListener("mousemove", onDragMove);
    window.removeEventListener("mouseup", stopDrag);
    const key = previewMode === "vertical" ? "editorSplit_vertical" : "editorSplit_horizontal";
    localStorage.setItem(key, String(splitRatio));
  }

  /* ================= 贴图 / 拖图事件 ================= */
  useEffect(() => {
    return () => {
      if (draggingSplit) stopDrag();
    };
  }, [draggingSplit]);

  if (!block) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-slate-400">
        请选择左侧 Block 或点击“新建”
      </div>
    );
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
        <div className="flex-1 text-lg font-semibold truncate">
          {derivedTitle}
        </div>

        <div className="flex items-center gap-2 text-xs">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={insertBold}
              className="btn-outline-modern !px-2.5 !py-1.5"
              title="加粗"
            >
              B
            </button>
            <button
              type="button"
              onClick={insertCodeBlock}
              className="btn-outline-modern !px-2.5 !py-1.5"
              title="代码块 / 行内代码"
            >
              {"</>"}
            </button>
            <button
              type="button"
              onClick={insertHeading}
              className="btn-outline-modern !px-2.5 !py-1.5"
              title="标题级别循环"
            >
              H#
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowPreview(p => !p)}
            className="btn-outline-modern !px-3 !py-1.5"
          >
            {showPreview ? "隐藏预览" : "显示预览"}
          </button>
          <button
            type="button"
            onClick={() =>
              setPreviewMode(m => (m === "vertical" ? "horizontal" : "vertical"))
            }
            className="btn-outline-modern !px-3 !py-1.5"
            title="切换预览布局"
          >
            {previewMode === "vertical" ? "上下预览" : "左右预览"}
          </button>

          <div className="text-slate-400 select-none min-w-[64px] text-right">
            {saving
              ? "保存中"
              : error
              ? (
                <button onClick={doSave} className="text-red-500 hover:underline">
                  重试
                </button>
                )
              : dirty
              ? "待保存"
              : "已保存"}
          </div>

          <button
            onClick={() => {
              if (confirm("确定删除该 Block？")) {
                onDelete && onDelete(block.id);
              }
            }}
            className="btn-danger-modern !px-3 !py-1.5"
          >
            删除
          </button>
        </div>
      </div>

      {/* 主体分屏根容器 */}
      <div
        className={`editor-split-root flex-1 min-h-0 flex ${
          showPreview
            ? previewMode === "vertical"
              ? "flex-row"
              : "flex-col"
            : "flex-col"
        }`}
      >
        {/* 编辑区 */}
        <div
          className={
            showPreview
              ? previewMode === "vertical"
                ? "h-full flex flex-col"
                : "w-full flex flex-col"
              : "flex-1 flex flex-col"
          }
          style={
            showPreview
              ? previewMode === "vertical"
                ? { width: `${splitRatio * 100}%` }
                : { height: `${splitRatio * 100}%` }
              : {}
          }
        >
          <div className="flex-1 relative">
            <div className="absolute inset-0 flex overflow-hidden">
              <div className="editor-line-numbers">
                <pre
                  ref={lineNumbersInnerRef}
                  className="editor-line-numbers-inner"
                  aria-hidden="true"
                >
                  {lineNumbers}
                </pre>
              </div>
              <div
                ref={scrollContainerRef}
                className="flex-1 h-full overflow-auto custom-scroll"
                onScroll={handleEditorScroll}
              >
                <textarea
                  ref={textareaRef}
                  className="editor-textarea"
                  value={content}
                  disabled={disabledByCreation}
                  placeholder="输入 Markdown 内容 (支持粘贴 / 拖拽图片, Tab 缩进, Shift+Tab 反缩进)"
                  wrap="off"
                  onChange={e => {
                    setContent(e.target.value);
                    shouldRestoreFocusRef.current = true;
                    userManuallyBlurredRef.current = false;
                    captureSel();
                  }}
                  onFocus={onContentFocus}
                  onBlur={onBlur}
                  onClick={captureSel}
                  onKeyUp={captureSel}
                  onKeyDown={handleKeyDown}
                />
              </div>
            </div>
          </div>
        </div>

        {/* 分割条 */}
        {showPreview && (
          <div
            className={`split-divider ${
              previewMode === "vertical"
                ? "split-vertical"
                : "split-horizontal"
            } ${draggingSplit ? "dragging" : ""}`}
            onMouseDown={startDrag}
          />
        )}

        {/* 预览区 */}
        {showPreview && (
          <div
            className={
              previewMode === "vertical"
                ? "h-full overflow-auto custom-scroll p-4 prose prose-sm dark:prose-invert"
                : "w-full overflow-auto custom-scroll p-4 prose prose-sm dark:prose-invert"
            }
            style={
              previewMode === "vertical"
                ? { width: `${(1 - splitRatio) * 100}%` }
                : { height: `${(1 - splitRatio) * 100}%` }
            }
          >
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
