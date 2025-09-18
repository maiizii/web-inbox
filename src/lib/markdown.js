import { marked } from "marked";
import DOMPurify from "dompurify";

marked.setOptions({
  gfm: true,
  breaks: true
});

/**
 * 将非代码块内的纯空行 (只含空白) 全部替换成一个 HTML 块级占位：
 * <div class="md-empty-line" data-empty-line="1"></div>
 * 这样 Markdown 解析不会折叠它们；连续空行 => 多个连续 div。
 * 代码围栏内部保持原样。
 */
function replaceBlankLinesWithDiv(raw = "") {
  const lines = raw.replace(/\r/g, "").split("\n");
  let inFence = false;
  return lines
    .map(line => {
      const trimmed = line.trim();

      // 代码围栏开关
      if (/^(```|~~~)/.test(trimmed)) {
        inFence = !inFence;
        return line;
      }

      if (!inFence && trimmed === "") {
        return '<div class="md-empty-line" data-empty-line="1"></div>';
      }
      return line;
    })
    .join("\n");
}

export function renderMarkdown(raw = "") {
  try {
    const staged = replaceBlankLinesWithDiv(raw || "");
    let html = marked.parse(staged); // 原样透传我们插入的 div
    html = DOMPurify.sanitize(html, {
      ADD_TAGS: ["div"],
      ADD_ATTR: ["data-empty-line"]
    });
    return html;
  } catch {
    return raw;
  }
}
