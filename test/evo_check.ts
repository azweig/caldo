// local check (node): does the population EVOLVE sanely over a century? (growth, age structure, generations)
import { World, ageYears } from "../src/world"
import { stageOf } from "../src/lifestage"

const w = new World(8) // 8 sprites, default seed
console.log("\naño | pob | genMax | edadMedia | reparto por etapa")
console.log("----+-----+--------+-----------+------------------------------------")
for (let y = 0; y <= 120; y++) {
  for (let d = 0; d < 360; d++) w.step() // 360 days = 1 year
  if (y % 10 !== 0) continue
  const wild = w.creatures.filter((c) => !c.isAvatar)
  const avg = wild.length ? Math.round(wild.reduce((s, c) => s + ageYears(c), 0) / wild.length) : 0
  const gen = wild.length ? Math.max(...wild.map((c) => c.generation)) : 0
  const bk: Record<string, number> = {}
  for (const c of wild) { const k = stageOf(ageYears(c)).name; bk[k] = (bk[k] || 0) + 1 }
  const ds = Object.entries(bk).map(([k, v]) => `${k.slice(0, 10)}:${v}`).join("  ")
  console.log(`${String(y).padStart(3)} | ${String(wild.length).padStart(3)} | ${String(gen).padStart(6)} | ${String(avg).padStart(7)}a | ${ds}`)
}
console.log(`\ntotales → nacimientos ${w.births} · muertes ${w.deaths} · era ${w.era}`)
console.log(`causas de muerte → ${Object.entries(w.deathCauses).map(([k, v]) => `${k}:${v}`).join(" · ")}\n`)
