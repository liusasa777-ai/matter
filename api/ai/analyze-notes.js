import { analyzeNotes, sendJson } from "../_lib/ai.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const notes = Array.isArray(req.body?.notes) ? req.body.notes : [];
    if (notes.length < 3) {
      sendJson(res, 400, { error: "最近 7 天至少需要 3 条便笺，才能生成本周回顾" });
      return;
    }

    sendJson(res, 200, await analyzeNotes(notes));
  } catch (error) {
    console.error(error);
    sendJson(res, error.statusCode || 500, { error: error.message || "服务刚刚没分析好，再试一次" });
  }
}
