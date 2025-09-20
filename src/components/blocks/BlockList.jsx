import React from "react";
import BlockItem from "./BlockItem.jsx";

export default function BlockList({
  blocks,
  selectedId,
  onSelect,
  onDelete
}) {
  return (
    <div className="card p-2 h-full overflow-auto custom-scroll">
      {blocks.map(b => (
        <BlockItem
          key={b.id}
          block={b}
          active={b.id === selectedId}
          onClick={() => onSelect && onSelect(b.id)}
          onDelete={() => onDelete && onDelete(b.id)}
        />
      ))}
      {!blocks.length && (
        <div className="text-xs text-slate-400 p-2">无结果</div>
      )}
    </div>
  );
}
