import React, { useState, useEffect } from "react";
import { apiUpdateBlock, apiDeleteBlock } from "../api/cloudflare.js";
import { renderMarkdown } from "../lib/markdown.js";
import Button from "./ui/Button.jsx";
import { useToast } from "../hooks/useToast.js";

export default function Block({ block, onChanged, onDeleted }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(block.content);
  const [preview, setPreview] = useState("");
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    setPreview(renderMarkdown(editing ? value : block.content));
  }, [block.content, value, editing]);

  async function save() {
    if (!value.trim()) return;
    setSaving(true);
    try {
      // 乐观
      const prev = block.content;
      onChanged && onChanged({ ...block, content: value, optimistic: true });
      const updated = await apiUpdateBlock(block.id, value);
      onChanged && onChanged(updated);
      setEditing(false);
      toast.push("已保存", { type: "success" });
    } catch (e) {
      toast.push(e.message, { type: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm("确认删除该块？")) return;
    try {
      onDeleted && onDeleted(block.id, { optimistic: true });
      await apiDeleteBlock(block.id);
      toast.push("已删除", { type: "success" });
    } catch (e) {
      toast.push(e.message, { type: "error" });
    }
  }

  return (
    <div
      className={`card p-4 space-y-3 relative ${
        block.optimistic ? "opacity-60 pointer-events-none" : ""
      }`}
    >
      <div className="text-xs text-slate-400 flex justify-between">
        <span>{new Date(block.created_at).toLocaleString()}</span>
        {block.updated_at && (
          <span className="italic">
            {block.updated_at !== block.created_at && "已修改"}
          </span>
        )}
      </div>
      {editing ? (
        <textarea
          className="textarea"
          value={value}
          onChange={e => setValue(e.target.value)}
        />
      ) : (
        <div
          className="prose prose-sm dark:prose-invert max-w-none"
          dangerouslySetInnerHTML={{ __html: preview }}
        />
      )}
      <div className="flex gap-2 justify-end">
        {editing ? (
          <>
            <Button
              type="button"
              onClick={save}
              disabled={saving}
            >
              {saving ? "保存中..." : "保存"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setEditing(false);
                setValue(block.content);
              }}
            >
              取消
            </Button>
          </>
        ) : (
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditing(true)}
            >
              编辑
            </Button>
            <Button type="button" variant="outline" onClick={remove}>
              删除
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
