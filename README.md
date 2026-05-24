# Matter

AI 日记与情绪便笺网站。前端使用原生 HTML/CSS/JS，后端使用 Node.js 内置模块提供静态资源与 DeepSeek API 转发。

## 启动

```bash
cp .env.example .env
```

在 `.env` 中填写：

```bash
DEEPSEEK_API_KEY=your_deepseek_api_key_here
DEEPSEEK_MODEL=deepseek-v4-flash
PORT=3000
```

然后启动：

```bash
npm run dev
```

如果 `3000` 被占用，服务会自动尝试下一个端口。

## 部署到 Vercel

Vercel 不使用本地长驻的 `server.js`，线上接口由 `api/` 目录下的 Serverless Functions 提供：

```text
api/ai/generate-note.js
api/ai/analyze-notes.js
```

部署前请在 Vercel 项目的 **Settings > Environment Variables** 中配置：

```bash
DEEPSEEK_API_KEY=your_deepseek_api_key_here
DEEPSEEK_MODEL=deepseek-v4-flash
```

保存环境变量后需要重新部署，变量才会在 Production 生效。

## 功能

- 心情输入与 DeepSeek 日记生成
- 1-4 个 AI 标签生成
- 今日便利贴预览、编辑和保存
- 本地便笺库、搜索、标签筛选、编辑、删除
- 随机便笺样式并持久保持
- 最近 7 天便笺聚合与 DeepSeek 本周回顾

未配置 `DEEPSEEK_API_KEY` 时，AI 接口会直接返回配置错误，不提供 mock 结果。
