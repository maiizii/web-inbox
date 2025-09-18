import { marked } from "marked";
import DOMPurify from "dompurify";

marked.setOptions({
  gfm: true,
  breaks: true
});

// 用于额外空行的占位符（必须是不会触发其它解析的简单大写串）
const BLANK_PH = "MD_EXTRA_BLANK_X7";
const BLANK_P_REGEX = new RegExp(`<p>${BLANK_PH}</p>`, "g");

/**
 * 兼容宽松图片语法：允许 ] 和 ( 之间有空白
 * 例如: ![alt] (/api/images/xxx) 或 ![alt]   (/url)
 */
function normalizeLooseImageSyntax(raw = "") {
  return raw.replace(/!\[([^\]]*?)\]\s+\(/g, (_m, alt) => `![${alt}](`);
}

/**
 * 多空行保留策略：
 *  - 找出连续空行组（非代码围栏内）。
 *  - 第一行空行原样保留（即真正的空行）。
 *  - 其余每个“额外空行”替换成：
 *        BLANK_PH
 *        （然后紧跟一个空行）
 *    这样 Marked 会把 BLANK_PH 独立成一个 <p> 段落。
 *  - 解析后再把 <p>BLANK_PH</p> 替换成 <p class="md-empty-line">&nbsp;</p>
 * 代码围栏内部一律不动。
 */
function encodeExtraBlankLines(raw = "") {
  const lines = raw.replace(/\r/g, "").split("\n");
  let inFence = false;
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // 代码围栏开关
    if (/^(```|~~~)/.test(trimmed)) {
      inFence = !inFence;
      out.push(line);
      continue;
    }

    if (!inFence && trimmed === "") {
      // 统计连续空行
      let j = i;
      while (j + 1 < lines.length && lines[j + 1].trim() === "") j++;
      const count = j - i + 1;

      // 保留首个空行（一个真正的空行）
      out.push(""); // 第一行
      // 余下每个空行：占位符行 + 一个空行（确保单独段落）
      for (let k = 1; k < count; k++) {
        out.push(BLANK_PH);
        out.push("");
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
    const step1 = normalizeLooseImageSyntax(raw || "");
    const staged = encodeExtraBlankLines(step1);
    let html = marked.parse(staged);
    // 允许我们需要的标签/属性（默认已允许 <img>）
    html = DOMPurify.sanitize(html, {
      ADD_TAGS: ["p"],
      ADD_ATTR: ["class", "data-empty-line"]
    });
    // 占位符替换成真正的空行段落
    html = html.replace(
      BLANK_P_REGEX,
      `<p class="md-empty-line" data-empty-line="true">&nbsp;</p>`
    );
    return html;
  } catch {
    return raw;
  }
}
