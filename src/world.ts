// world.ts — the simulation engine. A TOWN now: a large bounded map with a STREET GRID and HOUSES.
// 1 tick = 1 in-world DAY. Creatures forage in gardens, walk the STREETS to and from their HOME,
// age, fall ill, pair with a housemate to have CHILDREN (families share a house + surname), and die
// of hunger, illness or old age. The avatar lives by the same rules (you steer it; it ages and dies).

import { Genome, randomGenome, recombine } from "./genome"
import { Psyche, randomPsyche, inheritPsyche } from "./psyche"
import { Cat, Boosts, Prof, PROFS, availableProfs, nextTech, economyOf, professionTitle } from "./civ"

export const DAYS_PER_YEAR = 360
export const WORLD_W = 2800
export const WORLD_H = 1900
export const BLOCK = 300       // street grid spacing
export const ROAD_HALF = 20    // half street width
const MARGIN = 60

const MATURITY_YEARS = 16
const REPRO_COOLDOWN = 3 * DAYS_PER_YEAR
const REPRO_MIN_ENERGY = 74
const REPRO_COST = 30
const CHILD_ENERGY = 42
const MATING_RADIUS = 30
const MAX_ENERGY = 150
const POP_CAP = 380

const FOOD_ENERGY = 28
const START_ENERGY = 80
const IDLE_COST = 0.10
const MOVE_COST = 0.18
const SICK_EXTRA = 1.7
// px/tick per unit of genome.speed — scales VISUAL movement to the big town so a trip to a garden
// takes ~tens of days, not hundreds. Energy cost stays tied to the genome trait (below), NOT this,
// so faster creatures still pay more (selection) without the scaled px exploding the upkeep.
export const SPEED_SCALE = 11
const GO_HOME_AT = 116   // fed → walk home
const GO_FORAGE_AT = 80  // hungry → walk to a garden

export interface House { x: number; y: number; w: number; h: number; surname: string; hue: number }
export interface Garden { x: number; y: number }
export interface School { x: number; y: number; w: number; h: number }

// personality lives in psyche.ts — Big Five (OCEAN) + Enneagram core + heritable beliefs

export interface Creature {
  id: number
  x: number; y: number
  vx: number; vy: number
  energy: number
  ageDays: number
  lifespanDays: number
  genome: Genome
  generation: number
  name: string
  surname: string
  home: House
  goingHome: boolean
  parents: [number, number] | null
  children: number
  sick: boolean
  sickDays: number
  lastRepro: number
  isAvatar: boolean
  facing: 1 | -1
  psyche: Psyche
  memory: string[] // what this creature remembers from past chats with the player
  knowledge: number // accumulated learning (0..100): school as a child, experience as an adult
  profession: string // full lived title (may be specialised), for display + chat
  profBase: string   // base profession name (PROFS.n), for logic
  profCat: Cat | ""  // economic category (drives the village economy); "" = not yet working
  heritProf: string  // a parent's base profession — biases the child's choice (apprenticeship)
}

export interface Sample { pop: number; speed: number; vision: number; size: number; metabolism: number; intellect: number; knowledge: number }

const GIVEN = ["ka", "mu", "ri", "to", "na", "se", "lo", "vi", "za", "po", "ne", "shi", "ru", "ba", "ko", "mi", "te", "la", "do", "fa"]
const SURNAMES = ["Vdel", "Korr", "Mire", "Saum", "Theli", "Nax", "Orbe", "Pell", "Yuni", "Drav", "Esma", "Quil", "Fenn", "Ulmo", "Razi", "Bhen", "Cira", "Wode", "Junn", "Mola"]
const rnd = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)]
function given(): string {
  let s = ""; const n = 2 + Math.floor(Math.random() * 2)
  for (let i = 0; i < n; i++) s += rnd(GIVEN)
  return s[0].toUpperCase() + s.slice(1)
}

export function ageYears(c: Creature): number { return c.ageDays / DAYS_PER_YEAR }
export function isMature(c: Creature): boolean { return c.ageDays >= MATURITY_YEARS * DAYS_PER_YEAR }
export function formatClock(days: number): string {
  const year = Math.floor(days / DAYS_PER_YEAR) + 1
  const day = (Math.floor(days) % DAYS_PER_YEAR) + 1
  return `Año ${year} · Día ${day}`
}
const clampn = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

let NEXT_ID = 1

