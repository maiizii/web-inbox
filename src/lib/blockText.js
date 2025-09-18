// 工具：从 block 中派生标题与摘要，并判断后端是否不支持 title 字段

export function deriveTitle(block) {
  if (!block) return "";
  if (typeof block.title === "string" && block.title.trim()) {
    return block.title.trim();
  }
  const firstLine = (block.content || "").split("\n")[0] || "";
  return firstLine.replace(/^#+\s*/, "").trim().slice(0, 60);
}

export function deriveExcerpt(block) {
  if (!block) return "";
  const lines = (block.content || "").split("\n");
  if (lines.length > 1) {
    lines.shift(); // 去掉第一行
  }
  const rest = lines.join(" ").replace(/[#>*`!_\[\]\(\)]/g, " ");
  return rest.trim().slice(0, 60);
}

export function looksLikeTitleUnsupported(err) {
  if (!err) return false;
  const msg = (err.message || "").toLowerCase();
  return (
    (err.status === 400 || err.status === 422 || err.status === 500) &&
    msg.includes("title")
  );
}
