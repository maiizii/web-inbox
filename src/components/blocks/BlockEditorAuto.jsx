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

/**
 * BlockEditorAuto (updated, divider drag fix)
 *
 * - Make textarea the single scrollable element in editor pane.
 * - Listen to textarea.scroll and preview.scroll, not outer container scroll.
 * - Use pointer guards + programmaticScrollRef to avoid "stealing" the thumb during user drag.
 * - detectOverflow checks textarea and preview elements and toggles .no-v-scroll.
 * - Per-block history, undo/redo, image upload placeholders, split dragging, etc.
 * - Divider drag is fully fixed with higher z-index and pointer-events.
 */
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
    return isNaN(v) ? 0.5 : Math.min(MAX_RATIO, Math.max(MIN_RATIO, v));
  });
  const [draggingDivider, setDraggingDivider] = useState(false);
  const [lineNumbers, setLineNumbers] = useState("1");
  const [previewHtml, setPreviewHtml] = useState("");
  const [syncScrollEnabled, setSyncScrollEnabled] = useState(true);

  /* ---------------- Refs ---------------- */
  const splitContainerRef = useRef(null);
  const editorScrollRef = useRef(null); // layout only, not used for scroll
  const previewScrollRef = useRef(null);
  const textareaRef = useRef(null);
  const lineNumbersInnerRef = useRef(null);

  // selection / focus
  const selectionRef = useRef({ start: null, end: null });
  const userManuallyBlurredRef = useRef(false);
  const shouldRestoreFocusRef = useRef(false);

  const lastPersisted = useRef({ content: "" });
  const currentBlockIdRef = useRef(block?.id || null);

  // divider drag
  const dividerDragRef = useRef(null);

  // history per block
  const historyStoreRef = useRef(new Map());
  const isRestoringHistoryRef = useRef(false);

  // scroll sync guards
  const programmaticScrollRef = useRef(false);
  const pointerActiveRef = useRef({ editor: false, preview: false });
  const scrollSourceRef = useRef(null); // "editor" | "preview" | null
  const scrollIdleTimerRef = useRef(null);

  // overflow detection timer
  const overflowCheckTimerRef = useRef(null);

  /* ---------------- Derived ---------------- */
  const dirty = !!block && content !== lastPersisted.current.content;
  const derivedTitle = (block?.content || "").split("\n")[0].slice(0, 64) || "(空)";
  const hist = historyStoreRef.current.get(block?.id) || null;
  const canUndo = hist ? hist.index > 0 : false;
  const canRedo = hist ? hist.index < hist.stack.length - 1 : false;

  /* ---------------- Utils ---------------- */
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function escapeHtml(str) {
    return str
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
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

  /* ---------------- History ---------------- */
  function ensureHistory(blockId, init) {
    if (!blockId) return;
    if (!historyStoreRef.current.has(blockId)) {
      historyStoreRef.current.set(blockId, {
        stack: [init],
        index: 0,
        lastPush: Date.now()
      });
    }
  }
  function pushHistory(newContent, forceSeparate = false) {
    const id = currentBlockIdRef.current;
    if (!id) return;
    const h = historyStoreRef.current.get(id);
    if (!h || isRestoringHistoryRef.current) return;
    const now = Date.now();
    const since = now - h.lastPush;
    const lastSnap = h.stack[h.index];
    if (!forceSeparate && since < HISTORY_GROUP_MS) {
      if (lastSnap !== newContent) h.stack[h.index] = newContent;
      h.lastPush = now;
      return;
    }
    if (h.index < h.stack.length - 1) h.stack.splice(h.index + 1);
    h.stack.push(newContent);
    if (h.stack.length > MAX_HISTORY) h.stack.shift();
    else h.index++;
    h.lastPush = now;
  }
  function restoreHistory(delta) {
    const id = currentBlockIdRef.current;
    if (!id) return;
    const h = historyStoreRef.current.get(id);
    if (!h) return;
    const next = h.index + delta;
    if (next < 0 || next >= h.stack.length) return;
    h.index = next;
    const snap = h.stack[next];
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
    const mod = isMac ? e.metaKey : e.ctrlKey;
    if (!mod) return;
    if (e.key === "z" || e.key === "Z") {
      e.preventDefault();
      if (e.shiftKey) restoreHistory(+1);
      else restoreHistory(-1);
    } else if (e.key === "y" || e.key === "Y") {
      e.preventDefault();
      restoreHistory(+1);
    }
  }

  /* ---------------- Block切换 ---------------- */
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

  /* ---------------- 预览更新 ---------------- */
  useEffect(() => { updatePreview(content); }, [content]);

  /* ---------------- 模式切换加载比例 ---------------- */
  useEffect(() => {
    const key = previewMode === "vertical" ? "editorSplit_vertical" : "editorSplit_horizontal";
    const raw = localStorage.getItem(key);
    const v = raw ? parseFloat(raw) : splitRatio;
    setSplitRatio(clamp(isNaN(v) ? 0.5 : v, MIN_RATIO, MAX_RATIO));
    localStorage.setItem("previewMode", previewMode);
  }, [previewMode]);

  /* ---------------- Selection / Focus ---------------- */
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

  /* ---------------- 保存 ---------------- */
  async function doSave() {
    if (!block || block.optimistic) return;
    if (!dirty) return;
    const saveId = block.id;
    setSaving(true); setError("");
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
      if (currentBlockIdRef.current === saveId) {
        lastPersisted.current = { content };
      }
    } catch (err) {
      if (currentBlockIdRef.current === saveId) {
        setError(err.message || "保存失败");
      }
    } finally {
      if (currentBlockIdRef.current === saveId) {
        setSaving(false);
        requestAnimationFrame(maybeRestoreFocus);
      }
    }
  }
  const [debouncedSave, flushSave] = useDebouncedCallback(doSave, 800);
  useEffect(() => { if (dirty) debouncedSave(); }, [content, debouncedSave, dirty]);
  function onBlur() { userManuallyBlurredRef.current = true; flushSave(); }
  function onContentFocus() { userManuallyBlurredRef.current = false; shouldRestoreFocusRef.current = true; captureSel(); }

  /* ---------------- 行号同步 ---------------- */
  function syncLineNumbersPadding() {
    const ta = textareaRef.current;
    const inner = lineNumbersInnerRef.current;
    if (!ta || !inner) return;
    const padTop = parseFloat(getComputedStyle(ta).paddingTop) || 0;
    inner.style.top = padTop + "px";
  }
  useEffect(() => {
    syncLineNumbersPadding();
    const onResize = () => { syncLineNumbersPadding(); detectOverflow(); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  useEffect(() => { syncLineNumbersPadding(); }, [content]);

  /* ---------------- 溢出检测 ---------------- */
  function detectOverflow() {
    if (overflowCheckTimerRef.current) cancelAnimationFrame(overflowCheckTimerRef.current);
    overflowCheckTimerRef.current = requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (ta) {
        const hasOverflow = ta.scrollHeight > ta.clientHeight + 1;
        if (hasOverflow) ta.classList.remove("no-v-scroll"); else ta.classList.add("no-v-scroll");
      }
      const pv = previewScrollRef.current;
      if (pv) {
        const hasOverflow = pv.scrollHeight > pv.clientHeight + 1;
        if (hasOverflow) pv.classList.remove("no-v-scroll"); else pv.classList.add("no-v-scroll");
      }
    });
  }
  useEffect(() => { detectOverflow(); }, [content, showPreview, previewMode, splitRatio]);

  /* ---------------- 图片粘贴 / 拖拽 ---------------- */
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

  /* ---------------- Tab / Shift+Tab ---------------- */
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
        if (l.startsWith(" ")) { if (i === 0) removeFirst = 1; return l.slice(1); }
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

  /* ---------------- 分隔条拖动 ---------------- */
  function startDividerDrag(e) {
    if (!showPreview) return;
    e.preventDefault();
    const container = splitContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    dividerDragRef.current = { rect };
    setDraggingDivider(true);
    document.body.classList.add("editor-resizing");
    window.addEventListener("mousemove", onDividerMove);
    window.addEventListener("mouseup", stopDividerDrag);
    window.addEventListener("touchmove", onDividerMove, { passive: false });
    window.addEventListener("touchend", stopDividerDrag);
  }
  function onDividerMove(e) {
    console.log('onDividerMove', draggingDivider, dividerDragRef.current); // 调试输出
    if (!draggingDivider || !dividerDragRef.current) return;
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
    ratio = (clientY - rect.top) / rect.height;
    }
    ratio = clamp(ratio, MIN_RATIO, MAX_RATIO);
    console.log('setSplitRatio', ratio); // 调试输出
    setSplitRatio(ratio);
  }
  function stopDividerDrag() {
    if (!draggingDivider) return;
    setDraggingDivider(false);
    document.body.classList.remove("editor-resizing");
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
  useEffect(() => () => { if (draggingDivider) stopDividerDrag(); }, [draggingDivider]);

  /* ---------------- 滚动同步（监听 textarea & preview-scroll） ---------------- */
  function markPointer(source, active) {
    pointerActiveRef.current[source] = active;
    if (!active) {
      if (scrollIdleTimerRef.current) clearTimeout(scrollIdleTimerRef.current);
      scrollIdleTimerRef.current = setTimeout(() => {
        scrollSourceRef.current = null;
      }, 150);
    }
  }
  function onPointerDownContainer(source) {
    scrollSourceRef.current = source;
    markPointer(source, true);
  }
  function onPointerUpContainer(source) {
    markPointer(source, false);
  }

  function syncFromEditor() {
    if (!syncScrollEnabled || !showPreview) return;
    if (programmaticScrollRef.current) return;
    const ta = textareaRef.current;
    const pv = previewScrollRef.current;
    if (!ta || !pv) return;
    if (pointerActiveRef.current.preview) return;
    const ratio = ta.scrollTop / Math.max(1, ta.scrollHeight - ta.clientHeight);
    const target = ratio * (pv.scrollHeight - pv.clientHeight);
    if (Math.abs(pv.scrollTop - target) < 2) return;
    programmaticScrollRef.current = true;
    pv.scrollTop = target;
    requestAnimationFrame(() => { programmaticScrollRef.current = false; });
  }

  function syncFromPreview() {
    if (!syncScrollEnabled || !showPreview) return;
    if (programmaticScrollRef.current) return;
    const ta = textareaRef.current;
    const pv = previewScrollRef.current;
    if (!ta || !pv) return;
    if (pointerActiveRef.current.editor) return;
    const ratio = pv.scrollTop / Math.max(1, pv.scrollHeight - pv.clientHeight);
    const target = ratio * (ta.scrollHeight - ta.clientHeight);
    if (Math.abs(ta.scrollTop - target) < 2) return;
    programmaticScrollRef.current = true;
    ta.scrollTop = target;
    requestAnimationFrame(() => { programmaticScrollRef.current = false; });
  }

  useEffect(() => {
    const ta = textareaRef.current;
    const pv = previewScrollRef.current;
    if (!ta || !pv) return;

    detectOverflow();

    const onTaScroll = () => {
      if (programmaticScrollRef.current) return;
      if (pointerActiveRef.current.preview) return;
      syncFromEditor();
      if (lineNumbersInnerRef.current) {
        lineNumbersInnerRef.current.style.transform = `translateY(${-ta.scrollTop}px)`;
      }
    };
    const onPvScroll = () => {
      if (programmaticScrollRef.current) return;
      if (pointerActiveRef.current.editor) return;
      syncFromPreview();
    };

    ta.addEventListener("scroll", onTaScroll, { passive: true });
    pv.addEventListener("scroll", onPvScroll, { passive: true });

    ta.addEventListener("pointerdown", () => onPointerDownContainer("editor"));
    ta.addEventListener("pointerup", () => onPointerUpContainer("editor"));
    pv.addEventListener("pointerdown", () => onPointerDownContainer("preview"));
    pv.addEventListener("pointerup", () => onPointerUpContainer("preview"));

    return () => {
      ta.removeEventListener("scroll", onTaScroll);
      pv.removeEventListener("scroll", onPvScroll);
      ta.removeEventListener("pointerdown", () => onPointerDownContainer("editor"));
      ta.removeEventListener("pointerup", () => onPointerUpContainer("editor"));
      pv.removeEventListener("pointerdown", () => onPointerDownContainer("preview"));
      pv.removeEventListener("pointerup", () => onPointerUpContainer("preview"));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncScrollEnabled, previewMode, showPreview]);

  /* ---------------- 内容修改 ---------------- */
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
      className="h-full flex flex-col overflow-hidden"
      onPaste={handlePaste}
      onDrop={handleDrop}
      onDragOver={e => e.preventDefault()}
    >
      {/* 工具栏 */}
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
            onClick={() => setSyncScrollEnabled(v => !v)}
            className="btn-outline-modern !px-2.5 !py-1.5"
            title="同步滚动开/关"
          >
            {syncScrollEnabled ? "同步滚动:开" : "同步滚动:关"}
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
        {/* 编辑 Pane */}
        <div
          className="editor-pane"
          style={
            showPreview
              ? (previewMode === "vertical"
                  ? { width: `${splitRatio * 100}%` }
                  : { height: `${splitRatio * 100}%` })
              : {}
          }
        >
          <div
            className="editor-scroll custom-scroll"
            ref={editorScrollRef}
            // NO onScroll here; textarea below is the scrollable element!
          >
            <div className="editor-inner">
              <div className="editor-line-numbers">
                <pre
                  ref={lineNumbersInnerRef}
                  className="editor-line-numbers-inner"
                  aria-hidden="true"
                >
                  {lineNumbers}
                </pre>
              </div>
              <div className="editor-text-wrapper">
                <textarea
                  ref={textareaRef}
                  className="editor-textarea custom-scroll"
                  value={content}
                  disabled={disabledByCreation}
                  placeholder="输入文本 (粘贴/拖拽图片, Tab/Shift+Tab, Ctrl+Z / Ctrl+Y)"
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
                  style={{ overflow: "auto" }} /* textarea is the scrollable element */
                />
              </div>
            </div>
          </div>
        </div>

        {/* 分隔条 */}
        {showPreview && (
          <div
            className={`split-divider ${
              previewMode === "vertical" ? "split-vertical" : "split-horizontal"
            } ${draggingDivider ? "dragging" : ""}`}
            onMouseDown={e => {console.log('divider down'); startDividerDrag(e);}}
            onTouchStart={startDividerDrag}
            onDoubleClick={resetSplit}
            title="拖动调整比例，双击恢复 50%"
            /* Drag fix: High z-index and pointer-events are in CSS */
          />
        )}

        {/* 预览 Pane */}
        {showPreview && (
          <div
            className="preview-pane"
            style={
              previewMode === "vertical"
                ? { width: `${(1 - splitRatio) * 100}%` }
                : { height: `${(1 - splitRatio) * 100}%` }
            }
          >
            <div
              ref={previewScrollRef}
              className="preview-scroll custom-scroll"
            >
              <div
                className="preview-content font-mono text-sm leading-[1.5] whitespace-pre-wrap break-words select-text"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