export class World {
  width = WORLD_W
  height = WORLD_H
  creatures: Creature[] = []
  food: Food[] = []
  houses: House[] = []
  gardens: Garden[] = []
  schools: School[] = []
  universities: School[] = []
  wisdom = 25 // the village's collective knowledge ceiling (the cultural ratchet) — rises/falls over generations
  // civilisation
  research = 0
  discovered = new Set<string>()
  era = 0
  recentTech = ""
  techBoost: Boosts = { food: 0, health: 0, research: 0, learn: 0, life: 0 }
  econ: Boosts = { food: 0, health: 0, research: 0, learn: 0, life: 0 }
  profCounts: Partial<Record<Cat, number>> = {}
  profPop: Record<string, number> = {}
  tick = 0
  clockDays = 0
  spriteCount: number
  history: Sample[] = []
  births = 0
  deaths = 0
  peakGen = 0
  foodTarget: number

  constructor(spriteCount: number) {
    this.spriteCount = spriteCount
    this.foodTarget = 230

    // ── lay out the town: a house in (most) blocks, one surname per house ──
    let si = 0
    for (let bx = BLOCK; bx < WORLD_W - BLOCK / 2; bx += BLOCK) {
      for (let by = BLOCK; by < WORLD_H - BLOCK / 2; by += BLOCK) {
        if (Math.random() < 0.25) continue // some empty lots
        const w = 58, h = 50
        const cx = bx + BLOCK / 2 + (Math.random() * 40 - 20)
        const cy = by + BLOCK / 2 + (Math.random() * 30 - 15)
        this.houses.push({ x: cx - w / 2, y: cy - h / 2, w, h, surname: SURNAMES[si % SURNAMES.length], hue: (si * 47) % 360 })
        si++
      }
    }
    // gardens (food grows here) — a few per quadrant, off the houses
    for (let i = 0; i < 16; i++) this.gardens.push({ x: MARGIN + Math.random() * (WORLD_W - 2 * MARGIN), y: MARGIN + Math.random() * (WORLD_H - 2 * MARGIN) })

    // schools — the two seats of learning; the cultural ratchet flows through here
    this.schools.push({ x: WORLD_W * 0.33 - 48, y: WORLD_H * 0.5 - 40, w: 96, h: 80 })
    this.schools.push({ x: WORLD_W * 0.67 - 48, y: WORLD_H * 0.5 - 40, w: 96, h: 80 })

    // ── founding population: each takes a house (→ its surname) + some starting lore ──
    for (let i = 0; i < 30; i++) {
      const home = rnd(this.houses)
      const c = this.spawn(randomGenome(spriteCount), 1, home)
      c.ageDays = Math.random() * 30 * DAYS_PER_YEAR
      c.knowledge = 16 + Math.random() * 28
      c.x = home.x + Math.random() * 30; c.y = home.y + Math.random() * 30
      this.assignProfession(c)
      this.creatures.push(c)
    }
    for (let i = 0; i < this.foodTarget; i++) this.scatterFood()
  }

  private lifespanFor(g: Genome): number { return Math.round(g.longevity * DAYS_PER_YEAR * (0.9 + Math.random() * 0.2) * (1 + this.techBoost.life)) }

