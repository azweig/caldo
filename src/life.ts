// life.ts — the inner life that makes an aldeano feel like a person, not a forager:
// NEEDS (rest/social/fun) that decay and press on the mind · a primary EMOTION that reacts to events and
// fades · a long-term GOAL drawn from their character · a VOCATION fit + craft MASTERY that grows with years ·
// a HOBBY and a personal QUIRK · a web of RELATIONSHIPS (friends/rivals) + a REPUTATION spread by gossip ·
// and chronic CONDITIONS (grief, addiction) that linger. All of it is additive: it modulates the existing
// mood/behaviour, drives leisure choices, and surfaces as the creature's visible "inner life".

import type { Creature } from "./world"

export interface Life {
  rest: number; social: number; fun: number   // needs 0..100 (100 = satisfied); hunger is `energy`
  emotion: string; emoInt: number              // current felt emotion + intensity 0..1 (decays)
  goal: string; goalKey: string; goalProg: number // a life ambition + progress 0..1
  vocFit: number; mastery: number              // how the job fits them + craft mastery (years → 0..1)
  hobby: string; quirk: string                 // leisure pursuit + signature trait
  rep: number                                  // reputation -1..1 (spread by word of mouth)
  rels: Record<number, number>                 // id → bond -1 (enemy) .. +1 (close friend)
  condition: string; condDays: number          // chronic: "" | "duelo" | "depresión" | "adicción" | "trauma"
  intent: string                               // what this MIND wants to do right now (its own choice)
}

// each person decides for THEMSELVES what to do: their most pressing need wins, weighted by who they are.
// this is the autonomous "brain" — two people in the same spot will choose differently.
export function decideIntent(c: Creature): string {
  const L = c.life; if (!L) return "vagar"
  const f = c.psyche.five
  if (c.energy < 92) return "comer"                                   // hunger first
  if (L.rest < 28) return "descansar"
  if (L.social < 30 + f.e * 22) return "socializar"                  // extraverts seek company much sooner
  if (L.fun < 26) return "disfrutar"
  if (!c.partner && L.goalKey === "amor" && Math.random() < 0.4) return "cortejar"
  if (c.profCat && (f.c > 0.45 || L.goalKey === "rico" || L.goalKey === "obra" || L.goalKey === "poder")) return "trabajar"
  return Math.random() < 0.45 ? "socializar" : "trabajar"           // the rest potter between people + work
}
export const INTENT_LABEL: Record<string, string> = {
  comer: "buscando comida", descansar: "yendo a descansar", socializar: "buscando compañía",
  disfrutar: "buscando un rato de ocio", cortejar: "buscando el amor", trabajar: "yendo a trabajar", vagar: "vagando",
}

export const EMO = {
  alegre: "😊", triste: "😢", enojado: "😠", asustado: "😨", enamorado: "🥰",
  orgulloso: "😌", afligido: "💔", celoso: "😒", aburrido: "🥱", esperanzado: "✨", neutral: "",
} as const

const QUIRKS = ["habla con las manos", "colecciona piedras", "le teme a la oscuridad", "siempre llega tarde", "canturrea al caminar", "guarda rencores", "regala comida", "habla con los animales", "madruga siempre", "supersticioso", "tacaño", "generoso a lo tonto", "cuenta historias", "perfeccionista", "soñador", "cabezadura", "burlón", "callado", "chismoso", "valiente hasta lo temerario", "evita las multitudes", "ama la lluvia", "tararea canciones viejas", "junta amuletos"]
const HOBBIES_SOCIAL = ["la taberna", "contar historias", "el juego de dados", "bailar", "las reuniones"]
const HOBBIES_OPEN = ["la música", "pintar", "tallar madera", "observar las estrellas", "escribir versos"]
const HOBBIES_BODY = ["correr", "la lucha", "la caza", "nadar", "trepar"]
const HOBBIES_CALM = ["el jardín", "pescar", "tejer", "meditar", "caminar al bosque"]

