// i18n.ts — the experience runs in ONE base language, chosen AT INSTALL (VITE_BASE_LANG=es|en).
// The world has TWO in-world tongues, Spanish and English. You only UNDERSTAND the one that matches
// your base language; foreign-tongue speech is tagged "(idioma)" and shown as incomprehensible — so
// walking into a country that speaks the other language really does feel like a language barrier.

export type LangCode = "es" | "en"

const ENV = ((import.meta as unknown as { env?: Record<string, string> }).env) || {}
export const BASE_LANG: LangCode = ENV.VITE_BASE_LANG === "en" ? "en" : "es"

const NAMES = BASE_LANG === "en" ? { es: "Spanish", en: "English" } : { es: "español", en: "inglés" }
export function langName(code: LangCode): string { return NAMES[code] }

// the language the LLM should WRITE in (always the player's base language)
export const WRITE_LANG = BASE_LANG === "en" ? "English" : "español rioplatense"
const CANT = BASE_LANG === "en" ? "⟨you don't understand⟩" : "⟨no entendés⟩"

export interface Heard { tag: string; text: string; understood: boolean }
/** wrap an utterance with its in-world language tag + the comprehension barrier */
export function heard(text: string, spoken: LangCode, alsoKnown?: LangCode): Heard {
  // you understand your native tongue (BASE_LANG) AND — when you possess a local — their village's language too
  const understood = spoken === BASE_LANG || spoken === alsoKnown
  return { tag: `(${langName(spoken)})`, text: understood ? text : CANT, understood }
}
