// politics.ts — the economic-political SYSTEM of a country shapes its society each periodic tick:
//   capitalista → free market, no redistribution (high inequality), workers may unionise
//   socialista  → the state taxes + shares wealth (low inequality), strong safety net
//   dictadura   → the elite/dictator hoards, and SUBVERSIVES are repressed (Kim-style totalitarianism)
// Unions and subversives are emergent social movements logged as Deeds (so they show up in the legends).

import type { World, Creature } from "./world"
import { isMature } from "./world"

const power = (c: Creature) => (c.powerHungry ? 50 : 0) + c.money / 100 + (c.profCat === "liderazgo" ? 30 : 0)

export function runPolitics(w: World, adults: Creature[], price: number) {
  if (adults.length < 4) return
  const sys = w.system
  const sorted = adults.map((c) => c.money).sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)] || 0

  // ── REDISTRIBUTION / HOARDING ──
  if (sys === "socialista") {
    const tax = 0.13
    let pool = 0
    for (const c of adults) { const t = Math.max(0, c.money) * tax; c.money -= t; pool += t }
    const share = pool / adults.length
    for (const c of adults) c.money += share // welfare state flattens the curve
  } else if (sys === "dictadura") {
    const dictator = w.monarch && isMature(w.monarch) ? w.monarch : adults.slice().sort((a, b) => power(b) - power(a))[0]
    let skim = 0
    for (const c of adults) { if (c === dictator) continue; const t = Math.max(0, c.money) * 0.11; c.money -= t; skim += t }
    if (dictator) dictator.money += skim // the regime hoards; the people stay poor
  }

  // ── UNIONS — workers organise to raise the floor (banned/crushed under a dictatorship) ──
  if (sys !== "dictadura") {
    const workers = adults.filter((c) => !c.business && c.profCat !== "comercio" && c.profCat !== "liderazgo" && c.money < median)
    if (workers.length >= 8 && Math.random() < 0.05) {
      const leader = workers.reduce((b, c) => (c.psyche.five.e + c.psyche.five.a > b.psyche.five.e + b.psyche.five.a ? c : b), workers[0])
      for (const wk of workers) wk.money += price * 5 // collective bargaining
      w.logDeed({ day: w.clockDays, gen: leader.generation, who: leader.id, name: `${leader.name} ${leader.surname}`, kind: "sindicato", text: `organizó un sindicato de ${workers.length} trabajadores`, impact: 10 })
    }
  }

  // ── SUBVERSIVES — opponents of the order; a dictatorship represses them, a free country reforms ──
  for (const c of adults) {
    if (c === w.monarch) continue
    const poverty = Math.max(0, 1 - (c.money + 20) / (median + 40))
    const oppression = sys === "dictadura" ? 0.55 : 0.08
    const urge = c.psyche.five.o * 0.4 + poverty * 0.4 + oppression * 0.5 - c.psyche.five.a * 0.3
    if (Math.random() > urge * 0.018) continue
    const name = `${c.name} ${c.surname}`
    if (sys === "dictadura") {
      if (Math.random() < 0.55) {
        const ci = w.creatures.indexOf(c); if (ci >= 0) { w.creatures.splice(ci, 1); w.deaths++; w.deathCauses.violencia++ }
        w.repressed++
        w.logDeed({ day: w.clockDays, gen: c.generation, who: c.id, name, kind: "represión", text: "desapareció por conspirar contra el régimen", impact: -6 })
      } else {
        w.logDeed({ day: w.clockDays, gen: c.generation, who: c.id, name, kind: "subversivo", text: "conspira en secreto contra el régimen", impact: 8 })
      }
    } else {
      w.logDeed({ day: w.clockDays, gen: c.generation, who: c.id, name, kind: "reforma", text: "lidera un movimiento de reforma social", impact: 9 })
    }
  }
}
