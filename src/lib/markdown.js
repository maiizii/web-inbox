import DOMPurify from "dompurify";
import hljs from "highlight.js/lib/common";
import katex from "katex";
import MarkdownIt from "markdown-it";
import anchor from "markdown-it-anchor";
import container from "markdown-it-container";
import deflist from "markdown-it-deflist";
import footnote from "markdown-it-footnote";
import ins from "markdown-it-ins";
import mark from "markdown-it-mark";
import multimdTable from "markdown-it-multimd-table";
import sub from "markdown-it-sub";
import sup from "markdown-it-sup";
import taskLists from "markdown-it-task-lists";
import YAML from "yaml";
import "katex/dist/katex.min.css";

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "section";
}

function renderMath(source, displayMode) {
  try {
    return katex.renderToString(source, {
      displayMode,
      throwOnError: false,
      strict: "ignore",
      trust: false
    });
  } catch {
    return escapeHtml(source);
  }
}

function mathPlugin(md) {
  md.inline.ruler.after("escape", "math_inline", (state, silent) => {
    const start = state.pos;
    if (state.src[start] !== "$" || state.src[start + 1] === "$" || state.src[start - 1] === "\\") {
      return false;
    }
    const end = state.src.indexOf("$", start + 1);
    if (end <= start + 1 || /\s$/.test(state.src.slice(start + 1, end))) return false;
    if (!silent) {
      const token = state.push("math_inline", "math", 0);
      token.content = state.src.slice(start + 1, end);
    }
    state.pos = end + 1;
    return true;
  });
  md.renderer.rules.math_inline = (tokens, index) => renderMath(tokens[index].content, false);

  md.block.ruler.after("blockquote", "math_block", (state, startLine, endLine, silent) => {
    const start = state.bMarks[startLine] + state.tShift[startLine];
    const max = state.eMarks[startLine];
    if (state.src.slice(start, max).trim() !== "$$") return false;
    let nextLine = startLine + 1;
    while (nextLine < endLine) {
      const lineStart = state.bMarks[nextLine] + state.tShift[nextLine];
      const lineEnd = state.eMarks[nextLine];
      if (state.src.slice(lineStart, lineEnd).trim() === "$$") break;
      nextLine++;
    }
    if (nextLine >= endLine) return false;
    if (silent) return true;
    const contentStart = state.eMarks[startLine] + 1;
    const contentEnd = state.bMarks[nextLine];
    const token = state.push("math_block", "math", 0);
    token.block = true;
    token.content = state.src.slice(contentStart, contentEnd).trim();
    token.map = [startLine, nextLine + 1];
    state.line = nextLine + 1;
    return true;
  });
  md.renderer.rules.math_block = (tokens, index) =>
    `<div class="math-block">${renderMath(tokens[index].content, true)}</div>`;
}

function splitFrontMatter(source) {
  if (!/^---\s*\r?\n/.test(source)) return { body: source, properties: null };
  const match = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/.exec(source);
  if (!match || match[1].length > 64 * 1024) return { body: source, properties: null };
  try {
    const value = YAML.parse(match[1]);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { body: source.slice(match[0].length), properties: null };
    }
    return { body: source.slice(match[0].length), properties: value };
  } catch {
    return { body: source, properties: null };
  }
}

function renderProperties(properties) {
  if (!properties) return "";
  const rows = Object.entries(properties)
    .map(([key, value]) => {
      const shown = Array.isArray(value)
        ? value.join(", ")
        : value && typeof value === "object"
          ? JSON.stringify(value)
          : String(value ?? "");
      return `<div class="frontmatter-row"><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(shown)}</dd></div>`;
    })
    .join("");
  return `<details class="frontmatter-properties"><summary>文档属性</summary><dl>${rows}</dl></details>`;
}

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: false,
  breaks: true,
  highlight(code, language) {
    if (language && hljs.getLanguage(language)) {
      return hljs.highlight(code, { language, ignoreIllegals: true }).value;
    }
    return escapeHtml(code);
  }
});

md.use(anchor, { slugify });
md.use(deflist);
md.use(footnote);
md.use(ins);
md.use(mark);
md.use(multimdTable, { multiline: true, rowspan: true, headerless: true });
md.use(sub);
md.use(sup);
md.use(taskLists, { enabled: false, label: true, labelAfter: true });
md.use(container, "details", {
  validate: (params) => /^details(?:\s+.+)?$/.test(params.trim()),
  render(tokens, index) {
    if (tokens[index].nesting === 1) {
      const title = tokens[index].info.trim().replace(/^details\s*/, "") || "详情";
      return `<details class="markdown-details"><summary>${escapeHtml(title)}</summary>\n`;
    }
    return "</details>\n";
  }
});
mathPlugin(md);

