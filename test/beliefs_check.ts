// local check (node): do NEW beliefs that no founder held emerge over the generations?
import { World } from "../src/world"
import { BELIEFS } from "../src/psyche"

const w = new World(8)
const seed = new Set<string>()
for (const c of w.creatures) if (!c.isAvatar) c.psyche.beliefs.forEach((b) => seed.add(b))
console.log(`\ncreencias en la semilla: ${seed.size} (todas del repertorio curado inicial)`)

for (let y = 0; y < 120; y++) for (let d = 0; d < 360; d++) w.step()

const live = new Set<string>(), emergent = new Set<string>()
for (const c of w.creatures) if (!c.isAvatar) c.psyche.beliefs.forEach((b) => { live.add(b); if (!BELIEFS.includes(b)) emergent.add(b) })
console.log(`\n120 años después: ${live.size} creencias vivas · ${emergent.size} EMERGENTES (que nadie sostenía al inicio)`)
console.log("\nmitología inventada por esta civilización:")
for (const b of [...emergent].slice(0, 12)) console.log(`  · "${b}"`)
console.log("")
