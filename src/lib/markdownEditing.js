function clampSelection(source, start, end) {
  const length = source.length;
  const from = Math.max(0, Math.min(Number(start) || 0, length));
  const to = Math.max(from, Math.min(Number(end) || from, length));
  return { from, to };
}

function findWord(source, from, to) {
  if (from !== to) return { from, to };
  const left = /[\p{L}\p{N}_]+$/u.exec(source.slice(0, from));
  const right = /^[\p{L}\p{N}_]+/u.exec(source.slice(to));
  return {
    from: from - (left?.[0].length || 0),
    to: to + (right?.[0].length || 0)
  };
}

function toggleWrap(source, start, end, open, close, placeholder) {
  let { from, to } = findWord(source, start, end);
  const selected = source.slice(from, to);

  if (
    from >= open.length &&
    source.slice(from - open.length, from) === open &&
    source.slice(to, to + close.length) === close
  ) {
    const content =
      source.slice(0, from - open.length) +
      selected +
      source.slice(to + close.length);
    return { content, start: from - open.length, end: to - open.length };
  }

  if (
    selected.startsWith(open) &&
    selected.endsWith(close) &&
    selected.length >= open.length + close.length
  ) {
    const inner = selected.slice(open.length, selected.length - close.length);
    const content = source.slice(0, from) + inner + source.slice(to);
    return { content, start: from, end: from + inner.length };
  }

  const value = selected || placeholder;
  const inserted = `${open}${value}${close}`;
  const content = source.slice(0, from) + inserted + source.slice(to);
  return {
    content,
    start: from + open.length,
    end: from + open.length + value.length
  };
}

const ANY_LIST_PREFIX = /^(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/;

function lineConfig(command, option) {
  if (command === "heading") {
    const level = Math.max(1, Math.min(6, Number(option) || 1));
    return {
      marker: () => `${"#".repeat(level)} `,
      target: new RegExp(`^#{${level}}\\s+`),
      replace: /^#{1,6}\s+/
    };
  }
  if (command === "bullet") {
    return {
      marker: () => "- ",
      target: /^[-*+]\s+(?!\[[ xX]\]\s+)/,
      replace: ANY_LIST_PREFIX
    };
  }
  if (command === "ordered") {
    return {
      marker: (index) => `${index + 1}. `,
      target: /^\d+[.)]\s+(?!\[[ xX]\]\s+)/,
      replace: ANY_LIST_PREFIX
    };
  }
  if (command === "task") {
    return {
      marker: () => "- [ ] ",
      target: /^(?:[-*+]|\d+[.)])\s+\[[ xX]\]\s+/,
      replace: ANY_LIST_PREFIX
    };
  }
  return {
    marker: () => "> ",
    target: /^>\s?/,
    replace: /^>\s?/
  };
}

function toggleLineStyle(source, start, end, command, option) {
  const lineStart = source.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  const effectiveEnd = end > start && source[end - 1] === "\n" ? end - 1 : end;
  const nextBreak = source.indexOf("\n", effectiveEnd);
  const lineEnd = nextBreak === -1 ? source.length : nextBreak;
  const lines = source.slice(lineStart, lineEnd).split("\n");
  const config = lineConfig(command, option);
  const parsed = lines.map((line) => {
    const indent = /^\s*/.exec(line)?.[0] || "";
    const body = line.slice(indent.length);
    return { line, indent, body, match: config.target.exec(body) };
  });
  const remove = parsed.every((line) => !!line.match);
  let cumulativeDelta = 0;
  const records = parsed.map((line, index) => {
    const oldMarker = config.replace.exec(line.body)?.[0] || "";
    const marker = remove ? "" : config.marker(index);
    const body = line.body.slice(oldMarker.length);
    const next = `${line.indent}${marker}${body}`;
    const record = {
      oldStart: lines.slice(0, index).reduce((sum, item) => sum + item.length + 1, 0),
      oldLength: line.line.length,
      oldPrefix: line.indent.length + oldMarker.length,
      newPrefix: line.indent.length + marker.length,
      deltaBefore: cumulativeDelta,
      delta: next.length - line.line.length,
      next
    };
    cumulativeDelta += record.delta;
    return record;
  });

  const transformed = records.map((record) => record.next).join("\n");
  const content = source.slice(0, lineStart) + transformed + source.slice(lineEnd);

  function mapPosition(position) {
    const relative = Math.max(0, Math.min(position - lineStart, lineEnd - lineStart));
    const record =
      records.find((item) => relative <= item.oldStart + item.oldLength) || records.at(-1);
    if (!record) return position;
    const offset = relative - record.oldStart;
    const nextOffset =
      offset <= record.oldPrefix
        ? record.newPrefix
        : offset + record.delta;
    return lineStart + record.oldStart + record.deltaBefore + nextOffset;
  }

  return {
    content,
    start: mapPosition(start),
    end: mapPosition(end)
  };
}

function insertTemplate(source, start, end, template, selectionStart, selectionLength) {
  const content = source.slice(0, start) + template + source.slice(end);
  return {
    content,
    start: start + selectionStart,
    end: start + selectionStart + selectionLength
  };
}

