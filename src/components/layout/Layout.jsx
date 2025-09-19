import React from "react";
import Navbar from "./Navbar.jsx";

export default function Layout({ children, fullScreen = false }) {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className={fullScreen ? "flex-1 flex flex-col" : "flex-1 max-w-5xl w-full mx-auto px-4 py-6"}>
        {children}
      </main>
      <footer className="py-4 text-center text-xs text-slate-500 dark:text-slate-400 border-t border-slate-200/60 dark:border-slate-700/50">
        Web Tips · Powered by Cloudflare Pages + D1 + KV
      </footer>
    </div>
  );
}
