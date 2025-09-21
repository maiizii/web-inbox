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

  // === 移动端检测 ===
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

  // 移动端：编辑/预览 单屏切换
  const [mobileView, setMobileView] = useState("edit"); // 'edit' | 'preview'
  useEffect(() => { if (!isMobile) setMobileView("edit"); }, [isMobile]);

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

  const splitContainerRef = useRef(null);
  const editorScrollRef = useRef(null);
  const previewScrollRef = useRef(null);
  const textareaRef = useRef(null);
  const lineNumbersInnerRef = useRef(null);

  const selectionRef = useRef({ start: null, end: null });
  const userManuallyBlurredRef = useRef(false);
  const shouldRestoreFocusRef = useRef(false);
  const lastPersisted = useRef({ content: "" });
  const currentBlockIdRef = useRef(block?.id || null);

  const dividerDragRef = useRef(null);
  const draggingDividerRef = useRef(false);

  const historyStoreRef = useRef(new Map());
  const isRestoringHistoryRef = useRef(false);
  const isSyncingScrollRef = useRef(false);
  const overflowCheckTimerRef = useRef(null);

  const dirty = !!block && content !== lastPersisted.current.content;
  const derivedTitle = (block?.content || "").split("\n")[0].slice(0, 64) || "(空)";
  const hist = historyStoreRef.current.get(block?.id) || null;
  const canUndo = hist ? hist.index > 0 : false;
  const canRedo = hist ? hist.index < hist.stack.length - 1 : false;

  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function escapeHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function renderPlainWithImages(raw) {
    if (!raw) return "<span class='text-slate-400 dark:text-slate-500'>暂无内容</span>";
    const re = /!\[([^\]]*?)\]\(([^)\s]+)\)/g;
    let out = "", last = 0, m;
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

  function ensureHistory(blockId, init) {
    if (!blockId) return;
    if (!historyStoreRef.current.has(blockI
