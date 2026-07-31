import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  Network,
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

function MenuButton({ buttonRef, label, open, onClick, children }) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className="md-toolbar-menu-button"
      onClick={onClick}
      aria-label={label}
      aria-haspopup="menu"
      aria-expanded={open}
      title={label}
    >
      {children}
      <ChevronDown size={10} aria-hidden="true" />
    </button>
  );
}

function ToolbarMenu({ anchorRef, open, label, items, onClose }) {
  const menuRef = useRef(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const width = 190;
    setPosition({
      top: Math.min(window.innerHeight - 12, rect.bottom + 5),
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))
    });
  }, [anchorRef, open]);

  useEffect(() => {
    if (!open) return undefined;
    const closeFromOutside = (event) => {
      if (menuRef.current?.contains(event.target) || anchorRef.current?.contains(event.target)) return;
      onClose();
    };
    const closeFromKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("pointerdown", closeFromOutside);
    window.addEventListener("keydown", closeFromKey);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("pointerdown", closeFromOutside);
      window.removeEventListener("keydown", closeFromKey);
      window.removeEventListener("resize", onClose);
    };
  }, [anchorRef, onClose, open]);

  if (!open) return null;
  return createPortal(
    <div
      ref={menuRef}
      className="md-toolbar-menu"
      role="menu"
      aria-label={label}
      style={position}
    >
      {items.map((item) => (
        <React.Fragment key={`${item.command}-${item.label}`}>
          {item.separatorBefore ? <span className="md-toolbar-menu-separator" /> : null}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              item.onSelect();
              onClose();
            }}
          >
            <span>{item.label}</span>
            {item.shortcut ? <kbd>{item.shortcut}</kbd> : null}
          </button>
        </React.Fragment>
      ))}
    </div>,
    document.body
  );
}

export default function MarkdownToolbar({ onCommand, onPickImage }) {
  const headingRef = useRef(null);
  const inlineRef = useRef(null);
  const noteRef = useRef(null);
  const blockRef = useRef(null);
  const [openMenu, setOpenMenu] = useState(null);
  const closeMenu = () => setOpenMenu(null);
  const toggleMenu = (name) => setOpenMenu((current) => current === name ? null : name);
  const item = (command, label, option, extra = {}) => ({
    command,
    label,
    ...extra,
    onSelect: () => onCommand(command, option)
  });

  const headingItems = [1, 2, 3, 4, 5, 6].map((level) =>
    item("heading", `标题 ${level}`, level, { shortcut: `Ctrl ${level}` })
  );
  const inlineItems = [
    item("highlight", "高亮", undefined, { shortcut: "Ctrl Shift H" }),
    item("inserted", "插入文本"),
    item("subscript", "下标"),
    item("superscript", "上标"),
    item("inlineMath", "行内公式", undefined, { separatorBefore: true })
  ];
  const noteItems = [
    item("wikiLink", "双链"),
    item("noteEmbed", "笔记嵌入"),
    item("remoteImage", "网络图片"),
    item("tag", "插入标签", undefined, { separatorBefore: true }),
    item("blockId", "块 ID"),
    item("blockReference", "块引用"),
    item("footnote", "脚注", undefined, { separatorBefore: true })
  ];
  const blockItems = [
    item("definition", "定义列表"),
    item("mermaid", "Mermaid 图表"),
    item("advancedCode", "增强代码块"),
    item("callout", "Callout"),
    item("details", "折叠内容"),
    item("tabs", "标签页"),
    item("pandocAttributes", "Pandoc 属性", undefined, { separatorBefore: true }),
    item("frontMatter", "Front Matter")
  ];

  return (
    <div className="md-toolbar custom-scroll" role="toolbar" aria-label="Markdown 快捷编辑栏">
      <MenuButton
        buttonRef={headingRef}
        label="标题层级"
        open={openMenu === "heading"}
        onClick={() => toggleMenu("heading")}
      >
        <Heading size={15} />
      </MenuButton>

      <Divider />
      <ToolButton label="加粗 (Ctrl+B)" onClick={() => onCommand("bold")}><Bold size={15} /></ToolButton>
      <ToolButton label="斜体 (Ctrl+I)" onClick={() => onCommand("italic")}><Italic size={15} /></ToolButton>
      <ToolButton label="删除线 (Ctrl+Shift+X)" onClick={() => onCommand("strike")}><Strikethrough size={15} /></ToolButton>
      <ToolButton label="行内代码 (Ctrl+E)" onClick={() => onCommand("inlineCode")}><Code size={15} /></ToolButton>
      <MenuButton
        buttonRef={inlineRef}
        label="更多行内样式"
        open={openMenu === "inline"}
        onClick={() => toggleMenu("inline")}
      >
        <Highlighter size={15} />
      </MenuButton>

      <Divider />
      <ToolButton label="无序列表" onClick={() => onCommand("bullet")}><List size={15} /></ToolButton>
      <ToolButton label="有序列表" onClick={() => onCommand("ordered")}><ListOrdered size={15} /></ToolButton>
      <ToolButton label="任务列表" onClick={() => onCommand("task")}><ListTodo size={15} /></ToolButton>
      <ToolButton label="引用" onClick={() => onCommand("quote")}><Quote size={15} /></ToolButton>

      <Divider />
      <ToolButton label="链接" onClick={() => onCommand("link")}><Link2 size={15} /></ToolButton>
      <ToolButton label="上传图片" onClick={onPickImage}><ImageIcon size={15} /></ToolButton>
      <MenuButton
        buttonRef={noteRef}
        label="笔记语法"
        open={openMenu === "note"}
        onClick={() => toggleMenu("note")}
      >
        <Network size={15} />
      </MenuButton>

      <Divider />
      <ToolButton label="代码块" onClick={() => onCommand("codeBlock")}><Braces size={15} /></ToolButton>
      <ToolButton label="表格" onClick={() => onCommand("table")}><Table size={15} /></ToolButton>
      <ToolButton label="块级公式" onClick={() => onCommand("math")}><Sigma size={15} /></ToolButton>
      <ToolButton label="分隔线" onClick={() => onCommand("divider")}><Minus size={15} /></ToolButton>
      <MenuButton
        buttonRef={blockRef}
        label="更多块"
        open={openMenu === "block"}
        onClick={() => toggleMenu("block")}
      >
        <Blocks size={15} />
      </MenuButton>

      <ToolbarMenu anchorRef={headingRef} open={openMenu === "heading"} label="标题层级" items={headingItems} onClose={closeMenu} />
      <ToolbarMenu anchorRef={inlineRef} open={openMenu === "inline"} label="更多行内样式" items={inlineItems} onClose={closeMenu} />
      <ToolbarMenu anchorRef={noteRef} open={openMenu === "note"} label="笔记语法" items={noteItems} onClose={closeMenu} />
      <ToolbarMenu anchorRef={blockRef} open={openMenu === "block"} label="更多块" items={blockItems} onClose={closeMenu} />
    </div>
  );
}
