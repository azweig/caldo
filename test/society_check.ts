// local check (node): run a civilisation 150 years and report economy, crime/courts, culture, legends.
import { World } from "../src/world"
import { wealthStats, influentialByGen } from "../src/society"

const w = new World(8)
for (let y = 0; y < 70; y++) for (let d = 0; d < 360; d++) w.step()

const wild = w.creatures.filter((c) => !c.isAvatar)
console.log(`\n=== 150 años · pob ${wild.length} · era ${w.era} · gen máx ${Math.max(...wild.map((c) => c.generation))} ===`)
const arch: Record<string, number> = {}
for (const c of wild) arch[c.archetype] = (arch[c.archetype] || 0) + 1
console.log("arquetipos vivos:", Object.entries(arch).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(" · "))

const ws = wealthStats(w)
console.log("\n=== RIQUEZA ===")
console.log(`Gini ${ws.gini.toFixed(2)} (0=igual, 1=desigual) · media ${Math.round(ws.mean)} · p10 ${ws.p10} · p50 ${ws.p50} · p90 ${ws.p90}`)
console.log(`emprendedores activos ${ws.entrepreneurs} · en deuda/pobreza ${ws.poor}`)
console.log(`más ricos: ${ws.richest.map((r) => `${r.name} (${r.money}, ${r.arch})`).join(" · ")}`)

const k = (kind: string) => w.deeds.filter((d) => d.kind === kind)
console.log("\n=== ACTIVIDAD HISTÓRICA ===")
console.log(`crímenes ${k("crimen").length} · juicios ${k("justicia").length} · negocios ${k("negocio").length} · quiebras ${k("quiebra").length} · libros ${k("libro").length} · obras ${k("obra").length}`)
console.log("ovejas negras vivas:", wild.filter((c) => c.crimes > 0).sort((a, b) => b.crimes - a.crimes).slice(0, 6).map((c) => `${c.name} ${c.surname} [${c.archetype}] ×${c.crimes}`).join(" · ") || "ninguna")
console.log("últimas obras:")
for (const d of [...k("libro"), ...k("obra")].slice(-6)) console.log(`  · ${d.name}: ${d.text}`)

console.log("\n=== MÁS INFLUYENTES POR GENERACIÓN ===")
for (const g of influentialByGen(w, 3)) {
  console.log(`Gen ${g.gen}:`)
  for (const p of g.people) console.log(`   ${p.name} (impacto ${p.impact}) — ${p.deeds.slice(-3).join("; ") || "figura de su tiempo"}`)
}
console.log("")
