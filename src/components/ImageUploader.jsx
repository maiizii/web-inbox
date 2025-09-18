import React, { useRef, useState } from "react";
import { apiUploadImage } from "../api/cloudflare.js";
import Button from "./ui/Button.jsx";
import { useToast } from "../hooks/useToast.js";

export default function ImageUploader({ onInserted }) {
  const ref = useRef();
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  function pick() {
    ref.current?.click();
  }

  async function onChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const img = await apiUploadImage(file);
      // 返回 markdown 形式
      onInserted && onInserted(`![image](${img.url})`);
      toast.push("图片已上传", { type: "success" });
    } catch (err) {
      toast.push(err.message, { type: "error" });
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  }

  return (
    <>
      <input
        ref={ref}
        onChange={onChange}
        type="file"
        accept="image/*"
        className="hidden"
      />
      <Button
        type="button"
        variant="outline"
        onClick={pick}
        disabled={loading}
      >
        {loading ? "上传中..." : "上传图片"}
      </Button>
    </>
  );
}
