import { marked } from "marked";
import DOMPurify from "dompurify";

marked.setOptions({
  breaks: true,
  gfm: true
});

export function renderMarkdown(raw = "") {
  try {
    const html = marked.parse(raw || "");
    return DOMPurify.sanitize(html);
  } catch {
    return raw;
  }
}
