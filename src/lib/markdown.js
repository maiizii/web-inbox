import { marked } from "marked";
import DOMPurify from "dompurify";

marked.setOptions({
  gfm: true,
  breaks: true
});

// 占位符（避免 markdown 语义触发，使用纯大写+数字+下划线）
const BLANK_TOKEN = "MD_BLK_LINE_X7_TOKEN";
const BLANK_P_REGEX = new RegExp(`<p>${BLANK_TOKEN}</p>`, "g");

/**
 * 兼容宽松图片语法：允许 ] 与 ( 之间出现空白
 * 例: ![alt] (/path)  -> ![alt](/path)
 */
function normalizeLooseImageSyntax(raw = "") {
  return raw.replace(/!\[([^\]]*?)\]\s+\(/g, (_m, alt) => `![${alt}](`);
}

/**
 * 将 非代码围栏 中的每一条“纯空行”都替换成占位符行。
 * 这样每个空行都会在 markdown 解析后成为一个 <p>...</p>，
 * 再统一替换为视觉空行段落。
 */
function tagEveryBlankLine(raw = "") {
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
        return BLANK_TOKEN;
      }
      return line;
    })
    .join("\n");
}

export function renderMarkdown(raw = "") {
  try {
    const step1 = normalizeLooseImageSyntax(raw || "");
    const staged = tagEveryBlankLine(step1);
    let html = marked.parse(staged);
    html = DOMPurify.sanitize(html, {
      ADD_TAGS: ["p"],          // p 默认允许，这里显式列出以示意
      ADD_ATTR: ["class", "data-empty-line"]
    });
    // 将占位 <p> 替换为空行段落
    html = html.replace(
      BLANK_P_REGEX,
      `<p class="md-empty-line" data-empty-line="true">&nbsp;</p>`
    );
    return html;
  } catch {
    return raw;
  }
}
