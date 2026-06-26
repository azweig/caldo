// serve.mjs — zero-dependency server for the pod: serves the built caldo (dist/) AND proxies
// /ollama/* → your local Ollama (server-side, so NO CORS and the creatures' voice shares the app's
// origin). Expose ONE port in RunPod; point caldo's ⚙ at  <that-url>/ollama .
//
//   PORT=4321 OLLAMA_URL=http://localhost:11434 HOST=127.0.0.1 node serve.mjs
// Set HOST=0.0.0.0 only if you must expose it directly; prefer 127.0.0.1 behind the platform proxy.
import { createServer, request as httpRequest } from "node:http"
import { readFile } from "node:fs/promises"
import { join, extname, resolve, sep } from "node:path"

const DIST = resolve(process.cwd(), "dist")
const PORT = Number(process.env.PORT || 4321)
// platform proxies (RunPod etc.) connect from OUTSIDE, so the server must bind 0.0.0.0 to be reachable — binding
// loopback would leave the page stuck "initializing". The /ollama proxy is protected by the allow-list + token.
const HOST = process.env.HOST || "0.0.0.0"
const OLLAMA = new URL(process.env.OLLAMA_URL || "http://localhost:11434")
const PROXY_TOKEN = process.env.PROXY_TOKEN || "" // if set, /ollama/* requires header x-proxy-token to match
const OLLAMA_ALLOW = new Set(["/api/chat", "/api/generate", "/api/tags", "/api/version"]) // allow-list of proxied paths
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json", ".glb": "model/gltf-binary", ".webp": "image/webp" }
// CSP delivered as a response header (stronger than the <meta>, and keeps the dev server — vite needs inline/eval — working)
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https: http://localhost:* http://127.0.0.1:*; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
const SECURITY_HEADERS = { "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "no-referrer", "Content-Security-Policy": CSP }

createServer(async (req, res) => {
  const url = req.url || "/"

  // proxy the LLM under the same origin
  if (url.startsWith("/ollama/")) {
    if (PROXY_TOKEN && req.headers["x-proxy-token"] !== PROXY_TOKEN) { res.writeHead(401, SECURITY_HEADERS); return res.end("unauthorized") }
    const path = url.replace(/^\/ollama/, "").split("?")[0]
    if (!OLLAMA_ALLOW.has(path)) { res.writeHead(403, SECURITY_HEADERS); return res.end("path not allowed") }
    const headers = { ...req.headers, host: `${OLLAMA.hostname}:${OLLAMA.port || 11434}` }
    delete headers.origin; delete headers.referer; delete headers["x-proxy-token"]
    const p = httpRequest({ hostname: OLLAMA.hostname, port: OLLAMA.port || 11434, path: url.replace(/^\/ollama/, ""), method: req.method, headers }, (pr) => { res.writeHead(pr.statusCode || 502, pr.headers); pr.pipe(res) })
    p.setTimeout(35000, () => p.destroy(new Error("upstream timeout"))) // don't pile up sockets on a hung Ollama
    p.on("error", (e) => { if (!res.headersSent) { res.writeHead(502, { "Content-Type": "application/json", ...SECURITY_HEADERS }); res.end(JSON.stringify({ error: "ollama_unreachable", detail: String(e) })) } })
    req.pipe(p)
    return
  }

  // static files (with SPA fallback to index.html) — resolve + containment check against DIST (no traversal)
  let rel = decodeURIComponent(url.split("?")[0])
  if (rel === "/" || rel === "") rel = "/index.html"
  const full = resolve(DIST, "." + rel)
  if (full !== DIST && !full.startsWith(DIST + sep)) { res.writeHead(403, SECURITY_HEADERS); return res.end("forbidden") }
  try {
    const data = await readFile(full)
    res.writeHead(200, { "Content-Type": TYPES[extname(full)] || "application/octet-stream", ...SECURITY_HEADERS })
    res.end(data)
  } catch {
    try { res.writeHead(200, { "Content-Type": "text/html", ...SECURITY_HEADERS }); res.end(await readFile(join(DIST, "index.html"))) }
    catch { res.writeHead(404, SECURITY_HEADERS); res.end("not found — corré `npm run build` primero") }
  }
}).listen(PORT, HOST, () => console.log(`caldo-serve · app en ${HOST}:${PORT} · Ollama proxeado en /ollama → ${OLLAMA.href}${PROXY_TOKEN ? " (token requerido)" : ""}`))
