import DOMPurify from "dompurify";
import hljs from "highlight.js/lib/common";
import katex from "katex";
import MarkdownIt from "markdown-it";
import anchor from "markdown-it-anchor";
import deflist from "markdown-it-deflist";
import footnote from "markdown-it-footnote";
import ins from "markdown-it-ins";
import mark from "markdown-it-mark";
import multimdTable from "markdown-it-multimd-table";
import sub from "markdown-it-sub";
import sup from "markdown-it-sup";
import taskLists from "markdown-it-task-lists";
import YAML from "yaml";

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, "&#39;").replace(/\n/g, "&#10;");
}

function encodeDataValue(value) {
  return encodeURIComponent(String(value || ""));
}

function decodeDataValue(value) {
  try {
    return decodeURIComponent(value || "");
  } catch {
    return "";
  }
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s\u3000]+/g, "-")
    .replace(/[!-/:-@[-`{-~！-～，。、；：？（）【】「」『』]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "") || "section";
}

function parseFrontMatter(source) {
  const text = source.startsWith("\uFEFF") ? source.slice(1) : source;
  const lines = text.split(/\r?\n/);
  let opening = 0;
  if (!/^---[ \t]*$/.test(lines[0] || "")) {
    const leadingTitle = (lines[0] || "").trim();
    const plainRecordTitle = leadingTitle && !/^(?:#{1,6}\s|[-+*>]\s|`{3,}|~{3,}|:{3,})/.test(leadingTitle);
    const candidate = lines[1]?.trim() ? 1 : 2;
    if (!plainRecordTitle || candidate >= lines.length || !/^---[ \t]*$/.test(lines[candidate])) {
      return { body: text, data: null, errors: [], lineOffset: 0 };
    }
    opening = candidate;
  }
  let closing = -1;
  let size = lines[opening].length;
  for (let index = opening + 1; index < lines.length; index++) {
    size += lines[index].length + 1;
    if (size > 64 * 1024) {
      return { body: text, data: null, errors: ["Front Matter 超过 64 KiB 安全上限"], lineOffset: 0 };
    }
    if (/^(?:---|\.\.\.)[ \t]*$/.test(lines[index])) {
      closing = index;
      break;
    }
  }
  if (closing < 0) return { body: text, data: null, errors: [], lineOffset: 0 };
  const raw = lines.slice(opening + 1, closing).join("\n");
  try {
    const document = YAML.parseDocument(raw, { prettyErrors: false, uniqueKeys: true });
    const errors = document.errors.map((error) => error.message);
    const value = errors.length ? null : document.toJS({ maxAliasCount: 20 });
    if (value != null && (typeof value !== "object" || Array.isArray(value))) {
      errors.push("Front Matter 顶层必须是 YAML 映射");
    }
    return {
      body: lines.slice(closing + 1).join("\n"),
      data: value && typeof value === "object" && !Array.isArray(value) ? value : null,
      errors,
      lineOffset: closing + 1
    };
  } catch (error) {
    return {
      body: lines.slice(closing + 1).join("\n"),
      data: null,
      errors: [error?.message || "YAML 语法错误"],
      lineOffset: closing + 1
    };
  }
}

function renderFrontMatter(parsed) {
  if (parsed.errors.length) {
    const items = parsed.errors.map((error) => `<li>${escapeHtml(error)}</li>`).join("");
    return `<aside class="frontmatter-error"><strong>Front Matter 解析失败</strong><ul>${items}</ul></aside>`;
  }
  if (!parsed.data) return "";
  const rows = Object.entries(parsed.data).map(([key, value]) => {
    const shown = Array.isArray(value)
      ? value.map((item) => `<span class="frontmatter-chip">${escapeHtml(item)}</span>`).join("")
      : value && typeof value === "object"
        ? `<code>${escapeHtml(JSON.stringify(value))}</code>`
        : escapeHtml(value ?? "");
    return `<div class="frontmatter-row"><dt>${escapeHtml(key)}</dt><dd>${shown}</dd></div>`;
  }).join("");
  return rows
    ? `<details class="frontmatter-properties" open><summary>属性</summary><dl>${rows}</dl></details>`
    : "";
}

function createEnvironment(overrides = {}) {
  return {
    headings: [],
    taskNonce: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
    tabSequence: 0,
    exampleSequence: 0,
    lineOffset: 0,
    ...overrides
  };
}

function blockLine(state, line) {
  const from = state.bMarks[line] + state.tShift[line];
  return state.src.slice(from, state.eMarks[line]);
}

