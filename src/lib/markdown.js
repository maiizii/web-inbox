import { marked } from "marked";
import DOMPurify from "dompurify";

marked.setOptions({
  gfm: true,
  breaks: true
});

const EXTRA_BLANK_TOKEN = "___EXTRA_BLANK_LINE_X7___";
const TOKEN_P_REGEX = new RegExp(`<p>${EXTRA_BLANK_TOKEN}</p>`, "g");

/**
 * 处理逻辑：
 * - 扫描行，识别非代码围栏内的连续空行组。
 * - 每组保留第一行为空行（让 Markdown 知道是段落分隔）。
 * - 其余空行替换为占位符行（单独一行放 token）。
 * - 渲染后将每个 <p>token</p> 变成视觉空行。
 * - 代码块内的空行原样保留，不做替换。
 */
function injectExtraBlankTokens(raw = "") {
  const lines = raw.replace(/\r/g, "").split("\n");
  let inFence = false;
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // 代码围栏开关（``` 或 ~~~）
    if (/^(```|~~~)/.test(trimmed)) {
      inFence = !inFence;
      out.push(line);
      continue;
    }

    if (!inFence && trimmed === "") {
      // 统计这一段连续空行的长度
      let j = i;
      while (j + 1 < lines.length && lines[j + 1].trim() === "") j++;
      const groupLen = j - i + 1;

      // 第一行空行保留为空字符串
      out.push("");
      // 其余空行变 token
      for (let k = 1; k < groupLen; k++) {
        out.push(EXTRA_BLANK_TOKEN);
      }
      i = j;
      continue;
    }

    out.push(line);
  }
  return out.join("\n");
}

export function renderMarkdown(raw = "") {
  try {
    const staged = injectExtraBlankTokens(raw || "");
    let html = marked.parse(staged);
    html = DOMPurify.sanitize(html);
    html = html.replace(
      TOKEN_P_REGEX,
      `<p class="md-empty-line" data-empty-line="true">&nbsp;</p>`
    );
    return html;
  } catch {
    return raw;
  }
}
