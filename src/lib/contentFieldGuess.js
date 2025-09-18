// 尝试从现有 block 列表推断“内容字段名”
export function guessContentField(blocks) {
  if (!Array.isArray(blocks) || !blocks.length) return "content";
  const candidateOrder = ["content", "text", "body", "data", "note", "value"];
  const sample = blocks.find(b => typeof b === "object" && b);
  if (!sample) return "content";
  for (const key of candidateOrder) {
    if (typeof sample[key] === "string") return key;
  }
  // 尝试找第一个 string 字段
  for (const [k, v] of Object.entries(sample)) {
    if (typeof v === "string" && k !== "id") return k;
  }
  return "content";
}

// 返回一组请求“方案”用于逐个尝试
export function buildCreatePayloadCandidates(fieldName, baseContent, title) {
  const contentValue = baseContent && baseContent.length ? baseContent : "New block";
  const c = fieldName || "content";

  const flat = {};
  flat[c] = contentValue;
  if (title !== undefined) flat.title = title;

  const flatNoTitle = {};
  flatNoTitle[c] = contentValue;

  // 包装格式
  const wrapped = { block: { ...flat } };
  const wrappedNoTitle = { block: { ...flatNoTitle } };

  // 返回尝试顺序（最可能成功 → 最次）
  const arr = [flat, flatNoTitle, wrapped, wrappedNoTitle];

  // 如果我们之前默认字段是 content，但推断出的 fieldName 不是 content，再追加一个 content 版本
  if (c !== "content") {
    arr.push({ content: contentValue, title });
    arr.push({ content: contentValue });
  }

  return arr;
}
