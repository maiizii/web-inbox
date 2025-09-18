import React from "react";
import { renderMarkdown } from "../../lib/markdown.js";

export default function BlockItem({
  block,
  active,
  onClick,
  onDelete
}) {
  return (
    <div
      onClick={onClick}
      className={`cursor-pointer rounded-md px-3 py-2 text-xs mb-1 border transition
        ${
          active
            ? "bg-blue-50 dark:bg-blue-900/40 border-blue-300 dark:border-blue-600"
            : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/60"
        } ${block.optimistic ? "opacity-60" : ""}`}
    >
      <div className="flex justify-between gap-2">
        <span className="font-medium truncate">
          {firstLine(block.content) || "(空)"}
        </span>
        <button
          onClick={e => {
            e.stopPropagation();
            if (confirm("删除该 Block?")) onDelete && onDelete();
          }}
          className="text-red-500 hover:text-red-600"
          title="删除"
        >
          ×
        </button>
      </div>
      <div
        className="mt-1 line-clamp-2 prose prose-xs dark:prose-invert max-w-none text-slate-500 dark:text-slate-400"
        dangerouslySetInnerHTML={{
          __html: renderMarkdown(block.content.slice(0, 140))
        }}
      />
      <div className="mt-1 text-[10px] text-slate-400">
        {new Date(block.created_at).toLocaleTimeString()}
      </div>
    </div>
  );
}

function firstLine(str) {
  return (str || "").split(/\r?\n/)[0].slice(0, 60);
}
