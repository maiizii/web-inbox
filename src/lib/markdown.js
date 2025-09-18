import { marked } from "marked";
import DOMPurify from "dompurify";

marked.setOptions({
  gfm: true,
  breaks: true
});

// 兼容：![alt] (/path)  => ![alt](/path)
function normalizeLooseImageSyntax(raw = "") {
  return raw.replace(/!\[([^\]]*?)\]\s+\(/g, (_m, alt) => `![${alt}](`);
}

/**
 * 将“非代码围栏”里的所有纯空行替换成 <md-blank></md-blank>
 * - 代码围栏内不动
 * - 连续 N 个空行 => N 个 <md-blank>，1:1
 */
function replaceBlankLines(raw = "") {
  const lines = raw.replace(/\r/g, "").split("\n");
  let inFence = false;
  return lines
    .map(line => {
      const trimmed = line.trim();
      if (/^(```|~~~)/.test(trimmed)) {
        inFence = !inFence;
        return line; // 保留围栏分隔行
      }
      if (!inFence && trimmed === "") {
        return "<md-blank></md-blank>";
      }
      return line;
    })
    .join("\n");
}

export function renderMarkdown(raw = "") {
  try {
    const step1 = normalizeLooseImageSyntax(raw || "");
    const staged = replaceBlankLines(step1);
    let html = marked.parse(staged);
    // 允许自定义标签 md-blank
    html = DOMPurify.sanitize(html, {
      ADD_TAGS: ["md-blank"]
    });
    return html;
  } catch {
    return raw;
  }
}
