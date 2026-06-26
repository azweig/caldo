// affairs.ts — INTER-COUNTRY simulation: relations (peace / alliance / war), migration, and war between the
// separate country Worlds. This is sim logic, so it lives here (not in the UI bootstrap) and uses the seeded
// rng so it's reproducible. Called periodically from the game loop via worldAffairs(countries, steps).
import { World, isMature } from "./world"
import { transportLevel } from "./civconfig"
import { rand } from "./rng"

export interface AffairCountry { name: string; world: World }

function topReligion(w: World): string {
  const r: Record<string, number> = {}
  for (const c of w.creatures) if (!c.isAvatar && c.religion) r[c.religion] = (r[c.religion] || 0) + 1
  return Object.entries(r).sort((a, b) => b[1] - a[1])[0]?.[0] || ""
}
export function relationScore(A: AffairCountry, B: AffairCountry): number {
  let s = 1
  const ra = topReligion(A.world), rb = topReligion(B.world)
  if (ra && ra === rb) s += 2.5; else s -= 1 // shared faith bonds; different divides
  if (A.world.gov === B.world.gov) s += 1; else s -= 0.5 // like governments get along
  s -= Math.abs(A.world.era - B.world.era) * 0.25 // a big tech gap breeds resentment
  s -= (A.world.violence + B.world.violence) * 1.8 // violent peoples clash
  s -= (A.world.psychopathy + B.world.psychopathy) * 2.5
  if (A.world.monarch?.powerHungry || B.world.monarch?.powerHungry) s -= 1.5 // a despot wants conquest
  return s
}
export function relationLabel(s: number): string { return s > 3 ? "aliados 🤝" : s > 1 ? "paz" : s > -1 ? "neutral" : s > -3 ? "tensión" : "guerra ⚔" }

function warDeaths(w: World, n: number) {
  const adults = w.creatures.filter((c) => !c.isAvatar && isMature(c))
  for (let k = 0; k < n && adults.length > 6; k++) {
    const v = adults.splice(Math.floor(rand() * adults.length), 1)[0]
    const idx = w.creatures.indexOf(v); if (idx >= 0) { w.creatures.splice(idx, 1); w.deaths++ }
  }
}
function migrateBetween(from: AffairCountry, to: AffairCountry) {
  if (from === to) return
  const pool = from.world.creatures.filter((c) => !c.isAvatar && isMature(c))
  if (pool.length < 16) return
  const c = pool[Math.floor(rand() * pool.length)]
  from.world.creatures.splice(from.world.creatures.indexOf(c), 1)
  c.x = to.world.airport.x + rand() * 80; c.y = to.world.airport.y + rand() * 50
  c.home = to.world.houses[Math.floor(rand() * to.world.houses.length)]; c.goingHome = false; c.partner = 0; c.pregnant = 0
  to.world.creatures.push(c)
  from.world.chronicle.push({ day: from.world.clockDays, text: `${c.name} ${c.surname} partió a ${to.name} ✈` })
  to.world.chronicle.push({ day: to.world.clockDays, text: `llegó ${c.name} ${c.surname} desde ${from.name} ✈` })
}

// TRADE JOURNEYS: a merchant or scout sets off to visit ANOTHER town — to trade, learn, pick up its language —
// and returns days later the richer for it. They're off the map while away (handled in world.step).
function sendTravelers(countries: AffairCountry[]) {
  for (const A of countries) {
    if (A.world.era < 2) continue // no roads/travel until carts (~era 2)
    const wanderers = A.world.creatures.filter((c) => !c.isAvatar && isMature(c) && !(c.away && c.away > 0) && (c.profCat === "comercio" || c.profCat === "exploración"))
    if (!wanderers.length || rand() > 0.5) continue
    const c = wanderers[Math.floor(rand() * wanderers.length)]
    const others = countries.filter((b) => b !== A)
    const B = others[Math.floor(rand() * others.length)]
    if (!B) continue
    c.away = 18 + Math.floor(rand() * 50) // ~3-10 weeks on the road
    c.awayTo = B.world.cultureName || B.name
    A.world.chronicle.push({ day: A.world.clockDays, text: `${c.name} ${c.surname} partió de viaje a ${c.awayTo} 🧳` })
  }
}

let migrateAcc = 0
// runs periodically: transport gates contact, the relation decides migration / alliance / war
export function worldAffairs(countries: AffairCountry[], steps: number) {
  migrateAcc += steps
  if (migrateAcc < 450 || countries.length < 2) return
  migrateAcc = 0
  sendTravelers(countries)
  const i = Math.floor(rand() * countries.length)
  const j = (i + 1 + Math.floor(rand() * (countries.length - 1))) % countries.length
  const A = countries[i], B = countries[j]
  if (Math.min(transportLevel(A.world.era), transportLevel(B.world.era)) < 1) return // isolated until carts/boats (~era 3)
  const label = relationLabel(relationScore(A, B))
  if (label.startsWith("guerra")) {
    const sa = A.world.militaryStrength(), sb = B.world.militaryStrength(), total = sa + sb || 1
    const aLoss = 1 + Math.floor((5 * sb) / total), bLoss = 1 + Math.floor((5 * sa) / total)
    warDeaths(A.world, aLoss); warDeaths(B.world, bLoss)
    const aWins = sa >= sb, winner = aWins ? A : B, loser = aWins ? B : A
    winner.world.research += 1800 // spoils of war
    A.world.chronicle.push({ day: A.world.clockDays, text: `⚔ guerra con ${B.name} — ${aWins ? "victoria" : "derrota"}, ${aLoss} caídos` })
    B.world.chronicle.push({ day: B.world.clockDays, text: `⚔ guerra con ${A.name} — ${aWins ? "derrota" : "victoria"}, ${bLoss} caídos` })
    if (rand() < 0.6) migrateBetween(loser, winner) // refugees flee to the victor
  } else if (label === "aliados 🤝") {
    migrateBetween(A, B); migrateBetween(B, A)
    const lag = A.world.era <= B.world.era ? A : B; lag.world.research += 5000 // shared technology
  } else if (label === "paz") {
    if (rand() < 0.5) migrateBetween(A, B); else migrateBetween(B, A)
  } else if (rand() < 0.4) {
    migrateBetween(A, B) // neutral/tense — the rare traveller
  }
}
