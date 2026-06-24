// civconfig.ts — how a civilisation is BORN. The player configures it once (or starts a new one,
// which destroys the old): the starting era, the religious mix, how violent it is, what fraction are
// power-obsessed "psychopaths", and how many monarchies vs independent republics. The world then
// behaves accordingly (a stone-age civ has no tech and lives off foraging; a modern one is industrial).

import { LangCode } from "./i18n"

export type Gov = "monarquía" | "república"
export interface CountryCfg { name: string; flag: string; gov: Gov; lang: LangCode }
export interface CivConfig {
  startEra: number
  religions: { name: string; pct: number }[] // weights (need not sum to 100)
  violence: number     // 0..1 — how prone to violent death/conflict
  psychopathy: number  // 0..1 — fraction born power-obsessed (drift toward rule + violence)
  countries: CountryCfg[]
}

export const RELIGIONS = [
  "sin credo (ateos)", "el Caldo Eterno", "culto a los Ancestros",
  "la Diosa Jardín", "el Orden Solar", "los Cinco Vientos",
]

// one food system per era (0..18) — what the civilisation eats by, and how abundant it is
export const FOOD_SYSTEMS = [
  "forrajeo y caza", "pesca y recolección", "agricultura temprana", "agricultura de regadío",
  "rotación de cultivos", "graneros y ganadería", "molinos y feudos agrícolas", "huertas y comercio de granos",
  "agronomía científica", "mecanización agrícola", "fertilizantes y cadena de frío", "revolución verde (agroquímica)",
  "agroindustria global", "cultivos satelitales", "transgénicos", "granjas verticales hidropónicas",
  "agricultura autónoma por IA", "cultivo celular y síntesis", "replicadores de materia",
]
export function foodSystem(era: number): string { return FOOD_SYSTEMS[Math.max(0, Math.min(FOOD_SYSTEMS.length - 1, era))] }

const NAME_POOL = ["Solandia", "Norvik", "Akahara", "Verdane", "Kessaria", "Tolmir", "Bramwell", "Yssel", "Drennan", "Mokoa", "Ulania", "Pravik", "Caldoria", "Ostmark"]
const FLAGS = ["🟧", "🔵", "🟣", "🟢", "🔴", "🟡", "⚪", "🟤", "🔶", "🔷", "🟩", "🟥", "🟦", "🟪"]

export function buildCountries(monarchies: number, republics: number): CountryCfg[] {
  const out: CountryCfg[] = []
  const add = (gov: Gov, i: number) => out.push({ name: NAME_POOL[i % NAME_POOL.length], flag: FLAGS[i % FLAGS.length], gov, lang: (i % 2 ? "en" : "es") as LangCode })
  let i = 0
  for (let m = 0; m < monarchies; m++) add("monarquía", i++)
  for (let r = 0; r < republics; r++) add("república", i++)
  return out.length ? out.slice(0, 6) : [{ name: "Solandia", flag: "🟧", gov: "república", lang: "es" }, { name: "Norvik", flag: "🔵", gov: "monarquía", lang: "en" }]
}

export function defaultConfig(): CivConfig {
  return {
    startEra: 0,
    religions: RELIGIONS.map((name, i) => ({ name, pct: i === 0 ? 30 : 14 })),
    violence: 0.3,
    psychopathy: 0.05,
    countries: buildCountries(1, 1),
  }
}

/** pick a religion index by the configured weights */
export function pickReligion(religions: { name: string; pct: number }[]): string {
  const total = religions.reduce((s, r) => s + Math.max(0, r.pct), 0) || 1
  let r = Math.random() * total
  for (const rel of religions) { r -= Math.max(0, rel.pct); if (r <= 0) return rel.name }
  return religions[0]?.name || "sin credo (ateos)"
}
