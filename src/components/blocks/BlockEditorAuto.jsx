import React, {
  useEffect,
  useState,
  useRef,
  useCallback
} from "react";
import { useDebouncedCallback } from "../../hooks/useDebouncedCallback.js";
import { apiUploadImage } from "../../api/cloudflare.js";
import { useToast } from "../../hooks/useToast.jsx";

/**
 * BlockEditorAuto (纯文本预览 + 分割条拖动 + Undo/Redo + Tab/Shift+Tab)
 * Props:
 *  - block: { id, content, created_at, updated_at, position, optimistic? }
 *  - onChange(id, patch)
 *  - onDelete(id)
 *  - onImmediateSave(id, {content})
 *  - safeUpdateFallback?(id,payload,error)
 */

const MAX_HISTORY = 200;
const HISTORY_GROUP_MS = 800; // 组装输入的时间窗口
const INDENT = "  "; // 两个空格

export default function BlockEditorAuto({
  block,
  onChange,
  onDelete,
  onImmediateSave,
  safeUpdateFallback
}) {
  const toast = useToast();

  // ---------------- State ----------------
  const [content, setContent] = useState(block?.content || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showPreview, setShowPreview] = useState(true);
  const [previewMode, setPreviewMode] = useState(
    () => localStorage.getItem("previewMode") || "vertical"
  ); // vertical=左右, horizontal=上下

  const [splitRatio, setSplitRatio] = useState(() => {
    const key = previewMode === "vertical" ? "editorSplit_vertical" : "editorSplit_horizontal";
    const raw = localStorage.getItem(key);
    const v = raw ? parseFloat(raw) : 0.5;
    return isNaN(v) ? 0.5 : clamp(v, 0.15, 0.85);
  });

  const [lineNumbers, setLineNumbers] = useState("1");
  const [plainPreview, setPlainPreview] = useState("");

  const [draggingSplit, setDraggingSplit] = useState(false);

  // Undo/Redo
  const historyRef = useRef([]);
  const historyIndexRef = useRef(-1);
  const lastHistoryPushTimeRef = useRef(0);
  const isRestoringHistoryRef = useRef(false);

  // ---------------- Refs ----------------
  const textareaRef = useRef(null);
  const lineNumbersInnerRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const selectionRef = useRef({ start: null, end: null });
  const userManuallyBlurredRef = useRef(false);
  const shouldRestoreFocusRef = useRef(false);
  const lastPersisted = useRef({ content: "" });
  const currentBlockIdRef = useRef(block?.id || null);
  const dragMetaRef = useRef(null);

  // Derived
  const dirty = !!block && content !== lastPersisted.current.content;
  const derivedTitle = (block?.content || "").split("\n")[0].slice(0, 64) || "(空)";

  // ---------------- Helpers ----------------
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

  function updatePlainPreview(txt) {
    // 纯文本预览：只做转义 + 换行 -> <br/>
    setPlainPreview(
      escapeHtml(txt || "")
        .replace(/\r\n/g, "\n")
        .replace(/\n/g, "<br/>")
    );
  }

  function updateLineNumbers(txt) {
    if (!txt) { setLineNumbers("1"); return; }
    setLineNumbers(txt.split("\n").map((_, i) => i + 1).join("\n"));
  }

  // ---------------- History (Undo/Redo) ----------------
  function pushHistory(newContent, forceSeparate = false) {
    if (isRestoringHistoryRef.current) return;
    const now = Date.now();
    const since = now - lastHistoryPushTimeRef.current;
    const lastContent =
      historyIndexRef.current >= 0
        ? historyRef.current[historyIndexRef.current]
        : undefined;
    if (!forceSeparate && since < HISTORY_GROUP_MS && lastContent === newContent) {
      // 不需要重复
      return;
    }
    if (!forceSeparate && since < HISTORY_GROUP_MS && lastContent !== undefined) {
      // 在时间窗口内且内容变了，直接替换当前快照
      historyRef.current[historyIndexRef.current] = newContent;
      lastHistoryPushTimeRef.current = now;
      return;
    }
    // 剪掉 redo 分支
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
    if (historyRef.current.length === 0) return;
    const newIndex = historyIndexRef.current + delta;
    if (newIndex < 0 || newIndex >= historyRef.current.length) return;
    historyIndexRef.current = newIndex;
    const snap = historyRef.current[newIndex];
    isRestoringHistoryRef.current = true;
    setContent(snap);
    requestAnimationFrame(() => {
      isRestoringHistoryRef.current = false;
      updateLineNumbers(snap);
      updatePlainPreview(snap);
    });
  }

  function handleUndoRedoKey(e) {
    const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform);
    const ctrl = isMac ? e.metaKey : e.ctrlKey;
    if (!ctrl) return;
    if (e.key === "z" || e.key === "Z") {
      e.preventDefault();
      if (e.shiftKey) {
        // Ctrl+Shift+Z / Cmd+Shift+Z redo
        restoreHistory(+1);
      } else {
        restoreHistory(-1);
      }
    } else if (e.key === "y" || e.key === "Y") {
      e.preventDefault();
      restoreHistory(+1);
    }
  }

  // ---------------- Effects: block 切换 ----------------
  useEffect(() => {
    currentBlockIdRef.current = block?.id || null;
    setContent(block?.content || "");
    lastPersisted.current = { content: block?.content || "" };
    setError("");
    updateLineNumbers(block?.content || "");
    updatePlainPreview(block?.content || "");
    historyRef.current = [block?.content || ""];
    historyIndexRef.current = 0;
    lastHistoryPushTimeRef.current = Date.now();
    userManuallyBlurredRef.current = false;
    shouldRestoreFocusRef.current = false;
    requestAnimationFrame(syncLineNumbersPadding);
  }, [block?.id]);

  // ---------------- Effects: preview / mode / ratio ----------------
  useEffect(() => {
    updatePlainPreview(content);
  }, [content]);

  useEffect(() => {
    const key = previewMode === "vertical" ? "editorSplit_vertical" : "editorSplit_horizontal";
    const raw = localStorage.getItem(key);
    const v = raw ? parseFloat(raw) : splitRatio;
    setSplitRatio(isNaN(v) ? 0.5 : clamp(v, 0.15, 0.85));
    localStorage.setItem("previewMode", previewMode);
  }, [previewMode]);

  // ---------------- Selection / focus ----------------
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

  // ---------------- Save ----------------
  async function doSave() {
    if (!block || block.optimistic) return;
    if (!dirty) return;
    const savedForBlock = block.id;
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
      // 若在保存期间用户切换了 block，不更新 lastPersisted（避免覆盖）
      if (currentBlockIdRef.current === savedForBlock) {
        lastPersisted.current = { content };
      }
    } catch (err) {
      if (currentBlockIdRef.current === savedForBlock) {
        setError(err.message || "保存失败");
      }
    } finally {
      if (currentBlockIdRef.current === savedForBlock) {
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

  // ---------------- Scroll / line numbers ----------------
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
    const onResize = () => syncLineNumbersPadding();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // ---------------- Paste / Drop images ----------------
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
      const nl = prev.length > 0 && !prev.endsWith("\n") ? "\n" : "";
      const updated = prev + nl + placeholder + "\n";
      pushHistory(updated, true);
      return updated;
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

  // ---------------- Tab / Shift+Tab ----------------
  function handleIndentKey(e) {
    if (e.key !== "Tab") return;
    const ta = textareaRef.current;
    if (!ta) return;
    e.preventDefault();
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const before = content.slice(0, start);
    const sel = content.slice(start, end);
    const after = content.slice(end);

    if (e.shiftKey) {
      // 反缩进
      const selLines = sel.split("\n");
      let removedFirstLineChars = 0;
      const newSelLines = selLines.map((line, idx) => {
        if (line.startsWith(INDENT)) {
          if (idx === 0) removedFirstLineChars = INDENT.length;
          return line.slice(INDENT.length);
        } else if (line.startsWith(" ")) {
          if (idx === 0) removedFirstLineChars = 1;
          return line.slice(1);
        }
        return line;
      });
      const newSel = newSelLines.join("\n");
      const newContent = before + newSel + after;
      setContent(newContent);
      pushHistory(newContent);
      requestAnimationFrame(() => {
        const newStart = start - removedFirstLineChars;
        const newEnd = newStart + newSel.length;
        ta.focus();
        ta.setSelectionRange(newStart, newEnd);
        captureSel();
      });
    } else {
      // 正缩进
      if (sel.includes("\n")) {
        const selLines = sel.split("\n");
        const newSelLines = selLines.map(l => INDENT + l);
        const newSel = newSelLines.join("\n");
        const newContent = before + newSel + after;
        setContent(newContent);
        pushHistory(newContent);
        requestAnimationFrame(() => {
          ta.focus();
          ta.setSelectionRange(start + INDENT.length, start + newSel.length);
          captureSel();
        });
      } else {
        const newContent = before + INDENT + sel + after;
        setContent(newContent);
        pushHistory(newContent);
        requestAnimationFrame(() => {
          const pos = start + INDENT.length;
            ta.focus();
          ta.setSelectionRange(pos, pos);
          captureSel();
        });
      }
    }
  }

  // ---------------- Key handling ----------------
  function handleKeyDown(e) {
    // Undo/Redo
    handleUndoRedoKey(e);
    // Tab / Shift+Tab
    handleIndentKey(e);
  }

  // ---------------- Split drag ----------------
  function startDrag(e) {
    if (!showPreview) return;
    e.preventDefault();
    const container = e.currentTarget.parentElement; // .editor-split-root
    if (!container) return;
    const rect = container.getBoundingClientRect();
    dragMetaRef.current = { rect };
    setDraggingSplit(true);
    window.addEventListener("mousemove", onDragMove);
    window.addEventListener("mouseup", stopDrag);
  }
  function onDragMove(e) {
    if (!draggingSplit || !dragMetaRef.current) return;
    const rect = dragMetaRef.current.rect;
    if (previewMode === "vertical") {
      const ratio = (e.clientX - rect.left) / rect.width;
      setSplitRatio(clamp(ratio, 0.15, 0.85));
    } else {
      const ratio = (e.clientY - rect.top) / rect.height;
      setSplitRatio(clamp(ratio, 0.15, 0.85));
    }
  }
  function stopDrag() {
    setDraggingSplit(false);
    window.removeEventListener("mousemove", onDragMove);
    window.removeEventListener("mouseup", stopDrag);
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
  }, [draggingSplit]);

  // ---------------- History push on typing ----------------
  // 在输入时（onChange）及时 push（分组逻辑内部处理）
  function handleContentChange(val) {
    setContent(val);
    pushHistory(val);
  }

  // ---------------- Early return ----------------
  if (!block) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-slate-400">
        请选择左侧 Block 或点击“新建”
      </div>
    );
  }
  const disabledByCreation = !!(block.optimistic && String(block.id).startsWith("tmp-"));

  // ---------------- Render ----------------
  return (
    <div
      className="h-full flex flex-col overflow-hidden"
      onPaste={handlePaste}
      onDrop={handleDrop}
      onDragOver={e => e.preventDefault()}
    >
      {/* 顶部工具栏（无编辑标题/无 MD 快捷） */}
      <div className="flex items-center gap-3 py-3 px-4 border-b border-slate-200 dark:border-slate-700">
        <div className="flex-1 text-lg font-semibold truncate select-none">
          {derivedTitle}
        </div>
        <div className="flex items-center gap-2 text-xs">
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

      {/* 主区域 */}
      <div
        className={`editor-split-root flex-1 min-h-0 flex ${
          showPreview
            ? previewMode === "vertical"
              ? "flex-row"
              : "flex-col"
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
                  placeholder="输入文本 (支持粘贴/拖拽图片, Tab 缩进, Shift+Tab 反缩进, Ctrl+Z / Ctrl+Y 撤销恢复)"
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

        {/* 分隔条 */}
        {showPreview && (
          <div
            className={`split-divider ${
              previewMode === "vertical" ? "split-vertical" : "split-horizontal"
            } ${draggingSplit ? "dragging" : ""}`}
            onMouseDown={startDrag}
            onDoubleClick={resetSplit}
            title="拖动调整比例，双击恢复 50%"
          />
        )}

        {/* 预览区（纯文本） */}
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
              dangerouslySetInnerHTML={{ __html: plainPreview || "<span class='text-slate-400'>暂无内容</span>" }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
