import { marked } from "marked";
import DOMPurify from "dompurify";

// 保留 gfm / 换行（单行换行 -> <br>）
marked.setOptions({
  breaks: true,
  gfm: true
});

// 用一个极少出现的占位符标记额外空行
const BLANK_TOKEN = "__BLANK_LINE_X7__";
const BLANK_TOKEN_HTML = new RegExp(`<p>${BLANK_TOKEN}</p>`, "g");

/**
 * 预处理：对 2 行以上的连续空行，只保留前 2 行为普通段落分隔，
 * 多出的行用占位标记（每行一个）替代；渲染后再转成视觉空行。
 */
function preprocess(raw = "") {
  return raw.replace(/\n{2,}/g, (m) => {
    if (m.length <= 2) return m;
    const extra = m.length - 2;
    const fillers = Array(extra).fill(BLANK_TOKEN).join("\n");
    return "\n\n" + fillers + "\n";
  });
}

export function renderMarkdown(raw = "") {
  try {
    const pre = preprocess(raw || "");
    const html = marked.parse(pre);
    // 先 sanitize
    let safe = DOMPurify.sanitize(html);
    // 再把占位符替换成真正的“空行段落”
    safe = safe.replace(
      BLANK_TOKEN_HTML,
      `<p class="md-empty-line" data-empty-line="true">&nbsp;</p>`
    );
    return safe;
  } catch {
    return raw;
  }
}