export function applyMarkdownCommand(source, start, end, command, option) {
  const text = String(source || "");
  const selection = clampSelection(text, start, end);
  const from = selection.from;
  const to = selection.to;

  if (command === "bold") return toggleWrap(text, from, to, "**", "**", "加粗文字");
  if (command === "italic") return toggleWrap(text, from, to, "*", "*", "斜体文字");
  if (command === "strike") return toggleWrap(text, from, to, "~~", "~~", "删除线文字");
  if (command === "inlineCode") return toggleWrap(text, from, to, "`", "`", "代码");
  if (command === "highlight") return toggleWrap(text, from, to, "==", "==", "高亮文字");
  if (command === "inserted") return toggleWrap(text, from, to, "++", "++", "插入文本");
  if (command === "subscript") return toggleWrap(text, from, to, "~", "~", "2");
  if (command === "superscript") return toggleWrap(text, from, to, "^", "^", "2");
  if (command === "inlineMath") return toggleWrap(text, from, to, "$", "$", "E = mc^2");
  if (command === "wikiLink") return toggleWrap(text, from, to, "[[", "]]", "笔记标题");
  if (command === "noteEmbed") return toggleWrap(text, from, to, "![[", "]]", "笔记标题");
  if (command === "blockReference") return toggleWrap(text, from, to, "((", "))", "block-id");

  if (["heading", "bullet", "ordered", "task", "quote"].includes(command)) {
    return toggleLineStyle(text, from, to, command, option);
  }

  const selected = text.slice(from, to);
  if (command === "link") {
    const label = selected || "链接文字";
    const url = "https://";
    const template = `[${label}](${url})`;
    return insertTemplate(text, from, to, template, label.length + 3, url.length);
  }

  if (command === "remoteImage") {
    const alt = selected || "图片描述";
    const url = "https://";
    const template = `![${alt}](${url})`;
    return insertTemplate(text, from, to, template, alt.length + 4, url.length);
  }

  if (command === "tag") {
    const value = selected || "标签";
    return insertTemplate(text, from, to, `#${value}`, 1, value.length);
  }

  if (command === "blockId") {
    const prefix = from > 0 && !/\s/.test(text[from - 1]) ? " " : "";
    const value = selected || "block-id";
    return insertTemplate(text, from, to, `${prefix}^${value}`, prefix.length + 1, value.length);
  }

  if (command === "codeBlock") {
    const value = selected || "code";
    const template = `\`\`\`\n${value}\n\`\`\`\n`;
    return insertTemplate(text, from, to, template, 4, value.length);
  }

  if (command === "advancedCode") {
    const value = selected || "code";
    const info = 'text title="" line-numbers {1}';
    const template = `\`\`\`${info}\n${value}\n\`\`\`\n`;
    return insertTemplate(text, from, to, template, 3, info.length);
  }

  if (command === "definition") {
    const term = selected || "术语";
    const template = `${term}\n: 定义\n`;
    return insertTemplate(text, from, to, template, term.length + 3, 2);
  }

  if (command === "mermaid") {
    const diagram = selected || "flowchart LR\n  A --> B";
    const template = `\`\`\`mermaid\n${diagram}\n\`\`\`\n`;
    return insertTemplate(text, from, to, template, 11, diagram.length);
  }

  if (command === "callout") {
    const value = selected || "提示内容";
    const body = value.split("\n").map((line) => `> ${line}`).join("\n");
    const template = `> [!NOTE]\n${body}\n`;
    return insertTemplate(text, from, to, template, 12, body.length);
  }

  if (command === "details") {
    const value = selected || "折叠内容";
    const title = "点击展开";
    const template = `::: details [${title}]\n${value}\n:::\n`;
    return insertTemplate(text, from, to, template, 13, title.length);
  }

  if (command === "tabs") {
    const value = selected || "第一个标签页的内容。";
    const template = `::: tabs\n@tab 第一个标签\n${value}\n\n@tab 第二个标签\n\n:::\n`;
    const position = template.indexOf("第一个标签");
    return insertTemplate(text, from, to, template, position, "第一个标签".length);
  }

  if (command === "pandocAttributes") {
    if (selected) {
      const template = `[${selected}]{#id .class}`;
      return insertTemplate(text, from, to, template, selected.length + 3, 2);
    }
    const template = " {#id .class}";
    return insertTemplate(text, from, to, template, 3, 2);
  }

  if (command === "footnote") {
    let number = 1;
    while (text.includes(`[^${number}]`)) number++;
    const reference = `[^${number}]`;
    const separator = text.endsWith("\n\n") || !text ? "" : text.endsWith("\n") ? "\n" : "\n\n";
    const definition = `${separator}[^${number}]: ${selected || "脚注内容"}`;
    const withReference = text.slice(0, from) + reference + text.slice(to);
    const content = withReference + definition;
    const definitionStart = withReference.length + separator.length + reference.length + 2;
    return {
      content,
      start: definitionStart,
      end: definitionStart + (selected || "脚注内容").length
    };
  }

  if (command === "frontMatter") {
    if (/^---\s*\n/.test(text)) {
      const position = text.indexOf("\n") + 1;
      return { content: text, start: position, end: position };
    }
    const template = "---\ntitle: \ntags: []\n---\n\n";
    return {
      content: template + text,
      start: "---\ntitle: ".length,
      end: "---\ntitle: ".length
    };
  }

  if (command === "table") {
    const template = "| 列 1 | 列 2 | 列 3 |\n| --- | --- | --- |\n|  |  |  |\n";
    return insertTemplate(text, from, to, template, 2, 3);
  }

  if (command === "math") {
    const value = selected || "a^2 + b^2 = c^2";
    const template = `$$\n${value}\n$$\n`;
    return insertTemplate(text, from, to, template, 3, value.length);
  }

  if (command === "divider") {
    const before = from > 0 && text[from - 1] !== "\n" ? "\n" : "";
    const after = to < text.length && text[to] !== "\n" ? "\n" : "";
    const template = `${before}---\n${after}`;
    return insertTemplate(text, from, to, template, template.length, 0);
  }

  return { content: text, start: from, end: to };
}