const defaultFence = md.renderer.rules.fence.bind(md.renderer.rules);
md.renderer.rules.fence = (tokens, index, options, env, renderer) => {
  const token = tokens[index];
  const language = token.info.trim().split(/\s+/)[0] || "";
  if (language.toLowerCase() === "mermaid") {
    return `<figure class="mermaid-block"><div class="mermaid" data-mermaid-source="${encodeURIComponent(token.content)}">${escapeHtml(token.content)}</div></figure>`;
  }
  const rendered = defaultFence(tokens, index, options, env, renderer);
  return `<figure class="md-code-block"><figcaption><span>${escapeHtml(language || "text")}</span><button type="button" data-copy-code>复制</button></figcaption>${rendered}</figure>`;
};

md.renderer.rules.link_open = (tokens, index, options, env, renderer) => {
  const token = tokens[index];
  const hrefIndex = token.attrIndex("href");
  const href = hrefIndex >= 0 ? token.attrs[hrefIndex][1] : "";
  if (/^https?:\/\//i.test(href)) {
    token.attrSet("target", "_blank");
    token.attrSet("rel", "noopener noreferrer");
  }
  return renderer.renderToken(tokens, index, options);
};

function enhanceCallouts(root) {
  root.querySelectorAll("blockquote").forEach((blockquote) => {
    const first = blockquote.firstElementChild;
    const match = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][+-]?\s*/i.exec(first?.textContent || "");
    if (!first || !match) return;
    const kind = match[1].toLowerCase();
    first.innerHTML = first.innerHTML.replace(/^\[!(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][+-]?\s*/i, "");
    blockquote.classList.add("md-callout", `md-callout-${kind}`);
    const title = document.createElement("div");
    title.className = "md-callout-title";
    title.textContent = {
      note: "笔记",
      tip: "提示",
      important: "重要",
      warning: "警告",
      caution: "注意"
    }[kind];
    blockquote.prepend(title);
  });
}

function assignHeadingIds(root) {
  const used = new Map();
  return [...root.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((heading) => {
    const base = heading.id || slugify(heading.textContent);
    const count = used.get(base) || 0;
    used.set(base, count + 1);
    const id = count ? `${base}-${count + 1}` : base;
    heading.id = id;
    return {
      level: Number(heading.tagName.slice(1)),
      text: heading.textContent || "未命名标题",
      slug: id
    };
  });
}

function highlightSearch(root, searchQuery) {
  const query = String(searchQuery || "").trim();
  if (!query) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!node.parentElement?.closest("pre,code,script,style,mark,.katex")) nodes.push(node);
  }
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const expression = new RegExp(escaped, "gi");
  nodes.forEach((node) => {
    const value = node.nodeValue || "";
    if (!expression.test(value)) return;
    expression.lastIndex = 0;
    const fragment = document.createDocumentFragment();
    let cursor = 0;
    value.replace(expression, (match, offset) => {
      fragment.append(value.slice(cursor, offset));
      const element = document.createElement("mark");
      element.className = "search-mark";
      element.textContent = match;
      fragment.append(element);
      cursor = offset + match.length;
      return match;
    });
    fragment.append(value.slice(cursor));
    node.replaceWith(fragment);
  });
}

export function renderMarkdownDocument(raw = "", searchQuery = "") {
  try {
    const { body, properties } = splitFrontMatter(String(raw || ""));
    const rendered = renderProperties(properties) + md.render(body);
    const clean = DOMPurify.sanitize(rendered, {
      ADD_TAGS: ["details", "summary"],
      ADD_ATTR: ["target", "rel", "data-copy-code", "data-mermaid-source"]
    });
    const root = document.createElement("div");
    root.innerHTML = clean;
    enhanceCallouts(root);
    const headings = assignHeadingIds(root);
    highlightSearch(root, searchQuery);
    return { html: root.innerHTML, headings };
  } catch {
    return { html: `<pre>${escapeHtml(raw)}</pre>`, headings: [] };
  }
}

export function renderMarkdown(raw = "") {
  return renderMarkdownDocument(raw).html;
}