  // ── profession: chosen at maturity from what's available, biased by family, fit, popularity + need ──
  private fit(cat: Cat, c: Creature): number {
    const f = c.psyche.five, g = c.genome
    switch (cat) {
      case "saber": case "ingeniería": return 0.6 + 1.7 * g.intellect + f.o * 0.6
      case "enseñanza": return 0.7 + 1.1 * g.intellect + f.a * 0.6
      case "salud": case "cuidado": return 0.7 + f.a * 1.3 + g.intellect * 0.4
      case "arte": return 0.7 + f.o * 1.4 + (1 - f.c) * 0.4
      case "liderazgo": return 0.7 + f.e * 1.0 + (1 - f.a) * 0.5
      case "defensa": return 0.7 + f.e * 0.7 + (1 - f.a) * 0.7 + g.size * 0.3
      case "comercio": case "exploración": return 0.8 + f.e * 0.9 + f.o * 0.4
      case "espíritu": return 0.8 + f.n * 0.8 + f.o * 0.5
      default: return 1.0 + f.c * 0.6 // comida / oficio / construcción — the steady hands
    }
  }
  private profWeight(p: Prof, c: Creature): number {
    let w = this.fit(p.c, c)
    if (p.n === c.heritProf) w *= 4 // family apprenticeship (the strongest pull)
    const pop = this.profPop[p.n] || 0
    w *= 0.5 + 0.55 * Math.log1p(pop) + (pop > 0 ? 0.4 : 0) // social learning: known trades are easier to enter
    w *= 1 + 1.2 / (1 + (this.profCounts[p.c] || 0)) // village need: under-filled categories pull harder
    return w
  }
  private assignProfession(c: Creature) {
    const avail = availableProfs(this.era, this.universities.length > 0, c.knowledge)
    const pool = avail.length ? avail : PROFS.filter((p) => p.e === 0)
    const weights = pool.map((p) => this.profWeight(p, c))
    let r = Math.random() * weights.reduce((a, b) => a + b, 0)
    let chosen = pool[pool.length - 1]
    for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r <= 0) { chosen = pool[i]; break } }
    c.profBase = chosen.n; c.profCat = chosen.c
    c.profession = professionTitle(chosen, this.era, c.id)
  }

  private spawn(genome: Genome, generation: number, home: House, x?: number, y?: number, psyche?: Psyche): Creature {
    return {
      id: NEXT_ID++,
      x: x ?? home.x, y: y ?? home.y,
      vx: 0, vy: 0,
      energy: START_ENERGY, ageDays: 0, lifespanDays: this.lifespanFor(genome),
      genome, generation,
      name: given(), surname: home.surname, home,
      goingHome: false, parents: null, children: 0,
      sick: false, sickDays: 0, lastRepro: -REPRO_COOLDOWN,
      isAvatar: false, facing: 1,
      psyche: psyche ?? randomPsyche(), memory: [], knowledge: 0,
      profession: "", profBase: "", profCat: "", heritProf: "",
    }
  }

  scatterFood() {
    const g = rnd(this.gardens)
    this.food.push({ x: clampn(g.x + (Math.random() * 2 - 1) * 90, MARGIN, WORLD_W - MARGIN), y: clampn(g.y + (Math.random() * 2 - 1) * 90, MARGIN, WORLD_H - MARGIN) })
  }

  addAvatar(): Creature {
    const a = this.spawn(randomGenome(this.spriteCount), 0, rnd(this.houses), WORLD_W / 2, WORLD_H / 2)
    a.isAvatar = true; a.name = "Tú"; a.surname = ""; a.profession = "forastero del más allá"
    a.ageDays = 22 * DAYS_PER_YEAR; a.energy = START_ENERGY * 1.4
    this.creatures.push(a)
    return a
  }

  nearestFood(c: Creature, radius: number): Food | null {
    let best: Food | null = null, bd = radius * radius
    for (const f of this.food) { const d = (f.x - c.x) ** 2 + (f.y - c.y) ** 2; if (d < bd) { bd = d; best = f } }
    return best
  }
  nearestGarden(c: Creature): Garden {
    let best = this.gardens[0], bd = Infinity
    for (const g of this.gardens) { const d = (g.x - c.x) ** 2 + (g.y - c.y) ** 2; if (d < bd) { bd = d; best = g } }
    return best
  }
  nearestSchool(c: Creature): School {
    let best = this.schools[0], bd = Infinity
    for (const s of this.schools) { const d = (s.x + s.w / 2 - c.x) ** 2 + (s.y + s.h / 2 - c.y) ** 2; if (d < bd) { bd = d; best = s } }
    return best
  }
  nearestCreature(c: Creature, radius: number, filter?: (o: Creature) => boolean): Creature | null {
    let best: Creature | null = null, bd = radius * radius
    for (const o of this.creatures) {
      if (o === c || (filter && !filter(o))) continue
      const d = (o.x - c.x) ** 2 + (o.y - c.y) ** 2
      if (d < bd) { bd = d; best = o }
    }
    return best
  }

  // Manhattan-ish street routing: hop onto the nearest road, travel along it toward the target,
  // turn at intersections — so creatures FLOW along the grid instead of cutting across chaotically.
  private roadSteer(c: Creature, tx: number, ty: number): [number, number] {
    const sp = c.genome.speed * SPEED_SCALE
    const dx = tx - c.x, dy = ty - c.y
    const dist = Math.hypot(dx, dy)
    if (dist < BLOCK * 0.55 || dist < 1) return [(dx / (dist || 1)) * sp, (dy / (dist || 1)) * sp] // close → go direct (into the lot/garden)
    const offV = c.x - Math.round(c.x / BLOCK) * BLOCK // signed dist to nearest vertical road
    const offH = c.y - Math.round(c.y / BLOCK) * BLOCK // signed dist to nearest horizontal road
    const onV = Math.abs(offV) < ROAD_HALF
    const onH = Math.abs(offH) < ROAD_HALF
    const pull = (off: number) => clampn(-off, -sp, sp) // gently recentre on the road
    if (!onV && !onH) { // off-road: get to the nearest road, whichever axis is closer
      return Math.abs(offV) < Math.abs(offH) ? [-Math.sign(offV) * sp, 0] : [0, -Math.sign(offH) * sp]
    }
    if (onH) { // on a horizontal road: run along x toward target, or turn vertical once aligned
      if (Math.abs(dx) > ROAD_HALF) return [Math.sign(dx) * sp, pull(offH)]
      return [pull(offV), Math.sign(dy) * sp]
    }
    // on a vertical road
    if (Math.abs(dy) > ROAD_HALF) return [pull(offV), Math.sign(dy) * sp]
    return [Math.sign(dx) * sp, pull(offH)]
  }

  step() {
    this.tick++; this.clockDays++
    if (this.food.length < this.foodTarget && Math.random() < 0.92) this.scatterFood()

    // ── civilisation: research → discoveries (advance the era, boost the economy, unlock professions) ──
    this.research += this.econ.research * (1 + this.techBoost.research) * 0.5
    let nt = nextTech(this.discovered, this.era)
    while (nt && this.research >= nt.cost) {
      this.research -= nt.cost; this.discovered.add(nt.n); this.recentTech = nt.n
      if (nt.b) { const tb = this.techBoost as unknown as Record<string, number>, nb = nt.b as Record<string, number>; for (const k of Object.keys(nt.b)) tb[k] += nb[k] }
      if (nt.e > this.era) this.era = nt.e
      if (nt.n === "Universidad" && !this.universities.length) this.universities.push({ x: WORLD_W * 0.5 - 64, y: WORLD_H * 0.5 - 54, w: 128, h: 104 })
      nt = nextTech(this.discovered, this.era)
    }
    const healthM = 1 + this.econ.health + this.techBoost.health
    const learnM = 1 + this.econ.learn + this.techBoost.learn

    const survivors: Creature[] = []
    const newborns: Creature[] = []
    const paired = new Set<number>()

    for (const c of this.creatures) {
      c.ageDays++

      if (!c.isAvatar) {
        // hysteresis: walk home when fed, head to food when hungry
        if (c.energy < GO_FORAGE_AT) c.goingHome = false
        else if (c.energy > GO_HOME_AT) c.goingHome = true
        let tx: number, ty: number
        if (c.goingHome) {
          if (!isMature(c)) { const s = this.nearestSchool(c); tx = s.x + s.w / 2; ty = s.y + s.h / 2 } // kids go to SCHOOL, not home
          else { tx = c.home.x; ty = c.home.y }
        } else { const f = this.nearestFood(c, c.genome.vision * 3); const g = this.nearestGarden(c); tx = f ? f.x : g.x; ty = f ? f.y : g.y }
        const [vx, vy] = this.roadSteer(c, tx, ty)
        c.vx = vx; c.vy = vy
      }

      c.x += c.vx; c.y += c.vy
      if (c.vx > 0.05) c.facing = 1; else if (c.vx < -0.05) c.facing = -1
      c.x = clampn(c.x, MARGIN, WORLD_W - MARGIN)
      c.y = clampn(c.y, MARGIN, WORLD_H - MARGIN)

      const g = c.genome
      // upkeep follows the genome trait (not the scaled px velocity): a flat idle tax + a movement tax
      // proportional to how fast it's actually going relative to its max. Faster genomes pay more.
      const moving = Math.min(1, Math.hypot(c.vx, c.vy) / (g.speed * SPEED_SCALE || 1))
      let upkeep = IDLE_COST * g.metabolism * g.size + MOVE_COST * g.speed * g.speed * g.size * g.metabolism * moving
      if (c.sick) upkeep *= SICK_EXTRA
      c.energy -= upkeep

      const mouth = 16 + g.size * 9
      for (let i = this.food.length - 1; i >= 0; i--) {
        const f = this.food[i]
        if ((f.x - c.x) ** 2 + (f.y - c.y) ** 2 < mouth * mouth) {
          this.food.splice(i, 1)
          // smarter + better-schooled creatures extract more from the same food (selection pressure)
          const smart = 1 + 0.3 * (g.intellect - 0.5) + 0.002 * c.knowledge
          c.energy = Math.min(MAX_ENERGY, c.energy + FOOD_ENERGY * smart)
          break
        }
      }

      // ── learning / mental development ──
      if (!c.isAvatar) {
        if (!isMature(c)) {
          const s = this.nearestSchool(c)
          const atSchool = (c.x - (s.x + s.w / 2)) ** 2 + (c.y - (s.y + s.h / 2)) ** 2 < 95 * 95
          const ceiling = this.wisdom + 8 // a child can learn what the village knows, plus a little
          if (atSchool && c.knowledge < ceiling) c.knowledge = Math.min(ceiling, c.knowledge + 0.06 * g.intellect * learnM)
        } else if (c.knowledge < 100) {
          c.knowledge += 0.0014 * g.intellect // slow lifelong experience → nudges the village ceiling up (the ratchet)
        }
        // pick a trade when grown up
        if (!c.profBase && isMature(c)) this.assignProfession(c)
      }

      const ay = ageYears(c)
      const ageRisk = 1 + Math.max(0, ay - 45) / 40
      if (!c.sick) { if (Math.random() < 0.00009 * (1.25 - g.resistance) * ageRisk / healthM) { c.sick = true; c.sickDays = 0 } }
      else {
        c.sickDays++
        if (Math.random() < 0.016 * (0.5 + g.resistance) * healthM) { c.sick = false; c.sickDays = 0 }
        else if (Math.random() < 0.012 * (1.3 - g.resistance) * ageRisk / healthM) { if (!c.isAvatar) { this.deaths++; continue } else c.energy = 0 }
      }

      if (!c.isAvatar) {
        if (c.energy <= 0) { this.deaths++; continue }
        if (c.ageDays > c.lifespanDays && Math.random() < (c.ageDays - c.lifespanDays) / (0.18 * c.lifespanDays)) { this.deaths++; continue }
      }

      // FAMILIES — pair with a housemate-adult nearby (they gather at home), gene recombination
      if (!c.isAvatar && this.creatures.length + newborns.length < POP_CAP &&
          isMature(c) && c.energy >= REPRO_MIN_ENERGY && this.clockDays - c.lastRepro >= REPRO_COOLDOWN && !paired.has(c.id)) {
        const mate = this.nearestCreature(c, MATING_RADIUS, (o) =>
          !o.isAvatar && isMature(o) && o.energy >= REPRO_MIN_ENERGY && this.clockDays - o.lastRepro >= REPRO_COOLDOWN && !paired.has(o.id))
        if (mate) {
          paired.add(c.id); paired.add(mate.id)
          c.energy -= REPRO_COST; mate.energy -= REPRO_COST
          c.lastRepro = mate.lastRepro = this.clockDays
          c.children++; mate.children++
          const child = this.spawn(recombine(g, mate.genome, this.spriteCount), c.generation + 1, c.home, c.x + (Math.random() * 18 - 9), c.y + (Math.random() * 18 - 9), inheritPsyche(c.psyche, mate.psyche))
          child.energy = CHILD_ENERGY
          child.parents = [c.id, mate.id]
          child.heritProf = Math.random() < 0.5 ? c.profBase : mate.profBase // apprenticeship pull
          newborns.push(child)
          this.births++
          if (child.generation > this.peakGen) this.peakGen = child.generation
        }
      }

      survivors.push(c)
    }

    this.creatures = survivors.concat(newborns)

    if (this.tick % 20 === 0) {
      const wild = this.creatures.filter((c) => !c.isAvatar)
      const n = wild.length || 1
      const avg = (f: (c: Creature) => number) => wild.reduce((s, c) => s + f(c), 0) / n
      this.history.push({ pop: wild.length, speed: avg((c) => c.genome.speed), vision: avg((c) => c.genome.vision), size: avg((c) => c.genome.size), metabolism: avg((c) => c.genome.metabolism), intellect: avg((c) => c.genome.intellect), knowledge: avg((c) => c.knowledge) })
      if (this.history.length > 400) this.history.shift()
      // wisdom = the average knowledge of living adults → the ceiling kids can learn toward (the ratchet)
      const adults = wild.filter(isMature)
      if (adults.length) this.wisdom = adults.reduce((s, c) => s + c.knowledge, 0) / adults.length
      // recompute the working economy → drives food, health, learning + research output
      const counts: Partial<Record<Cat, number>> = {}, pop: Record<string, number> = {}
      for (const c of wild) { if (c.profCat) counts[c.profCat] = (counts[c.profCat] || 0) + 1; if (c.profBase) pop[c.profBase] = (pop[c.profBase] || 0) + 1 }
      this.profCounts = counts; this.profPop = pop
      this.econ = economyOf(counts, wild.length)
      this.foodTarget = Math.min(720, Math.round(230 * (1 + this.econ.food + this.techBoost.food)))
    }

    if (this.creatures.filter((c) => !c.isAvatar).length < 4) {
      for (let i = 0; i < 8; i++) this.creatures.push(this.spawn(randomGenome(this.spriteCount), 1, rnd(this.houses)))
    }
  }
}

export interface Food { x: number; y: number }
