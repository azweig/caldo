// local check (node): 100-agent start, families, health/mental tied to money, divorces, out-of-wedlock kids
import { World, ageYears, isMature } from "../src/world"

const w = new World(8)
const seed = w.creatures.filter((c) => !c.isAvatar)
console.log(`\nsemilla: ${seed.length} personas en ${new Set(seed.map((c) => c.surname)).size} familias`)

for (let y = 0; y < 70; y++) for (let d = 0; d < 360; d++) w.step()

const wild = w.creatures.filter((c) => !c.isAvatar)
const adults = wild.filter(isMature)
const avg = (arr: typeof wild, f: (c: typeof wild[0]) => number) => (arr.length ? Math.round(arr.reduce((s, c) => s + f(c), 0) / arr.length) : 0)
console.log(`\n=== 100 años · pob ${wild.length} · ${new Set(wild.map((c) => c.surname)).size} familias · era ${w.era} ===`)
console.log(`salud media ${avg(wild, (c) => c.health)}/100 · salud mental ${avg(wild, (c) => c.mental)}/100 · irritabilidad ${avg(wild, (c) => c.irritability * 100)}%`)

console.log("\n=== RESPONSABILIDAD: ¿el dinero protege la salud? ===")
const solvent = adults.filter((c) => c.money >= 0), indebt = adults.filter((c) => c.money < 0)
console.log(`adultos solventes ${solvent.length} → salud ${avg(solvent, (c) => c.health)} · mental ${avg(solvent, (c) => c.mental)}`)
console.log(`adultos en deuda  ${indebt.length} → salud ${avg(indebt, (c) => c.health)} · mental ${avg(indebt, (c) => c.mental)}`)
const kids = wild.filter((c) => !isMature(c))
console.log(`niños ${kids.length} → salud media ${avg(kids, (c) => c.health)} (dependen de que su familia provea)`)

console.log("\n=== FAMILIA ===")
console.log(`casados ${adults.filter((c) => c.partner).length}/${adults.length} · divorcios (histórico) ${w.deeds.filter((d) => d.kind === "divorcio").length}`)
console.log(`hijos fuera del matrimonio vivos: ${wild.filter((c) => c.parents && c.parents[1] === 0).length}`)

console.log(`\ncausas de muerte: ${Object.entries(w.deathCauses).map(([k, v]) => `${k} ${v}`).join(" · ")}\n`)
