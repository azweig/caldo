// society.ts — the economic + legal + cultural layer that runs each periodic tick on a World.
// Money flows (living costs, merchants, entrepreneurs, bankruptcy), crime + Noahide courts ("black sheep"),
// and creative works (books + art) by the rare openness-rich creators. Every notable act is logged as a
// Deed so we can later list the most INFLUENTIAL people per generation and what they did.

import type { World, Creature } from "./world"
import { ageYears, isMature } from "./world"
import { feel, bond } from "./life"
import { conscience, NOAHIDE } from "./morality"
import { runPolitics } from "./politics"

const rnd = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)]
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

const BOOK_THEMES = ["el origen del mundo", "los astros y el destino", "la memoria de los ancestros", "el arte de gobernar", "la naturaleza del alma", "viajes a tierras lejanas", "el amor y la pérdida", "las leyes de los números", "la caída de los reinos", "sueños y presagios"]
const ART_FORMS = ["un mural", "una escultura", "un tapiz", "una talla", "un retrato", "un fresco", "una sinfonía", "una danza ritual"]
const ART_SUBJ = ["la cosecha", "la diosa madre", "la guerra de los abuelos", "el río sagrado", "los amantes", "la ciudad soñada", "el eclipse", "la muerte y el renacer"]
const BOOK_OPENERS = ["En el principio, cuando los astros aún eran jóvenes,", "Nadie recuerda ya el nombre del primer rey,", "Dicen los ancianos que el río guarda la memoria de todos,", "Hubo un tiempo en que los hombres no conocían la muerte,", "Cuentan que bajo la ciudad duerme un dios antiguo,"]
const ART_DESC = ["trazos de ocre y carbón que parecen moverse a la luz del fuego", "una figura serena que mira más allá de quien la observa", "colores imposibles que ningún taller supo repetir", "líneas que cuentan, sin palabras, toda una vida"]

// Headless: works get a templated excerpt/description so they feel real without an LLM. In the browser,
// llm.ts can REPLACE this with genuine generated content using the prompt below (when the pod GPU is on).
export function workPrompt(authorName: string, era: string, kind: "libro" | "obra", title: string): string {
  return kind === "libro"
    ? `Sos ${authorName}, autor en la era ${era}. Escribí el primer párrafo (4-5 líneas) de tu libro titulado ${title}, en su voz y su época. Solo el texto.`
    : `Sos ${authorName}, artista en la era ${era}. Describí en 2-3 frases tu obra "${title}": qué representa, su técnica y su emoción. Solo la descripción.`
}

export function personOf(c: Creature) { return { five: c.psyche.five, dark: c.dark, archetype: c.archetype } }

