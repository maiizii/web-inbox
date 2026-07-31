import React, { useEffect, useState } from "react";
import { ListTree } from "lucide-react";

export default function MarkdownOutline({ headings, scrollerRef, hostRef, mobile = false }) {
  const [active, setActive] = useState(headings[0]?.slug || "");

  useEffect(() => {
    setActive(headings[0]?.slug || "");
  }, [headings]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    const host = hostRef.current;
    if (!scroller || !host || !headings.length) return;

    const update = () => {
      const threshold = scroller.scrollTop + 42;
      let current = headings[0].slug;
      for (const heading of headings) {
        const element = host.querySelector(`#${CSS.escape(heading.slug)}`);
        if (element && element.offsetTop <= threshold) current = heading.slug;
        else if (element) break;
      }
      setActive(current);
    };
    update();
    scroller.addEventListener("scroll", update, { passive: true });
    return () => scroller.removeEventListener("scroll", update);
  }, [headings, hostRef, scrollerRef]);

  function jumpTo(slug) {
    const scroller = scrollerRef.current;
    const element = hostRef.current?.querySelector(`#${CSS.escape(slug)}`);
    if (!scroller || !element) return;
    scroller.scrollTo({ top: Math.max(0, element.offsetTop - 16), behavior: "smooth" });
    setActive(slug);
  }

  if (!headings.length) return null;

  if (mobile) {
    return (
      <label className="markdown-outline-mobile">
        <ListTree size={15} aria-hidden="true" />
        <select
          value={active}
          onChange={(event) => jumpTo(event.target.value)}
          aria-label="文档大纲"
        >
          {headings.map((heading, index) => (
            <option key={`${heading.slug}-${index}`} value={heading.slug}>
              {`${"  ".repeat(Math.max(0, heading.level - 1))}${heading.text}`}
            </option>
          ))}
        </select>
      </label>
    );
  }

  const minLevel = Math.min(...headings.map((heading) => heading.level));
  return (
    <aside className="markdown-outline" aria-label="文档大纲">
      <div className="markdown-outline-title"><ListTree size={14} />大纲</div>
      <nav className="markdown-outline-list custom-scroll">
        {headings.map((heading, index) => (
          <button
            key={`${heading.slug}-${index}`}
            type="button"
            className={active === heading.slug ? "active" : ""}
            style={{ paddingLeft: `${10 + (heading.level - minLevel) * 12}px` }}
            onClick={() => jumpTo(heading.slug)}
            title={heading.text}
          >
            {heading.text}
          </button>
        ))}
      </nav>
    </aside>
  );
}
