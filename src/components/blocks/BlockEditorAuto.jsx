// src/components/blocks/BlockEditorAuto.jsx
// src/components/blocks/BlockEditorAuto.jsx
import React, { useEffect, useState, useRef, useCallback } from "react";
import { Undo2, Redo2, ArrowLeft, Eye, EyeOff } from "lucide-react";
import { apiUploadImage } from "../../api/cloudflare.js";
import { useDebouncedCallback } from "../../hooks/useDebouncedCallback.js";
import { useToast } from "../../hooks/useToast.jsx";

const MAX_HISTORY = 200;
const HISTORY_GROUP_MS = 800;
const INDENT = "  ";
const MIN_RATIO = 0.15;
const MAX_RATIO = 0.85;
const MOBILE_LINE_SLACK = 3;

// 高亮样式（行内，避免依赖外部 CSS）
const MARK_STYLE =
  "background: rgba(245, 158, 11, .35); box-shadow: inset 0 0 0 1px rgba(245,158,11,.5); border-radius: 2px;";

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// 在“原始文本”中打上标记，再整体转义，最后把标记替换成 <mark>，避免破坏实体 &amp; / 标签
function makeHighlightsFromRaw(raw, kw) {
  if (!kw) return escapeHtml(raw);
  const OPEN = "\u0001";
  const CLOSE = "\u0002";
  const re = new RegExp(escapeRegExp(kw), "gi");
  const withMarks = raw.replace(re, (m) => OPEN + m + CLOSE);
  const escaped = escapeHtml(withMarks);
  return escaped
    .replaceAll(OPEN, `<mark class="search-mark" style="${MARK_STYLE}">`)
    .replaceAll(CLOSE, "</mark>");
}

