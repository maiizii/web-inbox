import React, { useState } from "react";
import { apiUpdateBlock, apiDeleteBlock } from "../api/cloudflare.js";

export default function Block({ block, onChanged, onDeleted }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(block.content);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    setSaving(true);
    setErr("");
    try {
      const updated = await apiUpdateBlock(block.id, value);
      onChanged && onChanged(updated);
      setEditing(false);
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm("确认删除？")) return;
    try {
      await apiDeleteBlock(block.id);
      onDeleted && onDeleted(block.id);
    } catch (e) {
      alert(e.message);
    }
  }

  return (
    <div className="border rounded p-3 bg-white shadow-sm space-y-2">
      {editing ? (
        <textarea
          className="w-full border rounded p-2 h-24"
          value={value}
          onChange={e => setValue(e.target.value)}
        />
      ) : (
        <div className="whitespace-pre-wrap text-sm">{block.content}</div>
      )}
      {err && <div className="text-xs text-red-600">{err}</div>}
      <div className="flex gap-2 text-sm">
        {editing ? (
          <>
            <button
              onClick={save}
              disabled={saving}
              className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
            >
              保存
            </button>
            <button
              onClick={() => { setEditing(false); setValue(block.content); }}
              className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300"
            >
              取消
            </button>
          </>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            编辑
          </button>
        )}
        <button
          onClick={remove}
          className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 ml-auto"
        >
          删除
        </button>
      </div>
    </div>
  );
}
