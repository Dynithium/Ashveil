import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// This server binds to loopback and forwards only NVIDIA chat completions.
// API credentials are passed through in memory and never logged or saved.
const port = Number(process.env.ASHVEIL_PORT || 4173);
const indexPath = fileURLToPath(new URL("./dist/index.html", import.meta.url));

createServer(async (request, response) => {
  const url = new URL(request.url || "/", "http://localhost");
  if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
    try {
      const html = await readFile(indexPath);
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      response.end(html);
    } catch {
      response.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Build Ashveil first with npm run build.");
    }
    return;
  }
  if (request.method !== "POST" || url.pathname !== "/api/nvidia/v1/chat/completions") {
    response.writeHead(404).end();
    return;
  }
  // Reject cross-origin pages; the proxy is intended only for this local game.
  const origin = request.headers.origin;
  if (origin && origin !== `http://${request.headers.host}`) {
    response.writeHead(403).end();
    return;
  }
  const chunks = [];
  let size = 0;
  try {
    for await (const chunk of request) {
      size += chunk.length;
      if (size > 1024 * 1024) {
        response.writeHead(413).end();
        return;
      }
      chunks.push(chunk);
    }
    const upstream = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: request.headers.authorization || "" },
      body: Buffer.concat(chunks),
      signal: AbortSignal.timeout(180_000),
    });
    response.writeHead(upstream.status, { "Content-Type": upstream.headers.get("content-type") || "application/json", "Cache-Control": "no-store" });
    response.end(Buffer.from(await upstream.arrayBuffer()));
  } catch {
    if (!response.headersSent) response.writeHead(502, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "NVIDIA request failed or timed out." }));
  }
}).listen(port, "127.0.0.1", () => console.log(`Ashveil is available at http://127.0.0.1:${port}`));
