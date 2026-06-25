// cultures.ts — 100+ distinct civilisations. Each town is randomly seeded with one, and it shapes HOW the
// people evolve (a culture's ETHOS biases which technologies its minds are drawn to + how fast they realise
// them), how AGGRESSIVE they are, and what they BELIEVE. A warlike people races up metallurgy and weapons but
// lags in philosophy; a priestly people the opposite. No two towns climb the tree the same way.

import { Cat } from "./civ"

export type Faith = "politeísta" | "monoteísta" | "animista" | "ancestral"

// an ethos = a way of being a civilisation. bias multiplies innovation on techs DRIVEN by those categories.
export interface Ethos { bias: Partial<Record<Cat, number>>; aggression: number; psycho: number; faith: Faith }
export const ETHOS: Record<string, Ethos> = {
  guerrera:     { bias: { defensa: 1.8, oficio: 1.3, ingeniería: 1.15, saber: 0.7, arte: 0.6, espíritu: 0.8 }, aggression: 0.85, psycho: 0.05, faith: "politeísta" },
  imperial:     { bias: { liderazgo: 1.6, construcción: 1.4, defensa: 1.3, comercio: 1.2, saber: 0.95 }, aggression: 0.6, psycho: 0.045, faith: "politeísta" },
  mercante:     { bias: { comercio: 1.8, exploración: 1.4, oficio: 1.2, saber: 1.05, defensa: 0.8 }, aggression: 0.35, psycho: 0.03, faith: "politeísta" },
  sacerdotal:   { bias: { espíritu: 1.7, saber: 1.4, arte: 1.3, enseñanza: 1.2, defensa: 0.6 }, aggression: 0.3, psycho: 0.025, faith: "politeísta" },
  erudita:      { bias: { saber: 1.9, enseñanza: 1.5, arte: 1.2, ingeniería: 1.1, defensa: 0.7 }, aggression: 0.25, psycho: 0.02, faith: "politeísta" },
  agraria:      { bias: { comida: 1.7, construcción: 1.3, cuidado: 1.2, saber: 0.9, defensa: 0.8 }, aggression: 0.3, psycho: 0.025, faith: "animista" },
  nómada:       { bias: { exploración: 1.7, defensa: 1.3, comida: 1.2, construcción: 0.6, saber: 0.8 }, aggression: 0.55, psycho: 0.04, faith: "animista" },
  marinera:     { bias: { exploración: 1.8, comercio: 1.4, oficio: 1.25, ingeniería: 1.1, comida: 1.1 }, aggression: 0.45, psycho: 0.035, faith: "politeísta" },
  artesana:     { bias: { oficio: 1.7, arte: 1.5, ingeniería: 1.3, construcción: 1.2, defensa: 0.7 }, aggression: 0.3, psycho: 0.025, faith: "politeísta" },
  mística:      { bias: { espíritu: 1.8, saber: 1.3, arte: 1.3, cuidado: 1.1, defensa: 0.6 }, aggression: 0.2, psycho: 0.02, faith: "animista" },
  ingeniera:    { bias: { ingeniería: 1.8, construcción: 1.5, saber: 1.3, oficio: 1.2, espíritu: 0.8 }, aggression: 0.4, psycho: 0.03, faith: "politeísta" },
  igualitaria:  { bias: { enseñanza: 1.4, cuidado: 1.4, comida: 1.2, saber: 1.2, defensa: 0.7, liderazgo: 0.7 }, aggression: 0.2, psycho: 0.015, faith: "animista" },
  teocrática:   { bias: { espíritu: 1.6, liderazgo: 1.4, construcción: 1.3, saber: 1.1, comercio: 0.8 }, aggression: 0.5, psycho: 0.04, faith: "monoteísta" },
  tribal:       { bias: { comida: 1.4, espíritu: 1.4, defensa: 1.3, exploración: 1.2, ingeniería: 0.7 }, aggression: 0.45, psycho: 0.035, faith: "animista" },
  sanadora:     { bias: { salud: 1.8, cuidado: 1.5, saber: 1.3, espíritu: 1.1, defensa: 0.6 }, aggression: 0.2, psycho: 0.015, faith: "politeísta" },
  feudal:       { bias: { defensa: 1.4, construcción: 1.3, oficio: 1.2, liderazgo: 1.2, comercio: 0.9 }, aggression: 0.6, psycho: 0.045, faith: "monoteísta" },
}
const ETHOS_KEYS = Object.keys(ETHOS)

