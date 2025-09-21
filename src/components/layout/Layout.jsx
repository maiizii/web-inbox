import React from "react";
import Navbar from "./Navbar.jsx";

export default function Layout({ children, fullScreen = false }) {
  return (
    // 背景缝隙统一走主题深色
    <div
      className="min-h-screen flex flex-col text-gray-900 dark:text-slate-100 font-sans antialiased"
      style={{ backgroundColor: "var(--color-bg)" }}
    >
      <Navbar />

      <main
        className={`flex-1 flex flex-col ${
          fullScreen
            ? "p-2 md:p-3"
            : "max-w-6xl w-full mx-auto px-4 py-3 shadow-card rounded-xl-2"
        }`}
        // 主卡片底色走主题变量，深色为深色表面；避免 Tailwind 覆盖
        style={{ backgroundColor: fullScreen ? "transparent" : "var(--color-surface)" }}
      >
        {children}
      </main>

      {/* 底部也用深色表面；与主栏间距减半 */}
      <footer
        className="mt-1 py-2 text-center text-xs border-t"
        style={{
          backgroundColor: "var(--color-surface)",
          color: "var(--color-text-soft)",
          borderColor: "var(--color-border)"
        }}
      >
        Web Tips · Powered by Cloudflare Pages + D1 + KV
      </footer>
    </div>
  );
}
