import React from "react";

export default function Spinner({ size = 20, className = "" }) {
  return (
    <div
      className={`inline-block animate-spin rounded-full border-2 border-slate-400 border-t-blue-500 ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
