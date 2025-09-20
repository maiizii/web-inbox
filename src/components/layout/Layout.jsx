import React from "react";
import Navbar from "./Navbar.jsx";

export default function Layout({ children, fullScreen = false }) {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-slate-900 text-gray-900 dark:text-slate-100 font-sans antialiased">
      <Navbar />
      <main
        className={`flex-1 flex flex-col ${
          fullScreen
            ? "p-2 md:p-3"
            : // 统一使用 app-surface，深浅配色一致；保持原有圆角与阴影
              "max-w-6xl w-full mx-auto px-4 py-3 app-surface shadow-card rounded-xl-2"
        }`}
      >
        {children}
      </main>
      <footer className="mt-2 app-surface py-2 text-center text-xs text-slate-500 dark:text-slate-300 border-t border-slate-200 dark:border-slate-700">
        Web Tips · Powered by Cloudflare Pages + D1 + KV
      </footer>
    </div>
  );
}