export default function BlockEditorAuto({
  block,
  onChange,
  onDelete,
  onImmediateSave,
  safeUpdateFallback,
  onBackToList,
  // 新增：搜索词（来自 InboxPage 的 q）
  searchQuery = ""
}) {
  const toast = useToast();

  // 响应式
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(max-width: 768px)").matches
      : false
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 768px)");
    const handler = () => setIsMobile(mq.matches);
    handler();
    mq.addEventListener?.("change", handler);
    return () => mq.removeEventListener?.("change", handler);
  }, []);
  const [mobileView, setMobileView] = useState("edit"); // edit | preview
  useEffect(() => {
    if (!isMobile) setMobileView("edit");
  }, [isMobile]);

  // 编辑状态
  const [content, setContent] = useState(block?.content || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showPreview, setShowPreview] = useState(true);
  const [previewMode, setPreviewMode] = useState(
    () => localStorage.getItem("previewMode") || "vertical"
  );
  const [splitRatio, setSplitRatio] = useState(() => {
    const key =
      previewMode === "vertical"
        ? "editorSplit_vertical"
        : "editorSplit_horizontal";
    const raw = localStorage.getItem(key);
    const v = raw ? parseFloat(raw) : 0.5;
    return isNaN(v) ? 0.5 : Math.min(MAX_RATIO, Math.max(MIN_RATIO, v));
  });
  const [draggingDivider, setDraggingDivider] = useState(false);
  const [lineNumbers, setLineNumbers] = useState("1");
  const [previewHtml, setPreviewHtml] = useState("");
  const [syncScrollEnabled, setSyncScrollEnabled] = useState(true);

  // 按需滚动
  const [editorCanScroll, setEditorCanScroll] = useState(false);
  const [previewCanScroll, setPreviewCanScroll] = useState(false);

  // 引用
  const splitContainerRef = useRef(null);
  const editorScrollRef = useRef(null);
  const previewScrollRef = useRef(null);
  const textareaRef = useRef(null);
  const lineNumbersInnerRef = useRef(null);

  // 编辑框高亮覆盖层
  const highlightsInnerRef = useRef(null);
  const [editorHighlightsHtml, setEditorHighlightsHtml] = useState("");

  // 镜像测量元素（移动端行号计算）
  const mirrorRef = useRef(null);

  // 关键：记录“已保存的内容”，用于 dirty 判定；以及“是否发生真实编辑”
  const lastPersisted = useRef({ content: "" });
  const hasUserEditedRef = useRef(false);

  const currentBlockIdRef = useRef(block?.id || null);

  const dividerDragRef = useRef(null);
  const draggingDividerRef = useRef(false);

  const historyStoreRef = useRef(new Map());
  const isRestoringHistoryRef = useRef(false);
  const isSyncingScrollRef = useRef(false);
  const overflowCheckTimerRef = useRef(null);

  const dirty = !!block && content !== lastPersisted.current.content;
  const derivedTitle =
    (block?.content || "").split("\n")[0].slice(0, 64) || "(空)";
  const hist = historyStoreRef.current.get(block?.id) || null;
  const canUndo = hist ? hist.index > 0 : false;
  const canRedo = hist ? hist.index < hist.stack.length - 1 : false;

  // 工具
  function clamp(v, a, b) {
    return Math.min(b, Math.max(a, v));
  }
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // 预览：纯文本 + 图片（仅对非图片片段做高亮）
  function renderPlainWithImages(raw, kw) {
    if (!raw)
      return "<span class='text-slate-400 dark:text-slate-500'>暂无内容</span>";
    const re = /!\[([^\]]*?)\]\(([^)\s]+)\)/g;
    let out = "",
      last = 0,
      m;
    while ((m = re.exec(raw)) !== null) {
      const seg = raw.slice(last, m.index);
      out += makeHighlightsFromRaw(seg, kw);
      out += `<img class="preview-img" src="${escapeHtml(m[2])}" alt="${escapeHtml(
        m[1]
      )}" loading="lazy" />`;
      last = m.index + m[0].length;
    }
    out += makeHighlightsFromRaw(raw.slice(last), kw);
    return out.replace(/\r\n/g, "\n").replace(/\n/g, "<br/>");
  }
  function updatePreview(txt, kw) {
    setPreviewHtml(renderPlainWithImages(txt, kw));
  }

  // 历史（撤销/重做）
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
    const now = Date.now(),
      since = now - h.lastPush;
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
    updateLineNumsWrapped(snap);
    updatePreview(snap, searchQuery);
    hasUserEditedRef.current = true; // 撤销/重做属于“编辑”
    requestAnimationFrame(() => {
      isRestoringHistoryRef.current = false;
      detectOverflow();
      syncHighlightsMetrics();
    });
  }
  function handleUndoRedoKey(e) {
    const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform);
    const mod = isMac ? e.metaKey : e.ctrlKey;
    if (!mod) return;
    if (e.key === "z" || e.key === "Z") {
      e.preventDefault();
      restoreHistory(e.shiftKey ? 1 : -1);
    } else if (e.key === "y" || e.key === "Y") {
      e.preventDefault();
      restoreHistory(1);
    }
  }

  // 镜像测量 —— 移动端行号/换行
  function ensureMirrorReady() {
    if (mirrorRef.current || !textareaRef.current) return;
    const div = document.createElement("div");
    mirrorRef.current = div;
    div.style.position = "absolute";
    div.style.visibility = "hidden";
    div.style.pointerEvents = "none";
    div.style.whiteSpace = "pre-wrap";
    div.style.wordBreak = "break-word";
    div.style.left = "-9999px";
    div.style.top = "-9999px";
    document.body.appendChild(div);
  }
  function syncMirrorMetrics() {
    const ta = textareaRef.current,
      m = mirrorRef.current;
    if (!ta || !m) return;
    const cs = getComputedStyle(ta);
    const padL = parseFloat(cs.paddingLeft) || 0;
    const padR = parseFloat(cs.paddingRight) || 0;
    m.style.width = Math.max(0, ta.clientWidth - padL - padR) + "px";
    m.style.font = cs.font;
    m.style.fontFamily = cs.fontFamily;
    m.style.fontSize = cs.fontSize;
    m.style.lineHeight = cs.lineHeight;
    m.style.letterSpacing = cs.letterSpacing;
    m.style.tabSize = cs.tabSize || "2";
    m.style.padding = "0px";
  }
  function computeRowsForLine(line) {
    const m = mirrorRef.current;
    if (!m) return 1;
    m.textContent = line.length ? line : "·";
    const lh = parseFloat(getComputedStyle(m).lineHeight) || 20;
    const rows = Math.max(1, Math.ceil((m.scrollHeight + 0.5) / lh));
    return rows;
  }
  function updateLineNumsWrapped(txt) {
    const ta = textareaRef.current;
    if (!ta) {
      setLineNumbers("1");
      return;
    }
    const isSoftWrap = isMobile || ta.getAttribute("wrap") === "soft";
    if (!txt) {
      setLineNumbers("1");
      return;
    }
    if (!isSoftWrap) {
      setLineNumbers(
        txt
          .split("\n")
          .map((_, i) => i + 1)
          .join("\n")
      );
      return;
    }
    ensureMirrorReady();
    syncMirrorMetrics();
    const lines = txt.split("\n");
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      const rows = computeRowsForLine(lines[i]);
      out.push(String(i + 1));
      for (let k = 1; k < rows; k++) out.push("");
    }
    for (let s = 0; s < MOBILE_LINE_SLACK; s++) out.push("");
    setLineNumbers(out.join("\n") || "1");
  }

  // 初始与同步（切块时先重置快照，避免判脏；同步高亮）
  useEffect(() => {
    currentBlockIdRef.current = block?.id || null;
    const init = block?.content || "";
    lastPersisted.current = { content: init };
    hasUserEditedRef.current = false;
    setContent(init);
    ensureHistory(block?.id, init);
    updateLineNumsWrapped(init);
    updatePreview(init, searchQuery);
    setSaving(false);
    setError("");
    // 初始化编辑高亮
    setEditorHighlightsHtml(makeHighlightsFromRaw(init, (searchQuery || "").trim()));
    requestAnimationFrame(() => {
      syncLineNumbersPadding();
      detectOverflow();
      syncHighlightsMetrics();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block?.id]);

  // 内容或搜索词变化 → 同步预览 & 编辑高亮
  useEffect(() => {
    updatePreview(content, searchQuery);
    setEditorHighlightsHtml(
      makeHighlightsFromRaw(content, (searchQuery || "").trim())
    );
    requestAnimationFrame(() => {
      detectOverflow();
      syncHighlightsMetrics();
    });
  }, [content, searchQuery]);

  useEffect(() => {
    const key =
      previewMode === "vertical"
        ? "editorSplit_vertical"
        : "editorSplit_horizontal";
    const raw = localStorage.getItem(key);
    const v = raw ? parseFloat(raw) : splitRatio;
    setSplitRatio(clamp(isNaN(v) ? 0.5 : v, MIN_RATIO, MAX_RATIO));
    localStorage.setItem("previewMode", previewMode);
  }, [previewMode]);

  // 自动保存（仅当发生真实编辑时）
  async function doSave() {
    if (!block || block.optimistic) return;
    if (!hasUserEditedRef.current) return;
    if (!dirty) return;

    const saveId = block.id;
    setSaving(true);
    setError("");
    const payload = { content };
    try {
      onChange && onChange(block.id, { content });
      let real;
      try {
        real = await onImmediateSave(block.id, payload);
      } catch (err) {
        if (safeUpdateFallback)
          real = await safeUpdateFallback(block.id, payload, err);
        else throw err;
      }
      if (currentBlockIdRef.current === saveId) {
        lastPersisted.current = { content };
      }
    } catch (err) {
      if (currentBlockIdRef.current === saveId)
        setError(err.message || "保存失败");
    } finally {
      if (currentBlockIdRef.current === saveId) setSaving(false);
    }
  }
  const [debouncedSave, flushSave] = useDebouncedCallback(doSave, 800);
  useEffect(() => {
    if (dirty) debouncedSave();
  }, [content, debouncedSave, dirty]);
  function onBlur() {
    flushSave();
  }

  // 行号/滚动/溢出/高亮层度量同步
  function syncLineNumbersPadding() {
    const ta = textareaRef.current;
    const inner = lineNumbersInnerRef.current;
    if (ta && inner) {
      inner.style.top = (parseFloat(getComputedStyle(ta).paddingTop) || 0) + "px";
    }
  }

  function syncHighlightsMetrics() {
    const ta = textareaRef.current;
    const hi = highlightsInnerRef.current;
    if (!ta || !hi) return;
    const cs = getComputedStyle(ta);
    // 让覆盖层与 textarea 一致的内边距/字体/制表宽度等
    hi.style.paddingTop = cs.paddingTop;
    hi.style.paddingRight = cs.paddingRight;
    hi.style.paddingBottom = cs.paddingBottom;
    hi.style.paddingLeft = cs.paddingLeft;
    hi.style.font = cs.font;
    hi.style.lineHeight = cs.lineHeight;
    hi.style.letterSpacing = cs.letterSpacing;
    hi.style.tabSize = cs.tabSize || "2";
    // wrap: desktop 不换行，mobile 换行
    hi.style.whiteSpace = isMobile ? "pre-wrap" : "pre";
    hi.style.wordBreak = isMobile ? "break-word" : "normal";
  }

  useEffect(() => {
    syncLineNumbersPadding();
    syncHighlightsMetrics();
    const onResize = () => {
      syncLineNumbersPadding();
      updateLineNumsWrapped(content);
      detectOverflow();
      syncHighlightsMetrics();
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [content, isMobile]);

  useEffect(() => {
    const ta = textareaRef.current;
    const ln = lineNumbersInnerRef.current;
    const hi = highlightsInnerRef.current;
    if (!ta) return;
    function handleScroll() {
      if (ln) ln.style.transform = `translateY(${-ta.scrollTop}px)`;
      if (hi) hi.style.transform = `translate(${-ta.scrollLeft}px, ${-ta.scrollTop}px)`;
    }
    ta.addEventListener("scroll", handleScroll);
    handleScroll();
    return () => ta.removeEventListener("scroll", handleScroll);
  }, [block?.id, content]);

  function detectOverflow() {
    if (overflowCheckTimerRef.current)
      cancelAnimationFrame(overflowCheckTimerRef.current);
    overflowCheckTimerRef.current = requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (ta) {
        const can = ta.scrollHeight > ta.clientHeight + 1 || ta.scrollWidth > ta.clientWidth + 1;
        setEditorCanScroll(can);
        ta.classList.toggle("no-v-scroll", !(ta.scrollHeight > ta.clientHeight + 1));
      }
      const pv = previewScrollRef.current;
      if (pv) {
        const can = pv.scrollHeight > pv.clientHeight + 1;
        setPreviewCanScroll(can);
        pv.classList.toggle("no-v-scroll", !can);
      }
    });
  }
  useEffect(() => {
    detectOverflow();
  }, [content, showPreview, previewMode, splitRatio, isMobile, mobileView, searchQuery]);

  // 图片上传（属于编辑）
  async function persistAfterImage(newContent) {
    if (!block || block.optimistic) return;
    try {
      onChange && onChange(block.id, { content: newContent });
      const payload = { content: newContent };
      let real;
      try {
        real = await onImmediateSave(block.id, payload);
      } catch (e) {
        if (safeUpdateFallback)
          real = await safeUpdateFallback(block.id, payload, e);
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
    hasUserEditedRef.current = true; // 上传图片算编辑
    const currentId = block.id;
    const tempId =
      "uploading-" +
      Date.now() +
      "-" +
      Math.random().toString(16).slice(2);
    const placeholder = `![${tempId}](uploading)`;
    setContent((prev) => {
      const nl = prev && !prev.endsWith("\n") ? "\n" : "";
      const nc = prev + nl + placeholder + "\n";
      pushHistory(nc, true);
      updateLineNumsWrapped(nc);
      updatePreview(nc, searchQuery);
      detectOverflow();
      return nc;
    });
    try {
      const img = await apiUploadImage(file);
      if (!block || block.id !== currentId) return;
      setContent((prev) => {
        const re = new RegExp(
          `!\\[${tempId.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\]\\(uploading\\)`,
          "g"
        );
        const replaced = prev.replace(re, `![image](${img.url})`);
        updateLineNumsWrapped(replaced);
        updatePreview(replaced, searchQuery);
        persistAfterImage(replaced);
        detectOverflow();
        return replaced;
      });
      toast.push("图片已上传", { type: "success" });
    } catch (err) {
      setContent((prev) => {
        const re = new RegExp(
          `!\\[${tempId.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\]\\(uploading\\)`,
          "g"
        );
        const replaced = prev.replace(re, "![失败](#)");
        updateLineNumsWrapped(replaced);
        updatePreview(replaced, searchQuery);
        persistAfterImage(replaced);
        detectOverflow();
        return replaced;
      });
      toast.push(err.message || "图片上传失败", { type: "error" });
    }
  }
  const handlePaste = useCallback(
    async (e) => {
      if (!block) return;
      const items = Array.from(e.clipboardData.items).filter((it) =>
        it.type.startsWith("image/")
      );
      if (!items.length) return;
      e.preventDefault();
      for (const it of items) {
        const f = it.getAsFile();
        if (f) await uploadOne(f);
      }
    },
    [block]
  );
  const handleDrop = useCallback(
    async (e) => {
      if (!block) return;
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files).filter((f) =>
        f.type.startsWith("image/")
      );
      if (!files.length) return;
      for (const f of files) await uploadOne(f);
    },
    [block]
  );

  // Tab 缩进（视为编辑）
  function handleIndentKey(e) {
    if (e.key !== "Tab") return;
    const ta = textareaRef.current;
    if (!ta) return;
    e.preventDefault();
    const start = ta.selectionStart,
      end = ta.selectionEnd,
      text = content;
    const lineStartIdx = text.lastIndexOf("\n", start - 1) + 1;
    const lineEndIdx = text.indexOf("\n", end);
    const effectiveEnd = lineEndIdx === -1 ? text.length : lineEndIdx;
    const before = text.slice(0, lineStartIdx);
    const target = text.slice(lineStartIdx, effectiveEnd);
    const after = text.slice(effectiveEnd);
    const lines = target.split("\n");
    hasUserEditedRef.current = true;
    if (e.shiftKey) {
      let removeFirst = 0;
      const newLines = lines.map((l, i) => {
        if (l.startsWith(INDENT)) {
          if (i === 0) removeFirst = INDENT.length;
          return l.slice(INDENT.length);
        }
        if (l.startsWith(" ")) {
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
      updateLineNumsWrapped(newContent);
      updatePreview(newContent, searchQuery);
      pushHistory(newContent);
      detectOverflow();
      requestAnimationFrame(() => {
        const ta2 = textareaRef.current;
        if (!ta2) return;
        ta2.focus();
        ta2.setSelectionRange(newSelStart, newSelEnd);
      });
    } else {
      const newLines =
        lines.length === 1 ? [INDENT + lines[0]] : lines.map((l) => INDENT + l);
      const newTarget = newLines.join("\n");
      const newContent = before + newTarget + after;
      const delta = newLines.length * INDENT.length;
      setContent(newContent);
      updateLineNumsWrapped(newContent);
      updatePreview(newContent, searchQuery);
      pushHistory(newContent);
      detectOverflow();
      requestAnimationFrame(() => {
        const ta2 = textareaRef.current;
        if (!ta2) return;
        ta2.focus();
        ta2.setSelectionRange(
          start + INDENT.length,
          end + (lines.length === 1 ? INDENT.length : delta)
        );
      });
    }
  }
  function handleKeyDown(e) {
    handleUndoRedoKey(e);
    handleIndentKey(e);
  }

  // 分割条/同步滚动（桌面）
  function startDividerDrag(e) {
    if (!showPreview || isMobile) return;
    e.preventDefault();
    const container = splitContainerRef.current;
    if (!container) return;
    dividerDragRef.current = { rect: container.getBoundingClientRect() };
    draggingDividerRef.current = true;
    setDraggingDivider(true);
    document.body.classList.add("editor-resizing");
    window.addEventListener("mousemove", onDividerMove);
    window.addEventListener("mouseup", stopDividerDrag);
    window.addEventListener("touchmove", onDividerMove, { passive: false });
    window.addEventListener("touchend", stopDividerDrag);
  }
  function onDividerMove(e) {
    if (!draggingDividerRef.current || !dividerDragRef.current) return;
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
    let ratio =
      previewMode === "vertical"
        ? (clientX - rect.left) / rect.width
        : (clientY - rect.top) / rect.height;
    setSplitRatio(clamp(ratio, MIN_RATIO, MAX_RATIO));
  }
  function stopDividerDrag() {
    if (!draggingDividerRef.current) return;
    draggingDividerRef.current = false;
    setDraggingDivider(false);
    document.body.classList.remove("editor-resizing");
    window.removeEventListener("mousemove", onDividerMove);
    window.removeEventListener("mouseup", stopDividerDrag);
    window.removeEventListener("touchmove", onDividerMove);
    window.removeEventListener("touchend", stopDividerDrag);
    const key =
      previewMode === "vertical"
        ? "editorSplit_vertical"
        : "editorSplit_horizontal";
    localStorage.setItem(key, String(splitRatio));
    detectOverflow();
  }
  function resetSplit() {
    setSplitRatio(0.5);
    const key =
      previewMode === "vertical"
        ? "editorSplit_vertical"
        : "editorSplit_horizontal";
    localStorage.setItem(key, "0.5");
  }
  useEffect(() => () => {
    if (draggingDivider) stopDividerDrag();
  }, [draggingDivider]);

  useEffect(() => {
    if (!showPreview || isMobile) return;
    const ta = textareaRef.current,
      pv = previewScrollRef.current;
    if (!ta || !pv) return;
    function syncPreviewScroll() {
      if (!syncScrollEnabled || isSyncingScrollRef.current) return;
      isSyncingScrollRef.current = true;
      pv.scrollTop =
        (ta.scrollTop / Math.max(1, ta.scrollHeight - ta.clientHeight)) *
        (pv.scrollHeight - pv.clientHeight);
      setTimeout(() => {
        isSyncingScrollRef.current = false;
      }, 0);
    }
    function syncEditorScroll() {
      if (!syncScrollEnabled || isSyncingScrollRef.current) return;
      isSyncingScrollRef.current = true;
      ta.scrollTop =
        (pv.scrollTop / Math.max(1, pv.scrollHeight - pv.clientHeight)) *
        (ta.scrollHeight - ta.clientHeight);
      setTimeout(() => {
        isSyncingScrollRef.current = false;
      }, 0);
    }
    ta.addEventListener("scroll", syncPreviewScroll);
    pv.addEventListener("scroll", syncEditorScroll);
    return () => {
      ta.removeEventListener("scroll", syncPreviewScroll);
      pv.removeEventListener("scroll", syncEditorScroll);
    };
  }, [showPreview, syncScrollEnabled, previewMode, content, isMobile]);

  // 内容变化（用户输入才触发：标记 hasUserEdited）
  function handleContentChange(v) {
    hasUserEditedRef.current = true;
    setContent(v);
    updateLineNumsWrapped(v);
    updatePreview(v, searchQuery);
    pushHistory(v);
    detectOverflow();
  }

  // 顶部工具条
  const TopBar = (
    <div
      className="flex items-center justify-between gap-2 flex-wrap py-3 px-4 border-b"
      style={{
        backgroundColor: "var(--color-surface)",
        borderColor: "var(--color-border)"
      }}
    >
      <div className="flex items-center gap-2 min-w-0">
        {isMobile ? (
          onBackToList && (
            <button
              type="button"
              onClick={onBackToList}
              className="btn-outline-modern !p-2"
              title="返回列表"
            >
              <ArrowLeft size={16} />
            </button>
          )
        ) : (
          <div
            className="text-lg font-semibold truncate select-none"
            style={{ color: "var(--color-text)" }}
          >
            {derivedTitle}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        {isMobile ? (
          <>
            <button
              type="button"
              onClick={() => restoreHistory(-1)}
              disabled={!canUndo}
              className="btn-outline-modern !p-2 disabled:opacity-40"
              title="撤销"
            >
              <Undo2 size={16} />
            </button>
            <button
              type="button"
              onClick={() => restoreHistory(+1)}
              disabled={!canRedo}
              className="btn-outline-modern !p-2 disabled:opacity-40"
              title="重做"
            >
              <Redo2 size={16} />
            </button>
            {mobileView === "edit" ? (
              <button
                type="button"
                onClick={() => setMobileView("preview")}
                className="btn-outline-modern !p-2"
                title="预览"
              >
                <Eye size={16} />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setMobileView("edit")}
                className="btn-outline-modern !p-2"
                title="返回编辑"
              >
                <EyeOff size={16} />
              </button>
            )}
          </>
        ) : (
          <>
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
              title="重做 (Ctrl+Y)"
            >
              <Redo2 size={16} />
            </button>
            {showPreview && (
              <>
                <button
                  type="button"
                  onClick={() => setSyncScrollEnabled((v) => !v)}
                  className="btn-outline-modern !px-2.5 !py-1.5"
                  title="同步滚动开/关"
                >
                  {syncScrollEnabled ? "同步滚动:开" : "同步滚动:关"}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setPreviewMode((m) =>
                      m === "vertical" ? "horizontal" : "vertical"
                    )
                  }
                  className="btn-outline-modern !px-3 !py-1.5"
                  title="切换预览布局"
                >
                  {previewMode === "vertical" ? "上下预览" : "左右预览"}
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => setShowPreview((p) => !p)}
              className="btn-outline-modern !px-3 !py-1.5"
            >
              {showPreview ? "隐藏预览" : "显示预览"}
            </button>
          </>
        )}

        <div className="text-slate-400 dark:text-slate-300 select-none min-w-[64px] text-right">
          {saving ? (
            "保存中"
          ) : error ? (
            <button onClick={doSave} className="text-red-500 hover:underline">
              重试
            </button>
          ) : dirty ? (
            "待保存"
          ) : (
            "已保存"
          )}
        </div>

        <button
          onClick={() => {
            if (confirm("确定删除该 Block？"))
              onDelete && onDelete(block.id);
          }}
          className="btn-danger-modern !px-3 !py-1.5"
        >
          删除
        </button>
      </div>
    </div>
  );

  if (!block) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-slate-400 dark:text-slate-500">
        请选择左侧 Block 或点击“新建”
      </div>
    );
  }

  const disabledByCreation = !!(
    block.optimistic && String(block.id).startsWith("tmp-")
  );

  // 移动端：单屏编辑/预览（移动端不渲染行号，但渲染高亮覆盖层）
  if (isMobile) {
    return (
      <div
        className="h-full flex flex-col overflow-hidden"
        onPaste={handlePaste}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
      >
        {TopBar}
        {mobileView === "edit" ? (
          <div
            className="editor-pane rounded-md"
            // 关键修复：让编辑面板参与伸缩并拿到剩余高度
            style={{ flex: "1 1 0", minHeight: 0, display: "flex", flexDirection: "column" }}
          >
            <div
              className="editor-scroll custom-scroll"
              ref={editorScrollRef}
              // 关键修复：使内部链路为 flex，高度可传递到 textarea
              style={{ flex: "1 1 0", minHeight: 0, overflow: "hidden", display: "flex", height: "100%" }}
            >
              <div
                className="editor-inner"
                // 关键修复：内层吃满，便于子元素 100% 高度
                style={{ display: "flex", flexDirection: "column", flex: "1 1 0", minHeight: 0, height: "100%" }}
              >
                <div
                  className="editor-text-wrapper"
                  // 关键修复：包裹层也要成为 flex 容器并吃满
                  style={{ position: "relative", display: "flex", flex: "1 1 0", minHeight: 0, height: "100%" }}
                >
                  {/* 高亮覆盖层：仅在有搜索词时渲染；文字透明，只显示背景 */}
                  {(searchQuery || "").trim() ? (
                    <pre
                      ref={highlightsInnerRef}
                      className="editor-highlights-inner"
                      aria-hidden="true"
                      style={{
                        position: "absolute",
                        inset: 0,
                        pointerEvents: "none",
                        margin: 0,
                        color: "transparent",
                        zIndex: 2
                      }}
                      dangerouslySetInnerHTML={{
                        __html: editorHighlightsHtml
                      }}
                    />
                  ) : null}
                  <textarea
                    ref={textareaRef}
                    className="editor-textarea custom-scroll"
                    value={content}
                    disabled={disabledByCreation}
                    placeholder="输入文本 (可粘贴图片)"
                    wrap="soft"
                    onChange={(e) => {
                      handleContentChange(e.target.value);
                    }}
                    onBlur={onBlur}
                    onKeyDown={handleKeyDown}
                    // 关键修复：textarea 必须 100% 高，内部滚动才能到底
                    style={{
                      flex: "1 1 0",
                      minHeight: 0,
                      height: "100%",
                      overflowX: "hidden",
                      overflowY: editorCanScroll ? "auto" : "hidden",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      background: "var(--color-surface)",
                      color: "var(--color-text)",
                      paddingBottom:
                        "calc(env(safe-area-inset-bottom,0px) + 28px)",
                      position: "relative",
                      zIndex: 1,
                      caretColor: "var(--color-text)"
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="preview-pane rounded-md" style={{ flexBasis: "100%" }}>
            <div
              ref={previewScrollRef}
              className="preview-scroll custom-scroll"
              style={{
                flex: "1 1 0",
                minHeight: 0,
                maxHeight: "100%",
                overflowX: "hidden",
                overflowY: previewCanScroll ? "auto" : "hidden",
                background: "var(--color-surface)"
              }}
            >
              <div
                className="preview-content font-mono text-sm leading-[1.5] whitespace-pre-wrap break-words select-text"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  // 桌面端：分屏（两个面板都固定在容器内滚动）
  return (
    <div
      className="h-full flex flex-col overflow-hidden"
      onPaste={handlePaste}
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}}
    >
      {TopBar}
      <div
        ref={splitContainerRef}
        className={`editor-split-root flex-1 min-h-0 flex ${
          showPreview
            ? previewMode === "vertical"
              ? "flex-row"
              : "flex-col"
            : "flex-col"
        } overflow-hidden`}
        style={{ height: "100%" }}
      >
        {/* 编辑面板 */}
        <div
          className="editor-pane rounded-md"
          style={
            showPreview
              ? { flexBasis: `${splitRatio * 100}%` }
              : { flexBasis: "100%" }
          }
        >
          <div
            className="editor-scroll custom-scroll"
            ref={editorScrollRef}
            style={{ flex: "1 1 0", minHeight: 0, overflow: "hidden" }}
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
              <div
                className="editor-text-wrapper"
                style={{ position: "relative" }}
              >
                {/* 高亮覆盖层（仅有搜索词时渲染）；与横/纵向滚动同步 */}
                {(searchQuery || "").trim() ? (
                  <pre
                    ref={highlightsInnerRef}
                    className="editor-highlights-inner"
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      inset: 0,
                      pointerEvents: "none",
                      margin: 0,
                      color: "transparent",
                      zIndex: 2
                    }}
                    dangerouslySetInnerHTML={{
                      __html: editorHighlightsHtml
                    }}
                  />
                ) : null}
                <textarea
                  ref={textareaRef}
                  className="editor-textarea custom-scroll"
                  value={content}
                  disabled={disabledByCreation}
                  placeholder="输入文本 (粘贴/拖拽图片, Tab/Shift+Tab, Ctrl+Z / Ctrl+Y)"
                  wrap="off"
                  onChange={(e) => {
                    handleContentChange(e.target.value);
                  }}
                  onBlur={onBlur}
                  onKeyDown={handleKeyDown}
                  style={{
                    flex: "1 1 0",
                    minHeight: 0,
                    overflowX: "auto",
                    overflowY: editorCanScroll ? "auto" : "hidden",
                    background: "var(--color-surface)",
                    color: "var(--color-text)",
                    position: "relative",
                    zIndex: 1,
                    caretColor: "var(--color-text)"
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* 预览分隔条 + 预览面板 */}
        {showPreview && (
          <>
            <div
              className={`split-divider ${
                previewMode === "vertical" ? "split-vertical" : "split-horizontal"
              } ${draggingDivider ? "dragging" : ""}`}
              onMouseDown={startDividerDrag}
              onTouchStart={startDividerDrag}
              onDoubleClick={resetSplit}
              title="拖动调整比例，双击恢复 50%"
            />
            <div
              className="preview-pane rounded-md"
              style={{ flexBasis: `${(1 - splitRatio) * 100}%` }}
            >
              <div
                ref={previewScrollRef}
                className="preview-scroll custom-scroll"
                style={{
                  flex: "1 1 0",
                  minHeight: 0,
                  maxHeight: "100%",
                  overflowX: "hidden",
                  overflowY: previewCanScroll ? "auto" : "hidden",
                  background: "var(--color-surface)"
                }}
              >
                <div
                  className="preview-content font-mono text-sm leading-[1.5] whitespace-pre-wrap break-words select-text"
                  style={{ maxWidth: "100%" }}
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// —— 工具函数（放在组件文件底部也可）
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
