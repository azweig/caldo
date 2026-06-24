// local check (node, no browser): are the psychological parameters coherent per age?
import { STAGES, stageOf, agePsyche } from "../src/lifestage"
import { randomPsyche, BigFive } from "../src/psyche"

const pct = (v: number) => (v * 100).toFixed(0).padStart(3)
const row = (label: string, f: BigFive) => `${label.padEnd(22)} O${pct(f.o)} C${pct(f.c)} E${pct(f.e)} A${pct(f.a)} N${pct(f.n)}`

console.log("\n=== 1) Las 9 etapas — capacidades de desarrollo por edad ===")
for (const s of STAGES) {
  const r = `${s.min}-${s.max > 120 ? "∞" : s.max}a`
  console.log(`${r.padStart(6)}  ${s.name.padEnd(18)} lengua ${pct(s.language)}% · ToM ${s.theoryOfMind ? "✓" : "·"} · abstracto ${s.abstractThought ? "✓" : "·"} · indep ${pct(s.independence)}% · aprende ×${s.learnRate}`)
  console.log(`        └ ${s.note}`)
}

console.log("\n=== 2) La MISMA persona (genes fijos) a distintas edades — cómo madura ===")
const fixed = randomPsyche()
console.log(row("set-point genético", fixed.five))
for (const age of [1, 4, 8, 14, 25, 42, 58, 72, 85]) {
  const { five, stage } = agePsyche(fixed, age)
  console.log(row(`${age}a · ${stage.name}`, five))
}

console.log("\n=== 3) Promedio poblacional (2000 psiques random) por edad — tendencias ===")
for (const age of [2, 8, 14, 25, 45, 70]) {
  const acc: BigFive = { o: 0, c: 0, e: 0, a: 0, n: 0 }, N = 2000
  for (let i = 0; i < N; i++) { const p = agePsyche(randomPsyche(), age).five; acc.o += p.o; acc.c += p.c; acc.e += p.e; acc.a += p.a; acc.n += p.n }
  console.log(row(`${age}a · ${stageOf(age).name}`, { o: acc.o / N, c: acc.c / N, e: acc.e / N, a: acc.a / N, n: acc.n / N }))
}
console.log("\nO=apertura · C=responsabilidad · E=extraversión · A=amabilidad · N=neuroticismo\n")
