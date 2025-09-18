import { marked } from "marked";
import DOMPurify from "dompurify";

/**
 * 保留所有空行：将（非代码块内的）纯空行替换成占位符行，
 * 渲染后再转成 <p class="md-empty-line">。
 */
marked.setOptions({
  breaks: true,
  gfm: true
});

const BLANK_TOKEN = "BLANK_LINE_X7_PLACEHOLDER";
const TOKEN_HTML_REGEX = new RegExp(`<p>${BLANK_TOKEN}</p>`, "g");
const TOKEN_HTML_STRONG_REGEX = new RegExp(`<p><strong>${BLANK_TOKEN}</strong></p>`, "g"); // 保险

function preprocess(raw = "") {
  if (!raw) return "";
  const lines = raw.split("\n");
  let inFence = false;
  const out = lines.map(line => {
    const trimmed = line.trim();
    // 处理代码围栏（``` 或 ~~~ 开头）
    if (/^```|^~~~/.test(trimmed)) {
      inFence = !inFence;
      return line;
    }
    if (!inFence && trimmed === "") {
      // 将空行替换为占位符
      return BLANK_TOKEN;
    }
    return line;
  });
  return out.join("\n");
}

export function renderMarkdown(raw = "") {
  try {
    const pre = preprocess(raw);
    let html = marked.parse(pre);
    html = DOMPurify.sanitize(html);
    // 替换占位符段落为视觉空行
    html = html
      .replace(TOKEN_HTML_REGEX, `<p class="md-empty-line" data-empty-line="true">&nbsp;</p>`)
      .replace(TOKEN_HTML_STRONG_REGEX, `<p class="md-empty-line" data-empty-line="true">&nbsp;</p>`);
    return html;
  } catch {
    return raw;
  }
}
