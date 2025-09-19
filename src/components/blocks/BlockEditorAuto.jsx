import React, {
  useEffect,
  useState,
  useRef,
  useCallback
} from "react";
import { useDebouncedCallback } from "../../hooks/useDebouncedCallback.js";
import { apiUploadImage } from "../../api/cloudflare.js";
import { useToast } from "../../hooks/useToast.jsx";
import { Undo2, Redo2 } from "lucide-react";

const MAX_HISTORY = 200;
const HISTORY_GROUP_MS = 800;
const INDENT = "  "; // 两个空格

export default function BlockEditorAuto({
  block,
  onChange,
  onDelete,
  onImmediateSave,
  safeUpdateFallback
}) {
  const toast = useToast();

  /* ---------------- State ---------------- */
  const [content, setContent] = useState(block?.content || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showPreview, setShowPreview] = useState(true);
  const [previewMode, setPreviewMode] = useState(
    () => localStorage.getItem("previewMode") || "vertical"
  ); // vertical=左右 horizontal=上下
  const [splitRatio, setSplitRatio] = useState(() => {
    const key = previewMode === "vertical" ? "editorSplit_vertical" : "editorSplit_horizontal";
    const raw = localStorage.getItem(key);
    const v = raw ? parseFloat(raw) : 0.5;
    return isNaN(v) ? 0.5 : clamp(v, 0.15, 0.85);
  });
  const [draggingSplit, setDraggingSplit] = useState(false);
  const [lineNumbers, setLineNumbers] = useState("1");
  const [previewHtml, setPreviewHtml] = useState("");

  /* ---------------- Refs ---------------- */
  const rootRef = useRef(null);                // 整个组件
  const splitContainerRef = useRef(null);      // 仅分屏区域（用于测量）
  const textareaRef = useRef(null);
  const lineNumbersInnerRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const selectionRef = useRef({ start: null, end: null });
  const userManuallyBlurredRef = useRef(false);
  const shouldRestoreFocusRef = useRef(false);
  const lastPersisted = useRef({ content: "" });
  const currentBlockIdRef = useRef(block?.id || null);
  const dragMetaRef = useRef(null);

  // 历史
  const historyRef = useRef([]);
  const historyIndexRef = useRef(-1);
  const lastHistoryPushTimeRef = useRef(0);
  const isRestoringHistoryRef = useRef(false);

  /* ---------------- Derived ---------------- */
  const dirty = !!block && content !== lastPersisted.current.content;
  const derivedTitle = (block?.content || "").split("\n")[0].slice(0, 64) || "(空)";
  const canUndo = historyIndexRef.current > 0;
  const canRedo = historyIndexRef.current < historyRef.current.length - 1;

  /* ---------------- Utils ---------------- */
  function clamp(v, a, b) {
    return Math.min(b, Math.max(a, v));
  }
  function escapeHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // 仅解析图片，支持相对路径/绝对路径，其它 markdown 仍显示纯文本
  function renderPlainWithImages(raw) {
    if (!raw) return "<span class='text-slate-400'>暂无内容</span>";
    const re = /!\[([^\]]*?)\]\(([^)\s]+)\)/g;
    let out = "";
    let lastIndex = 0;
    let m;
    while ((m = re.exec(raw)) !== null) {
      const [full, alt, url] = m;
      const before = raw.slice(lastIndex, m.index);
      out += escapeHtml(before);
      const safeAlt = escapeHtml(alt || "");
      const safeUrl = escapeHtml(url);
      out += `<img src="${safeUrl}" alt="${safeAlt}" loading="lazy" class="inline-block max-w-full border border-slate-200 dark:border-slate-600 rounded-md my-1" />`;
      lastIndex = m.index + full.length;
    }
    out += escapeHtml(raw.slice(lastIndex));
    return out.replace(/\r\n/g, "\n").replace(/\n/g, "<br/>");
  }

  function updatePreview(text) {
    setPreviewHtml(renderPlainWithImages(text));
  }

  function updateLineNums(text) {
    if (!text) { setLineNumbers("1"); return; }
    setLineNumbers(text.split("\n").map((_, i) => i + 1).join("\n"));
  }

  /* ---------------- History ---------------- */
  function pushHistory(newContent, forceSeparate = false) {
    if (isRestoringHistoryRef.current) return;
    const now = Date.now();
    const since = now - lastHistoryPushTimeRef.current;
    const lastSnap =
      historyIndexRef.current >= 0
        ? historyRef.current[historyIndexRef.current]
        : undefined;

    if (!forceSeparate && since < HISTORY_GROUP_MS) {
      if (lastSnap !== newContent && historyIndexRef.current >= 0) {
        historyRef.current[historyIndexRef.current] = newContent;
      }
      lastHistoryPushTimeRef.current = now;
      return;
    }
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyRef.current.splice(historyIndexRef.current + 1);
    }
    historyRef.current.push(newContent);
    if (historyRef.current.length > MAX_HISTORY) {
      historyRef.current.shift();
    } else {
      historyIndexRef.current++;
    }
    lastHistoryPushTimeRef.current = now;
  }

  function restoreHistory(delta) {
    if (!historyRef.current.length) return;
    const nextIndex = historyIndexRef.current + delta;
    if (nextIndex < 0 || nextIndex >= historyRef.current.length) return;
    historyIndexRef.current = nextIndex;
    const snap = historyRef.current[nextIndex];
    isRestoringHistoryRef.current = true;
    setContent(snap);
    updateLineNums(snap);
    updatePreview(snap);
    requestAnimationFrame(() => {
      isRestoringHistoryRef.current = false;
    });
  }

  function handleUndoRedoKey(e) {
    const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform);
    const ctrl = isMac ? e.metaKey : e.ctrlKey;
    if (!ctrl) return;
    if (e.key === "z" || e.key === "Z") {
      e.preventDefault();
      if (e.shiftKey) restoreHistory(+1);
      else restoreHistory(-1);
    } else if (e.key === "y" || e.key === "Y") {
      e.preventDefault();
      restoreHistory(+1);
    }
  }

  /* ---------------- Effects: block change ---------------- */
  useEffect(() => {
    currentBlockIdRef.current = block?.id || null;
    const init = block?.content || "";
    setContent(init);
    lastPersisted.current = { content: init };
    historyRef.current = [init];
    historyIndexRef.current = 0;
    updateLineNums(init);
    updatePreview(init);
    userManuallyBlurredRef.current = false;
    shouldRestoreFocusRef.current = false;
    requestAnimationFrame(syncLineNumbersPadding);
  }, [block?.id]);

  /* ---------------- Effects: preview / mode ---------------- */
  useEffect(() => {
    updatePreview(content);
  }, [content]);

  useEffect(() => {
    const key = previewMode === "vertical"
      ? "editorSplit_vertical"
      : "editorSplit_horizontal";
    const raw = localStorage.getItem(key);
    const v = raw ? parseFloat(raw) : splitRatio;
    setSplitRatio(isNaN(v) ? 0.5 : clamp(v, 0.15, 0.85));
    localStorage.setItem("previewMode", previewMode);
  }, [previewMode]);

  /* ---------------- Selection / focus ---------------- */
  function captureSel() {
    const ta = textareaRef.current;
    if (!ta) return;
    selectionRef.current = { start: ta.selectionStart, end: ta.selectionEnd };
  }
  function restoreSel() {
    const ta = textareaRef.current;
    const { start, end } = selectionRef.current;
    if (!ta || start == null || end == null) return;
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

  /* ---------------- Auto Save ---------------- */
  async function doSave() {
    if (!block || block.optimistic) return;
    if (!dirty) return;
    const savedBlock = block.id;
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
      if (currentBlockIdRef.current === savedBlock) {
        lastPersisted.current = { content };
      }
    } catch (err) {
      if (currentBlockIdRef.current === savedBlock) {
        setError(err.message || "保存失败");
      }
    } finally {
      if (currentBlockIdRef.current === savedBlock) {
        setSaving(false);
        requestAnimationFrame(maybeRestoreFocus);
      }
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

  /* ---------------- Scroll & line numbers ---------------- */
  function syncLineNumbersPadding() {
    const ta = textareaRef.current;
    const inner = lineNumbersInnerRef.current;
    if (!ta || !inner) return;
    const padTop = parseFloat(getComputedStyle(ta).paddingTop) || 0;
    inner.style.top = padTop + "px";
  }
  function handleEditorScroll(e) {
    if (lineNumbersInnerRef.current) {
      lineNumbersInnerRef.current.style.transform =
        `translateY(${-e.target.scrollTop}px)`;
    }
  }
  useEffect(() => {
    syncLineNumbersPadding();
    const r = () => syncLineNumbersPadding();
    window.addEventListener("resize", r);
    return () => window.removeEventListener("resize", r);
  }, []);

  /* ---------------- Paste / Drop image ---------------- */
  async function persistAfterImage(newContent) {
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
      pushHistory(newContent, true);
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
      const nl = prev && !prev.endsWith("\n") ? "\n" : "";
      const nc = prev + nl + placeholder + "\n";
      pushHistory(nc, true);
      return nc;
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
        persistAfterImage(replaced);
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
        persistAfterImage(replaced);
        return replaced;
      });
      toast.push(err.message || "图片上传失败", { type: "error" });
    }
  }
  const handlePaste = useCallback(async e => {
    if (!block) return;
    const items = Array.from(e.clipboardData.items).filter(it => it.type.startsWith("image/"));
    if (!items.length) return;
    e.preventDefault();
    for (const it of items) {
      const f = it.getAsFile();
      if (f) await uploadOne(f);
    }
  }, [block]);
  const handleDrop = useCallback(async e => {
    if (!block) return;
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/"));
    if (!files.length) return;
    for (const f of files) await uploadOne(f);
  }, [block]);

  /* ---------------- Indent (Tab / Shift+Tab) ---------------- */
  function handleIndentKey(e) {
    if (e.key !== "Tab") return;
    const ta = textareaRef.current;
    if (!ta) return;
    e.preventDefault();

    const start = ta.selectionStart;
    const end = ta.selectionEnd;

    const text = content;
    // 选区所在的完整行
    const lineStartIdx = text.lastIndexOf("\n", start - 1) + 1;
    const lineEndIdx = text.indexOf("\n", end);
    const effectiveEnd = lineEndIdx === -1 ? text.length : lineEndIdx;

    const before = text.slice(0, lineStartIdx);
    const target = text.slice(lineStartIdx, effectiveEnd);
    const after = text.slice(effectiveEnd);
    const lines = target.split("\n");

    if (e.shiftKey) {
      let removeFirst = 0;
      const newLines = lines.map((l, i) => {
        if (l.startsWith(INDENT)) {
          if (i === 0) removeFirst = INDENT.length;
          return l.slice(INDENT.length);
        } else if (l.startsWith(" ")) {
          if (i === 0) removeFirst = 1;
          return l.slice(1);
        }
        return l;
      });
      const newTarget = newLines.join("\n");
      const newContent = before + newTarget + after;
      const newSelStart = start - removeFirst;
      const adjust = target.length - newTarget.length;
      const newSelEnd = end - adjust;
      setContent(newContent);
      updateLineNums(newContent);
      updatePreview(newContent);
      pushHistory(newContent);
      requestAnimationFrame(() => {
        ta.focus();
        ta.setSelectionRange(newSelStart, newSelEnd);
        captureSel();
      });
    } else {
      if (lines.length === 1) {
        const newLine = INDENT + lines[0];
        const newContent = before + newLine + after;
        setContent(newContent);
        updateLineNums(newContent);
        updatePreview(newContent);
        pushHistory(newContent);
        requestAnimationFrame(() => {
          const pos = start + INDENT.length;
          ta.focus();
          ta.setSelectionRange(pos, pos);
          captureSel();
        });
      } else {
        const newLines = lines.map(l => INDENT + l);
        const newTarget = newLines.join("\n");
        const newContent = before + newTarget + after;
        const delta = newLines.length * INDENT.length;
        setContent(newContent);
        updateLineNums(newContent);
        updatePreview(newContent);
        pushHistory(newContent);
        requestAnimationFrame(() => {
          ta.focus();
          ta.setSelectionRange(start + INDENT.length, end + delta);
          captureSel();
        });
      }
    }
  }

  /* ---------------- Keydown ---------------- */
  function handleKeyDown(e) {
    handleUndoRedoKey(e);
    handleIndentKey(e);
  }

  /* ---------------- Split Drag (修复版) ---------------- */
  function startDrag(e) {
    if (!showPreview) return;
    e.preventDefault();
    const container = splitContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    dragMetaRef.current = { rect };
    setDraggingSplit(true);
    document.body.classList.add("editor-resizing");
    window.addEventListener("mousemove", onDragMove);
    window.addEventListener("mouseup", stopDrag);
    window.addEventListener("touchmove", onDragMove, { passive: false });
    window.addEventListener("touchend", stopDrag);
  }
  function onDragMove(e) {
    if (!draggingSplit || !dragMetaRef.current) return;
    const rect = dragMetaRef.current.rect;
    let clientX, clientY;
    if (e.touches && e.touches[0]) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
      e.preventDefault();
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    if (previewMode === "vertical") {
      const ratio = (clientX - rect.left) / rect.width;
      setSplitRatio(clamp(ratio, 0.15, 0.85));
    } else {
      const ratio = (clientY - rect.top) / rect.height;
      setSplitRatio(clamp(ratio, 0.15, 0.85));
    }
  }
  function stopDrag() {
    setDraggingSplit(false);
    document.body.classList.remove("editor-resizing");
    window.removeEventListener("mousemove", onDragMove);
    window.removeEventListener("mouseup", stopDrag);
    window.removeEventListener("touchmove", onDragMove);
    window.removeEventListener("touchend", stopDrag);
    const key = previewMode === "vertical" ? "editorSplit_vertical" : "editorSplit_horizontal";
    localStorage.setItem(key, String(splitRatio));
  }
  function resetSplit() {
    setSplitRatio(0.5);
    const key = previewMode === "vertical" ? "editorSplit_vertical" : "editorSplit_horizontal";
    localStorage.setItem(key, "0.5");
  }
  useEffect(() => {
    return () => {
      if (draggingSplit) stopDrag();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draggingSplit]);

  /* ---------------- Content Change ---------------- */
  function handleContentChange(v) {
    setContent(v);
    updateLineNums(v);
    updatePreview(v);
    pushHistory(v);
  }

  /* ---------------- Render ---------------- */
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
      ref={rootRef}
      className="h-full flex flex-col overflow-hidden"
      onPaste={handlePaste}
      onDrop={handleDrop}
      onDragOver={e => e.preventDefault()}
    >
      {/* 顶部工具栏 */}
      <div className="flex items-center gap-3 py-3 px-4 border-b border-slate-200 dark:border-slate-700">
        <div className="flex-1 text-lg font-semibold truncate select-none">
          {derivedTitle}
        </div>

        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => restoreHistory(-1)}
            disabled={!canUndo}
            className="btn-outline-modern !px-2.5 !py-1.5 disabled:opacity-40"
            title="撤销 (Ctrl+Z)"
          >
            <Undo2 size={16} />
          </button>
          <button
            type="button"
            onClick={() => restoreHistory(+1)}
            disabled={!canRedo}
            className="btn-outline-modern !px-2.5 !py-1.5 disabled:opacity-40"
            title="恢复 (Ctrl+Y)"
          >
            <Redo2 size={16} />
          </button>

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
                ? <button onClick={doSave} className="text-red-500 hover:underline">重试</button>
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

      {/* 分屏容器 */}
      <div
        ref={splitContainerRef}
        className={`editor-split-root flex-1 min-h-0 flex ${
          showPreview
            ? previewMode === "vertical" ? "flex-row" : "flex-col"
            : "flex-col"
        } overflow-hidden`}
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
          <div className="flex-1 relative overflow-hidden">
            <div className="absolute inset-0 flex overflow-hidden">
              {/* 行号列 */}
              <div className="editor-line-numbers">
                <pre
                  ref={lineNumbersInnerRef}
                  className="editor-line-numbers-inner"
                  aria-hidden="true"
                >
                  {lineNumbers}
                </pre>
              </div>
              {/* 滚动容器 */}
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
                  placeholder="输入文本 (支持粘贴/拖拽图片, Tab/Shift+Tab, Ctrl+Z / Ctrl+Y)"
                  wrap="off"
                  onChange={e => {
                    handleContentChange(e.target.value);
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

        {/* 分隔条（支持鼠标+触摸，双击重置） */}
        {showPreview && (
          <div
            className={`split-divider ${
              previewMode === "vertical" ? "split-vertical" : "split-horizontal"
            } ${draggingSplit ? "dragging" : ""}`}
            onMouseDown={startDrag}
            onPointerDown={startDrag}
            onTouchStart={startDrag}
            onDoubleClick={resetSplit}
            title="拖动调整比例，双击恢复 50%"
          />
        )}

        {/* 预览区（纯文本 + 图片识别） */}
        {showPreview && (
          <div
            className={
              previewMode === "vertical"
                ? "h-full overflow-auto custom-scroll p-4 preview-plain"
                : "w-full overflow-auto custom-scroll p-4 preview-plain"
            }
            style={
              previewMode === "vertical"
                ? { width: `${(1 - splitRatio) * 100}%` }
                : { height: `${(1 - splitRatio) * 100}%` }
            }
          >
            <div
              className="font-mono text-sm leading-[1.5] whitespace-pre-wrap break-words select-text"
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