export interface Culture { name: string; ethos: string; deity: string; flag: string }

// ── ~55 real-history-flavoured cultures ──
const REAL: Culture[] = [
  { name: "Inca", ethos: "imperial", deity: "Inti el Sol", flag: "🌄" },
  { name: "Azteca", ethos: "guerrera", deity: "Huitzilopochtli", flag: "🦅" },
  { name: "Maya", ethos: "sacerdotal", deity: "Kukulkán", flag: "🐍" },
  { name: "Olmeca", ethos: "sacerdotal", deity: "el Jaguar", flag: "🐆" },
  { name: "Tolteca", ethos: "guerrera", deity: "Quetzalcóatl", flag: "🪶" },
  { name: "Egipcia", ethos: "teocrática", deity: "Ra", flag: "☀️" },
  { name: "Nubia", ethos: "imperial", deity: "Apedemak", flag: "🏹" },
  { name: "Romana", ethos: "imperial", deity: "Júpiter", flag: "🦅" },
  { name: "Griega", ethos: "erudita", deity: "los Olímpicos", flag: "🏛️" },
  { name: "Minoica", ethos: "marinera", deity: "la Diosa Serpiente", flag: "🐂" },
  { name: "Etrusca", ethos: "artesana", deity: "Tinia", flag: "⚱️" },
  { name: "Persa", ethos: "imperial", deity: "Ahura Mazda", flag: "🔥" },
  { name: "Babilónica", ethos: "sacerdotal", deity: "Marduk", flag: "🏯" },
  { name: "Sumeria", ethos: "agraria", deity: "Enlil", flag: "🌾" },
  { name: "Asiria", ethos: "guerrera", deity: "Ashur", flag: "⚔️" },
  { name: "Hitita", ethos: "guerrera", deity: "Tarhunna", flag: "🌩️" },
  { name: "Fenicia", ethos: "marinera", deity: "Baal", flag: "⛵" },
  { name: "Cartaginesa", ethos: "mercante", deity: "Tanit", flag: "🌙" },
  { name: "Hebrea", ethos: "teocrática", deity: "Yahvé", flag: "✡️" },
  { name: "Bizantina", ethos: "teocrática", deity: "el Dios Único", flag: "✝️" },
  { name: "Árabe", ethos: "teocrática", deity: "Alá", flag: "☪️" },
  { name: "Otomana", ethos: "imperial", deity: "Alá", flag: "🌙" },
  { name: "Celta", ethos: "tribal", deity: "los Druidas", flag: "🌳" },
  { name: "Nórdica", ethos: "guerrera", deity: "Odín", flag: "⚒️" },
  { name: "Anglosajona", ethos: "feudal", deity: "el Dios Único", flag: "🛡️" },
  { name: "Mongola", ethos: "nómada", deity: "Tengri", flag: "🐎" },
  { name: "Escita", ethos: "nómada", deity: "Tabiti", flag: "🏹" },
  { name: "Han", ethos: "imperial", deity: "el Cielo", flag: "🐉" },
  { name: "Japonesa", ethos: "artesana", deity: "los Kami", flag: "⛩️" },
  { name: "Coreana", ethos: "agraria", deity: "Hwanin", flag: "🏔️" },
  { name: "Védica", ethos: "sacerdotal", deity: "los Devas", flag: "🕉️" },
  { name: "Maurya", ethos: "imperial", deity: "el Dharma", flag: "☸️" },
  { name: "Khmer", ethos: "teocrática", deity: "Vishnu", flag: "🛕" },
  { name: "Tibetana", ethos: "mística", deity: "el Buda", flag: "🏔️" },
  { name: "Tailandesa", ethos: "sacerdotal", deity: "el Buda", flag: "🐘" },
  { name: "Javanesa", ethos: "marinera", deity: "los espíritus del mar", flag: "🌋" },
  { name: "Mali", ethos: "mercante", deity: "los Ancestros", flag: "🏜️" },
  { name: "Songhai", ethos: "imperial", deity: "Alá", flag: "🐪" },
  { name: "Aksum", ethos: "teocrática", deity: "el Dios Único", flag: "⛪" },
  { name: "Zulú", ethos: "guerrera", deity: "Unkulunkulu", flag: "🛡️" },
  { name: "Yoruba", ethos: "sacerdotal", deity: "los Orishas", flag: "🥁" },
  { name: "Akan", ethos: "mercante", deity: "Nyame", flag: "🪙" },
  { name: "Bantú", ethos: "agraria", deity: "los espíritus", flag: "🌍" },
  { name: "Mapuche", ethos: "tribal", deity: "Ngenechén", flag: "🌋" },
  { name: "Guaraní", ethos: "tribal", deity: "Tupã", flag: "🌿" },
  { name: "Muisca", ethos: "sacerdotal", deity: "el Sol y la Luna", flag: "🪙" },
  { name: "Polinesia", ethos: "marinera", deity: "Tangaroa", flag: "🌊" },
  { name: "Maorí", ethos: "guerrera", deity: "Tūmatauenga", flag: "🗿" },
  { name: "Aborigen", ethos: "mística", deity: "el Tiempo del Sueño", flag: "🪃" },
  { name: "Inuit", ethos: "nómada", deity: "Sedna", flag: "❄️" },
  { name: "Apache", ethos: "nómada", deity: "Usen", flag: "🏜️" },
  { name: "Iroquesa", ethos: "igualitaria", deity: "el Gran Espíritu", flag: "🪶" },
  { name: "Sioux", ethos: "nómada", deity: "Wakan Tanka", flag: "🦬" },
  { name: "Cherokee", ethos: "agraria", deity: "el Gran Espíritu", flag: "🌽" },
  { name: "Hawaiana", ethos: "marinera", deity: "Pelé", flag: "🌺" },
]

