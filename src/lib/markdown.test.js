import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://example.test" });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.NodeFilter = dom.window.NodeFilter;
globalThis.Node = dom.window.Node;
globalThis.HTMLElement = dom.window.HTMLElement;

const { renderMarkdownDocument } = await import("./markdown.js");

const sample = `---
title: 欢迎使用 Inkstone
tags: [入门, Inkstone]
---

# 欢迎使用 Inkstone

> [!TIP] 自定义标题
> Callout 内容

- [ ] 待办事项

::: tabs
@tab 第一个标签
标签一内容

@tab 第二个标签
标签二内容
:::

++插入文本++ H~2~O x^2^ ==高亮==

[[另一篇笔记|双链]] #入门

这是一段块内容。 ^markdown-demo

点击 ((markdown-demo)) 回到上面。

![[#^markdown-demo]]

##### 自定义标题 {#custom-heading .wide}

::: details [点击展开]
折叠内容
:::

~~~~md-example title="公式"
行内公式：$E = mc^2$
~~~~

$$
a^2 + b^2 = c^2
$$

\`\`\`mermaid
flowchart LR
  A --> B
\`\`\`

\`\`\`ts title="hello.ts" line-numbers {2}
const one = 1
console.log(one)
\`\`\`
`;

test("renders the Inkstone welcome document extension set", () => {
  const rendered = renderMarkdownDocument(sample);
  const root = document.createElement("div");
  root.innerHTML = rendered.html;

  assert.equal(root.querySelectorAll(".frontmatter-chip").length, 2);
  assert.equal(root.querySelector(".callout-tip .callout-title")?.textContent, "自定义标题");
  assert.ok(root.querySelector('input[type="checkbox"][data-task-line]'));
  assert.equal(root.querySelectorAll("[data-tab-button]").length, 2);
  assert.ok(root.querySelector("ins"));
  assert.ok(root.querySelector("sub"));
  assert.ok(root.querySelector("sup"));
  assert.ok(root.querySelector(".wikilink"));
  assert.ok(root.querySelector(".inline-tag"));
  assert.ok(root.querySelector('[data-block-id="markdown-demo"]'));
  assert.ok(root.querySelector('[data-block-ref="markdown-demo"]'));
  assert.ok(root.querySelector(".note-embed.ready .note-embed-body"));
  assert.equal(root.querySelector("#custom-heading")?.tagName, "H5");
  assert.ok(root.querySelector(".markdown-details"));
  assert.ok(root.querySelector(".markdown-example"));
  assert.ok(root.querySelector(".katex"));
  assert.ok(root.querySelector("[data-mermaid]"));
  assert.ok(root.querySelector(".code-block.has-line-numbers .line.highlighted"));
  assert.ok(rendered.headings.some((heading) => heading.slug === "custom-heading"));
});

test("sanitizes unsafe raw HTML while keeping safe details blocks", () => {
  const rendered = renderMarkdownDocument(`<details open><summary>标题</summary>\n\n正文\n</details>\n<script>alert(1)</script>`);
  assert.match(rendered.html, /<details open="">/);
  assert.doesNotMatch(rendered.html, /<script/i);
});
