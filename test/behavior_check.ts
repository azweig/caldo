// local check (node): does poker-style decision-making differ sensibly by psychological profile?
import { Mind, lieDecision, careerDecision } from "../src/behavior"
import { BigFive } from "../src/psyche"

const f = (o: number, c: number, e: number, a: number, n: number): BigFive => ({ o, c, e, a, n })
const minds: { name: string; m: Mind }[] = [
  { name: "Joven audaz (O↑ C↓ N↓)",      m: { five: f(.85, .25, .8, .4, .2), knowledge: 18, intellect: .7 } },
  { name: "Anciano cauto (C↑ A↑ O↓)",    m: { five: f(.25, .9, .35, .8, .5), knowledge: 80, intellect: .6 } },
  { name: "Adulto listo (equilibrado)",  m: { five: f(.55, .65, .5, .55, .4), knowledge: 75, intellect: .9 } },
  { name: "Adolescente impulsivo (N↑)",  m: { five: f(.8, .2, .65, .45, .8), knowledge: 22, intellect: .5 } },
  { name: "Manipulador (A↓ C↓ N↓)",      m: { five: f(.6, .3, .7, .15, .2), knowledge: 40, intellect: .75 } },
]
const pc = (p: Record<string, number>) => Object.entries(p).map(([k, v]) => `${k} ${Math.round(v * 100)}%`).join(" · ")

console.log("\n=== MENTIR — mentira descarada (brazen .8) por un beneficio 40, oyente perceptivo (.6) ===")
console.log("(riesgo REAL de que lo descubran ≈ 70% — pero cada uno lo ESTIMA distinto)")
for (const { name, m } of minds) {
  const d = lieDecision(m, { brazen: 0.8, benefit: 40 }, 0.6)
  console.log(`${name.padEnd(34)} → ${d.best.padEnd(13)} | cree riesgo ${d.estCaught}% (real ${d.trueCaught}%) | ${pc(d.probs)}`)
}

console.log("\n=== MENTIR — mentira SUTIL (brazen .25) por beneficio 40, oyente ingenuo (.2) ===")
console.log("(riesgo REAL ≈ 22% — acá la apuesta SÍ conviene, y los perfiles divergen)")
for (const { name, m } of minds) {
  const d = lieDecision(m, { brazen: 0.25, benefit: 40 }, 0.2)
  console.log(`${name.padEnd(34)} → ${d.best.padEnd(13)} | cree riesgo ${d.estCaught}% | ${pc(d.probs)}`)
}

console.log("\n=== ELEGIR OFICIO — herrero estable (paga 30, muere 15%) vs ferroviario (paga 55, muere 70% por los autos) ===")
const jobs = [
  { key: "herrero", payNow: 30, obsolescenceRisk: 0.15 },
  { key: "ferroviario", payNow: 55, obsolescenceRisk: 0.70 },
]
for (const { name, m } of minds) {
  const d = careerDecision(m, jobs)
  console.log(`${name.padEnd(34)} → elige ${d.best.padEnd(12)} | ${pc(d.probs)}`)
}
console.log("")
