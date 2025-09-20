import React from "react";
import Navbar from "./Navbar.jsx";

export default function Layout({ children, fullScreen = false }) {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-slate-900 text-gray-900 dark:text-slate-100 font-sans antialiased">
      <Navbar />
      <main
        className={`flex-1 flex flex-col ${
          fullScreen
            ? "p-4 md:p-6"
            : "max-w-6xl w-full mx-auto px-4 py-3 bg-white dark:bg-slate-800 shadow-card rounded-xl-2" // py-6 -> py-3 缩小间隙
        }`}
      >
        {children}
      </main>
      <footer className="py-2 text-center text-xs text-slate-500 dark:text-slate-400 border-t border-slate-200/60 dark:border-slate-700/50">
        Web Tips · Powered by Cloudflare Pages + D1 + KV
      </footer>
    </div>
  );
}
