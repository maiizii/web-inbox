import React from "react";
import {
  Bold,
  Blocks,
  Braces,
  ChevronDown,
  Code,
  Heading,
  Highlighter,
  Image as ImageIcon,
  Italic,
  Link2,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  Quote,
  Sigma,
  Strikethrough,
  Table
} from "lucide-react";

function ToolButton({ label, onClick, children }) {
  return (
    <button
      type="button"
      className="md-toolbar-button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="md-toolbar-divider" aria-hidden="true" />;
}

export default function MarkdownToolbar({ onCommand, onPickImage }) {
  return (
    <div className="md-toolbar custom-scroll" role="toolbar" aria-label="Markdown 快捷编辑栏">
      <label className="md-toolbar-heading" title="标题级别">
        <Heading size={15} aria-hidden="true" />
        <ChevronDown size={11} aria-hidden="true" />
        <select
          value=""
          onChange={(event) => onCommand("heading", Number(event.target.value))}
          aria-label="标题级别"
        >
          <option value="" disabled>标题级别</option>
          {[1, 2, 3, 4, 5, 6].map((level) => (
            <option key={level} value={level}>标题 {level}</option>
          ))}
        </select>
      </label>

      <Divider />
      <ToolButton label="加粗 (Ctrl+B)" onClick={() => onCommand("bold")}><Bold size={15} /></ToolButton>
      <ToolButton label="斜体 (Ctrl+I)" onClick={() => onCommand("italic")}><Italic size={15} /></ToolButton>
      <ToolButton label="删除线" onClick={() => onCommand("strike")}><Strikethrough size={15} /></ToolButton>
      <ToolButton label="行内代码 (Ctrl+E)" onClick={() => onCommand("inlineCode")}><Code size={15} /></ToolButton>
      <ToolButton label="高亮" onClick={() => onCommand("highlight")}><Highlighter size={15} /></ToolButton>

      <Divider />
      <ToolButton label="无序列表" onClick={() => onCommand("bullet")}><List size={15} /></ToolButton>
      <ToolButton label="有序列表" onClick={() => onCommand("ordered")}><ListOrdered size={15} /></ToolButton>
      <ToolButton label="任务列表" onClick={() => onCommand("task")}><ListTodo size={15} /></ToolButton>
      <ToolButton label="引用" onClick={() => onCommand("quote")}><Quote size={15} /></ToolButton>

      <Divider />
      <ToolButton label="链接" onClick={() => onCommand("link")}><Link2 size={15} /></ToolButton>
      <ToolButton label="上传图片" onClick={onPickImage}><ImageIcon size={15} /></ToolButton>

      <Divider />
      <ToolButton label="代码块" onClick={() => onCommand("codeBlock")}><Braces size={15} /></ToolButton>
      <ToolButton label="表格" onClick={() => onCommand("table")}><Table size={15} /></ToolButton>
      <ToolButton label="公式" onClick={() => onCommand("math")}><Sigma size={15} /></ToolButton>
      <ToolButton label="分隔线" onClick={() => onCommand("divider")}><Minus size={15} /></ToolButton>

      <label className="md-toolbar-heading" title="更多 Markdown 区块">
        <Blocks size={15} aria-hidden="true" />
        <ChevronDown size={11} aria-hidden="true" />
        <select
          value=""
          onChange={(event) => onCommand(event.target.value)}
          aria-label="更多 Markdown 区块"
        >
          <option value="" disabled>更多区块</option>
          <option value="definition">定义列表</option>
          <option value="mermaid">Mermaid 图表</option>
          <option value="callout">提示块</option>
          <option value="details">折叠内容</option>
          <option value="footnote">脚注</option>
          <option value="frontMatter">Front Matter</option>
        </select>
      </label>
    </div>
  );
}