function findContainerEnd(state, startLine, endLine, markerLength) {
  let depth = 1;
  let fence = null;
  for (let line = startLine + 1; line < endLine; line++) {
    const text = blockLine(state, line);
    const fenceMatch = /^(`{3,}|~{3,})/.exec(text);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      if (!fence) fence = { char: marker[0], length: marker.length };
      else if (marker[0] === fence.char && marker.length >= fence.length) fence = null;
      continue;
    }
    if (fence) continue;
    if (new RegExp(`^:{${markerLength},}\\s+(?:details|tabs)\\b`).test(text)) depth++;
    else if (new RegExp(`^:{${markerLength},}\\s*$`).test(text) && --depth === 0) return line;
  }
  return -1;
}

function stripBracketTitle(value) {
  const trimmed = String(value || "").trim();
  return /^\[[\s\S]*\]$/.test(trimmed) ? trimmed.slice(1, -1).trim() : trimmed;
}

function findTabSegments(state, start, end) {
  const markers = [];
  let fence = null;
  for (let line = start; line < end; line++) {
    const text = blockLine(state, line);
    const fenceMatch = /^(`{3,}|~{3,})/.exec(text);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      if (!fence) fence = { char: marker[0], length: marker.length };
      else if (marker[0] === fence.char && marker.length >= fence.length) fence = null;
      continue;
    }
    if (fence) continue;
    const tab = /^@tab[ \t]+(.+?)[ \t]*$/.exec(text);
    if (tab) markers.push({ line, title: stripBracketTitle(tab[1]) || "标签" });
  }
  return markers.map((marker, index) => ({
    title: marker.title,
    start: marker.line + 1,
    end: markers[index + 1]?.line ?? end
  }));
}

function modernContainers(md) {
  md.block.ruler.before("fence", "modern_container", (state, startLine, endLine, silent) => {
    const match = /^(:{3,})[ \t]+(details|tabs)\b(?:[ \t]+(.*))?$/.exec(blockLine(state, startLine));
    if (!match) return false;
    const markerLength = match[1].length;
    const end = findContainerEnd(state, startLine, endLine, markerLength);
    if (end < 0) return false;
    if (silent) return true;
    if (match[2] === "details") {
      const rawInfo = (match[3] || "").trim();
      const open = /^(?:open|\+)\b/.test(rawInfo);
      const title = stripBracketTitle(rawInfo.replace(/^(?:open|\+)\b[ \t]*/, "")) || "详情";
      const openToken = state.push("details_open", "details", 1);
      openToken.block = true;
      openToken.meta = { open };
      const summary = state.push("details_summary", "summary", 0);
      summary.content = title;
      state.md.block.tokenize(state, startLine + 1, end);
      state.push("details_close", "details", -1).block = true;
    } else {
      const tabs = findTabSegments(state, startLine + 1, end);
      if (!tabs.length) {
        state.line = end + 1;
        return true;
      }
      const id = `md-tabs-${++state.env.tabSequence}`;
      const openToken = state.push("tabs_open", "div", 1);
      openToken.block = true;
      openToken.meta = { id, titles: tabs.map((tab) => tab.title) };
      tabs.forEach((tab, tabIndex) => {
        const panelOpen = state.push("tab_panel_open", "section", 1);
        panelOpen.block = true;
        panelOpen.meta = { id, tabIndex };
        state.md.block.tokenize(state, tab.start, tab.end);
        const panelClose = state.push("tab_panel_close", "section", -1);
        panelClose.block = true;
        panelClose.meta = { id, tabIndex };
      });
      state.push("tabs_close", "div", -1).block = true;
    }
    state.line = end + 1;
    return true;
  });
  md.renderer.rules.details_open = (tokens, index) =>
    `<details class="markdown-details"${tokens[index].meta?.open ? " open" : ""}>`;
  md.renderer.rules.details_summary = (tokens, index) => `<summary>${escapeHtml(tokens[index].content)}</summary>`;
  md.renderer.rules.details_close = () => "</details>";
  md.renderer.rules.tabs_open = (tokens, index) => {
    const { id, titles } = tokens[index].meta;
    const buttons = titles.map((title, tabIndex) =>
      `<button type="button" role="tab" id="${id}-tab-${tabIndex}" aria-controls="${id}-panel-${tabIndex}" aria-selected="${tabIndex === 0}" tabindex="${tabIndex === 0 ? 0 : -1}" data-tab-button="${tabIndex}">${escapeHtml(title)}</button>`
    ).join("");
    return `<div class="markdown-tabs" data-tabs><div class="tab-list" role="tablist" aria-label="标签页">${buttons}</div>`;
  };
  md.renderer.rules.tabs_close = () => "</div>";
  md.renderer.rules.tab_panel_open = (tokens, index) => {
    const { id, tabIndex } = tokens[index].meta;
    return `<section class="tab-panel" role="tabpanel" id="${id}-panel-${tabIndex}" aria-labelledby="${id}-tab-${tabIndex}" data-tab-panel="${tabIndex}"${tabIndex === 0 ? "" : " hidden"}>`;
  };
  md.renderer.rules.tab_panel_close = () => "</section>";
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
    return `<code class="math-error">${escapeHtml(source)}</code>`;
  }
}

