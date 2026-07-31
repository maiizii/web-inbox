import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import "katex/dist/katex.min.css";
import MarkdownOutline from "./MarkdownOutline.jsx";

function decodeDataValue(value) {
  try {
    return decodeURIComponent(value || "");
  } catch {
    return "";
  }
}

function selectTab(button) {
  const tabs = button.closest("[data-tabs]");
  if (!tabs) return;
  const selected = button.dataset.tabButton;
  tabs.querySelectorAll("[data-tab-button]").forEach((candidate) => {
    const active = candidate.dataset.tabButton === selected;
    candidate.setAttribute("aria-selected", active ? "true" : "false");
    candidate.tabIndex = active ? 0 : -1;
  });
  tabs.querySelectorAll("[data-tab-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.tabPanel !== selected;
  });
}

export default function MarkdownPreview({
  html,
  headings,
  scrollerRef,
  canScroll,
  onTaskToggle,
  mobile = false
}) {
  const hostRef = useRef(null);
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  const [lightbox, setLightbox] = useState(null);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setDark(document.documentElement.classList.contains("dark"));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    let cancelled = false;
    let frame = 0;
    let modulePromise;
    let renderId = 0;

    host.querySelectorAll("[data-mermaid]").forEach((node) => {
      delete node.dataset.mermaidRendered;
      delete node.dataset.mermaidRendering;
    });

    const renderDiagrams = async () => {
      frame = 0;
      const nodes = [...host.querySelectorAll("[data-mermaid]")].filter(
        (node) => !node.dataset.mermaidRendered && !node.dataset.mermaidRendering
      );
      if (!nodes.length) return;
      nodes.forEach((node) => { node.dataset.mermaidRendering = "1"; });
      let module;
      try {
        modulePromise ||= import("mermaid");
        module = await modulePromise;
      } catch (error) {
        if (!cancelled) {
          nodes.forEach((node) => {
            node.classList.remove("loading");
            node.classList.add("has-error");
            node.textContent = `Mermaid 加载失败：${error?.message || "未知错误"}`;
            delete node.dataset.mermaidRendering;
          });
        }
        return;
      }
      if (cancelled) return;
      const mermaid = module.default;
      mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: dark ? "dark" : "default" });
      for (const node of nodes) {
        try {
          const source = decodeDataValue(node.dataset.mermaid);
          const result = await mermaid.render(`markdown-mermaid-${Date.now()}-${renderId++}`, source);
          if (!cancelled) {
            node.innerHTML = result.svg;
            node.classList.remove("loading", "has-error");
            node.setAttribute("aria-busy", "false");
            node.dataset.mermaidRendered = "1";
            delete node.dataset.mermaidRendering;
          }
        } catch (error) {
          if (!cancelled) {
            const source = decodeDataValue(node.dataset.mermaid);
            node.classList.remove("loading");
            node.classList.add("has-error");
            node.innerHTML = `<span class="mermaid-error-message"></span><code></code>`;
            node.querySelector(".mermaid-error-message").textContent = error?.message || "Mermaid 渲染失败";
            node.querySelector("code").textContent = source;
            node.setAttribute("aria-busy", "false");
            node.dataset.mermaidRendered = "error";
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
      host.querySelectorAll("[data-mermaid][data-mermaid-rendering]").forEach((node) => {
        delete node.dataset.mermaidRendering;
      });
    };
  }, [dark, html]);

  async function handleClick(event) {
    const target = event.target;
    const checkbox = target.closest('input[type="checkbox"][data-task-line]');
    if (checkbox) {
      const line = Number(checkbox.dataset.taskLine);
      if (Number.isInteger(line)) onTaskToggle?.(line, checkbox.checked);
      return;
    }

    const tab = target.closest("[data-tab-button]");
    if (tab) {
      event.preventDefault();
      selectTab(tab);
      return;
    }

    const button = target.closest("[data-copy-code]");
    if (button) {
      const code = button.closest(".code-block")?.querySelector("pre")?.textContent || "";
      try {
        await navigator.clipboard.writeText(code);
        const previous = button.textContent;
        button.textContent = "已复制";
        button.classList.add("copied");
        window.setTimeout(() => {
          if (button.isConnected) {
            button.textContent = previous;
            button.classList.remove("copied");
          }
        }, 900);
      } catch {
        button.textContent = "复制失败";
      }
      return;
    }

    const blockReference = target.closest("[data-block-ref]");
    if (blockReference) {
      event.preventDefault();
      const id = `^${blockReference.dataset.blockRef || ""}`;
      hostRef.current?.querySelector(`#${CSS.escape(id)}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    const wikiLink = target.closest("[data-wikilink]");
    if (wikiLink) {
      event.preventDefault();
      const raw = decodeDataValue(wikiLink.dataset.wikilink);
      const hash = raw.indexOf("#");
      if (hash >= 0) {
        const fragment = raw.slice(hash + 1).split("|")[0].trim();
        const id = fragment.startsWith("^") ? fragment : fragment.toLowerCase().replace(/\s+/g, "-").replace(/[^\p{L}\p{N}-]/gu, "");
        hostRef.current?.querySelector(`#${CSS.escape(id)}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      return;
    }

    const image = target.closest("img");
    if (image?.src) {
      event.preventDefault();
      setLightbox({ src: image.src, alt: image.alt || "图片预览" });
      return;
    }

    const anchor = target.closest('a[href^="#"]');
    if (anchor) {
      const rawId = anchor.getAttribute("href").slice(1);
      const id = decodeURIComponent(rawId);
      const element = hostRef.current?.querySelector(`#${CSS.escape(id)}`);
      if (element) {
        event.preventDefault();
        element.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  }

  const outline = (
    <MarkdownOutline headings={headings} scrollerRef={scrollerRef} hostRef={hostRef} mobile={mobile} />
  );

  return (
    <div className="markdown-preview-layout">
      {mobile ? outline : null}
      <div ref={scrollerRef} className={`preview-scroll custom-scroll ${canScroll ? "" : "no-v-scroll"}`}>
        <div
          ref={hostRef}
          className="preview-content markdown-preview select-text"
          onClick={handleClick}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
      {!mobile ? outline : null}
      {lightbox ? createPortal(
        <div className="markdown-lightbox" role="dialog" aria-modal="true" aria-label="图片预览" onClick={() => setLightbox(null)}>
          <button type="button" aria-label="关闭图片预览" title="关闭" onClick={() => setLightbox(null)}><X size={20} /></button>
          <img src={lightbox.src} alt={lightbox.alt} onClick={(event) => event.stopPropagation()} />
        </div>,
        document.body
      ) : null}
    </div>
  );
}
