import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(__dirname, "public");
const promptPath = join(__dirname, "prompt.md");

loadEnvFile(join(__dirname, ".env"));

const port = Number(process.env.PORT || 3000);
const deepSeekApiKey = process.env.DEEPSEEK_API_KEY || "";
const deepSeekModel = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";
const deepSeekBaseUrl = "https://api.deepseek.com";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

listen(port);

function listen(targetPort) {
  const server = createAppServer();
  server.once("error", (error) => {
    if (error.code === "EADDRINUSE" && !process.env.PORT) {
      console.log(`Port ${targetPort} is busy, trying ${targetPort + 1}...`);
      listen(targetPort + 1);
      return;
    }
    throw error;
  });

  server.listen(targetPort, () => {
    console.log(`Matter is running at http://127.0.0.1:${targetPort}`);
  });
}

function createAppServer() {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", `http://${req.headers.host}`);

      if (req.method === "POST" && url.pathname === "/api/ai/generate-note") {
        await handleGenerateNote(req, res);
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/ai/analyze-notes") {
        await handleAnalyzeNotes(req, res);
        return;
      }

      if (req.method === "GET" || req.method === "HEAD") {
        await serveStatic(url.pathname, res, req.method === "HEAD");
        return;
      }

      sendJson(res, 405, { error: "Method not allowed" });
    } catch (error) {
      console.error(error);
      sendJson(res, 500, { error: "服务刚刚没整理好，再试一次" });
    }
  });
}

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  const content = readFileSync(path, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

async function handleGenerateNote(req, res) {
  if (!ensureDeepSeekConfigured(res)) return;

  const body = await readJson(req);
  const inputText = String(body.inputText || "").trim();
  if (!inputText) {
    sendJson(res, 400, { error: "写一点也可以" });
    return;
  }

  const prompts = await readPromptSections();
  const systemPrompt = `${prompts.diary}

请严格输出 JSON，不要输出 Markdown：
{
  "diary": "约50字中文日记正文",
  "tags": ["1-4个简短中文标签"]
}`;

  const data = await callDeepSeek([
    { role: "system", content: systemPrompt },
    { role: "user", content: inputText }
  ]);

  const content = data.choices?.[0]?.message?.content || "";
  const parsed = parseJsonFromModel(content);
  const diary = String(parsed.diary || "").trim();
  const tags = Array.isArray(parsed.tags)
    ? parsed.tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 4)
    : [];

  if (!diary || tags.length === 0) {
    sendJson(res, 502, { error: "刚刚没整理好，再试一次" });
    return;
  }

  sendJson(res, 200, { diary, tags });
}

async function handleAnalyzeNotes(req, res) {
  if (!ensureDeepSeekConfigured(res)) return;

  const body = await readJson(req);
  const notes = Array.isArray(body.notes) ? body.notes : [];
  if (notes.length < 3) {
    sendJson(res, 400, { error: "最近 7 天至少需要 3 条便笺，才能生成本周回顾" });
    return;
  }

  const prompts = await readPromptSections();
  const noteText = notes
    .map((note) => `${note.date || ""} ${note.time || ""}\n${note.content || ""}`)
    .join("\n\n");

  const systemPrompt = `${prompts.analysis}

请严格输出 JSON，不要输出 Markdown：
{
  "summary": {
    "study": "学习维度摘要",
    "life": "生活维度摘要",
    "emotion": "情绪维度摘要"
  },
  "fullAnalysis": "按要求结构输出的完整中文分析"
}`;

  const data = await callDeepSeek([
    { role: "system", content: systemPrompt },
    { role: "user", content: `以下是最近 7 天的日记内容：\n\n${noteText}` }
  ]);

  const content = data.choices?.[0]?.message?.content || "";
  const parsed = parseJsonFromModel(content);
  const summary = parsed.summary || {};
  const fullAnalysis = String(parsed.fullAnalysis || "").trim();

  if (!fullAnalysis) {
    sendJson(res, 502, { error: "刚刚没分析好，再试一次" });
    return;
  }

  sendJson(res, 200, {
    summary: {
      study: String(summary.study || "这一周学习相关内容还不够清晰。"),
      life: String(summary.life || "生活记录里有一些零散但真实的片段。"),
      emotion: String(summary.emotion || "情绪上出现了一些值得温柔回看的变化。")
    },
    fullAnalysis
  });
}

async function callDeepSeek(messages) {
  const response = await fetch(`${deepSeekBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${deepSeekApiKey}`
    },
    body: JSON.stringify({
      model: deepSeekModel,
      messages,
      response_format: { type: "json_object" },
      temperature: 0.7
    })
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`DeepSeek returned non-JSON response: ${text.slice(0, 200)}`);
  }

  if (!response.ok) {
    const message = data.error?.message || "DeepSeek 请求失败";
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return data;
}

function ensureDeepSeekConfigured(res) {
  if (deepSeekApiKey) return true;
  sendJson(res, 500, {
    error: "未配置 DEEPSEEK_API_KEY。请在服务端 .env 中配置后重启网站。"
  });
  return false;
}

async function readPromptSections() {
  const content = await readFile(promptPath, "utf8");
  const diary = content.split("分析日记prompt：")[0].replace("写日记prompt：", "").trim();
  const analysis = content.split("分析日记prompt：")[1]?.trim() || "";
  return { diary, analysis };
}

function parseJsonFromModel(content) {
  const trimmed = content.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return {};
    try {
      return JSON.parse(match[0]);
    } catch {
      return {};
    }
  }
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function serveStatic(pathname, res, headOnly = false) {
  const cleanPath = pathname === "/" ? "/index.html" : pathname;
  const normalized = normalize(cleanPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(publicDir, normalized);

  if (!filePath.startsWith(publicDir)) {
    sendJson(res, 403, { error: "Forbidden" });
    return;
  }

  try {
    const content = await readFile(filePath);
    res.writeHead(200, {
      "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    res.end(headOnly ? undefined : content);
  } catch {
    const index = await readFile(join(publicDir, "index.html"));
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(headOnly ? undefined : index);
  }
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}
