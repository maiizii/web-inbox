# Web Inbox / Tips (Cloudflare 版本)

极简私有便签 / 代码片段收集器。前端：React + Vite。后端：Cloudflare Pages Functions + D1 + KV。登录基于会话 Cookie；支持邀请码注册；Block 增删改查、排序、搜索、图片上传；桌面/移动端自适配编辑器（分屏、同步滚动、撤销/重做、缩进、高亮）。

---

## 更新

- v2.5 支持移动端，修复了一些bug
  - v2.5.3 修改了自动保存逻辑，增加了搜索词高亮显示
  - v2.5.4 左侧列表太长时可滚动
- v2.4 增加了修改密码功能，替换了logo，修复了一些bug
- v2.3 UI做了美化，增加了网站logo，修正了暗色主题
- v2.2 可以正常拖拽分割栏 可以正常拖拽左侧列表 最新编辑的自动排序到前面 隐藏预览后，同步滚动/上下/左右预览按钮屏蔽

---

## 功能

- 账号
  - 会话登录（sid Cookie）
  - 邀请码注册（INVITE_CODE）
  - 退出登录、查询当前用户
- Block
  - 列表、创建、更新、删除
  - 拖拽排序（桌面）、上/下移按钮（移动端）
  - 搜索（标题派生自首行）
- 图片上传
  - multipart/form-data，大小 ≤ 2MB
  - 二进制入 KV，元数据入 D1
- 编辑器
  - 自动保存（去抖 800ms）
  - 撤销/重做（Ctrl/Cmd + Z / Y）
  - Tab / Shift+Tab 缩进
  - 粘贴/拖拽图片
  - 搜索词高亮镜像层（不破坏文本）
  - 左右/上下分屏切换；同步滚动可开关；分隔条可拖动；双击重置 50%
  - 移动端单屏“编辑/预览”切换，滚动链完整可到底
- 主题/布局/通知
  - 深浅主题（ThemeContext）
  - 布局与导航（Layout, Navbar）
  - 轻量 Toast

---

## 目录结构

    web-inbox/
    ├─ functions/
    │  ├─ [[path]].js            # Pages Functions 路由聚合：/api/*（auth/blocks/images 等）
    │  └─ api/password.js        # 修改密码（独立函数）
    ├─ src/
    │  ├─ App.jsx                # Provider 组合 + 路由
    │  ├─ main.jsx               # 入口
    │  ├─ index.css              # 主题变量/滚动条/编辑器样式
    │  ├─ context/
    │  │  ├─ AuthContext.jsx
    │  │  └─ ThemeContext.jsx
    │  ├─ hooks/
    │  │  └─ useToast.jsx
    │  ├─ lib/
    │  │  └─ apiClient.js        # apiFetch（同源 /api，带凭据）
    │  ├─ api/
    │  │  └─ cloudflare.js       # 前端 API 包装（blocks/images/auth 等）
    │  ├─ components/
    │  │  ├─ layout/
    │  │  │  ├─ Layout.jsx
    │  │  │  ├─ Navbar.jsx
    │  │  │  └─ Sidebar.jsx
    │  │  ├─ account/ChangePasswordModal.jsx
    │  │  └─ blocks/BlockEditorAuto.jsx
    │  └─ pages/
    │     ├─ AuthPage.jsx
    │     └─ InboxPage.jsx

---

## 快速开始（本地）

    npm i
    npm run dev

产物构建与本地预览：

    npm run build
    npm run preview

构建输出目录：dist/

---

## Cloudflare Pages Functions

必须启用 Pages Functions，并绑定以下资源与变量（名称固定）：

- D1：绑定名 DB
- KV：绑定名 KV
- 环境变量
  - INVITE_CODE：邀请码（注册必需）
  - SESSION_TTL_SECONDS：会话有效期秒数，默认 604800（7 天）
  - PBKDF2_ITER：密码哈希迭代上限，建议 ≤ 100000

后端入口：
- functions/[[path]].js：聚合 /api/* 路由
- functions/api/password.js：修改密码

---

## 前端路由与 Provider

- App.jsx：ThemeProvider + AuthProvider + ToastProvider + BrowserRouter
- 路由：
  - /auth → AuthPage
  - /     → 受保护路由 → Layout(fullScreen) + InboxPage
  - 其余 → 重定向 /

---

## Sidebar（列表）

- 顶部工具条（新建按钮 + 拖拽/调整提示）
- 搜索框固定
- 列表区超出滚动（桌面拖拽、移动端上/下移按钮）
- 选中项渐变高亮；未选中 hover 背景；深浅色自适应

---

## 编辑器（BlockEditorAuto）

- 自动保存：去抖 800ms，仅在确有编辑时触发
- 历史：快照栈（分组窗口 800ms），撤销/重做
- 缩进：Tab/Shift+Tab 多行处理
- 图片：剪贴板或拖拽上传，成功后替换占位
- 分屏：
  - vertical（左右）/ horizontal（上下）保存在 localStorage
  - 拖动分隔条实时调整比例，双击重置为 0.5
  - 可选“同步滚动”
- 搜索高亮：镜像 <pre> 覆盖层，仅渲染背景，不影响输入
- 行号：桌面精确，移动端计算换行占位
- 溢出检测：决定各区域是否出现滚动条
- 移动端：
  - 单屏“编辑/预览”切换
  - 完整 flex 链路，编辑区与预览区都能滚到最底

---

## API 约定（同源 /api）

- 健康检查
  - GET /api/health → { ok, ts }
- 认证
  - POST /api/auth/register：{ email, password, name?, inviteCode } → user
  - POST /api/auth/login：{ email, password } → user + Set-Cookie: sid=...
  - POST /api/auth/logout：清除会话
  - GET  /api/auth/me：返回当前 user
- Blocks
  - GET  /api/blocks：当前用户列表；服务端排序优先 position ASC，其次 updated_at DESC，再 created_at DESC
  - POST /api/blocks：{ content } → 新建
  - PUT  /api/blocks/:id：{ content } → 更新
  - DELETE /api/blocks/:id：删除
  - POST /api/blocks/reorder：{ order: [{ id, position }, ...] }
- Images
  - POST /api/images：字段 file，≤ 2MB → { url: "/api/images/:id" }
  - GET  /api/images/:id：鉴权读取，设置正确 Content-Type 与缓存
- 修改密码
  - POST /api/password：{ email?, old_password, new_password }
  - 兼容旧散列（如明文/sha256），迁移至 PBKDF2-SHA256

前端统一通过 src/api/cloudflare.js 封装，底层 apiFetch 走相对路径 /api 并携带凭据。

---

## D1 表结构（最小集合）

    -- users
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT,
      created_at TEXT NOT NULL
    );

    -- blocks
    CREATE TABLE blocks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      position INTEGER NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    -- images
    CREATE TABLE images (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      mime TEXT NOT NULL,
      size INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

---

## 键盘与交互

- 撤销/重做：Ctrl/Cmd + Z / Y
- 缩进：Tab、Shift+Tab
- 分屏：分隔条拖动；双击重置；同步滚动开/关

---

## 部署（Cloudflare Pages）

- 构建命令：npm run build
- 输出目录：dist/
- 绑定：
  - D1：DB
  - KV：KV
  - 环境变量：INVITE_CODE（必需）、SESSION_TTL_SECONDS、PBKDF2_ITER
- 确保以下函数存在并启用：
  - functions/[[path]].js
  - functions/api/password.js
