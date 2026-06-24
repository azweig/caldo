// serve.mjs — zero-dependency server for the pod: serves the built caldo (dist/) AND proxies
// /ollama/* → your local Ollama (server-side, so NO CORS and the creatures' voice shares the app's
// origin). Expose ONE port in RunPod; point caldo's ⚙ at  <that-url>/ollama .
//
//   PORT=4321 OLLAMA_URL=http://localhost:11434 node serve.mjs   # tag: caldo-serve
import { createServer, request as httpRequest } from "node:http"
import { readFile } from "node:fs/promises"
import { join, extname, normalize } from "node:path"

const DIST = join(process.cwd(), "dist")
const PORT = Number(process.env.PORT || 4321)
const OLLAMA = new URL(process.env.OLLAMA_URL || "http://localhost:11434")
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json" }

createServer(async (req, res) => {
  const url = req.url || "/"

  // proxy the LLM under the same origin
  if (url.startsWith("/ollama/")) {
    // strip Origin/Referer so Ollama sees a same-origin (localhost) call and doesn't 403 on CORS
    const headers = { ...req.headers, host: `${OLLAMA.hostname}:${OLLAMA.port || 11434}` }
    delete headers.origin; delete headers.referer
    const p = httpRequest(
      { hostname: OLLAMA.hostname, port: OLLAMA.port || 11434, path: url.replace(/^\/ollama/, ""), method: req.method, headers },
      (pr) => { res.writeHead(pr.statusCode || 502, pr.headers); pr.pipe(res) },
    )
    p.on("error", (e) => { res.writeHead(502, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "ollama_unreachable", detail: String(e) })) })
    req.pipe(p)
    return
  }

  // static files (with SPA fallback to index.html)
  let path = normalize(url.split("?")[0]).replace(/^(\.\.[/\\])+/, "")
  if (path === "/" || path === "") path = "/index.html"
  try {
    const data = await readFile(join(DIST, path))
    res.writeHead(200, { "Content-Type": TYPES[extname(path)] || "application/octet-stream" })
    res.end(data)
  } catch {
    try { res.writeHead(200, { "Content-Type": "text/html" }); res.end(await readFile(join(DIST, "index.html"))) }
    catch { res.writeHead(404); res.end("not found — corré `npm run build` primero") }
  }
}).listen(PORT, "0.0.0.0", () => console.log(`caldo-serve · app en :${PORT} · Ollama proxeado en /ollama → ${OLLAMA.href}`))
