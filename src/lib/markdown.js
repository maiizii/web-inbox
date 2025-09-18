import { marked } from "marked";
import DOMPurify from "dompurify";

marked.setOptions({
  gfm: true,
  breaks: true
});

// 规范化非标准的图片语法：允许 ] 和 ( 之间出现一个或多个空白
function normalizeLooseImageSyntax(raw = "") {
  return raw.replace(/!\[([^\]]*?)\]\s+\(/g, (_m, alt) => `![${alt}](`);
}

/**
 * 将非代码围栏内的纯空行替换为一个块级占位 <div class="md-empty-line">
 * 连续空行 => 多个 div，保证视觉 1:1；代码块内部保持原样。
 */
function replaceBlankLinesWithDiv(raw = "") {
  const lines = raw.replace(/\r/g, "").split("\n");
  let inFence = false;
  return lines
    .map(line => {
      const trimmed = line.trim();
      if (/^(```|~~~)/.test(trimmed)) {
        inFence = !inFence;
        return line; // 保留围栏行
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
    const step1 = normalizeLooseImageSyntax(raw || "");
    const staged = replaceBlankLinesWithDiv(step1);
    let html = marked.parse(staged);
    // 允许 div + data-empty-line
    html = DOMPurify.sanitize(html, {
      ADD_TAGS: ["div"],
      ADD_ATTR: ["data-empty-line"]
    });
    return html;
  } catch {
    return raw;
  }
}