function mathPlugin(md) {
  const inlineMath = /^\$(?!\s)((?:[^$\\]|\\.)+?)(?<!\s)\$/;
  md.inline.ruler.before("escape", "math_inline", (state, silent) => {
    if (state.src[state.pos] !== "$") return false;
    const match = inlineMath.exec(state.src.slice(state.pos));
    if (!match) return false;
    if (!silent) {
      const token = state.push("math_inline", "span", 0);
      token.content = match[1];
    }
    state.pos += match[0].length;
    return true;
  });
  md.block.ruler.before("fence", "math_block", (state, startLine, endLine, silent) => {
    const first = blockLine(state, startLine);
    if (!/^\$\$/.test(first)) return false;
    let next = startLine;
    let content = "";
    let found = false;
    const firstContent = first.slice(2);
    if (firstContent.trim().endsWith("$$")) {
      content = firstContent.trim().slice(0, -2);
      found = true;
    } else {
      while (++next < endLine) {
        const line = blockLine(state, next);
        if (line.trim().endsWith("$$")) {
          content += line.slice(0, line.lastIndexOf("$$"));
          found = true;
          break;
        }
        content += `${line}\n`;
      }
      if (firstContent.trim()) content = `${firstContent}\n${content}`;
    }
    if (!found) return false;
    if (silent) return true;
    const token = state.push("math_block", "div", 0);
    token.content = content.trim();
    token.map = [startLine, next + 1];
    state.line = next + 1;
    return true;
  });
  md.renderer.rules.math_inline = (tokens, index) =>
    `<span class="math-inline">${renderMath(tokens[index].content, false)}</span>`;
  md.renderer.rules.math_block = (tokens, index) =>
    `<div class="math-block">${renderMath(tokens[index].content, true)}</div>`;
}

export function parseWikiTarget(source) {
  const pipe = source.indexOf("|");
  const rawTarget = (pipe >= 0 ? source.slice(0, pipe) : source).trim();
  const alias = pipe >= 0 ? source.slice(pipe + 1).trim() || null : null;
  let noteTitle = rawTarget;
  let heading = null;
  let blockId = null;
  if (rawTarget.startsWith("^")) {
    noteTitle = "";
    blockId = rawTarget.slice(1);
  } else {
    const hash = rawTarget.indexOf("#");
    if (hash >= 0) {
      noteTitle = rawTarget.slice(0, hash).trim();
      const fragment = rawTarget.slice(hash + 1).trim();
      if (fragment.startsWith("^")) blockId = fragment.slice(1);
      else heading = fragment || null;
    }
  }
  return { raw: rawTarget, noteTitle, heading, blockId, alias };
}

function parsePandocAttributes(source) {
  const attrs = [];
  const classes = [];
  const pattern = /(?:^|\s)(#[A-Za-z][\w:.-]{0,63}|\.[A-Za-z][\w-]{0,63}|[A-Za-z][\w:-]*(?:=(?:"[^"]*"|'[^']*'|[^\s]+))?)/g;
  for (const match of source.matchAll(pattern)) {
    const part = match[1];
    if (part.startsWith("#")) attrs.push(["id", part.slice(1)]);
    else if (part.startsWith(".")) classes.push(part.slice(1));
    else {
      const equals = part.indexOf("=");
      const name = (equals >= 0 ? part.slice(0, equals) : part).toLowerCase();
      let value = equals >= 0 ? part.slice(equals + 1) : name;
      value = value.replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/, "$1$2");
      if (!/^on/.test(name) && ["title", "width", "height", "lang", "dir", "open", "start", "startfrom", "hl_lines", "highlight"].includes(name)) {
        attrs.push([name, value.slice(0, 512)]);
      }
    }
  }
  if (classes.length) attrs.push(["class", classes.join(" ")]);
  return attrs;
}

function setTokenAttribute(token, name, value) {
  if (name !== "class") {
    token.attrSet(name, value);
    return;
  }
  const classes = token.attrGet("class")?.split(/\s+/).filter(Boolean) || [];
  value.split(/\s+/).filter(Boolean).forEach((className) => {
    if (!classes.includes(className)) classes.push(className);
  });
  token.attrSet("class", classes.join(" "));
}

function findOpeningToken(tokens, inlineIndex) {
  const previous = tokens[inlineIndex - 1];
  return previous && ["paragraph_open", "heading_open"].includes(previous.type) ? previous : null;
}

function applyInlineElementAttributes(inline) {
  const children = inline.children;
  if (!children) return;
  for (let index = 1; index < children.length; index++) {
    const text = children[index];
    if (text.type !== "text") continue;
    const match = /^\{([^{}\n]+)\}/.exec(text.content);
    if (!match) continue;
    const attrs = parsePandocAttributes(match[1]);
    if (!attrs.length) continue;
    const previous = children[index - 1];
    let target = previous.type === "image" ? previous : null;
    if (previous.type === "link_close") {
      let depth = 0;
      for (let cursor = index - 1; cursor >= 0; cursor--) {
        if (children[cursor].type === "link_close") depth++;
        if (children[cursor].type === "link_open" && --depth === 0) {
          target = children[cursor];
          break;
        }
      }
    }
    if (!target) continue;
    attrs.forEach(([name, value]) => setTokenAttribute(target, name, value));
    text.content = text.content.slice(match[0].length);
  }
}

function reparseInline(token, content, markdown, env) {
  const children = [];
  markdown.inline.parse(content, markdown, env, children);
  token.content = content;
  token.children = children;
}

