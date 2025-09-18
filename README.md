# Web Inbox (Cloudflare 版本)

功能：
- 用户注册 / 登录（Session Cookie）
- 创建 / 查看 / 编辑 / 删除文本块
- 图片上传（保存在 KV）
- 前端：React + Vite + Tailwind（最小样板）
- 后端：Cloudflare Pages Functions (`_worker.js`) + D1 + KV

部署：
1. Pages 绑定 GitHub（已完成）
2. 添加 `_worker.js`（已完成）
3. 填入本前端文件
4. 在 D1 控制台执行 `migrations/001_init.sql` 里的 SQL（复制即可）
5. 访问 `/api/health` 测试
6. 浏览器注册登录使用
