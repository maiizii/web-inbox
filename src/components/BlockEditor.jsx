import React, { useState, useEffect } from "react";
import Button from "./ui/Button.jsx";
import { renderMarkdown } from "../lib/markdown.js";
import { useToast } from "../hooks/useToast.js";
import { apiCreateBlock } from "../api/cloudflare.js";

export default function BlockEditor({ onCreated }) {
  const [value, setValue] = useState("");
  const [preview, setPreview] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  useEffect(() => {
    setPreview(renderMarkdown(value));
  }, [value]);

  async function submit(e) {
    e.preventDefault();
    if (!value.trim()) return;
    setSubmitting(true);
    try {
      // 乐观：先构造假的 block
      const optimistic = {
        id: "optimistic-" + Date.now(),
        content: value,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        optimistic: true
      };
      onCreated && onCreated(optimistic, { optimistic: true });

      const real = await apiCreateBlock(value);
      onCreated && onCreated(real, { replace: optimistic.id });
      setValue("");
      toast.push("已创建", { type: "success" });
    } catch (err) {
      toast.push(err.message, { type: "error" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="card p-0 overflow-hidden flex flex-col md:flex-row"
    >
      <div className="flex-1 flex flex-col">
        <textarea
          className="textarea rounded-none flex-1 border-0 border-b md:border-b-0 md:border-r dark:bg-slate-900/40"
          placeholder="输入 Markdown 内容（支持图片粘贴后用上方上传）"
            value={value}
          onChange={e => setValue(e.target.value)}
        />
        <div className="p-3 flex justify-between gap-3">
          <div className="text-xs text-slate-500">
            支持 Markdown / 图片（生成 ![image](...))
          </div>
          <div className="flex gap-2">
            <Button disabled={!value.trim() || submitting}>
              {submitting ? "提交中..." : "创建 Block"}
            </Button>
          </div>
        </div>
      </div>
      <div className="w-full md:w-1/2 border-t md:border-t-0 md:border-l border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/30 p-4 overflow-auto max-h-[360px]">
        <div
          className="prose prose-sm dark:prose-invert"
          dangerouslySetInnerHTML={{ __html: preview || "<p class='text-slate-400'>实时预览...</p>" }}
        />
      </div>
    </form>
  );
}
