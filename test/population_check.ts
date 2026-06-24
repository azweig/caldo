// local check: do generated personalities match real-world base rates? (no cheating — measured, not placed)
import { genPopulation, genPerson, Person, Archetype } from "../src/population"
import { NOAHIDE, conscience, restraint } from "../src/morality"

const pct = (v: number) => (v * 100).toFixed(0).padStart(3)
const five = (p: Person) => `O${pct(p.five.o)} C${pct(p.five.c)} E${pct(p.five.e)} A${pct(p.five.a)} N${pct(p.five.n)}`

console.log("\n=== 30 personas generadas (una ciudad semilla en miniatura) ===")
for (let i = 0; i < 30; i++) {
  const p = genPerson()
  console.log(`${String(i + 1).padStart(2)}. ${p.archetype.padEnd(12)} ${five(p)}  ·  mach ${pct(p.dark.mach)} narc ${pct(p.dark.narc)} psico ${pct(p.dark.psycho)}`)
}

console.log("\n=== prevalencia sobre 10.000 personas vs. literatura ===")
const N = 10000
const pop = genPopulation(N)
const counts: Record<string, number> = {}
for (const p of pop) counts[p.archetype] = (counts[p.archetype] || 0) + 1
const expect: Record<string, string> = {
  "psicópata": "~1% (Hare)", "narcisista": "~1-3% (NPD)", "manipulador": "~12-16% (high-Mach)",
  "emprendedor": "~5-10%", "líder": "~8-12%", "altruista": "~10-15%", "ansioso": "~10-15%",
  "solitario": "~8-12%", "promedio": "el grueso",
}
const order: Archetype[] = ["psicópata", "narcisista", "manipulador", "emprendedor", "líder", "altruista", "ansioso", "solitario", "promedio"]
for (const k of order) {
  const c = counts[k] || 0
  console.log(`${k.padEnd(12)} ${String(c).padStart(5)}  (${(100 * c / N).toFixed(1).padStart(4)}%)   esperado ${expect[k]}`)
}

console.log("\n=== código noájida — 7 leyes base de la civilización ===")
for (const l of NOAHIDE) console.log(`  · ${l.name}${l.kind === "deber" ? " (deber)" : ""}`)

console.log("\n=== freno moral (conciencia) por arquetipo — ¿cuánto los frena cada ley? ===")
const sample: Partial<Record<Archetype, Person>> = {}
for (let i = 0; i < 200000 && Object.keys(sample).length < order.length; i++) { const p = genPerson(); if (!sample[p.archetype]) sample[p.archetype] = p }
console.log(`${"arquetipo".padEnd(12)} conciencia | freno a ASESINAR | freno a ROBAR`)
for (const k of order) {
  const p = sample[k]; if (!p) continue
  console.log(`${k.padEnd(12)} ${pct(conscience(p))}%       |       ${pct(restraint(p, "asesinato"))}%      |     ${pct(restraint(p, "robo"))}%`)
}
console.log("")
