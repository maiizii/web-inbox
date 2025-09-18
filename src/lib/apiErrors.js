export function looksLikeTitleUnsupported(err) {
  if (!err) return false;
  const msg = (err.message || "").toLowerCase();
  return (
    (err.status === 400 || err.status === 422 || err.status === 500) &&
    msg.includes("title")
  );
}

export function looksLikeEmptyContentRejected(err) {
  if (!err) return false;
  const msg = (err.message || "").toLowerCase();
  // 常见关键词：empty, required, blank, missing
  return (
    (err.status === 400 || err.status === 422) &&
    msg.includes("content") &&
    (msg.includes("empty") ||
      msg.includes("required") ||
      msg.includes("blank") ||
      msg.includes("missing"))
  );
}
