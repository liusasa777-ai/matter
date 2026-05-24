import { readFile } from "node:fs/promises";
import { join } from "node:path";

const deepSeekBaseUrl = "https://api.deepseek.com";

export async function generateNote(inputText) {
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
    const error = new Error("刚刚没整理好，再试一次");
    error.statusCode = 502;
    throw error;
  }

  return { diary, tags };
}

export async function analyzeNotes(notes) {
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
    const error = new Error("刚刚没分析好，再试一次");
    error.statusCode = 502;
    throw error;
  }

  return {
    summary: {
      study: String(summary.study || "这一周学习相关内容还不够清晰。"),
      life: String(summary.life || "生活记录里有一些零散但真实的片段。"),
      emotion: String(summary.emotion || "情绪上出现了一些值得温柔回看的变化。")
    },
    fullAnalysis
  };
}

export function ensureDeepSeekConfigured() {
  if (process.env.DEEPSEEK_API_KEY) return;
  const error = new Error("未配置 DEEPSEEK_API_KEY。请在 Vercel 项目环境变量中配置后重新部署。");
  error.statusCode = 500;
  throw error;
}

export function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

async function callDeepSeek(messages) {
  ensureDeepSeekConfigured();

  const response = await fetch(`${deepSeekBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`
    },
    body: JSON.stringify({
      model: process.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
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
    const error = new Error("DeepSeek 返回格式异常");
    error.statusCode = 502;
    throw error;
  }

  if (!response.ok) {
    const error = new Error(data.error?.message || "DeepSeek 请求失败");
    error.statusCode = response.status;
    throw error;
  }

  return data;
}

async function readPromptSections() {
  const content = await readFile(join(process.cwd(), "prompt.md"), "utf8");
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
