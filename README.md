# Web Inbox (Cloudflare 版本)

更新：
- v2.5 支持移动端，修复了一些bug
- v2.5.3 修改了自动保存逻辑，增加了搜索词高亮显示
- v2.5.4 左侧列表太长时可滚动
- v2.4 增加了修改密码功能，替换了logo，修复了一些bug
- v2.3 UI做了美化，增加了网站logo，修正了暗色主题
- v2.2 可以正常拖拽分割栏 可以正常拖拽左侧列表 最新编辑的自动排序到前面 隐藏预览后，同步滚动/上下/左右预览按钮屏蔽

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