// a life goal drawn from the Enneagram core (0..8) + a few trait-driven ones
const ENN_GOAL: [string, string][] = [
  ["vivir con rectitud", "virtud"], ["ser amado y necesario", "amor"], ["prosperar y destacar", "rico"],
  ["dejar una obra única", "obra"], ["entender el mundo", "saber"], ["estar a salvo y rodeado", "familia"],
  ["vivir mil aventuras", "mundo"], ["mandar y proteger", "poder"], ["vivir en paz con todos", "paz"],
]
export function pickGoal(c: Creature): { goal: string; key: string } {
  const f = c.psyche.five, t = c.psyche.type % 9
  if (f.o > 0.78) return { goal: "crear una obra que perdure", key: "obra" }
  if (c.archetype === "emprendedor" || f.c > 0.8) return { goal: "hacerse rico y próspero", key: "rico" }
  if (c.powerHungry) return { goal: "ascender y gobernar", key: "poder" }
  if (f.a > 0.78) return { goal: "criar una familia grande y feliz", key: "familia" }
  const [g, k] = ENN_GOAL[t]
  return { goal: g, key: k }
}
function pickHobby(c: Creature): string {
  const f = c.psyche.five
  const pool = f.e > 0.62 ? HOBBIES_SOCIAL : f.o > 0.62 ? HOBBIES_OPEN : f.n < 0.4 && f.e > 0.45 ? HOBBIES_BODY : HOBBIES_CALM
  return pool[c.id % pool.length]
}

export function newLife(c: Creature): Life {
  const g = pickGoal(c)
  return {
    rest: 70 + Math.random() * 20, social: 60 + Math.random() * 25, fun: 60 + Math.random() * 25,
    emotion: "neutral", emoInt: 0,
    goal: g.goal, goalKey: g.key, goalProg: 0,
    vocFit: 0.5, mastery: 0,
    hobby: pickHobby(c), quirk: QUIRKS[(c.id * 7) % QUIRKS.length],
    rep: 0, rels: {}, condition: "", condDays: 0, intent: "vagar",
  }
}

// how well a profession category fits a personality (0..1) — the source of job satisfaction
const FIT: Partial<Record<string, (f: { o: number; c: number; e: number; a: number; n: number }) => number>> = {
  saber: (f) => 0.4 + f.o * 0.6, enseñanza: (f) => 0.3 + f.a * 0.4 + f.e * 0.3, arte: (f) => 0.2 + f.o * 0.8,
  salud: (f) => 0.3 + f.a * 0.5 + f.c * 0.2, cuidado: (f) => 0.3 + f.a * 0.7, ingeniería: (f) => 0.4 + f.o * 0.3 + f.c * 0.3,
  construcción: (f) => 0.4 + f.c * 0.4, oficio: (f) => 0.4 + f.c * 0.4, comercio: (f) => 0.3 + f.e * 0.4 + (1 - f.a) * 0.2,
  liderazgo: (f) => 0.2 + f.e * 0.5 + (1 - f.n) * 0.3, defensa: (f) => 0.3 + f.e * 0.3 + (1 - f.n) * 0.4,
  exploración: (f) => 0.3 + f.o * 0.5 + f.e * 0.2, comida: (f) => 0.45 + f.c * 0.2, espíritu: (f) => 0.3 + f.o * 0.3 + f.a * 0.3,
}
export function vocationFit(c: Creature): number {
  const fn = FIT[c.profCat as string]; return fn ? Math.max(0, Math.min(1, fn(c.psyche.five))) : 0.5
}

// raise an emotion only if it's stronger than what they already feel (the loudest feeling wins)
export function feel(c: Creature, emotion: string, intensity: number) {
  const L = c.life; if (!L) return
  if (intensity >= L.emoInt - 0.05) { L.emotion = emotion; L.emoInt = Math.min(1, intensity) }
}
// nudge a relationship between two creatures (remembered by both)
export function bond(c: Creature, otherId: number, delta: number) {
  const L = c.life; if (!L) return
  L.rels[otherId] = Math.max(-1, Math.min(1, (L.rels[otherId] || 0) + delta))
  if (Math.abs(L.rels[otherId]) < 0.05) delete L.rels[otherId]
  const ids = Object.keys(L.rels) // keep only the strongest ~8 ties
  if (ids.length > 8) { const weak = ids.reduce((a, b) => Math.abs(L.rels[+a]) < Math.abs(L.rels[+b]) ? a : b); delete L.rels[+weak] }
}