function expandBlockReferences(inline, TokenConstructor) {
  if (!inline.children) return;
  const expanded = [];
  for (const child of inline.children) {
    if (child.type !== "text" || !child.content.includes("((")) {
      expanded.push(child);
      continue;
    }
    let cursor = 0;
    const pattern = /\(\(([A-Za-z0-9][A-Za-z0-9_-]{0,63})\)\)/g;
    for (const match of child.content.matchAll(pattern)) {
      if (match.index > cursor) {
        const textToken = new TokenConstructor("text", "", 0);
        textToken.content = child.content.slice(cursor, match.index);
        expanded.push(textToken);
      }
      const reference = new TokenConstructor("block_reference", "a", 0);
      reference.content = match[1];
      expanded.push(reference);
      cursor = match.index + match[0].length;
    }
    if (cursor < child.content.length) {
      const textToken = new TokenConstructor("text", "", 0);
      textToken.content = child.content.slice(cursor);
      expanded.push(textToken);
    }
  }
  inline.children = expanded;
}

function noteSyntaxPlugin(md) {
  const wiki = /^\[\[([^\[\]\n]{1,400})\]\]/;
  const embed = /^!\[\[([^\[\]\n]{1,400})\]\]/;
  const blockReference = /^\(\(([A-Za-z0-9][A-Za-z0-9_-]{0,63})\)\)/;
  const tag = /^#([\p{L}\p{N}_\-/·]{1,60})(?![\p{L}\p{N}_\-/·])/u;
  md.inline.ruler.before("image", "note_embed", (state, silent) => {
    if (!state.src.startsWith("![[", state.pos)) return false;
    const match = embed.exec(state.src.slice(state.pos));
    if (!match) return false;
    if (!silent) {
      const token = state.push("note_embed", "span", 0);
      token.content = match[1].trim();
    }
    state.pos += match[0].length;
    return true;
  });
  md.inline.ruler.before("link", "wikilink", (state, silent) => {
    if (!state.src.startsWith("[[", state.pos)) return false;
    const match = wiki.exec(state.src.slice(state.pos));
    if (!match) return false;
    if (!silent) {
      const token = state.push("wikilink", "a", 0);
      token.content = match[1].trim();
    }
    state.pos += match[0].length;
    return true;
  });
  md.inline.ruler.before("text", "block_reference", (state, silent) => {
    if (!state.src.startsWith("((", state.pos)) return false;
    const match = blockReference.exec(state.src.slice(state.pos));
    if (!match) return false;
    if (!silent) {
      const token = state.push("block_reference", "a", 0);
      token.content = match[1];
    }
    state.pos += match[0].length;
    return true;
  });
  md.inline.ruler.before("text", "inline_tag", (state, silent) => {
    if (state.src[state.pos] !== "#") return false;
    const previous = state.pos > 0 ? state.src[state.pos - 1] : " ";
    if (state.pos !== 0 && !/[\s(（[【>「『，,、;；]/.test(previous)) return false;
    const match = tag.exec(state.src.slice(state.pos));
    if (!match || /^\d+$/.test(match[1])) return false;
    if (!silent) {
      const token = state.push("inline_tag", "span", 0);
      token.content = match[1];
    }
    state.pos += match[0].length;
    return true;
  });
  md.renderer.rules.note_embed = (tokens, index) => {
    const parsed = parseWikiTarget(tokens[index].content);
    const label = parsed.alias || parsed.raw;
    return `<span class="note-embed loading" data-embed-target="${escapeAttr(encodeDataValue(parsed.raw))}"><span class="note-embed-head">${escapeHtml(label)}</span><span class="note-embed-body" aria-busy="true">正在加载…</span></span>`;
  };
  md.renderer.rules.wikilink = (tokens, index) => {
    const parsed = parseWikiTarget(tokens[index].content);
    const label = parsed.alias || parsed.raw;
    return `<a class="wikilink" data-wikilink="${escapeAttr(encodeDataValue(parsed.raw))}" href="#">${escapeHtml(label)}</a>`;
  };
  md.renderer.rules.block_reference = (tokens, index) => {
    const id = tokens[index].content;
    return `<a class="block-reference" data-block-ref="${escapeAttr(id)}" href="#%5E${escapeAttr(id)}">((${escapeHtml(id)}))</a>`;
  };
  md.renderer.rules.inline_tag = (tokens, index) =>
    `<span class="inline-tag" data-tag="${escapeAttr(encodeDataValue(tokens[index].content))}">#${escapeHtml(tokens[index].content)}</span>`;

  md.inline.ruler.before("link", "pandoc_span", (state, silent) => {
    if (state.src[state.pos] !== "[") return false;
    const match = /^\[([^\]\n]+)\]\{([^{}\n]+)\}/.exec(state.src.slice(state.pos));
    if (!match) return false;
    const attrs = parsePandocAttributes(match[2]);
    if (!attrs.length) return false;
    if (!silent) {
      const open = state.push("pandoc_span_open", "span", 1);
      open.attrs = attrs;
      const children = [];
      state.md.inline.parse(match[1], state.md, state.env, children);
      state.tokens.push(...children);
      state.push("pandoc_span_close", "span", -1);
    }
    state.pos += match[0].length;
    return true;
  });

  md.core.ruler.before("github-task-lists", "pandoc_attributes_and_blocks", (state) => {
    const seen = new Set();
    for (let index = 0; index < state.tokens.length; index++) {
      const inline = state.tokens[index];
      if (inline.type !== "inline") continue;
      expandBlockReferences(inline, state.Token);
      applyInlineElementAttributes(inline);
      const opening = findOpeningToken(state.tokens, index);
      if (!opening) continue;
      let content = inline.content;
      const attributes = /(?:^|\s)\{([^{}\n]+)\}\s*$/.exec(content);
      if (attributes) {
        const attrs = parsePandocAttributes(attributes[1]);
        if (attrs.length) {
          attrs.forEach(([name, value]) => setTokenAttribute(opening, name, value));
          content = content.slice(0, attributes.index).trimEnd();
        }
      }
      const block = /(?:^|\s)\^([A-Za-z0-9][A-Za-z0-9_-]{0,63})\s*$/.exec(content);
      if (block) {
        const base = block[1];
        let id = base;
        let suffix = 2;
        while (seen.has(id)) id = `${base}-${suffix++}`;
        seen.add(id);
        opening.attrSet("id", `^${id}`);
        opening.attrSet("data-block-id", id);
        content = content.slice(0, block.index).trimEnd();
      }
      if (content !== inline.content) reparseInline(inline, content, state.md, state.env);
    }
    return true;
  });
}

function matchingClose(tokens, start, openType, closeType) {
  let depth = 0;
  for (let index = start; index < tokens.length; index++) {
    if (tokens[index].type === openType) depth++;
    else if (tokens[index].type === closeType && --depth === 0) return index;
  }
  return -1;
}

function normalizeCalloutType(value) {
  const type = value.toLowerCase();
  const aliases = {
    summary: "abstract", tldr: "abstract", hint: "tip", important: "tip",
    check: "success", done: "success", help: "question", faq: "question",
    caution: "warning", attention: "warning", fail: "failure", missing: "failure",
    error: "danger", bug: "danger", cite: "quote"
  };
  return aliases[type] || type.replace(/[^a-z0-9_-]/g, "") || "note";
}

function calloutTitle(type) {
  return {
    note: "提示", abstract: "摘要", info: "信息", todo: "待办", tip: "技巧",
    success: "成功", question: "问题", warning: "警告", failure: "失败",
    danger: "危险", example: "示例", quote: "引用"
  }[type] || type;
}

function calloutPlugin(md) {
  md.core.ruler.after("github-task-lists", "obsidian_callouts", (state) => {
    for (let index = 0; index < state.tokens.length; index++) {
      const open = state.tokens[index];
      if (open.type !== "blockquote_open") continue;
      const paragraphOpen = state.tokens[index + 1];
      const inline = state.tokens[index + 2];
      if (paragraphOpen?.type !== "paragraph_open" || inline?.type !== "inline") continue;
      const firstBreak = inline.content.indexOf("\n");
      const firstLine = firstBreak >= 0 ? inline.content.slice(0, firstBreak) : inline.content;
      const marker = /^\[!([A-Za-z][A-Za-z0-9_-]{0,31})\]([+-])?(?:[ \t]+(.+?))?[ \t]*$/.exec(firstLine);
      if (!marker) continue;
      const closeIndex = matchingClose(state.tokens, index, "blockquote_open", "blockquote_close");
      if (closeIndex < 0) continue;
      const type = normalizeCalloutType(marker[1]);
      const fold = marker[2] || "";
      const title = marker[3]?.trim() || calloutTitle(type);
      open.type = "callout_open";
      open.tag = fold ? "details" : "aside";
      open.meta = { type, title, fold };
      const close = state.tokens[closeIndex];
      close.type = "callout_close";
      close.tag = open.tag;
      close.meta = { fold };
      const remaining = firstBreak >= 0 ? inline.content.slice(firstBreak + 1) : "";
      if (remaining.trim()) reparseInline(inline, remaining, state.md, state.env);
      else if (state.tokens[index + 3]?.type === "paragraph_close") state.tokens.splice(index + 1, 3);
    }
    return true;
  });
  md.renderer.rules.callout_open = (tokens, index) => {
    const { type, title, fold } = tokens[index].meta;
    return fold
      ? `<details class="callout callout-${escapeAttr(type)}" data-callout="${escapeAttr(type)}"${fold === "+" ? " open" : ""}><summary class="callout-title">${escapeHtml(title)}</summary><div class="callout-content">`
      : `<aside class="callout callout-${escapeAttr(type)}" data-callout="${escapeAttr(type)}"><div class="callout-title">${escapeHtml(title)}</div><div class="callout-content">`;
  };
  md.renderer.rules.callout_close = (tokens, index) => `</div>${tokens[index].meta.fold ? "</details>" : "</aside>"}`;
}

function taskPlaceholderPlugin(md) {
  md.core.ruler.after("github-task-lists", "trusted_task_placeholders", (state) => {
    for (let index = 2; index < state.tokens.length; index++) {
      const inline = state.tokens[index];
      const paragraph = state.tokens[index - 1];
      const item = state.tokens[index - 2];
      if (inline.type !== "inline" || paragraph.type !== "paragraph_open" || item.type !== "list_item_open" || !inline.children?.length) continue;
      const checkboxIndex = inline.children.findIndex((child) =>
        child.type === "html_inline" && /task-list-item-checkbox/.test(child.content)
      );
      if (checkboxIndex < 0 || item.map?.[0] == null) continue;
      const checkbox = inline.children[checkboxIndex];
      const checked = /\schecked(?:=|\s|>)/.test(checkbox.content);
      const sourceLine = item.map[0] + (state.env.lineOffset || 0);
      checkbox.content = `<span class="task-checkbox-placeholder" data-task-placeholder="${escapeAttr(state.env.taskNonce)}" data-task-line="${sourceLine}" data-task-checked="${checked ? 1 : 0}"></span>`;
      const labelOpen = new state.Token("html_inline", "", 0);
      labelOpen.content = '<span class="task-label">';
      const labelClose = new state.Token("html_inline", "", 0);
      labelClose.content = "</span>";
      inline.children.splice(checkboxIndex + 1, 0, labelOpen);
      inline.children.push(labelClose);
      item.attrSet("data-task-line", String(sourceLine));
      if (checked) item.attrJoin("class", "done");
    }
    return true;
  });
}

function parseLineSpec(source) {
  const lines = new Set();
  for (const part of String(source || "").split(/[ ,]+/).filter(Boolean).slice(0, 200)) {
    const range = /^(\d+)-(\d+)$/.exec(part);
    if (range) {
      const from = Math.max(1, Number(range[1]));
      const to = Math.min(from + 1000, Math.max(from, Number(range[2])));
      for (let line = from; line <= to; line++) lines.add(line);
    } else if (/^\d+$/.test(part)) lines.add(Math.max(1, Number(part)));
  }
  return [...lines];
}

function parseFenceInfo(source) {
  let rest = source.trim();
  let language = "";
  let title = "";
  let lineNumbers = false;
  let startLine = 1;
  const highlighted = new Set();
  const leadingPandoc = /^\{([^{}]+)\}/.exec(rest);
  const attrs = leadingPandoc ? parsePandocAttributes(leadingPandoc[1]) : [];
  if (leadingPandoc) {
    const classes = attrs.filter(([name]) => name === "class").flatMap(([, value]) => value.split(/\s+/));
    language = classes.find((name) => !["numberlines", "line-numbers", "linenos"].includes(name.toLowerCase())) || "";
    lineNumbers = classes.some((name) => ["numberlines", "line-numbers", "linenos"].includes(name.toLowerCase()));
    rest = rest.slice(leadingPandoc[0].length).trim();
  }
  if (!language) {
    const match = /^([^\s{]+)/.exec(rest);
    if (match) {
      language = match[1].toLowerCase();
      rest = rest.slice(match[0].length).trim();
    }
  }
  const titleMatch = /(?:^|\s)title=(?:"([^"]*)"|'([^']*)'|([^\s]+))/.exec(rest);
  title = titleMatch?.[1] ?? titleMatch?.[2] ?? titleMatch?.[3] ?? attrs.find(([name]) => name === "title")?.[1] ?? "";
  const bracketTitle = /(?:^|\s)\[([^\]\n]+)\]/.exec(rest);
  if (!title && bracketTitle) title = bracketTitle[1].trim();
  lineNumbers ||= /(?:^|\s)(?:line-numbers|linenos|numberLines)(?=\s|$)/.test(rest);
  const start = /(?:^|\s)(?:start|startFrom)=(?:"(\d+)"|'(\d+)'|(\d+))/.exec(rest);
  if (start) startLine = Math.max(1, Number(start[1] ?? start[2] ?? start[3]));
  const highlight = /(?:^|\s)\{(\d[\d,\s-]*)\}/.exec(rest);
  if (highlight) parseLineSpec(highlight[1]).forEach((line) => highlighted.add(line));
  return { language, title, lineNumbers, startLine, highlightedLines: [...highlighted], attrs };
}

