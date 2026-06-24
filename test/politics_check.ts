// local check (node): do the three economic-political systems produce different societies?
import { World } from "../src/world"
import { wealthStats } from "../src/society"
import { EconSystem } from "../src/civconfig"

function run(system: EconSystem, years = 90) {
  const w = new World(8); w.system = system
  for (let y = 0; y < years; y++) for (let d = 0; d < 360; d++) w.step()
  const wild = w.creatures.filter((c) => !c.isAvatar)
  const ws = wealthStats(w)
  const k = (kind: string) => w.deeds.filter((d) => d.kind === kind).length
  return {
    pop: wild.length, ws,
    avgKnow: Math.round(wild.reduce((s, c) => s + c.knowledge, 0) / (wild.length || 1)),
    sindicatos: k("sindicato"), subversivos: k("subversivo") + k("reforma"), represiones: k("represión"), repressed: w.repressed,
    deeds: w.deeds,
  }
}

for (const sys of ["capitalista", "socialista", "dictadura"] as EconSystem[]) {
  const r = run(sys)
  console.log(`\n========= ${sys.toUpperCase()} · población ${r.pop} =========`)
  console.log(`desigualdad Gini ${r.ws.gini.toFixed(2)}  ·  pobre ${r.ws.p10} / medio ${r.ws.p50} / rico ${r.ws.p90}  ·  en deuda ${r.ws.poor}`)
  console.log(`más ricos: ${r.ws.richest.slice(0, 3).map((x) => `${x.name} ${x.money}`).join(" · ")}`)
  console.log(`educación media (saber) ${r.avgKnow}/100`)
  console.log(`sindicatos ${r.sindicatos} · subversivos/reformistas ${r.subversivos} · represiones ${r.represiones} (desaparecidos ${r.repressed})`)
  const movements = r.deeds.filter((d) => ["sindicato", "subversivo", "represión", "reforma"].includes(d.kind)).slice(-4)
  for (const d of movements) console.log(`   · ${d.name}: ${d.text}`)
}
console.log("")