// a whole-DAY inner update (one sim step = one day): needs ebb + press on the mind, emotion fades,
// goal + mastery creep, conditions heal. derived from the creature so it needs no costly neighbour scan.
export function lifeTick(c: Creature, partnerAlive: boolean, householdSize: number) {
  const L = c.life; if (!L) return
  const f = c.psyche.five
  L.rest = clamp(L.rest + (c.sick ? -3 : 6) - c.irritability * 4)                          // sleep restores; illness/stress disrupt
  const company = (partnerAlive ? 2.4 : 0) + Math.min(3, householdSize - 1) * 0.8 + f.e * 1.4
  L.social = clamp(L.social - 3.6 + company)                                                // isolation drains it; introverts mind less
  L.fun = clamp(L.fun + 0.4 + (c.money < 3 ? -0.7 : 1.4) + (f.o + f.e) * 0.4)                // their hobby cheers them unless destitute
  // unmet needs weigh on mood + colour how they feel
  let drag = 0
  if (L.rest < 25) { drag += 0.5; feel(c, "aburrido", 0.3) }
  if (L.social < 22) { drag += 0.4; feel(c, "triste", 0.35) }
  if (L.fun < 22) { drag += 0.3; feel(c, "aburrido", 0.4) }
  if (L.social > 70 && L.fun > 70 && c.partner) feel(c, "alegre", 0.3) // a full, connected life lifts the spirit
  if (Math.random() < 0.02) feel(c, Math.random() < 0.7 ? "alegre" : "triste", 0.24) // the small good + bad days of an ordinary life
  c.mental = clamp(c.mental - drag)
  c.irritability = Math.max(0, Math.min(1, c.irritability + (L.rest < 25 ? 0.012 : -0.004)))
  // emotion fades back to neutral
  L.emoInt *= 0.965; if (L.emoInt < 0.08) { L.emotion = "neutral"; L.emoInt = 0 }
  // vocation + mastery
  if (c.profCat && L.vocFit === 0.5) L.vocFit = vocationFit(c)
  if (c.profCat && L.mastery < 1) L.mastery = Math.min(1, L.mastery + 0.00018 * (0.6 + c.psyche.five.c))
  // chronic conditions slowly heal (faster if cared-for = high mental)
  if (L.condition) { L.condDays--; if (L.condDays <= 0) { L.condition = ""; feel(c, "esperanzado", 0.4) } }
  // long-term goal progress (light; events add the big jumps)
  L.goalProg = Math.max(0, Math.min(1, L.goalProg + goalDrift(c) * 0.001))
  // ELDERS earn quiet respect for their years + wisdom (their reputation slowly rises)
  const age = c.ageDays / 360
  if (age > 55) L.rep = Math.min(1, L.rep + 0.0006 * Math.min(20, age - 55))
}
function goalDrift(c: Creature): number {
  const L = c.life!; switch (L.goalKey) {
    case "rico": return c.money > 60 ? 1 : 0.2
    case "familia": return c.children
    case "amor": return c.partner ? 1 : 0
    case "saber": case "obra": return c.knowledge / 40
    case "poder": return c.powerHungry ? 0.6 : 0.1
    case "mundo": return 0.4
    default: return 0.3
  }
}
const clamp = (v: number) => Math.max(0, Math.min(100, v))

// a one-line read of their inner life, for the click card
export function innerLine(c: Creature): string {
  const L = c.life; if (!L) return ""
  const need = L.rest < 25 ? "agotada" : c.energy < 35 ? "con hambre" : L.social < 22 ? "sola" : L.fun < 22 ? "aburrida" : "tranquila"
  const emo = L.emoInt > 0.25 && L.emotion !== "neutral" ? ` · ${(EMO as Record<string, string>)[L.emotion] || ""} ${L.emotion}` : ""
  const now = INTENT_LABEL[L.intent] ? ` · ahora ${INTENT_LABEL[L.intent]}` : ""
  return `${need}${emo}${now} · sueña con ${L.goal.toLowerCase()}`
}
