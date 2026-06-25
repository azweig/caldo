// works.ts — generate the REAL content of a creature's creations with the connected LLM (Ollama):
// a book's actual opening passage in its era's voice, or a painting/sculpture's description + an image
// prompt (so we can also generate the picture). Results are cached per work so we only ask once.

import { llmConfigured, llmChat } from "./llm"
import { LangCode, langName } from "./i18n"

export type WorkResult = { kind: "libro" | "obra"; text: string; prompt?: string; image?: string; loading?: boolean }
const cache = new Map<string, WorkResult>()
export const cachedWork = (key: string) => cache.get(key)

// Stable Diffusion endpoint (the pod). Configurable via localStorage caldo_sd_url.
const sdUrl = () => (localStorage.getItem("caldo_sd_url") || "https://mfm0k56hwcs9ep-7860.proxy.runpod.net").replace(/\/+$/, "")
async function paintWork(prompt: string): Promise<string | undefined> {
  try {
    const res = await fetch(sdUrl() + "/sdapi/v1/txt2img", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: prompt + ", a painting, artwork", steps: 18, width: 512, height: 512, cfg_scale: 7, sampler_name: "DPM++ 2M" }),
    })
    if (!res.ok) return undefined
    const j = await res.json()
    return j.images?.[0] ? `data:image/png;base64,${j.images[0]}` : undefined
  } catch { return undefined }
}

export async function composeWork(key: string, kind: "libro" | "obra", author: string, era: string, title: string, lang: LangCode): Promise<WorkResult> {
  const hit = cache.get(key); if (hit && !hit.loading) return hit
  if (!llmConfigured()) { const r: WorkResult = { kind, text: "(conectá la voz IA en ⚙ para leer/ver la obra real)" }; cache.set(key, r); return r }
  cache.set(key, { kind, text: "…", loading: true })
  try {
    if (kind === "libro") {
      const out = await llmChat([
        { role: "system", content: `Sos ${author}, autor de la era ${era}. Escribís en ${langName(lang)}, con la voz, las imágenes y las creencias de tu época. Devolvé SOLO el texto, sin comillas ni preámbulo.` },
        { role: "user", content: `Escribí el primer párrafo (4 a 6 líneas) de tu libro titulado ${title}.` },
      ])
      const r: WorkResult = { kind, text: out.trim() }; cache.set(key, r); return r
    }
    const out = await llmChat([
      { role: "system", content: `Sos ${author}, artista de la era ${era}. Devolvé EXACTAMENTE dos líneas:\nDESC: <2-3 frases en ${langName(lang)} describiendo tu obra ${title}: qué representa, su técnica y su emoción>\nPROMPT: <un prompt corto en inglés para generar la imagen de la obra, con un estilo acorde a la época>` },
      { role: "user", content: `Describí y dame el prompt de tu obra: ${title}.` },
    ])
    const desc = (out.match(/DESC:\s*([\s\S]+?)(?:\nPROMPT:|$)/)?.[1] || out).trim()
    const prompt = (out.match(/PROMPT:\s*([\s\S]+)/)?.[1] || "").trim()
    const image = prompt ? await paintWork(prompt) : undefined // actually paint it with Stable Diffusion
    const r: WorkResult = { kind, text: desc, prompt, image }; cache.set(key, r); return r
  } catch {
    const r: WorkResult = { kind, text: "(no se pudo generar)" }; cache.set(key, r); return r
  }
}