function highlightedCode(code, info) {
  const output = info.language && hljs.getLanguage(info.language)
    ? hljs.highlight(code, { language: info.language, ignoreIllegals: true }).value
    : escapeHtml(code);
  const lines = output.replace(/\n$/, "").split("\n");
  return lines.map((line, index) => {
    const lineNumber = info.startLine + index;
    const active = info.highlightedLines.includes(lineNumber) ? " highlighted" : "";
    return `<span class="line${active}" data-line-number="${lineNumber}">${line || " "}</span>`;
  }).join("\n");
}

const md = new MarkdownIt({ html: true, linkify: true, breaks: false, typographer: false });
md.use(taskLists, { enabled: true, label: false })
  .use(footnote)
  .use(mark)
  .use(ins)
  .use(sub)
  .use(sup)
  .use(deflist)
  .use(multimdTable, { multiline: true, rowspan: true, headerless: true })
  .use(anchor, {
    slugify,
    permalink: anchor.permalink.linkInsideHeader({
      symbol: "",
      placement: "before",
      class: "heading-anchor",
      ariaHidden: true
    })
  });
modernContainers(md);
mathPlugin(md);
noteSyntaxPlugin(md);
calloutPlugin(md);
taskPlaceholderPlugin(md);

md.renderer.rules.fence = (tokens, index, _options, env) => {
  const token = tokens[index];
  const info = parseFenceInfo(token.info);
  if (["md-example", "markdown-example"].includes(info.language)) {
    const exampleId = ++env.exampleSequence;
    const childEnv = createEnvironment({
      taskNonce: env.taskNonce,
      tabSequence: env.tabSequence,
      exampleSequence: env.exampleSequence,
      lineOffset: 0
    });
    const preview = md.render(token.content, childEnv).replace(/ data-line="\d+"/g, "");
    env.tabSequence = childEnv.tabSequence;
    env.exampleSequence = Math.max(env.exampleSequence, childEnv.exampleSequence);
    const title = info.title || "Markdown 示例";
    return [
      `<section class="markdown-example" data-example-source="${escapeAttr(encodeDataValue(token.content))}">`,
      `<div class="markdown-example-head"><span class="markdown-example-title">${escapeHtml(title)}</span></div>`,
      '<div class="markdown-example-grid">',
      `<section class="markdown-example-preview" aria-label="预览"><div class="markdown-example-preview-body">${preview}</div></section>`,
      '<section class="markdown-example-source" aria-label="Markdown">',
      '<div class="code-block markdown-example-code" data-lang="markdown">',
      '<button class="code-copy markdown-example-copy" data-copy-code type="button">复制</button>',
      `<pre><code>${highlightedCode(token.content, { language: "markdown", startLine: 1, highlightedLines: [] })}</code></pre>`,
      "</div></section></div></section>"
    ].join("");
  }
  if (info.language === "mermaid") {
    return `<div class="mermaid-block loading" data-mermaid="${escapeAttr(encodeDataValue(token.content))}" aria-busy="true">正在绘制图表…</div>`;
  }
  const title = info.title || info.language || "代码";
  const classes = info.attrs.filter(([name]) => name === "class").map(([, value]) => value).join(" ");
  const id = info.attrs.find(([name]) => name === "id")?.[1];
  return [
    `<div class="code-block${classes ? ` ${escapeAttr(classes)}` : ""}${info.lineNumbers ? " has-line-numbers" : ""}"${id ? ` id="${escapeAttr(id)}"` : ""} data-lang="${escapeAttr(info.language)}">`,
    '<div class="code-block-head">',
    `<span class="code-title">${escapeHtml(title)}</span>`,
    info.title && info.language ? `<span class="code-lang">${escapeHtml(info.language)}</span>` : "",
    '<button class="code-copy" data-copy-code type="button">复制</button>',
    "</div>",
    `<pre><code>${highlightedCode(token.content, info)}</code></pre>`,
    "</div>"
  ].join("");
};

