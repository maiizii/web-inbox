import React, { useState, useEffect } from "react";
import { renderMarkdown } from "../../lib/markdown.js";
import { apiUploadImage } from "../../api/cloudflare.js";
import { useToast } from "../../hooks/useToast.jsx";

export default function BlockEditorPanel({
  selected,
  onCreate,
  onUpdate
}) {
  const toast = useToast();
  const [mode, setMode] = useState("create"); // create | edit
  const [value, setValue] = useState("");
  const [preview, setPreview] = useState("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (selected) {
      setMode("edit");
      setValue(selected.content);
    } else {
      setMode("create");
      setValue("");
    }
  }, [selected]);

  useEffect(() => {
    setPreview(renderMarkdown(value));
  }, [value]);

  async function submit(e) {
    e.preventDefault();
    if (!value.trim()) return;
    if (mode === "create") {
      onCreate && onCreate(value);
      setValue("");
    } else if (mode === "edit" && selected) {
      onUpdate && onUpdate(selected.id, value);
    }
  }

  async function onPickFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const img = await apiUploadImage(file);
      setValue(v => v + `\n\n![image](${img.url})\n`);
      toast.push("图片上传成功", { type: "success" });
    } catch (err) {
      toast.push(err.message, { type: "error" });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  return (
    <div className="card p-0 flex flex-col h-[340px] overflow-hidden">
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-700 px-3 h-10 text-xs">
        <span className="font-medium">
          {mode === "create" ? "新建 Block" : "编辑 Block"}
        </span>
        {selected && (
          <span className="text-slate-400">
            ({selected.id.slice(0, 8)}…)
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <label className="text-xs btn btn-outline !py-1 !px-2 cursor-pointer">
            <input
              type="file"
              accept="image/*"
              onChange={onPickFile}
              className="hidden"
              disabled={uploading}
            />
            {uploading ? "上传中..." : "上传图片"}
          </label>
          <button
            onClick={submit}
            disabled={!value.trim()}
            className="btn btn-primary !py-1 !px-3"
          >
            {mode === "create" ? "创建" : "保存"}
          </button>
        </div>
      </div>
      <div className="flex flex-1 min-h-0">
        <textarea
          className="textarea rounded-none flex-1 border-0 border-r dark:bg-slate-900/40"
          placeholder="Markdown 内容..."
          value={value}
          onChange={e => setValue(e.target.value)}
        />
        <div className="w-1/2 p-3 overflow-auto prose prose-sm dark:prose-invert custom-scroll">
          {preview ? (
            <div dangerouslySetInnerHTML={{ __html: preview }} />
          ) : (
            <div className="text-slate-400 text-xs">预览区域</div>
          )}
        </div>
      </div>
    </div>
  );
}