// ── ~60 invented cultures, deterministically built so the world has 100+ distinct peoples ──
const STEMS = ["Vael", "Tor", "Qen", "Mhor", "Zar", "Ilu", "Drak", "Sael", "Onn", "Brak", "Yth", "Cal", "Nuri", "Osma", "Veth", "Lho", "Amk", "Sken", "Tav", "Wol", "Esh", "Kran", "Joran", "Mux", "Pal", "Reth", "Aza", "Bom", "Cyr", "Dun"]
const TAILS = ["andia", "ovia", "esh", "ara", "ium", "oria", "akh", "una", "ystan", "mark", "heim", "opolis", "atl", "uacan", "veld", "gard", "tania", "essa", "or", "ai"]
const DEITIES = ["el Sol Eterno", "la Madre Tierra", "los Tres Vientos", "el Río Sagrado", "la Llama Viva", "los Antepasados", "el Cielo Único", "la Serpiente Cósmica", "el Gran Tejedor", "los Astros", "la Montaña Padre", "el Vacío", "la Luna Doble", "el Trueno", "los Guardianes", "la Semilla Primordial"]
const CFLAGS = ["🔥", "🌊", "🌙", "⭐", "🗿", "🌲", "⚡", "🏔️", "🌀", "🪐", "🦂", "🐺", "🦉", "🌾", "❄️", "🌸", "🏺", "⚜️", "🔱", "🪨"]

const GEN: Culture[] = []
for (let i = 0; i < 60; i++) {
  const a = (i * 7) % STEMS.length, b = (i * 5 + 3) % TAILS.length
  GEN.push({
    name: (STEMS[a].trim() + TAILS[b]).replace(/\s/g, ""),
    ethos: ETHOS_KEYS[(i * 3 + 1) % ETHOS_KEYS.length],
    deity: DEITIES[i % DEITIES.length],
    flag: CFLAGS[i % CFLAGS.length],
  })
}

export const CULTURES: Culture[] = [...REAL, ...GEN]

export function ethosOf(c: Culture): Ethos { return ETHOS[c.ethos] }
// innovation multiplier this culture gives to a tech driven by `drive` (different evolution paths)
export function cultureBias(c: Culture, drive: Cat): number { return ETHOS[c.ethos].bias[drive] ?? 1 }
// the starting religion mix this culture believes in
export function cultureReligions(c: Culture): { name: string; pct: number }[] {
  const f = ETHOS[c.ethos].faith
  if (f === "monoteísta") return [{ name: `culto a ${c.deity}`, pct: 0.82 }, { name: "los dudosos", pct: 0.18 }]
  if (f === "animista") return [{ name: `espíritus de ${c.name}`, pct: 0.55 }, { name: `culto a ${c.deity}`, pct: 0.3 }, { name: "chamánicos", pct: 0.15 }]
  if (f === "ancestral") return [{ name: "culto a los Ancestros", pct: 0.6 }, { name: `${c.deity}`, pct: 0.4 }]
  return [{ name: `culto a ${c.deity}`, pct: 0.45 }, { name: `los dioses de ${c.name}`, pct: 0.4 }, { name: "animistas", pct: 0.15 }] // politeísta
}