md.renderer.rules.table_open = () => '<div class="table-wrap"><table>';
md.renderer.rules.table_close = () => "</table></div>";
const defaultImage = md.renderer.rules.image;
md.renderer.rules.image = (tokens, index, options, env, renderer) => {
  const token = tokens[index];
  token.attrSet("loading", "lazy");
  token.attrSet("decoding", "async");
  const title = token.attrGet("title");
  const image = defaultImage
    ? defaultImage(tokens, index, options, env, renderer)
    : renderer.renderToken(tokens, index, options);
  return title ? `<figure>${image}<figcaption>${escapeHtml(title)}</figcaption></figure>` : image;
};
const defaultLink = md.renderer.rules.link_open;
md.renderer.rules.link_open = (tokens, index, options, env, renderer) => {
  const href = tokens[index].attrGet("href") || "";
  if (/^https?:/i.test(href)) {
    tokens[index].attrSet("target", "_blank");
    tokens[index].attrSet("rel", "noopener noreferrer");
  }
  return defaultLink
    ? defaultLink(tokens, index, options, env, renderer)
    : renderer.renderToken(tokens, index, options);
};

md.core.ruler.push("source_lines", (state) => {
  for (const token of state.tokens) {
    if (token.map && token.type.endsWith("_open") && token.level === 0) {
      token.attrSet("data-line", String(token.map[0] + (state.env.lineOffset || 0)));
    }
  }
  return true;
});

