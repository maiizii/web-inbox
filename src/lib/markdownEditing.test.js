import test from "node:test";
import assert from "node:assert/strict";
import { applyMarkdownCommand } from "./markdownEditing.js";

test("wraps and unwraps a selected value", () => {
  const wrapped = applyMarkdownCommand("hello world", 6, 11, "bold");
  assert.equal(wrapped.content, "hello **world**");
  assert.deepEqual([wrapped.start, wrapped.end], [8, 13]);

  const unwrapped = applyMarkdownCommand(wrapped.content, wrapped.start, wrapped.end, "bold");
  assert.equal(unwrapped.content, "hello world");
  assert.deepEqual([unwrapped.start, unwrapped.end], [6, 11]);
});

test("formats and removes multiple list lines", () => {
  const list = applyMarkdownCommand("alpha\nbeta", 0, 10, "bullet");
  assert.equal(list.content, "- alpha\n- beta");

  const plain = applyMarkdownCommand(list.content, 2, list.content.length, "bullet");
  assert.equal(plain.content, "alpha\nbeta");
});

test("changes a heading level without duplicating the marker", () => {
  const result = applyMarkdownCommand("# Title", 2, 7, "heading", 3);
  assert.equal(result.content, "### Title");
});

test("inserts links and selects the URL", () => {
  const result = applyMarkdownCommand("OpenAI", 0, 6, "link");
  assert.equal(result.content, "[OpenAI](https://)");
  assert.equal(result.content.slice(result.start, result.end), "https://");
});

test("inserts rich block templates", () => {
  const mermaid = applyMarkdownCommand("", 0, 0, "mermaid");
  assert.match(mermaid.content, /^```mermaid/);
  assert.match(mermaid.content, /flowchart LR/);

  const details = applyMarkdownCommand("body", 0, 4, "details");
  assert.equal(details.content, "::: details [点击展开]\nbody\n:::\n");

  const frontMatter = applyMarkdownCommand("# Note", 0, 0, "frontMatter");
  assert.match(frontMatter.content, /^---\ntitle: \ntags: \[\]\n---/);
});

test("supports the complete Inkstone toolbar command set", () => {
  assert.equal(applyMarkdownCommand("text", 0, 4, "inserted").content, "++text++");
  assert.equal(applyMarkdownCommand("2", 0, 1, "subscript").content, "~2~");
  assert.equal(applyMarkdownCommand("2", 0, 1, "superscript").content, "^2^");
  assert.equal(applyMarkdownCommand("Note", 0, 4, "wikiLink").content, "[[Note]]");
  assert.equal(applyMarkdownCommand("Note", 0, 4, "noteEmbed").content, "![[Note]]");
  assert.match(applyMarkdownCommand("", 0, 0, "advancedCode").content, /line-numbers/);
  assert.match(applyMarkdownCommand("", 0, 0, "tabs").content, /^::: tabs/);
  assert.equal(applyMarkdownCommand("label", 0, 5, "pandocAttributes").content, "[label]{#id .class}");
  assert.match(applyMarkdownCommand("", 0, 0, "math").content, /^\$\$/);
});
