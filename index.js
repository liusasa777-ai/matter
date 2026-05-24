import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { analyzeNotes, generateNote } from "./api/_lib/ai.js";

const rootDir = process.cwd();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
  ".png": "image/png"
};

export default async function handler(req, res) {
  try {
    const url = new URL(req.url || "/", "https://matter.local");

    if (req.method === "POST" && url.pathname === "/api/ai/generate-note") {
      const body = await readJson(req);
      const inputText = String(body.inputText || "").trim();
      if (!inputText) {
        sendJson(res, 400, { error: "写一点也可以" });
        return;
      }

      sendJson(res, 200, await generateNote(inputText));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/ai/analyze-notes") {
      const body = await readJson(req);
      const notes = Array.isArray(body.notes) ? body.notes : [];
      if (notes.length < 3) {
        sendJson(res, 400, { error: "最近 7 天至少需要 3 条便笺，才能生成本周回顾" });
        return;
      }

      sendJson(res, 200, await analyzeNotes(notes));
      return;
    }

    if (req.url === "/favicon.ico" || req.url === "/favicon.png") {
      res.statusCode = 204;
      res.end();
      return;
    }

    const cleanPath = url.pathname === "/" ? "/index.html" : url.pathname;
    const normalized = normalize(cleanPath).replace(/^(\.\.[/\\])+/, "");
    const filePath = join(rootDir, normalized);

    if (!filePath.startsWith(rootDir)) {
      sendJson(res, 403, { error: "Forbidden" });
      return;
    }

    try {
      const content = await readFile(filePath);
      res.setHeader("Content-Type", mimeTypes[extname(filePath)] || "application/octet-stream");
      res.setHeader("Cache-Control", "no-store");
      res.statusCode = 200;
      res.end(content);
    } catch {
      const index = await readFile(join(rootDir, "index.html"));
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.statusCode = 200;
      res.end(index);
    }
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: "Server error" });
  }
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
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
