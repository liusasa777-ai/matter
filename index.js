import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

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
    if (req.url === "/favicon.ico" || req.url === "/favicon.png") {
      res.status(204).end();
      return;
    }

    const url = new URL(req.url || "/", "https://matter.local");
    const cleanPath = url.pathname === "/" ? "/index.html" : url.pathname;
    const normalized = normalize(cleanPath).replace(/^(\.\.[/\\])+/, "");
    const filePath = join(rootDir, normalized);

    if (!filePath.startsWith(rootDir)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    try {
      const content = await readFile(filePath);
      res.setHeader("Content-Type", mimeTypes[extname(filePath)] || "application/octet-stream");
      res.setHeader("Cache-Control", "no-store");
      res.status(200).send(content);
    } catch {
      const index = await readFile(join(rootDir, "index.html"));
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.status(200).send(index);
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
}
