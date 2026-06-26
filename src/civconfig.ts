// civconfig.ts — how a civilisation is BORN. The player configures it once (or starts a new one,
// which destroys the old): the starting era, the religious mix, how violent it is, what fraction are
// power-obsessed "psychopaths", and how many monarchies vs independent republics. The world then
// behaves accordingly (a stone-age civ has no tech and lives off foraging; a modern one is industrial).

import { LangCode } from "./i18n"
import { Culture, CULTURES } from "./cultures"

export type Gov = "monarquía" | "república"
export interface CountryCfg { name: string; flag: string; gov: Gov; lang: LangCode; system: EconSystem; culture: Culture }
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

// each land has a CLIMATE (by region) that shapes its food + health: cold freezes, deserts starve, tropics teem + fever
export const CLIMATES = ["templado", "frío", "desértico", "tropical"]
export function climateOf(region: number): string { return CLIMATES[region % 4] }

// transport per era — also gates how much countries can reach each other (level 0 = isolated)
export const TRANSPORT = [
  "a pie", "a pie y canoas", "animales de carga", "carros con ruedas", "carros y caballos",
  "barcos y calzadas", "carretas y veleros", "carabelas oceánicas", "diligencias",
  "trenes a vapor", "autos y bicicletas", "autos y aviones", "autos, trenes y aviones",
  "cohetes y jets", "vuelos supersónicos", "transporte autónomo", "drones y autónomos",
  "transporte cuántico", "naves interestelares",
]
export function transportOf(era: number): string { return TRANSPORT[Math.max(0, Math.min(TRANSPORT.length - 1, era))] }
export function transportLevel(era: number): number { return Math.max(0, Math.min(6, Math.floor(era / 3))) } // 0..6 reach between countries

export type EconSystem = "capitalista" | "socialista" | "dictadura"
export const ECON_SYSTEMS: EconSystem[] = ["capitalista", "socialista", "dictadura"]

export function buildCountries(monarchies: number, republics: number): CountryCfg[] {
  const out: CountryCfg[] = []
  // a monarchy leans authoritarian (dictatorship); republics alternate capitalist / socialist — for variety
  const sysFor = (gov: Gov, i: number): EconSystem => gov === "monarquía" ? "dictadura" : (i % 2 ? "socialista" : "capitalista")
  const pool = [...CULTURES].sort(() => Math.random() - 0.5) // each town gets a RANDOM distinct culture
  const add = (gov: Gov, i: number) => { const cul = pool[i % pool.length]; out.push({ name: cul.name, flag: cul.flag, gov, lang: (i % 2 ? "en" : "es") as LangCode, system: sysFor(gov, i), culture: cul }) }
  let i = 0
  for (let m = 0; m < monarchies; m++) add("monarquía", i++)
  for (let r = 0; r < republics; r++) add("república", i++)
  if (out.length) return out.slice(0, 6)
  const a = pool[0], b = pool[1]
  return [{ name: a.name, flag: a.flag, gov: "república", lang: "es", system: "capitalista", culture: a }, { name: b.name, flag: b.flag, gov: "monarquía", lang: "en", system: "dictadura", culture: b }]
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
