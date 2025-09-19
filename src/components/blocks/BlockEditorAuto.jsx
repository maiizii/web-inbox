import React, { useEffect, useState, useRef, useCallback } from "react";
import { Undo2, Redo2 } from "lucide-react";
import { apiUploadImage } from "../../api/cloudflare.js";
import { useDebouncedCallback } from "../../hooks/useDebouncedCallback.js";
import { useToast } from "../../hooks/useToast.jsx";

const MAX_HISTORY = 200;
const HISTORY_GROUP_MS = 800;
const INDENT = "  ";
const MIN_RATIO = 0.15;
const MAX_RATIO = 0.85;

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
  );
  const [splitRatio, setSplitRatio] = useState(() => {
    const key = previewMode === "vertical" ? "editorSplit_vertical" : "editorSplit_horizontal";
    const raw = localStorage.getItem(key);
    const v = raw ? parseFloat(raw) : 0.5;
    return isNaN(v) ? 0.5 : clamp(v, MIN_RATIO, MAX_RATIO);
  });
  const [lineNumbers, setLineNumbers] = useState("1");
  const [previewHtml, setPreviewHtml] = useState("");
  const [syncScrollEnabled, setSyncScrollEnabled] = useState(true);

  /* ---------------- Refs ---------------- */
  const splitContainerRef = useRef(null);
  const textareaRef = useRef(null); // textarea is the editor's unique scroll element
  const previewScrollRef = useRef(null); // preview unique scroll element
  const lineNumbersInnerRef = useRef(null);

  const lastPersisted = useRef({ content: "" });
  const currentBlockIdRef = useRef(block?.id || null);
  const dividerDragRef = useRef(null);

  // history per block
  const historyStoreRef = useRef(new Map());
  const isRestoringHistoryRef = useRef(false);

  // scroll guards
  const programmaticScrollRef = useRef(false);
  const pointerActiveRef = useRef({ editor: false, preview: false });

  // selection/focus
  const selectionRef = useRef({ start: null, end: null });
  const userManuallyBlurredRef = useRef(false);
  const shouldRestoreFocusRef = useRef(false);

  /* ---------------- Derived ---------------- */
  const dirty = !!block && content !== lastPersisted.current.content;
  const derivedTitle = (block?.content || "").split("\n")[0].slice(0, 64) || "(空)";

  /* ---------------- Utils ---------------- */
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function escapeHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderPlainWithImages(raw) {
    if (!raw) return "<span class='text-slate-400'>暂无内容</span>";
    const re = /!\[([^\]]*?)\]\(([^)\s]+)\)/g;
    let out = "";
    let last = 0;
    let m;
    while ((m = re.exec(raw)) !== null) {
      out += escapeHtml(raw.slice(last, m.index));
      out += `<img class="preview-img" src="${escapeHtml(m[2])}" alt="${escapeHtml(m[1])}" loading="lazy" />`;
      last = m.index + m[0].length;
    }
    out += escapeHtml(raw.slice(last));
    return out.replace(/\r\n/g, "\n").replace(/\n/g, "<br/>");
  }

  function updatePreview(txt) { setPreviewHtml(renderPlainWithImages(txt)); }
  function updateLineNums(txt) {
    if (!txt) { setLineNumbers("1"); return; }
    setLineNumbers(txt.split("\n").map((_, i) => i + 1).join("\n"));
  }

  /* ---------------- History (per-block) ---------------- */
  function ensureHistory(blockId, initialContent) {
    if (!blockId) return;
    if (!historyStoreRef.current.has(blockId)) {
      historyStoreRef.current.set(blockId, {
        stack: [initialContent],
        index: 0,
        lastPush: Date.now()
      });
    }
  }

  function pushHistory(newContent, forceSeparate = false) {
    const blockId = currentBlockIdRef.current;
    if (!blockId) return;
    const hist = historyStoreRef.current.get(blockId);
    if (!hist || isRestoringHistoryRef.current) return;
    const now = Date.now();
    const since = now - hist.lastPush;
    const lastSnap = hist.stack[hist.index];

    if (!forceSeparate && since < HISTORY_GROUP_MS) {
      if (lastSnap !== newContent) hist.stack[hist.index] = newContent;
      hist.lastPush = now;
      return;
    }

    if (hist.index < hist.stack.length - 1) hist.stack.splice(hist.index + 1);
    hist.stack.push(newContent);
    if (hist.stack.length > MAX_HISTORY) hist.stack.shift();
    else hist.index++;
    hist.lastPush = now;
  }

  function restoreHistory(delta) {
    const blockId = currentBlockIdRef.current;
    if (!blockId) return;
    const hist = historyStoreRef.current.get(blockId);
    if (!hist) return;
    const nextIndex = hist.index + delta;
    if (nextIndex < 0 || nextIndex >= hist.stack.length) return;
    hist.index = nextIndex;
    const snap = hist.stack[nextIndex];
    isRestoringHistoryRef.current = true;
    setContent(snap);
    updateLineNums(snap);
    updatePreview(snap);
    requestAnimationFrame(() => {
      isRestoringHistoryRef.current = false;
      detectOverflow();
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
    ensureHistory(block?.id, init);
    updateLineNums(init);
    updatePreview(init);
    userManuallyBlurredRef.current = false;
    shouldRestoreFocusRef.current = false;
    requestAnimationFrame(() => {
      syncLineNumbersPadding();
      detectOverflow();
    });
  }, [block?.id]);

  /* ---------------- Effects: preview / mode ---------------- */
  useEffect(() => { updatePreview(content); }, [content]);

  useEffect(() => {
    const key = previewMode === "vertical"
      ? "editorSplit_vertical"
      : "editorSplit_horizontal";
    const raw = localStorage.getItem(key);
    const v = raw ? parseFloat(raw) : splitRatio;
    setSplitRatio(isNaN(v) ? 0.5 : clamp(v, MIN_RATIO, MAX_RATIO));
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
        if (safeUpdateFallback) {
          real = await safeUpdateFallback(block.id, payload, err);
        } else {
          throw err;
        }
      }
      if (currentBlockIdRef.current === savedBlock) lastPersisted.current = { content };
    } catch (err) {
      if (currentBlockIdRef.current === savedBlock) setError(err.message || "保存失败");
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
  useEffect(() => {
    syncLineNumbersPadding();
    const r = () => syncLineNumbersPadding();
    window.addEventListener("resize", r);
    return () => window.removeEventListener("resize", r);
  }, []);

  /* ---------------- Overflow detection (hide scrollbars when no overflow) ---------------- */
  function detectOverflow() {
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (ta) {
        const has = ta.scrollHeight > ta.clientHeight + 1;
        if (has) ta.classList.remove("no-v-scroll"); else ta.classList.add("no-v-scroll");
      }
      const pv = previewScrollRef.current;
      if (pv) {
        const has = pv.scrollHeight > pv.clientHeight + 1;
        if (has) pv.classList.remove("no-v-scroll"); else pv.classList.add("no-v-scroll");
      }
    });
  }

  useEffect(() => { detectOverflow(); }, [content, showPreview, splitRatio, previewMode]);

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
      updateLineNums(nc);
      updatePreview(nc);
      detectOverflow();
      return nc;
    });
    try {
      const img = await apiUploadImage(file);
      if (!block || block.id !== currentId) return;
      setContent(prev => {
        const re = new RegExp(`!\\[${tempId.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\]\\(uploading\\)`, "g");
        const replaced = prev.replace(re, `![image](${img.url})`);
        updateLineNums(replaced);
        updatePreview(replaced);
        persistAfterImage(replaced);
        detectOverflow();
        return replaced;
      });
      toast.push("图片已上传", { type: "success" });
    } catch (err) {
      setContent(prev => {
        const re = new RegExp(`!\\[${tempId.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\]\\(uploading\\)`, "g");
        const replaced = prev.replace(re, "![失败](#)");
        updateLineNums(replaced);
        updatePreview(replaced);
        persistAfterImage(replaced);
        detectOverflow();
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
        if (l.startsWith(INDENT)) { if (i === 0) removeFirst = INDENT.length; return l.slice(INDENT.length); }
        else if (l.startsWith(" ")) { if (i === 0) removeFirst = 1; return l.slice(1); }
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
      detectOverflow();
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
        detectOverflow();
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
        detectOverflow();
        requestAnimationFrame(() => {
          ta.focus();
          ta.setSelectionRange(start + INDENT.length, end + delta);
          captureSel();
        });
      }
    }
  }

  function handleKeyDown(e) {
    handleUndoRedoKey(e);
    handleIndentKey(e);
  }

  /* ---------------- Divider Drag ---------------- */
  function startDividerDrag(e) {
    if (!showPreview) return;
    e.preventDefault();
    const container = splitContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    dividerDragRef.current = { rect };
    document.body.classList.add("editor-resizing");
    setDragging(trueRef => true);
    window.addEventListener("mousemove", onDividerMove);
    window.addEventListener("mouseup", stopDividerDrag);
    window.addEventListener("touchmove", onDividerMove, { passive: false });
    window.addEventListener("touchend", stopDividerDrag);
  }

  function onDividerMove(e) {
    if (!dividerDragRef.current) return;
    let clientX, clientY;
    if (e.touches && e.touches[0]) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
      e.preventDefault();
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    const { rect } = dividerDragRef.current;
    if (previewMode === "vertical") {
      const ratio = (clientX - rect.left) / rect.width;
      setSplitRatio(clamp(ratio, MIN_RATIO, MAX_RATIO));
    } else {
      const ratio = (clientY - rect.top) / rect.height;
      setSplitRatio(clamp(ratio, MIN_RATIO, MAX_RATIO));
    }
  }

  function stopDividerDrag() {
    dividerDragRef.current = null;
    document.body.classList.remove("editor-resizing");
    setDragging(false);
    window.removeEventListener("mousemove", onDividerMove);
    window.removeEventListener("mouseup", stopDividerDrag);
    window.removeEventListener("touchmove", onDividerMove);
    window.removeEventListener("touchend", stopDividerDrag);
    const key = previewMode === "vertical" ? "editorSplit_vertical" : "editorSplit_horizontal";
    localStorage.setItem(key, String(splitRatio));
    detectOverflow();
  }

  function resetSplit() {
    setSplitRatio(0.5);
    const key = previewMode === "vertical" ? "editorSplit_vertical" : "editorSplit_horizontal";
    localStorage.setItem(key, "0.5");
  }

  useEffect(() => { return () => { stopDividerDrag(); }; }, []);

  /* ---------------- Scroll sync (textarea <-> preview) ---------------- */
  // pointer guards
  function onEditorPointerDown() { pointerActiveRef.current.editor = true; scrollSourceSet("editor"); }
  function onEditorPointerUp() { pointerActiveRef.current.editor = false; setTimeout(()=> scrollSourceClearIfIdle(), 120); }
  function onPreviewPointerDown() { pointerActiveRef.current.preview = true; scrollSourceSet("preview"); }
  function onPreviewPointerUp() { pointerActiveRef.current.preview = false; setTimeout(()=> scrollSourceClearIfIdle(), 120); }

  const scrollSourceRef = useRef(null);
  function scrollSourceSet(src) { scrollSourceRef.current = src; }
  function scrollSourceClearIfIdle() {
    if (!pointerActiveRef.current.editor && !pointerActiveRef.current.preview) scrollSourceRef.current = null;
  }

  function syncFromEditor() {
    if (!syncScrollEnabled) return;
    const ta = textareaRef.current;
    const pv = previewScrollRef.current;
    if (!ta || !pv) return;
    if (programmaticScrollRef.current) return;
    if (pointerActiveRef.current.preview) return; // preview user dragging -> don't override
    const ratio = ta.scrollTop / Math.max(1, ta.scrollHeight - ta.clientHeight);
    const target = ratio * (pv.scrollHeight - pv.clientHeight);
    if (Math.abs(pv.scrollTop - target) > 2) {
      programmaticScrollRef.current = true;
      pv.scrollTop = target;
      requestAnimationFrame(() => { programmaticScrollRef.current = false; });
    }
  }

  function syncFromPreview() {
    if (!syncScrollEnabled) return;
    const ta = textareaRef.current;
    const pv = previewScrollRef.current;
    if (!ta || !pv) return;
    if (programmaticScrollRef.current) return;
    if (pointerActiveRef.current.editor) return;
    const ratio = pv.scrollTop / Math.max(1, pv.scrollHeight - pv.clientHeight);
    const target = ratio * (ta.scrollHeight - ta.clientHeight);
    if (Math.abs(ta.scrollTop - target) > 2) {
      programmaticScrollRef.current = true;
      ta.scrollTop = target;
      requestAnimationFrame(() => { programmaticScrollRef.current = false; });
    }
  }

  useEffect(() => {
    const ta = textareaRef.current;
    const pv = previewScrollRef.current;
    if (!ta || !pv) return;

    // initial detection
    detectOverflow();

    function onTaScroll() {
      if (programmaticScrollRef.current) return;
      if (pointerActiveRef.current.preview) return;
      syncFromEditor();
      if (lineNumbersInnerRef.current) lineNumbersInnerRef.current.style.transform = `translateY(${-ta.scrollTop}px)`;
    }
    function onPvScroll() {
      if (programmaticScrollRef.current) return;
      if (pointerActiveRef.current.editor) return;
      syncFromPreview();
    }

    ta.addEventListener("scroll", onTaScroll, { passive: true });
    pv.addEventListener("scroll", onPvScroll, { passive: true });

    ta.addEventListener("pointerdown", onEditorPointerDown);
    ta.addEventListener("pointerup", onEditorPointerUp);
    pv.addEventListener("pointerdown", onPreviewPointerDown);
    pv.addEventListener("pointerup", onPreviewPointerUp);

    return () => {
      ta.removeEventListener("scroll", onTaScroll);
      pv.removeEventListener("scroll", onPvScroll);
      ta.removeEventListener("pointerdown", onEditorPointerDown);
      ta.removeEventListener("pointerup", onEditorPointerUp);
      pv.removeEventListener("pointerdown", onPreviewPointerDown);
      pv.removeEventListener("pointerup", onPreviewPointerUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncScrollEnabled, previewMode, showPreview]);

  /* ---------------- Content change ---------------- */
  function handleContentChange(v) {
    setContent(v);
    updateLineNums(v);
    updatePreview(v);
    pushHistory(v);
    detectOverflow();
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
      ref={splitContainerRef}
      className="h-full flex flex-col overflow-hidden"
      onPaste={handlePaste}
      onDrop={handleDrop}
      onDragOver={e => e.preventDefault()}
    >
      {/* Top bar */}
      <div className="flex items-center gap-3 py-3 px-4 border-b border-slate-200 dark:border-slate-700">
        <div className="flex-1 text-lg font-semibold truncate select-none">{derivedTitle}</div>
        <div className="flex items-center gap-2 text-xs">
          <button type="button" onClick={() => restoreHistory(-1)} disabled={!canUndo} className="btn-outline-modern !px-2.5 !py-1.5 disabled:opacity-40" title="撤销 (Ctrl+Z)"><Undo2 size={16} /></button>
          <button type="button" onClick={() => restoreHistory(+1)} disabled={!canRedo} className="btn-outline-modern !px-2.5 !py-1.5 disabled:opacity-40" title="恢复 (Ctrl+Y)"><Redo2 size={16} /></button>

          <button type="button" onClick={() => setSyncScrollEnabled(s => !s)} className="btn-outline-modern !px-2.5 !py-1.5">
            {syncScrollEnabled ? "同步滚动:开" : "同步滚动:关"}
          </button>

          <button type="button" onClick={() => setShowPreview(p => !p)} className="btn-outline-modern !px-3 !py-1.5">
            {showPreview ? "隐藏预览" : "显示预览"}
          </button>
          <button type="button" onClick={() => setPreviewMode(m => (m === "vertical" ? "horizontal" : "vertical"))} className="btn-outline-modern !px-3 !py-1.5" title="切换预览布局">
            {previewMode === "vertical" ? "上下预览" : "左右预览"}
          </button>

          <div className="text-slate-400 select-none min-w-[64px] text-right">
            {saving ? "保存中" : error ? <button onClick={doSave} className="text-red-500 hover:underline">重试</button> : dirty ? "待保存" : "已保存"}
          </div>

          <button onClick={() => { if (confirm("确定删除该 Block？")) onDelete && onDelete(block.id); }} className="btn-danger-modern !px-3 !py-1.5">删除</button>
        </div>
      </div>

      {/* Main split */}
      <div className={`editor-split-root flex-1 min-h-0 flex ${showPreview ? (previewMode === "vertical" ? "flex-row" : "flex-col") : "flex-col"} overflow-hidden`}>
        {/* Editor Pane */}
        <div className="editor-pane" style={ showPreview ? (previewMode === "vertical" ? { width: `${splitRatio * 100}%` } : { height: `${splitRatio * 100}%` }) : {} }>
          <div className="editor-scroll" style={{ overflow: "hidden" }}>
            <div className="editor-inner">
              <div className="editor-line-numbers">
                <pre ref={lineNumbersInnerRef} className="editor-line-numbers-inner" aria-hidden="true">{lineNumbers}</pre>
              </div>
              <div className="editor-text-wrapper">
                <textarea
                  ref={textareaRef}
                  className="editor-textarea custom-scroll"
                  value={content}
                  disabled={disabledByCreation}
                  placeholder="输入文本 (粘贴/拖拽图片, Tab/Shift+Tab, Ctrl+Z / Ctrl+Y)"
                  wrap="off"
                  onChange={e => { handleContentChange(e.target.value); shouldRestoreFocusRef.current = true; userManuallyBlurredRef.current = false; captureSel(); }}
                  onFocus={onContentFocus}
                  onBlur={onBlur}
                  onClick={captureSel}
                  onKeyUp={captureSel}
                  onKeyDown={handleKeyDown}
                  style={{ overflow: "auto" }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Divider */}
        {showPreview && (
          <div className={`split-divider ${previewMode === "vertical" ? "split-vertical" : "split-horizontal"}`} onMouseDown={startDividerDrag} onTouchStart={startDividerDrag} onDoubleClick={resetSplit} title="拖动调整比例，双击恢复 50%" />
        )}

        {/* Preview Pane */}
        {showPreview && (
          <div className="preview-pane" style={ previewMode === "vertical" ? { width: `${(1 - splitRatio) * 100}%` } : { height: `${(1 - splitRatio) * 100}%` } }>
            <div ref={previewScrollRef} className="preview-scroll custom-scroll">
              <div className="preview-content font-mono text-sm leading-[1.5] whitespace-pre-wrap break-words select-text" dangerouslySetInnerHTML={{ __html: previewHtml }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- helper: a minimal useDebouncedCallback fallback ----------------
   If your project already exposes useDebouncedCallback from ../../hooks/useDebouncedCallback.js,
   the above import will use it; this fallback is only helpful for standalone testing.
*/
function useDebouncedCallback(fn, wait = 800) {
  const tRef = useRef(null);
  useEffect(() => () => { if (tRef.current) clearTimeout(tRef.current); }, []);
  const debounced = useCallback((...args) => {
    if (tRef.current) clearTimeout(tRef.current);
    tRef.current = setTimeout(() => fn(...args), wait);
  }, [fn, wait]);
  const flush = useCallback(() => {
    if (tRef.current) { clearTimeout(tRef.current); fn(); tRef.current = null; }
  }, [fn]);
  return [debounced, flush];
}