export function runSociety(w: World, wild: Creature[]) {
  const adults = wild.filter(isMature)
  if (adults.length < 2) return
  const price = 1 + w.era * 0.08

  // ── ECONOMY: agents must AFFORD housing + food + their CHILDREN. Provide, or your family's health falls. ──
  const homeKids = new Map<object, number>(), homeAdults = new Map<object, number>()
  for (const c of wild) (isMature(c) ? homeAdults : homeKids).set(c.home, ((isMature(c) ? homeAdults : homeKids).get(c.home) || 0) + 1)
  let pot = 0
  for (const c of adults) {
    const dependents = (homeKids.get(c.home) || 0) / (homeAdults.get(c.home) || 1) // share of the household's children
    const cost = price * (1.8 + 0.3 * c.genome.size + dependents * 0.95) // supporting kids is the cost of responsibility
    if (c.money >= cost) {
      c.money -= cost; pot += cost
      c.health = Math.min(100, c.health + 3); c.mental = Math.min(100, c.mental + 2) // fed + housed → recover
    } else {
      pot += Math.max(0, c.money); c.money -= cost // pay what you can; the rest is debt
      c.health = Math.max(0, c.health - 4); c.mental = Math.max(0, c.mental - 3) // can't fully provide → slow decline (recoverable)
    }
    if (c.partner) c.mental = Math.min(100, c.mental + 0.6) // a partner buffers stress
    c.irritability = Math.max(0.03, Math.min(0.98, c.irritability * 0.9 + (1 - c.mental / 100) * 0.22 + (0.5 - c.psyche.five.a) * 0.05))
  }
  // children's wellbeing rides on whether their FAMILY can provide
  const provider = new Map<object, number>()
  for (const c of adults) { const m = provider.get(c.home) ?? -Infinity; if (c.money > m) provider.set(c.home, c.money) }
  for (const c of wild) if (!isMature(c)) {
    const prov = provider.get(c.home) ?? -50
    if (prov >= 0) { c.health = Math.min(100, c.health + 3); c.mental = Math.min(100, c.mental + 2) }
    else { c.health = Math.max(0, c.health - 5); c.mental = Math.max(0, c.mental - 3) } // a poor family → the kids go hungry
  }
  const sellers = adults.filter((c) => c.profCat === "comercio" || c.business)
  if (sellers.length) { const share = Math.min(pot * 0.5 / sellers.length, 60 + w.era * 8); for (const s of sellers) s.money += share } // merchants collect part of spending, capped
  for (const c of adults) {
    const entrepreneurial = c.archetype === "emprendedor" || (c.psyche.five.o > 0.58 && c.psyche.five.n < 0.46 && c.psyche.five.e > 0.5)
    if (entrepreneurial && !c.business && c.money > 35 && Math.random() < (c.archetype === "emprendedor" ? 0.08 : 0.03)) {
      c.business = true; c.money -= 25
      w.logDeed({ day: w.clockDays, gen: c.generation, who: c.id, name: `${c.name} ${c.surname}`, kind: "negocio", text: "fundó un negocio", impact: 6 })
    }
    if (c.business) {
      c.money += price * 4
      const risk = 0.02 + 0.06 * (1 - c.psyche.five.c)
      if (c.money < 0 || Math.random() < risk) {
        c.business = false; c.money = Math.max(c.money, -25)
        w.logDeed({ day: w.clockDays, gen: c.generation, who: c.id, name: `${c.name} ${c.surname}`, kind: "quiebra", text: "quebró su negocio", impact: -3 })
      }
    }
  }

  // ── the country's political system reshapes the economy (redistribution/hoarding, unions, subversives) ──
  runPolitics(w, adults, price)

  // ── CRIME + COURTS (Noahide law #1): low-conscience adults break the law; courts catch + punish ──
  for (const c of adults) {
    const con = conscience(personOf(c))
    const stress = c.irritability * 0.5 + (1 - c.mental / 100) * 0.5 // desperation + a short fuse
    if (con - stress * 0.45 > 0.28) continue // the desperate + irritable cross the line more easily
    if (Math.random() > (0.4 - con + stress * 0.3) * 0.08) continue
    const victim = rnd(adults.filter((o) => o !== c))
    if (!victim) continue
    let lawKey = "robo"
    if (c.dark.psycho > 0.6 && Math.random() < 0.28) lawKey = "asesinato"
    else if (c.partner && c.dark.mach > 0.5 && Math.random() < 0.3) lawKey = "inmoralidad"
    c.crimes = (c.crimes || 0) + 1
    const law = NOAHIDE.find((l) => l.key === lawKey)!
    const caught = Math.random() < 0.35 + w.era * 0.02 // better institutions catch more
    if (lawKey === "asesinato") {
      const vi = w.creatures.indexOf(victim); if (vi >= 0) { w.creatures.splice(vi, 1); w.deaths++; w.deathCauses.violencia++ }
      w.logDeed({ day: w.clockDays, gen: c.generation, who: c.id, name: `${c.name} ${c.surname}`, kind: "crimen", text: `asesinó a ${victim.name} ${victim.surname}`, impact: -20 })
      if (caught) { const ci = w.creatures.indexOf(c); if (ci >= 0) { w.creatures.splice(ci, 1); w.deaths++ }; w.logDeed({ day: w.clockDays, gen: c.generation, who: c.id, name: `${c.name} ${c.surname}`, kind: "justicia", text: "ejecutado por el tribunal", impact: 0 }) }
      if (c.life) c.life.rep = Math.max(-1, c.life.rep - 0.5) // a killer's name is cursed
    } else {
      if (lawKey === "robo") { const loot = Math.min(Math.max(0, victim.money), 10 + price * 5); victim.money -= loot; c.money += loot }
      w.logDeed({ day: w.clockDays, gen: c.generation, who: c.id, name: `${c.name} ${c.surname}`, kind: "crimen", text: lawKey === "inmoralidad" ? "cometió adulterio" : `robó a ${victim.name} ${victim.surname}`, impact: -4 })
      if (c.life) c.life.rep = Math.max(-1, c.life.rep - 0.2)
      feel(victim, "enojado", 0.7); bond(victim, c.id, -0.6) // the victim resents the thief
      if (caught) { c.money -= price * 10 * (0.4 + 0.6 * law.severity); w.logDeed({ day: w.clockDays, gen: c.generation, who: c.id, name: `${c.name} ${c.surname}`, kind: "justicia", text: "multado por el tribunal", impact: 0 }) }
    }
  }

  // ── CULTURE: the rare openness-rich writers + artists create works that lift the whole people ──
  for (const c of adults) {
    const writer = !!c.profBase && c.profBase.toLowerCase().includes("escrit")
    const artist = c.profCat === "arte"
    if ((!writer && !artist) || c.psyche.five.o < 0.6) continue
    if (Math.random() > 0.015 + 0.03 * c.psyche.five.o) continue
    const impact = Math.round(4 + c.knowledge / 12 + c.psyche.five.o * 6)
    if (writer || Math.random() < 0.4) {
      const title = `«${cap(rnd(BOOK_THEMES))}»`
      w.logDeed({ day: w.clockDays, gen: c.generation, who: c.id, name: `${c.name} ${c.surname}`, kind: "libro", text: `escribió ${title}`, impact, content: `${rnd(BOOK_OPENERS)} …` })
    } else {
      const title = `${rnd(ART_FORMS)} sobre ${rnd(ART_SUBJ)}`
      w.logDeed({ day: w.clockDays, gen: c.generation, who: c.id, name: `${c.name} ${c.surname}`, kind: "obra", text: `creó ${title}`, impact, content: ART_DESC[Math.floor(Math.random() * ART_DESC.length)] })
    }
    w.wisdom = Math.min(100, w.wisdom + impact * 0.04)
    if (c.life) { feel(c, "orgulloso", 0.8); c.life.rep = Math.min(1, c.life.rep + 0.15); if (c.life.goalKey === "obra") c.life.goalProg = Math.min(1, c.life.goalProg + 0.18) } // the artist's pride + renown
  }
}

