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
 * BlockEditorAuto
 * Props:
 *  - block: { id, content, created_at, updated_at, position, optimistic? }
 *  - onChange(id, patch)           (本地乐观更新)
 *  - onDelete(id)                  (删除)
 *  - onImmediateSave(id, payload)  (真实持久化函数，返回后端 block)
 *  - safeUpdateFallback?(id, payload, originalError) -> Promise<block>
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
  const [title, setTitle] = useState(block?.title || "");
  const [content, setContent] = useState(block?.content || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showPreview, setShowPreview] = useState(true);
  const [previewMode, setPreviewMode] = useState(
    () => localStorage.getItem("previewMode") || "vertical"
  ); // vertical = 左右；horizontal = 上下
  const [titleManuallyEdited, setTitleManuallyEdited] = useState(false);

  // 预览 HTML
  const [previewHtml, setPreviewHtml] = useState("");

  // 行号字符串
  const [lineNumbers, setLineNumbers] = useState("1");

  /* ================= Refs ================= */
  const textareaRef = useRef(null);
  const lineNumbersInnerRef = useRef(null);
  const scrollContainerRef = useRef(null);

  // 保存光标
  const selectionRef = useRef({ start: null, end: null });
  // 用户是否手动 blur 过（防止自动 focus）
  const userManuallyBlurredRef = useRef(false);
  // 是否应该尝试恢复 focus
  const shouldRestoreFocusRef = useRef(false);
  // 上次持久化成功的内容
  const lastPersisted = useRef({ title: "", content: "" });

  /* ================= Derived ================= */
  const dirty =
    !!block &&
    (title !== lastPersisted.current.title ||
      content !== lastPersisted.current.content);

  /* ================= Effects: Preview ================= */
  useEffect(() => {
    if (showPreview) setPreviewHtml(renderMarkdown(content));
  }, [content, showPreview]);

  /* ================= Effects: Block 切换 ================= */
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
    updateLineNumbers(block?.content || "");
    // 延迟同步一次滚动/行号位置
    requestAnimationFrame(syncLineNumbersPadding);
  }, [block?.id]);

  /* ================= Effect: 自动标题 ================= */
  useEffect(() => {
    if (!block) return;
    if (!titleManuallyEdited && !title && content) {
      setTitle(content.split("\n")[0].slice(0, 32));
    }
  }, [content, title, titleManuallyEdited, block]);

  /* ================= Effect: 预览模式持久化 ================= */
  useEffect(() => {
    localStorage.setItem("previewMode", previewMode);
  }, [previewMode]);

  /* ================= 行号生成 ================= */
  function updateLineNumbers(text) {
    if (text === "") {
      setLineNumbers("1");
      return;
    }
    const lines = text.split("\n");
    setLineNumbers(lines.map((_, i) => i + 1).join("\n"));
  }

  /* ================= 选区 / 焦点 ================= */
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
    if (start == null || end == null) return;
    try {
      ta.setSelectionRange(start, end);
    } catch {}
  }
  function maybeRestoreFocus() {
    const ta = textareaRef.current;
    if (!ta) return;
    if (userManuallyBlurredRef.current) return;
    if (!shouldRestoreFocusRef.current) return;
    if (document.activeElement !== ta) {
      ta.focus();
      restoreSel();
    }
  }

  /* ================= 保存逻辑 ================= */
  async function doSave() {
    if (!block || block.optimistic) return;
    if (!dirty) return;

    setSaving(true);
    setError("");
    const payload = { title, content };
    try {
      // 乐观本地更新（可选保留）
      onChange && onChange(block.id, { ...payload });

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
      lastPersisted.current = { title, content };
    } catch (err) {
      setError(err.message || "保存失败");
    } finally {
      setSaving(false);
      requestAnimationFrame(maybeRestoreFocus);
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
    captureSel();
  }

  /* ================= 行号同步 / 滚动同步 ================= */
  function syncLineNumbersPadding() {
    const ta = textareaRef.current;
    const inner = lineNumbersInnerRef.current;
    if (!ta || !inner) return;
    // 与 textarea padding-top 对齐
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
    const resize = () => syncLineNumbersPadding();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  // 每次内容变动更新行号
  useEffect(() => {
    updateLineNumbers(content);
  }, [content]);

  // block 切换后尝试恢复光标
  useEffect(() => {
    if (!block) return;
    requestAnimationFrame(maybeRestoreFocus);
  }, [block?.id]);

  /* ================= 图片上传 ================= */
  async function immediatePersistAfterImage(newContent) {
    if (!block || block.optimistic) return;
    try {
      onChange && onChange(block.id, { content: newContent, title });
      const payload = { title, content: newContent };
      let real;
      try {
        real = await onImmediateSave(block.id, payload);
      } catch (err) {
        if (safeUpdateFallback) real = await safeUpdateFallback(block.id, payload, err);
        else throw err;
      }
      lastPersisted.current = { title, content: newContent };
    } catch (err) {
      toast.push(err.message || "图片保存失败", { type: "error" });
    }
  }

  async function uploadOne(file) {
    if (!file || !block) return;
    const currentId = block.id;
    const tempId = "uploading-" + Date.now() + "-" + Math.random().toString(16).slice(2);
    const placeholder = `![${tempId}](uploading)`;

    setContent(prev => {
      const needsNL = prev.length > 0 && !prev.endsWith("\n");
      return prev + (needsNL ? "\n" : "") + placeholder + "\n";
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

  const handlePaste = useCallback(
    async e => {
      if (!block) return;
      const items = Array.from(e.clipboardData.items).filter(it =>
        it.type.startsWith("image/")
      );
      if (!items.length) return;
      e.preventDefault();
      for (const it of items) {
        const file = it.getAsFile();
        file && (await uploadOne(file));
      }
    },
    [block]
  );

  const handleDrop = useCallback(
    async e => {
      if (!block) return;
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files).filter(f =>
        f.type.startsWith("image/")
      );
      if (!files.length) return;
      for (const f of files) await uploadOne(f);
    },
    [block]
  );

  /* ================= 插入文本（可扩展工具） ================= */
  function insertAtCursor(text) {
    const ta = textareaRef.current;
    if (!ta) {
      setContent(c => c + text);
      return;
    }
    captureSel();
    const { start, end } = selectionRef.current;
    setContent(c => c.slice(0, start) + text + c.slice(end));
    requestAnimationFrame(() => {
      const newPos = start + text.length;
      selectionRef.current = { start: newPos, end: newPos };
      try {
        ta.focus();
        ta.setSelectionRange(newPos, newPos);
      } catch {}
    });
  }

  /* ================= Block 不存在时 ================= */
  if (!block) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-slate-400">
        请选择左侧 Block 或点击“新建”
      </div>
    );
  }

  const disabledByCreation =
    !!(block.optimistic && String(block.id).startsWith("tmp-"));

  /* ================= Render ================= */
  return (
    <div
      className="h-full flex flex-col"
      onPaste={handlePaste}
      onDrop={handleDrop}
      onDragOver={e => e.preventDefault()}
    >
      {/* ========== 工具栏 ========== */}
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
                <button
                  onClick={doSave}
                  className="text-red-500 hover:underline"
                >
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

      {/* ========== 主体分屏容器 ========== */}
      <div
        className={`flex-1 min-h-0 flex ${
          showPreview
            ? previewMode === "vertical"
              ? "flex-row"
              : "flex-col"
            : "flex-col"
        }`}
      >
        {/* ===== 编辑区域 ===== */}
        <div
          className={
            showPreview
              ? previewMode === "vertical"
                ? "w-1/2 h-full flex flex-col border-r border-slate-200 dark:border-slate-700"
                : "h-1/2 w-full flex flex-col border-b border-slate-200 dark:border-slate-700"
              : "flex-1 flex flex-col"
          }
        >
          <div className="flex-1 relative">
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
                  placeholder="输入 Markdown 内容 (支持粘贴 / 拖拽图片)"
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
                />
              </div>
            </div>
          </div>
        </div>

        {/* ===== 预览区域 ===== */}
        {showPreview && (
          <div
            className={
              previewMode === "vertical"
                ? "w-1/2 h-full overflow-auto custom-scroll p-4 prose prose-sm dark:prose-invert"
                : "h-1/2 w-full overflow-auto custom-scroll p-4 prose prose-sm dark:prose-invert"
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
