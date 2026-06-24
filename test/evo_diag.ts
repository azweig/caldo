// diagnostic: WHY isn't the population growing? break down adults / pairs / fertile / pregnant / energy
import { World, ageYears, isMature } from "../src/world"

const w = new World(8)
const snap = (y: number) => {
  const wild = w.creatures.filter((c) => !c.isAvatar)
  const adults = wild.filter(isMature)
  const fertile = adults.filter((c) => { const a = ageYears(c); return a >= 16 && a <= 48 })
  const paired = adults.filter((c) => c.partner)
  const fed = fertile.filter((c) => c.energy > 55)
  const fertilePairedFed = fertile.filter((c) => c.partner && c.energy > 55)
  const preg = wild.filter((c) => c.pregnant > 0)
  const avgE = adults.length ? Math.round(adults.reduce((s, c) => s + c.energy, 0) / adults.length) : 0
  console.log(`año ${String(y).padStart(3)} | pob ${String(wild.length).padStart(3)} | adultos ${String(adults.length).padStart(2)} | fértiles ${String(fertile.length).padStart(2)} | conPareja ${String(paired.length).padStart(2)} | fért+pareja+comida ${String(fertilePairedFed.length).padStart(2)} | embarazadas ${String(preg.length).padStart(2)} | energíaAdulto ${avgE} | nac ${w.births} mue ${w.deaths}`)
}
for (let y = 0; y <= 40; y++) {
  for (let d = 0; d < 360; d++) w.step()
  if (y % 5 === 0) snap(y)
}