md.core.ruler.push("collect_headings", (state) => {
  state.env.headings = [];
  for (let index = 0; index < state.tokens.length; index++) {
    const token = state.tokens[index];
    if (token.type !== "heading_open") continue;
    const inline = state.tokens[index + 1];
    const text = inline?.children
      ?.filter((child) => ["text", "code_inline", "inline_tag", "wikilink", "block_reference"].includes(child.type))
      .map((child) => child.content)
      .join("")
      .trim() || inline?.content || "";
    state.env.headings.push({
      level: Number(token.tag.slice(1)),
      text,
      slug: token.attrGet("id") || slugify(text),
      line: token.map?.[0] ?? 0
    });
  }
  return true;
});

const purifyConfig = {
  ADD_TAGS: ["figure", "figcaption", "details", "summary"],
  ADD_ATTR: [
    "target", "rel", "loading", "decoding", "open", "hidden", "role", "tabindex",
    "aria-busy", "aria-label", "aria-selected", "aria-controls", "aria-labelledby",
    "data-line", "data-copy-code", "data-mermaid", "data-wikilink", "data-embed-target",
    "data-block-ref", "data-block-id", "data-tag", "data-task-placeholder", "data-task-line",
    "data-task-checked", "data-tabs", "data-tab-button", "data-tab-panel", "data-callout",
    "data-example-source", "data-line-number", "align", "colspan", "rowspan", "width", "height"
  ],
  FORBID_TAGS: ["style", "script", "iframe", "object", "embed", "form", "input", "link", "base"],
  FORBID_ATTR: ["style", "onerror", "onload", "onclick", "onchange", "oninput", "onfocus", "srcdoc", "action", "formaction"],
  ALLOW_DATA_ATTR: true
};

