// src/components/blocks/BlockEditorAuto.jsx
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
  block, onChange, onDelete, onImmediateSave, safeUpdateFallback
}) {
  const toast = useToast();
  const [content, setContent] = useState(block?.content || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showPreview, setShowPreview] = useState(true);
  const [previewMode, setPreviewMode] = useState(() => localStorage.getItem("previewMode") || "vertical");
  const [splitRatio, setSplitRatio] = useState(() => {
    const key = previewMode === "vertical" ? "editorSplit_vertical" : "editorSplit_horizontal";
    const raw = localStorage.getItem(key);
    const v = raw ? parseFloat(raw) : 0.5;
    return isNaN(v) ? 0.5 : Math.min(MAX_RATIO, Math.max(MIN_RATIO, v));
  });
  const [lineNumbers, setLineNumbers] = useState("1");
  const [previewHtml, setPreviewHtml] = useState("");
  const [syncScrollEnabled, setSyncScrollEnabled] = useState(true);

  const splitContainerRef = useRef(null);
  const editorScrollRef   = useRef(null);
  const previewScrollRef  = useRef(null);
  const textareaRef       = useRef(null);
  const lineNumbersInnerRef = useRef(null);

  const selectionRef = useRef({ start: null, end: null });
  const lastPersisted = useRef({ content: "" });
  const currentBlockIdRef = useRef(block?.id || null);

  const historyStoreRef = useRef(new Map());
  const isRestoringHistoryRef = useRef(false);
  const isSyncingScrollRef = useRef(false);

  const dirty = !!block && content !== lastPersisted.current.content;
  const derivedTitle = (block?.content || "").split("\n")[0].slice(0, 64) || "(空)";
  const hist = historyStoreRef.current.get(block?.id) || null;
  const canUndo = hist ? hist.index > 0 : false;
  const canRedo = hist ? hist.index < hist.stack.length - 1 : false;

  function escapeHtml(str){return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
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
    return out.replace(/\r\n/g,"\n").replace(/\n/g,"<br/>");
  }

  function ensureHistory(blockId, init) {
    if (!blockId) return;
    if (!historyStoreRef.current.has(blockId)) {
      historyStoreRef.current.set(blockId, { stack:[init], index:0, lastPush:Date.now() });
    }
  }

  useEffect(() => {
    currentBlockIdRef.current = block?.id || null;
    const init = block?.content || "";
    setContent(init);
    lastPersisted.current = { content: init };
    ensureHistory(block?.id, init);
    setLineNumbers(String((init.match(/\n/g)||[]).length + 1));
    setPreviewHtml(renderPlainWithImages(init));
  }, [block?.id]);

  function updateBoth(v){
    setContent(v);
    setLineNumbers(String((v.match(/\n/g)||[]).length + 1));
    setPreviewHtml(renderPlainWithImages(v));
  }

  async function doSave(){
    if (!block || block.optimistic || !dirty) return;
    const id = block.id;
    setSaving(true); setError("");
    try {
      onChange && onChange(id, { content });
      const real = await onImmediateSave(id, { content });
      if (currentBlockIdRef.current === id) lastPersisted.current = { content };
    } catch (e) {
      if (currentBlockIdRef.current === id) setError(e.message || "保存失败");
    } finally {
      if (currentBlockIdRef.current === id) setSaving(false);
    }
  }
  const [debouncedSave, flushSave] = useDebouncedCallback(doSave, 800);
  useEffect(() => { if (dirty) debouncedSave(); }, [content, debouncedSave, dirty]);

  function handleKeyDown(e){
    const isMac=/Mac|iPhone|iPad|iPod/.test(navigator.platform); const mod=isMac?e.metaKey:e.ctrlKey;
    if (mod && (e.key==="z"||e.key==="Z")) { e.preventDefault(); const h=historyStoreRef.current.get(block.id); if(!h||h.index<=0) return; h.index--; updateBoth(h.stack[h.index]); return; }
    if (mod && (e.key==="y"||e.key==="Y")) { e.preventDefault(); const h=historyStoreRef.current.get(block.id); if(!h||h.index>=h.stack.length-1) return; h.index++; updateBoth(h.stack[h.index]); return; }
    if (e.key==="Tab"){
      const ta=textareaRef.current; if(!ta) return; e.preventDefault();
      const start=ta.selectionStart, end=ta.selectionEnd, text=content;
      const lineStart=text.lastIndexOf("\n",start-1)+1; const lineEnd=text.indexOf("\n",end); const effEnd=lineEnd===-1?text.length:lineEnd;
      const before=text.slice(0,lineStart), target=text.slice(lineStart,effEnd), after=text.slice(effEnd);
      const lines=target.split("\n");
      if (e.shiftKey){
        const newTarget=lines.map(l=>l.startsWith("  ")?l.slice(2):l.startsWith(" ")?l.slice(1):l).join("\n");
        const nc=before+newTarget+after; updateBoth(nc);
        requestAnimationFrame(()=>{ta.focus(); ta.setSelectionRange(Math.max(lineStart,start-2), Math.max(effEnd-(target.length-newTarget.length),0));});
      }else{
        const newTarget=lines.length===1?("  "+lines[0]):lines.map(l=>"  "+l).join("\n");
        const nc=before+newTarget+after; updateBoth(nc);
        requestAnimationFrame(()=>{ta.focus(); ta.setSelectionRange(start+2, end+2*lines.length);});
      }
    }
  }

  return !block ? (
    <div className="h-full flex items-center justify-center text-sm text-slate-400 dark:text-slate-500">请选择左侧 Block 或点击“新建”</div>
  ) : (
    <div className="h-full flex flex-col overflow-hidden" onDrop={e=>e.preventDefault()} onDragOver={e=>e.preventDefault()}>
      {/* 头部面板：浅/深统一 app-surface */}
      <div className="app-surface border-b border-slate-200 dark:border-slate-700 py-3 px-4 flex items-center gap-3">
        <div className="flex-1 text-lg font-semibold truncate">{(block?.content||"").split("\n")[0].slice(0,64)||"(空)"}</div>
        <div className="flex items-center gap-2 text-xs">
          <button type="button" disabled className="btn-outline-modern !px-2.5 !py-1.5 opacity-50" title="撤销 (Ctrl+Z)"><Undo2 size={16}/></button>
          <button type="button" disabled className="btn-outline-modern !px-2.5 !py-1.5 opacity-50" title="恢复 (Ctrl+Y)"><Redo2 size={16}/></button>
          <button type="button" onClick={()=>setSyncScrollEnabled(v=>!v)} className="btn-outline-modern !px-2.5 !py-1.5">{syncScrollEnabled?"同步滚动:开":"同步滚动:关"}</button>
          <button type="button" onClick={()=>setPreviewMode(m=>m==="vertical"?"horizontal":"vertical")} className="btn-outline-modern !px-3 !py-1.5">{previewMode==="vertical"?"上下预览":"左右预览"}</button>
          <button type="button" onClick={()=>setShowPreview(p=>!p)} className="btn-outline-modern !px-3 !py-1.5">{showPreview?"隐藏预览":"显示预览"}</button>
          <div className="text-slate-400 dark:text-slate-300 select-none min-w-[64px] text-right">
            {saving ? "保存中" : error ? <button onClick={doSave} className="text-red-500 hover:underline">重试</button> : (content!==lastPersisted.current.content ? "待保存" : "已保存")}
          </div>
          <button onClick={()=>{ if (confirm("确定删除该 Block？")) onDelete && onDelete(block.id); }} className="btn-danger-modern !px-3 !py-1.5">删除</button>
        </div>
      </div>

      {/* 编辑/预览区 */}
      <div ref={splitContainerRef} className={`flex-1 min-h-0 flex ${showPreview?(previewMode==="vertical"?"flex-row":"flex-col"):"flex-col"} overflow-hidden`}>
        <div className="rounded-md" style={showPreview?{flexBasis: `${splitRatio*100}%`}:{flexBasis:"100%"}}>
          <div ref={editorScrollRef} className="editor-scroll custom-scroll h-full">
            <div className="grid grid-cols-[48px_1fr]">
              <div className="editor-line-numbers"><pre className="editor-line-numbers-inner p-2 select-none">{String((content.match(/\n/g)||[]).length+1).split("").join("")}</pre></div>
              <textarea
                ref={textareaRef}
                className="editor-textarea custom-scroll h-full w-full p-3 font-mono text-sm leading-[1.5] outline-none resize-none"
                value={content}
                onChange={e=>updateBoth(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="输入文本 (粘贴/拖拽图片, Tab/Shift+Tab)"
                onBlur={() => { if (content!==lastPersisted.current.content) doSave(); }}
              />
            </div>
          </div>
        </div>

        {showPreview && <>
          <div className={`split-divider ${previewMode==="vertical"?"w-1 cursor-col-resize":"h-1 cursor-row-resize"}`} title="拖动调整比例，双击恢复 50%"/>
          <div className="rounded-md" style={{ flexBasis: `${(1 - splitRatio) * 100}%` }}>
            <div ref={previewScrollRef} className="preview-scroll custom-scroll h-full p-3">
              {/* 关键：预览文字深色下白字 */}
              <div className="preview-content font-mono text-sm leading-[1.5] whitespace-pre-wrap break-words select-text" dangerouslySetInnerHTML={{ __html: previewHtml }} />
            </div>
          </div>
        </>}
      </div>
    </div>
  );
}
