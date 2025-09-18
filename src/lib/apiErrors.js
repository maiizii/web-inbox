export function looksLikeTitleUnsupported(err) {
  if (!err) return false;
  const msg = (err.message || "").toLowerCase();
  return (
    (err.status === 400 || err.status === 422 || err.status === 500) &&
    msg.includes("title")
  );
}