// ── stats for the "ver más" panel ──
export function wealthStats(w: World) {
  const adults = w.creatures.filter((c) => !c.isAvatar && isMature(c))
  const m = adults.map((c) => c.money).sort((a, b) => a - b)
  const n = m.length || 1
  const total = m.reduce((a, b) => a + b, 0)
  let g = 0; for (let i = 0; i < m.length; i++) g += (2 * (i + 1) - n - 1) * m[i]
  const gini = total > 0 && n > 1 ? g / (n * total) : 0
  return {
    gini: Math.abs(gini), mean: total / n,
    p10: Math.round(m[Math.floor(n * 0.1)] || 0), p50: Math.round(m[Math.floor(n * 0.5)] || 0), p90: Math.round(m[Math.floor(n * 0.9)] || 0),
    entrepreneurs: adults.filter((c) => c.business).length,
    poor: adults.filter((c) => c.money < 0).length,
    richest: adults.slice().sort((a, b) => b.money - a.money).slice(0, 5).map((c) => ({ name: `${c.name} ${c.surname}`, money: Math.round(c.money), arch: c.archetype })),
  }
}

// the most INFLUENTIAL people, grouped by generation (by total deed impact), with what they did
export function influentialByGen(w: World, perGen = 3) {
  type Work = { kind: "libro" | "obra"; text: string; content: string; who: number; title: string }
  const byPerson = new Map<number, { name: string; gen: number; impact: number; deeds: string[]; works: Work[] }>()
  for (const d of w.deeds) {
    let e = byPerson.get(d.who)
    if (!e) { e = { name: d.name, gen: d.gen, impact: 0, deeds: [], works: [] }; byPerson.set(d.who, e) }
    e.impact += d.impact
    if (["libro", "obra", "negocio", "crimen", "descubrimiento", "sindicato", "subversivo", "reforma", "represión"].includes(d.kind)) e.deeds.push(d.text)
    if ((d.kind === "libro" || d.kind === "obra") && d.content) e.works.push({ kind: d.kind as "libro" | "obra", text: d.text, content: d.content, who: d.who, title: d.text.match(/«([^»]+)»/)?.[1] || d.text.replace(/^\S+\s/, "") })
  }
  const gens = new Map<number, { name: string; impact: number; deeds: string[]; works: Work[] }[]>()
  for (const e of byPerson.values()) { const a = gens.get(e.gen) || []; a.push(e); gens.set(e.gen, a) }
  return [...gens.entries()].sort((a, b) => a[0] - b[0]).map(([gen, arr]) => ({
    gen, people: arr.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact)).slice(0, perGen),
  }))
}
export { ageYears }
