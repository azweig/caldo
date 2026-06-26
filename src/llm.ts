// llm.ts — optional connection to a self-hosted Ollama (your GPU box) that gives the creatures a
// fluid voice. Config lives in localStorage so you point it at your box from the ⚙ panel. If it's
// unset or unreachable, chat.ts falls back to the built-in templated voice — the sim always works.
//
// Your Ollama must allow the browser origin (CORS):  OLLAMA_ORIGINS=*  ollama serve

const LS_URL = "caldo_llm_url"
const LS_MODEL = "caldo_llm_model"

// SECURITY: only allow https endpoints (or same-origin relative, or explicit localhost) — a plaintext http://
// endpoint over an https page leaks every prompt + completion and lets a MITM inject markup (→ XSS). Reject it.
export function isSafeLlmUrl(url: string): boolean {
  const u = url.trim()
  if (!u) return false
  if (u.startsWith("/")) return true // same-origin relative (the pod's /ollama proxy)
  try {
    const p = new URL(u)
    if (p.protocol === "https:") return true
    if (p.protocol === "http:" && (p.hostname === "localhost" || p.hostname === "127.0.0.1" || p.hostname === "[::1]")) return true
    return false
  } catch { return false }
}
export function llmUrl(): string { const u = (localStorage.getItem(LS_URL) || "").replace(/\/+$/, ""); return isSafeLlmUrl(u) ? u : "" }
export function llmModel(): string { return localStorage.getItem(LS_MODEL) || "qwen2.5:7b" }
export function llmConfigured(): boolean { return !!llmUrl() }
export function setLlm(url: string, model: string): boolean {
  const u = url.trim()
  if (u && !isSafeLlmUrl(u)) return false // refuse insecure endpoints
  localStorage.setItem(LS_URL, u)
  localStorage.setItem(LS_MODEL, (model.trim() || "qwen2.5:7b"))
  return true
}

export interface Msg { role: "system" | "user" | "assistant"; content: string }

export async function llmChat(messages: Msg[]): Promise<string> {
  const url = llmUrl()
  if (!url) throw new Error("llm_not_configured")
  const res = await fetch(`${url}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: llmModel(), messages, stream: false, options: { temperature: 0.85, num_predict: 130 } }),
    signal: AbortSignal.timeout(30000),
  })
  if (!res.ok) throw new Error(`http ${res.status}`)
  const data = await res.json()
  const txt = data?.message?.content
  if (!txt) throw new Error("respuesta vacía")
  return String(txt).trim()
}

// try to connect automatically: the same-origin proxy (the pod's /ollama) or a local Ollama. Saves
// the player from configuring ⚙ when it can just work.
export async function autoDetect(): Promise<boolean> {
  if (llmConfigured()) return true
  for (const url of [location.origin + "/ollama", "http://localhost:11434"]) {
    try {
      const r = await fetch(url + "/api/tags", { signal: AbortSignal.timeout(2500) })
      if (!r.ok) continue
      const models: string[] = ((await r.json())?.models || []).map((m: { name?: string; model?: string }) => m.name || m.model).filter(Boolean)
      if (!models.length) continue // Ollama is up but has NO model pulled — don't pretend we're connected
      const model = models.find((m) => /qwen2\.5:7b/.test(m)) || models.find((m) => /qwen|llama|gemma|mistral/i.test(m)) || models[0]
      setLlm(url, model)
      return true
    } catch { /* try the next */ }
  }
  return false
}

export async function pingLLM(): Promise<{ ok: boolean; detail: string }> {
  try {
    const r = await llmChat([{ role: "user", content: "Respondé solo con la palabra: hola" }])
    return { ok: true, detail: r.slice(0, 50) }
  } catch (e) { return { ok: false, detail: (e as Error).message } }
}
