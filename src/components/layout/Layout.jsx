import React from "react";
import Navbar from "./Navbar.jsx";

export default function Layout({ children }) {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-6">
        {children}
      </main>
      <footer className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
        Web Inbox · Powered by Cloudflare Pages + D1 + KV
      </footer>
    </div>
  );
}
