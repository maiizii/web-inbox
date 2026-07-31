import React, { useEffect, useRef, useState } from "react";
import MarkdownOutline from "./MarkdownOutline.jsx";

export default function MarkdownPreview({
  html,
  headings,
  scrollerRef,
  canScroll,
  mobile = false
}) {
  const hostRef = useRef(null);
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setDark(document.documentElement.classList.contains("dark"));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  // Mermaid diagrams are inserted through dangerouslySetInnerHTML. Observe the host so
  // rendering also runs when the asynchronous Markdown parser updates its HTML.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    let cancelled = false;
    let frame = 0;
    let mermaidModulePromise;
    let renderId = 0;

    host.querySelectorAll(".mermaid").forEach((node) => {
      delete node.dataset.mermaidRendered;
      delete node.dataset.mermaidRendering;
    });

    const renderDiagrams = async () => {
      frame = 0;
      const nodes = [...host.querySelectorAll(".mermaid")].filter(
        (node) => !node.dataset.mermaidRendered && !node.dataset.mermaidRendering
      );
      if (!nodes.length) return;
      nodes.forEach((node) => { node.dataset.mermaidRendering = "1"; });

      let module;
      try {
        mermaidModulePromise ||= import("mermaid");
        module = await mermaidModulePromise;
      } catch (error) {
        if (!cancelled) {
          nodes.forEach((node) => {
            node.classList.add("mermaid-error");
            node.textContent = `Mermaid load failed: ${error?.message || "Unknown error"}`;
            delete node.dataset.mermaidRendering;
          });
        }
        return;
      }
      if (cancelled) return;
      const mermaid = module.default;
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: dark ? "dark" : "default"
      });
      for (const node of nodes) {
        try {
          const source = decodeURIComponent(node.dataset.mermaidSource || node.textContent || "");
          const result = await mermaid.render(
            `markdown-mermaid-${Date.now()}-${renderId++}`,
            source
          );
          if (!cancelled) {
            node.innerHTML = result.svg;
            node.dataset.mermaidRendered = "1";
            delete node.dataset.mermaidRendering;
          }
        } catch (error) {
          if (!cancelled) {
            node.classList.add("mermaid-error");
            node.title = error?.message || "Mermaid render failed";
            delete node.dataset.mermaidRendering;
          }
        }
      }
    };

    const scheduleRender = () => {
      if (frame || cancelled) return;
      frame = requestAnimationFrame(() => { void renderDiagrams(); });
    };
    const observer = new MutationObserver(scheduleRender);
    observer.observe(host, { childList: true, subtree: true });
    scheduleRender();

    return () => {
      cancelled = true;
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
      host.querySelectorAll(".mermaid[data-mermaid-rendering]").forEach((node) => {
        delete node.dataset.mermaidRendering;
      });
    };
  }, [dark, html]);

  async function handleClick(event) {
    const button = event.target.closest("[data-copy-code]");
    if (!button) return;
    const code = button.closest(".md-code-block")?.querySelector("code")?.textContent || "";
    try {
      await navigator.clipboard.writeText(code);
      const previous = button.textContent;
      button.textContent = "已复制";
      window.setTimeout(() => {
        if (button.isConnected) button.textContent = previous;
      }, 900);
    } catch {
      button.textContent = "复制失败";
    }
  }

  const outline = (
    <MarkdownOutline
      headings={headings}
      scrollerRef={scrollerRef}
      hostRef={hostRef}
      mobile={mobile}
    />
  );

  return (
    <div className="markdown-preview-layout">
      {mobile ? outline : null}
      <div
        ref={scrollerRef}
        className={`preview-scroll custom-scroll ${canScroll ? "" : "no-v-scroll"}`}
      >
        <div
          ref={hostRef}
          className="preview-content markdown-preview select-text"
          onClick={handleClick}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
      {!mobile ? outline : null}
    </div>
  );
}