function extractHeadingSection(markdown, heading) {
  const lines = markdown.split(/\r?\n/);
  const wanted = slugify(heading);
  for (let index = 0; index < lines.length; index++) {
    const match = /^[ \t]{0,3}(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*(?:\{[^{}]+\})?$/.exec(lines[index]);
    if (!match || slugify(match[2].replace(/[*_~`=+]/g, "")) !== wanted) continue;
    const level = match[1].length;
    let end = lines.length;
    for (let cursor = index + 1; cursor < lines.length; cursor++) {
      const next = /^[ \t]{0,3}(#{1,6})[ \t]+/.exec(lines[cursor]);
      if (next && next[1].length <= level) {
        end = cursor;
        break;
      }
    }
    return lines.slice(index, end).join("\n").trim();
  }
  return null;
}

function extractBlock(markdown, blockId) {
  const safeId = blockId.replace(/[^A-Za-z0-9_-]/g, "");
  if (!safeId) return null;
  const marker = new RegExp(`(?:^|\\s)\\^${safeId}[ \\t]*$`);
  const lines = markdown.split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    if (!marker.test(lines[index])) continue;
    const cleaned = lines[index].replace(marker, "").trimEnd();
    if (/^[ \t]*(?:[-+*]|\d+[.)])[ \t]+/.test(lines[index])) return cleaned.trim();
    let start = index;
    while (start > 0 && lines[start - 1].trim() && !/^ {0,3}#{1,6}\s/.test(lines[start - 1])) start--;
    return [...lines.slice(start, index), cleaned].join("\n").trim();
  }
  return null;
}

function resolveLocalEmbeds(root, source, currentTitle, depth = 0, taskNonce = "") {
  if (depth >= 4) return;
  const embeds = [...root.querySelectorAll("[data-embed-target]")];
  embeds.forEach((embed) => {
    if (embed.closest(".note-embed-body") && !root.classList.contains("note-embed-body")) return;
    const parsed = parseWikiTarget(decodeDataValue(embed.dataset.embedTarget));
    const example = embed.closest("[data-example-source]");
    const scopedSource = example ? decodeDataValue(example.dataset.exampleSource) : source;
    const frontMatter = parseFrontMatter(scopedSource);
    const scopedTitle = frontMatter.data?.title || currentTitle;
    const sameNote = !parsed.noteTitle || !scopedTitle || parsed.noteTitle.trim().toLowerCase() === String(scopedTitle).trim().toLowerCase();
    let markdown = null;
    if (sameNote) {
      if (parsed.blockId) markdown = extractBlock(frontMatter.body, parsed.blockId);
      else if (parsed.heading) markdown = extractHeadingSection(frontMatter.body, parsed.heading);
      else markdown = frontMatter.body;
    }
    const body = embed.querySelector(".note-embed-body");
    if (!body || !markdown) {
      embed.classList.remove("loading");
      embed.classList.add("error");
      if (body) body.textContent = "嵌入的笔记或内容不存在";
      return;
    }
    const childEnv = createEnvironment({ taskNonce, lineOffset: 0 });
    body.innerHTML = DOMPurify.sanitize(md.render(markdown, childEnv), purifyConfig);
    body.removeAttribute("aria-busy");
    embed.classList.remove("loading", "error");
    embed.classList.add("ready");
    resolveLocalEmbeds(body, scopedSource, scopedTitle, depth + 1, taskNonce);
  });
}

function materializeTasks(root, nonce) {
  root.querySelectorAll("[data-task-placeholder]").forEach((placeholder) => {
    if (placeholder.dataset.taskPlaceholder !== nonce) return;
    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = "task-list-item-checkbox";
    input.checked = placeholder.dataset.taskChecked === "1";
    if (input.checked) input.setAttribute("checked", "");
    const readonly = !!placeholder.closest(".markdown-example-preview,.note-embed-body");
    input.disabled = readonly;
    if (!readonly) input.dataset.taskLine = placeholder.dataset.taskLine;
    input.setAttribute("aria-label", input.checked ? "标记为未完成" : "标记为已完成");
    placeholder.replaceWith(input);
  });
}

function highlightSearch(root, searchQuery) {
  const query = String(searchQuery || "").trim();
  if (!query) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!node.parentElement?.closest("pre,code,script,style,mark,.katex,button")) nodes.push(node);
  }
  const expression = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
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
    const source = String(raw || "");
    const parsed = parseFrontMatter(source);
    const env = createEnvironment({ lineOffset: parsed.lineOffset });
    const rendered = renderFrontMatter(parsed) + md.render(parsed.body, env);
    const root = document.createElement("div");
    root.innerHTML = DOMPurify.sanitize(rendered, purifyConfig);
    resolveLocalEmbeds(root, source, parsed.data?.title || "", 0, env.taskNonce);
    materializeTasks(root, env.taskNonce);
    highlightSearch(root, searchQuery);
    return { html: root.innerHTML, headings: env.headings };
  } catch (error) {
    return {
      html: `<pre class="markdown-render-error">${escapeHtml(error?.message || raw)}</pre>`,
      headings: []
    };
  }
}

export function renderMarkdown(raw = "") {
  return renderMarkdownDocument(raw).html;
}
