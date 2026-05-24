import { generateNote, sendJson } from "../_lib/ai.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const inputText = String(req.body?.inputText || "").trim();
    if (!inputText) {
      sendJson(res, 400, { error: "写一点也可以" });
      return;
    }

    sendJson(res, 200, await generateNote(inputText));
  } catch (error) {
    console.error(error);
    sendJson(res, error.statusCode || 500, { error: error.message || "服务刚刚没整理好，再试一次" });
  }
}
