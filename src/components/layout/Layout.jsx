import React from "react";
import Navbar from "./Navbar.jsx";

export default function Layout({ children, fullScreen = false }) {
  return (
    // 深色“缝隙”统一用 --color-bg；避免 Tailwind 覆盖，用内联 backgroundColor
    <div
      className="min-h-screen flex flex-col text-gray-900 dark:text-slate-100 font-sans antialiased"
      style={{ backgroundColor: "var(--color-bg)" }}
    >
      <Navbar />

      <main
        className={`flex-1 flex flex-col ${
          fullScreen
            ? "p-2 md:p-3"
            : // 主内容卡片
              "max-w-6xl w-full mx-auto px-4 py-3 bg-white dark:bg-slate-800 shadow-card rounded-xl-2"
        }`}
      >
        {children}
      </main>

      {/* 底部与主栏间距减半：mt-1（原 mt-2） */}
      <footer className="mt-1 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md py-2 text-center text-xs text-slate-500 dark:text-slate-300 border-t border-slate-200 dark:border-slate-700">
        Web Tips · Powered by Cloudflare Pages + D1 + KV
      </footer>
    </div>
  );
}
