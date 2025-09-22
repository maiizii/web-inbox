// src/components/layout/Layout.jsx
import React from "react";
import Navbar from "./Navbar.jsx";

export default function Layout({ children, fullScreen = false }) {
  return (
    // 固定视口高度，允许子项分配高度；确保内部滚动生效
    <div
      className="h-screen min-h-0 flex flex-col text-gray-900 dark:text-slate-100 font-sans antialiased"
      style={{ backgroundColor: "var(--color-bg)" }}
    >
      {/* 头部不参与伸缩 */}
      <div className="shrink-0">
        <Navbar />
      </div>

      {/* 主体占据剩余空间，min-h-0 允许内部滚动容器获得可分配高度 */}
      <main
        className={`flex-1 min-h-0 flex flex-col ${
          fullScreen
            ? "p-2 md:p-3"
            : "max-w-6xl w-full mx-auto px-4 py-3 shadow-card rounded-xl-2"
        }`}
        style={{
          backgroundColor: fullScreen ? "transparent" : "var(--color-surface)",
        }}
      >
        {children}
      </main>

      {/* 底部不参与伸缩，保持卡片式布局的节奏 */}
      <footer
        className="shrink-0 mt-1 py-2 text-center text-xs border-t"
        style={{
          backgroundColor: "var(--color-surface)",
          color: "var(--color-text-soft)",
          borderColor: "var(--color-border)",
        }}
      >
        Web Tips · Powered by Cloudflare Pages + D1 + KV
      </footer>
    </div>
  );
}
