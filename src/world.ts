// world.ts — the simulation engine. A TOWN now: a large bounded map with a STREET GRID and HOUSES.
// 1 tick = 1 in-world DAY. Creatures forage in gardens, walk the STREETS to and from their HOME,
// age, fall ill, pair with a housemate to have CHILDREN (families share a house + surname), and die
// of hunger, illness or old age. The avatar lives by the same rules (you steer it; it ages and dies).

import { Genome, randomGenome, recombine } from "./genome"
import { Psyche, randomPsyche, inheritPsyche } from "./psyche"
import { Cat, Boosts, Prof, Tech, PROFS, TECHS, availableProfs, availableTechs, canAdvanceEra, economyOf, professionTitle, eraName } from "./civ"
import { Life, newLife, lifeTick, feel, bond, decideIntent } from "./life"
import { Sig, KIND, codeOf, decode } from "./comms"
import { Animal, SPECIES, SPECIES_KEYS, Enemy, ENEMIES } from "./animals"
import { rand } from "./rng"
import { pickReligion, EconSystem } from "./civconfig"
import { genPerson, inheritDark, classify, DarkTriad, Archetype } from "./population"
import { runSociety } from "./society"
import { stageOf } from "./lifestage"

export const SEASONS = ["primavera", "verano", "otoño", "invierno"] as const
export function seasonOf(days: number): number { return Math.floor((Math.floor(days) % DAYS_PER_YEAR) / (DAYS_PER_YEAR / 4)) }

export const DAYS_PER_YEAR = 360
export const WORLD_W = 2800
export const WORLD_H = 1900
export const BLOCK = 300       // street grid spacing
export const ROAD_HALF = 20    // half street width
const MARGIN = 60
// how strongly a mind/trade fits what a tech needs (drives the emergent discovery rate)
const INNOV_RATE = 0.55
// REALISTIC PACING: humanity spent ~99% of its history in the stone age, then tech ACCELERATED. So early eras
// must be epochs (the deep past is the slowest) and progress speeds up later. This per-era multiplier on tech
// cost makes the Palaeolithic take generations; without it, cheap early techs flew by in a year or two.
const ERA_COST_MULT = [7.5, 7, 6.5, 6, 5.5, 5, 4.5, 4, 3.6, 3.2, 2.9, 2.6, 2.3, 2.1, 1.9, 1.7, 1.6, 1.5, 1.4]
const eraCostMult = (era: number) => ERA_COST_MULT[Math.max(0, Math.min(ERA_COST_MULT.length - 1, era))]
const RELATED: Record<string, Cat[]> = {
  saber: ["enseñanza", "espíritu", "arte"], ingeniería: ["construcción", "oficio"], construcción: ["ingeniería", "oficio"],
  salud: ["cuidado", "saber"], comida: ["exploración", "cuidado"], exploración: ["comida", "defensa"], comercio: ["liderazgo"],
  liderazgo: ["comercio", "espíritu"], arte: ["espíritu", "saber"], espíritu: ["arte", "saber"], defensa: ["oficio", "exploración"],
  oficio: ["construcción", "ingeniería"], enseñanza: ["saber"], cuidado: ["salud", "comida"],
}
function driveMatch(cat: Cat | "" | undefined, drive: Cat): number {
  if (!cat) return 0.45 // a forager with no trade is a curious generalist
  if (cat === drive) return 2.5 // your life's work
  return RELATED[drive]?.includes(cat as Cat) ? 1.1 : 0.4
}

const MATURITY_YEARS = 16
const REPRO_COOLDOWN = 150  // recovery between pregnancies (gestation is on top) — ~5 months
const REPRO_MIN_ENERGY = 46
const REPRO_COST = 26
const CHILD_ENERGY = 42
const FERTILE_MAX = 48                    // years — fertility window 16..48
const GESTATION_MIN = 210                 // ~7 months; +0..60 → up to ~9 months
const MAX_ENERGY = 150
const POP_CAP = 280 // per country (several countries simulate at once now)
// realistic multiple-birth odds: ~3% twins, ~0.2% triplets, else a single
// a struggling tribe rebounds with big broods (boom>1 when the population is small) — a baby-boom rebound
function litterSize(boom = 1): number {
  const r = rand()
  if (boom > 2 && r < 0.1) return 3 + Math.floor(rand() * 2) // 3-4 children at once when near-wiped
  return r < 0.004 * boom ? 3 : r < 0.04 * boom ? 2 : 1
}

const FOOD_ENERGY = 40
const START_ENERGY = 80
const IDLE_COST = 0.10
const MOVE_COST = 0.18
const SICK_EXTRA = 1.7
// px/tick per unit of genome.speed — scales VISUAL movement to the big town so a trip to a garden
// takes ~tens of days, not hundreds. Energy cost stays tied to the genome trait (below), NOT this,
// so faster creatures still pay more (selection) without the scaled px exploding the upkeep.
export const SPEED_SCALE = 11
const GO_HOME_AT = 120   // fed → walk home
const GO_FORAGE_AT = 98  // hungry → walk to a garden (forage early; a big map makes trips long)

// tier 0 choza · 1 casa · 2 casona · 3 mansión · 4 edificio (multi-familia). homes UPGRADE as a family prospers.
export interface House { x: number; y: number; w: number; h: number; surname: string; hue: number; tier: number; value: number; rent: number; landlord: number }
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
  partner: number  // id of life partner (0 = none) — couples form, then bear children over gestation
  pregnant: number // gestation days remaining (0 = not pregnant)
  isAvatar: boolean
  facing: 1 | -1
  psyche: Psyche
  memory: string[] // what this creature remembers from past chats with the player
  social: string[] // what it remembers from talking with OTHER creatures (family, teachers, neighbours)
  knowledge: number // accumulated learning (0..100): school as a child, experience as an adult
  profession: string // full lived title (may be specialised), for display + chat
  profBase: string   // base profession name (PROFS.n), for logic
  profCat: Cat | ""  // economic category (drives the village economy); "" = not yet working
  heritProf: string  // a parent's base profession — biases the child's choice (apprenticeship)
  religion: string   // belief system (heritable; the mix is set when the civ is born)
  powerHungry: boolean // a power-obsessed "psychopath" — drifts toward rule + raises violence
  money: number      // earned by working (you can SEE + spend it when you possess them)
  controlled: boolean // true while the PLAYER is possessing this creature (transient, not saved)
  dark: DarkTriad    // machiavellianism / narcissism / psychopathy (realistic base rates)
  archetype: Archetype // emergent label (psicópata, emprendedor, altruista…)
  crimes: number     // how many Noahide laws they've broken — a "black sheep" if high
  business: boolean  // currently runs a business (entrepreneurs)
  health: number     // 0..100 physical health — falls if they can't afford food/housing → illness/death
  mental: number     // 0..100 mental health — falls under poverty, loss, repression → drives bad behaviour
  irritability: number // 0..1 — rises with stress + low mental health; tips them toward conflict/crime
  life?: Life        // the inner life: needs, emotion, goal, vocation, hobby, quirk, relationships, reputation
  sigs?: string[]    // recent compact chatter codes (transient — the binary they "speak" when unobserved)
  heard?: string     // the last thing they overheard, DECODED into words (transient, for the click card)
  poi?: number       // the Point of Interest (market stall / work station / bench) they've claimed, or -1
}

// a notable act, logged so we can later rank the most INFLUENTIAL people per generation
export interface Deed { day: number; gen: number; who: number; name: string; kind: string; text: string; impact: number; content?: string }

export interface WorldOpts { startEra: number; religions: { name: string; pct: number }[]; violence: number; psychopathy: number; gov: "monarquía" | "república"; system?: EconSystem; culture?: { name: string; ethos: string; bias: Partial<Record<Cat, number>> } }

export interface Sample { pop: number; speed: number; vision: number; size: number; metabolism: number; intellect: number; knowledge: number }

const GIVEN = ["ka", "mu", "ri", "to", "na", "se", "lo", "vi", "za", "po", "ne", "shi", "ru", "ba", "ko", "mi", "te", "la", "do", "fa"]
const SURNAMES = ["Vdel", "Korr", "Mire", "Saum", "Theli", "Nax", "Orbe", "Pell", "Yuni", "Drav", "Esma", "Quil", "Fenn", "Ulmo", "Razi", "Bhen", "Cira", "Wode", "Junn", "Mola"]
// when a couple founds their own household the family tree BRANCHES: one line absorbs the other, or a wholly
// new blended surname is born (a new dynasty). this is what makes lineages split + recombine over generations.
function foundSurname(a: string, b: string): string {
  if (rand() < 0.5) return a.length >= b.length ? a : b // one line carries on
  const s = a.slice(0, Math.max(2, Math.ceil(a.length / 2))) + b.slice(Math.floor(b.length / 2)).toLowerCase()
  return s[0].toUpperCase() + s.slice(1)
}
const rnd = <T>(a: T[]): T => a[Math.floor(rand() * a.length)]
function given(): string {
  let s = ""; const n = 2 + Math.floor(rand() * 2)
  for (let i = 0; i < n; i++) s += rnd(GIVEN)
  return s[0].toUpperCase() + s.slice(1)
}

export function ageYears(c: Creature): number { return c.ageDays / DAYS_PER_YEAR }
export function isMature(c: Creature): boolean { return c.ageDays >= MATURITY_YEARS * DAYS_PER_YEAR }
export function formatClock(minutes: number): string {
  const totalMin = Math.floor(minutes)
  const mm = totalMin % 60
  const hh = Math.floor(totalMin / 60) % 24
  const totalDays = Math.floor(totalMin / 1440)
  const day = (totalDays % DAYS_PER_YEAR) + 1
  const year = Math.floor(totalDays / DAYS_PER_YEAR) + 1
  return `Año ${year} · Día ${day} · ${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`
}
const clampn = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

let NEXT_ID = 1
// creature ids are a process-global counter (shared across all country Worlds so ids never collide between
// them). Reset it when a fresh seeded game starts so a run is fully reproducible from (seed) alone.
export function resetCreatureIds(): void { NEXT_ID = 1 }

export class World {
  width = WORLD_W
  height = WORLD_H
  creatures: Creature[] = []
  food: Food[] = []
  houses: House[] = []
  gardens: Garden[] = []
  schools: School[] = []
  universities: School[] = []
  airport: School = { x: 110, y: 110, w: 120, h: 88 }
  region = 0
  wisdom = 25 // the village's collective knowledge ceiling (the cultural ratchet) — rises/falls over generations
  // civilisation
  research = 0
  discovered = new Set<string>()
  era = 0
  recentTech = ""
  marketPrice = 1 // a market index (supply vs demand) — drives merchant profit + the price of goods
  cultureName = "" // this town's people (Inca, Azteca, …) — shapes which techs they're drawn to + how fast
  cultureEthos = "" // their way of being (guerrera, sacerdotal, mercante, …)
  cultureBias: Partial<Record<Cat, number>> = {} // per-driver innovation multiplier (their evolution path)
  techProgress = new Map<string, number>() // per-tech effort accumulated by aldeanos working on it
  techTop = new Map<string, { id: number; name: string; surname: string; prof: string; amt: number }>() // best mind on each
  techBoost: Boosts = { food: 0, health: 0, research: 0, learn: 0, life: 0 }
  econ: Boosts = { food: 0, health: 0, research: 0, learn: 0, life: 0 }
  profCounts: Partial<Record<Cat, number>> = {}
  profPop: Record<string, number> = {}
  chronicle: { day: number; text: string }[] = []
  plagueUntil = 0
  // civ configuration / governance
  gov: "monarquía" | "república" = "república"
  system: EconSystem = "capitalista" // economic-political system: capitalist / socialist / dictatorship
  repressed = 0 // running count of subversives crushed by a dictatorship (for the stats panel)
  violence = 0.3
  psychopathy = 0.05
  religionsCfg: { name: string; pct: number }[] = [{ name: "el Caldo Eterno", pct: 100 }]
  monarch: Creature | null = null
  tick = 0
  clockDays = 0
  clockMinutes = 0 // master clock (in-world minutes); the day-based dynamics step once per whole day
  spriteCount: number
  history: Sample[] = []
  births = 0
  deaths = 0
  deathCauses: Record<string, number> = { hambre: 0, vejez: 0, enfermedad: 0, violencia: 0, pobreza: 0 }
  deeds: Deed[] = [] // log of notable acts (works, crimes, businesses, discoveries) for the legends list
  logDeed(d: Deed) { this.deeds.push(d); if (this.deeds.length > 800) this.deeds.shift() }
  peakGen = 0
  foodTarget: number

  constructor(spriteCount: number, region = 0, opts?: WorldOpts, skipSeed = false) {
    this.spriteCount = spriteCount
    this.region = region
    this.foodTarget = 230
    if (opts) {
      this.gov = opts.gov; this.violence = opts.violence; this.psychopathy = opts.psychopathy; this.system = opts.system ?? this.system
      this.religionsCfg = opts.religions.length ? opts.religions : this.religionsCfg
      if (opts.culture) { this.cultureName = opts.culture.name; this.cultureEthos = opts.culture.ethos; this.cultureBias = opts.culture.bias }
    }
    if (skipSeed) return // fromState() will populate everything

    // ── lay out the town: a house in (most) blocks, one surname per house ──
    let si = 0
    for (let bx = BLOCK; bx < WORLD_W - BLOCK / 2; bx += BLOCK) {
      for (let by = BLOCK; by < WORLD_H - BLOCK / 2; by += BLOCK) {
        if (rand() < 0.25) continue // some empty lots
        const w = 58, h = 50
        const cx = bx + BLOCK / 2 + (rand() * 40 - 20)
        const cy = by + BLOCK / 2 + (rand() * 30 - 15)
        this.houses.push({ x: cx - w / 2, y: cy - h / 2, w, h, surname: SURNAMES[si % SURNAMES.length], hue: (si * 47) % 360, tier: 0, value: 30, rent: 0, landlord: 0 })
        si++
      }
    }
    // gardens (food grows here) — a few per quadrant, off the houses
    for (let i = 0; i < 16; i++) this.gardens.push({ x: MARGIN + rand() * (WORLD_W - 2 * MARGIN), y: MARGIN + rand() * (WORLD_H - 2 * MARGIN) })

    // schools — the two seats of learning; the cultural ratchet flows through here
    this.schools.push({ x: WORLD_W * 0.33 - 48, y: WORLD_H * 0.5 - 40, w: 96, h: 80 })
    this.schools.push({ x: WORLD_W * 0.67 - 48, y: WORLD_H * 0.5 - 40, w: 96, h: 80 })

    // start the civilisation already advanced to the chosen era (pre-discovered techs + boosts)
    this.applyStartEra(opts?.startEra ?? 0)

    // ── founding population: ~100 people across ~FAMILIES households (≈ the 100-people / 10-families ratio,
    //    the seed of a future 10000 / 1000-family city). Each family shares a house → a surname + a religion.
    const startKnow = 16 + this.era * 4
    const FOUNDERS = 100, FAMILIES = 12
    const famReligion: string[] = [], famHome: House[] = []
    for (let f = 0; f < FAMILIES; f++) { famHome[f] = this.houses[f % this.houses.length]; famReligion[f] = pickReligion(this.religionsCfg) }
    for (let i = 0; i < FOUNDERS; i++) {
      const f = i % FAMILIES, home = famHome[f]
      const c = this.spawn(randomGenome(spriteCount), 1, home)
      c.ageDays = rand() * 38 * DAYS_PER_YEAR
      c.knowledge = startKnow + rand() * 28
      c.religion = famReligion[f] // a household shares its faith
      c.powerHungry = rand() < this.psychopathy
      c.x = home.x + rand() * 30; c.y = home.y + rand() * 30
      this.assignProfession(c)
      this.creatures.push(c)
    }
    for (let i = 0; i < this.foodTarget; i++) this.scatterFood()
    this.buildPois() // lay out the market square + benches
  }

  // discover every tech up to `era`, accumulating its boosts + building the university if reached
  private applyStartEra(era: number) {
    if (era <= 0) return
    for (const t of TECHS) {
      if (t.e >= era) continue // earlier eras are settled; the current era is still to be discovered
      this.discovered.add(t.n)
      if (t.b) { const tb = this.techBoost as unknown as Record<string, number>, nb = t.b as Record<string, number>; for (const k of Object.keys(t.b)) tb[k] += nb[k] }
      if (t.n === "Universidad" && !this.universities.length) this.universities.push({ x: WORLD_W * 0.5 - 64, y: WORLD_H * 0.5 - 54, w: 128, h: 104 })
    }
    this.era = era
  }

  private lifespanFor(g: Genome): number { return Math.round(g.longevity * DAYS_PER_YEAR * (0.9 + rand() * 0.2) * (1 + this.techBoost.life)) }

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
    if (p.n === c.heritProf) w *= c.psyche.five.o > 0.66 ? 1.3 : 4 // family trade pulls hard — unless they're the open, independent sort who forge their OWN path
    if (c.powerHungry && (p.c === "liderazgo" || p.c === "defensa")) w *= 3 // the ambitious seek power
    if (p.c === "defensa") { const threat = this.animals.reduce((s, a) => s + (SPECIES[a.kind].hostile && !a.tame ? 1 : 0), 0); w *= 1 + threat * 0.12 + this.violence * 0.5 } // beasts at the gates + a violent age → the town arms itself
    const pop = this.profPop[p.n] || 0
    w *= 0.5 + 0.55 * Math.log1p(pop) + (pop > 0 ? 0.4 : 0) // social learning: known trades are easier to enter
    w *= 1 + 1.2 / (1 + (this.profCounts[p.c] || 0)) // village need: under-filled categories pull harder
    // WHERE you grow up shapes your trade: by the fields → farming; by the university → scholarship; by the plaza → trade
    const hx = c.home.x + c.home.w / 2, hy = c.home.y + c.home.h / 2
    const dG = this.gardens.length ? Math.min(...this.gardens.map((g) => (g.x - hx) ** 2 + (g.y - hy) ** 2)) : 1e12
    const dU = this.universities[0] ? (this.universities[0].x + 64 - hx) ** 2 + (this.universities[0].y - hy) ** 2 : 1e12
    const dC = (WORLD_W / 2 - hx) ** 2 + (WORLD_H / 2 - hy) ** 2
    const near = Math.min(dG, dU, dC)
    if (near === dG && (p.c === "comida" || p.c === "cuidado")) w *= 1.6
    else if (near === dU && (p.c === "saber" || p.c === "ingeniería" || p.c === "salud")) w *= 1.6
    else if (near === dC && (p.c === "comercio" || p.c === "liderazgo" || p.c === "arte")) w *= 1.5
    return w
  }
  private assignProfession(c: Creature) {
    const avail = availableProfs(this.era, this.universities.length > 0, c.knowledge)
    const pool = avail.length ? avail : PROFS.filter((p) => p.e === 0)
    const weights = pool.map((p) => this.profWeight(p, c))
    let r = rand() * weights.reduce((a, b) => a + b, 0)
    let chosen = pool[pool.length - 1]
    for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r <= 0) { chosen = pool[i]; break } }
    c.profBase = chosen.n; c.profCat = chosen.c
    c.profession = professionTitle(chosen, this.era, c.id)
    if (c.life) {
      c.life.vocFit = 0.5 // recomputed next tick from the new trade
      if (chosen.n === c.heritProf) { c.life.mastery = Math.max(c.life.mastery, 0.22); feel(c, "orgulloso", 0.4) } // raised in the family craft → a head start
      if (chosen.u) { c.life.mastery = Math.max(c.life.mastery, 0.3); feel(c, "orgulloso", 0.6); c.life.rep = Math.min(1, c.life.rep + 0.1); this.logEvent(`${c.name} ${c.surname} se graduó de ${c.profBase} en la universidad`) } // a university degree
    }
  }
  // a deeply mismatched, unhappy worker may RETRAIN into a trade that fits them better (career change)
  private maybeRetrain(c: Creature) {
    if (!c.life || !c.profBase || c.life.vocFit > 0.4 || c.mental > 45 || c.life.mastery > 0.5) return
    if (rand() > 0.04) return
    const prev = c.profBase; c.heritProf = "" // free choice this time
    c.profBase = ""; c.life.mastery = 0; this.assignProfession(c)
    if (c.profBase !== prev) { feel(c, "esperanzado", 0.5); this.logEvent(`${c.name} ${c.surname} dejó de ser ${prev} y aprendió ${c.profBase}`) }
  }

  viewControlled = false // true while this world is on screen → the view (main.ts) owns creature positions
  pois: { x: number; y: number; kind: string; by: number }[] = [] // claimable spots: market stalls, work stations, benches
  animals: Animal[] = [] // wild + domestic beasts roaming the land
  raiders: Enemy[] = [] // an active raid from beyond the map (savages / nomads / pirates / terrorists)
  news: { txt: string; sent: number; reach: number; day: number }[] = [] // recent events that spread as gossip
  private logEvent(text: string) {
    this.chronicle.push({ day: this.clockDays, text }); if (this.chronicle.length > 80) this.chronicle.shift()
    if (text.startsWith("✦")) return // ceremonial announcements (eras, festivals) aren't personal gossip
    const neg = /murió|quiebra|crimen|asesin|robó|sin techo|cordura|calle|divorció|guerra|represión|peste|rumor|esconde/.test(text)
    const pos = /prosper|inventó|ideó|graduó|boda|se unió|fortuna|alquiló|construyó|graduó/.test(text)
    this.news.push({ txt: text, sent: pos ? 1 : neg ? -1 : 0, reach: 1, day: this.clockDays }); if (this.news.length > 14) this.news.shift()
  }
  // what the town is buzzing about — the events that spread widest through the gossip network
  talkOfTown(): { txt: string; reach: number; sent: number }[] { return [...this.news].sort((a, b) => b.reach - a.reach).slice(0, 5) }
  graves: { x: number; y: number; name: string }[] = [] // where the town's notable dead are remembered
  // the single greatest figure in the whole history of this people (most cumulative renown across their deeds)
  private _greatestCache: { n: number; v: { name: string; impact: number } | null } | null = null
  greatestEver(): { name: string; impact: number } | null {
    if (this._greatestCache && this._greatestCache.n === this.deeds.length) return this._greatestCache.v // memo: only changes when a deed is added
    const by = new Map<number, { name: string; impact: number }>()
    for (const d of this.deeds) { const e = by.get(d.who) || { name: d.name, impact: 0 }; e.impact += d.impact; by.set(d.who, e) }
    let best: { name: string; impact: number } | null = null
    for (const e of by.values()) if (!best || e.impact > best.impact) best = e
    const v = best && best.impact > 8 ? best : null
    this._greatestCache = { n: this.deeds.length, v }
    return v
  }
  researchProgress(): { name: string; frac: number } {
    const avail = availableTechs(this.discovered, this.era)
    if (!avail.length) return { name: "—", frac: 1 }
    let best = avail[0], bf = -1 // show whichever idea is closest to a breakthrough
    for (const t of avail) { const f = (this.techProgress.get(t.n) || 0) / t.cost; if (f > bf) { bf = f; best = t } }
    return { name: best.n, frac: Math.max(0, Math.min(1, bf)) }
  }
  private discoverTech(t: Tech) {
    this.discovered.add(t.n); this.recentTech = t.n; this.techProgress.delete(t.n)
    if (t.b) { const tb = this.techBoost as unknown as Record<string, number>, nb = t.b as Record<string, number>; for (const k of Object.keys(t.b)) tb[k] += nb[k] }
    if (t.n === "Universidad" && !this.universities.length) this.universities.push({ x: WORLD_W * 0.5 - 64, y: WORLD_H * 0.5 - 54, w: 128, h: 104 })
    const top = this.techTop.get(t.n)
    this.logEvent(`${top ? `${top.name} ${top.surname} (${top.prof})` : "el pueblo"} ideó ${t.n}`)
    if (top) {
      this.deeds.push({ day: this.clockDays, gen: this.peakGen, who: top.id, name: top.name, kind: "descubrimiento", text: `ideó ${t.n}`, impact: 16 })
      const inv = this.creatures.find((c) => c.id === top.id) // the inventor swells with pride + earns renown
      if (inv?.life) { feel(inv, "orgulloso", 0.85); inv.life.rep = Math.min(1, inv.life.rep + 0.25); inv.life.goalProg = Math.min(1, inv.life.goalProg + 0.12) }
    }
  }

  // ── persistence: a civilisation survives reloads until you start a new one ──
  toState() {
    const hi = new Map<House, number>(); this.houses.forEach((h, i) => hi.set(h, i))
    const C = (c: Creature) => ({ id: c.id, x: c.x, y: c.y, e: c.energy, ad: c.ageDays, ls: c.lifespanDays, gen: c.generation, nm: c.name, sn: c.surname, h: hi.get(c.home) ?? 0, k: c.knowledge, pf: c.profession, pb: c.profBase, pc: c.profCat, hp: c.heritProf, sick: c.sick, ch: c.children, par: c.parents, rel: c.religion, pw: c.powerHungry, g: c.genome, ps: c.psyche, mem: c.memory, soc: c.social, gh: c.goingHome, pt: c.partner, pg: c.pregnant, mny: c.money, dk: c.dark, arc: c.archetype, crm: c.crimes, biz: c.business, hl: c.health, mt: c.mental, ir: c.irritability, lf: c.life })
    return { region: this.region, gov: this.gov, system: this.system, era: this.era, cultureName: this.cultureName, cultureEthos: this.cultureEthos, cultureBias: this.cultureBias, clockDays: this.clockDays, clockMinutes: this.clockMinutes, tick: this.tick, research: this.research, discovered: [...this.discovered], techBoost: this.techBoost, wisdom: this.wisdom, births: this.births, deaths: this.deaths, peakGen: this.peakGen, plagueUntil: this.plagueUntil, violence: this.violence, psychopathy: this.psychopathy, religionsCfg: this.religionsCfg, chronicle: this.chronicle.slice(-60), houses: this.houses, gardens: this.gardens, schools: this.schools, universities: this.universities, airport: this.airport, monarch: this.monarch?.id ?? null, animals: this.animals, raiders: this.raiders, graves: this.graves, techProgress: [...this.techProgress], news: this.news, deeds: this.deeds.slice(-300), creatures: this.creatures.filter((c) => !c.isAvatar).map(C) }
  }
  static fromState(s: any, spriteCount: number): World {
    const w = new World(spriteCount, s.region, undefined, true)
    w.gov = s.gov; w.system = s.system || "capitalista"; w.era = s.era; w.clockDays = s.clockDays; w.clockMinutes = s.clockMinutes ?? s.clockDays * 1440; w.tick = s.tick; w.research = s.research
    w.cultureName = s.cultureName || ""; w.cultureEthos = s.cultureEthos || ""; w.cultureBias = s.cultureBias || {}
    w.discovered = new Set<string>(s.discovered || []); w.techBoost = s.techBoost; w.wisdom = s.wisdom
    w.births = s.births; w.deaths = s.deaths; w.peakGen = s.peakGen; w.plagueUntil = s.plagueUntil
    w.violence = s.violence; w.psychopathy = s.psychopathy; w.religionsCfg = s.religionsCfg
    w.chronicle = s.chronicle || []; w.houses = s.houses; w.gardens = s.gardens; w.schools = s.schools
    for (const h of w.houses) if (h.tier === undefined) { h.tier = 0; h.value = 30; h.rent = 0; h.landlord = 0 }
    w.buildPois() // rebuild the market square (claims reset on load)
    w.animals = s.animals || []
    w.raiders = s.raiders || []
    if (Array.isArray(s.techProgress)) w.techProgress = new Map(s.techProgress) // don't lose in-flight research on reload
    if (Array.isArray(s.news)) w.news = s.news
    w.graves = s.graves || []
    w.universities = s.universities; w.airport = s.airport; w.foodTarget = 230; w.deeds = s.deeds || []
    // SECURITY + INTEGRITY: a save is untrusted input (it could be a crafted localStorage blob). Strip markup
    // from any string that reaches the DOM/LLM, cap lengths + array sizes, and finite-clamp the numbers.
    const san = (v: unknown, max = 80): string => String(v ?? "").replace(/[<>]/g, "").slice(0, max)
    const sanArr = (v: unknown, n = 6, max = 200): string[] => (Array.isArray(v) ? v.slice(-n).map((x) => san(x, max)) : [])
    const num = (v: unknown, def: number): number => (typeof v === "number" && Number.isFinite(v) ? v : def)
    const byId = new Map<number, Creature>(); let maxId = 0
    w.creatures = (s.creatures || []).map((c: any) => {
      maxId = Math.max(maxId, num(c.id, 0))
      const cr: Creature = { id: num(c.id, 0), x: num(c.x, 0), y: num(c.y, 0), vx: 0, vy: 0, energy: num(c.e, 80), ageDays: num(c.ad, 0), lifespanDays: num(c.ls, 60 * DAYS_PER_YEAR), genome: c.g, generation: num(c.gen, 1), name: san(c.nm, 40), surname: san(c.sn, 40), home: w.houses[c.h] || w.houses[0], goingHome: !!c.gh, parents: c.par, children: num(c.ch, 0), sick: !!c.sick, sickDays: 0, lastRepro: -99999, partner: num(c.pt, 0), pregnant: num(c.pg, 0), isAvatar: false, facing: 1, psyche: c.ps, memory: sanArr(c.mem, 8, 400), social: sanArr(c.soc, 6, 200), knowledge: num(c.k, 16), profession: san(c.pf, 40), profBase: san(c.pb, 40), profCat: c.pc, heritProf: san(c.hp, 40), religion: san(c.rel, 40), powerHungry: !!c.pw, money: num(c.mny, 0), controlled: false, dark: c.dk || { mach: 0.2, narc: 0.2, psycho: 0.1 }, archetype: c.arc || "promedio", crimes: num(c.crm, 0), business: !!c.biz, health: num(c.hl, 88), mental: num(c.mt, 78), irritability: num(c.ir, 0.3), life: c.lf }
      if (cr.psyche?.beliefs) cr.psyche.beliefs = cr.psyche.beliefs.slice(0, 12).map((b: string) => san(b, 120))
      if (!cr.life) cr.life = newLife(cr)
      byId.set(cr.id, cr); return cr
    })
    for (const cr of w.creatures) if (cr.parents && !cr.parents.every((p) => p === 0 || byId.has(p))) cr.parents = null // drop dangling parent refs
    w.monarch = s.monarch != null ? byId.get(s.monarch) || null : null
    if (maxId + 1 > NEXT_ID) NEXT_ID = maxId + 1
    return w
  }

  private spawn(genome: Genome, generation: number, home: House, x?: number, y?: number, psyche?: Psyche): Creature {
    // realistic personality: a fresh creature draws Big Five + Dark Triad from real base rates; a child
    // is passed an inherited psyche, so we keep that and only seed dark/archetype (overwritten at birth).
    const person = genPerson()
    const ps = psyche ?? randomPsyche()
    if (!psyche) ps.five = person.five // founders + reseeds get the normally-distributed Big Five
    const c: Creature = {
      id: NEXT_ID++,
      x: x ?? home.x, y: y ?? home.y,
      vx: 0, vy: 0,
      energy: START_ENERGY, ageDays: 0, lifespanDays: this.lifespanFor(genome),
      genome, generation,
      name: given(), surname: home.surname, home,
      goingHome: false, parents: null, children: 0,
      sick: false, sickDays: 0, lastRepro: -REPRO_COOLDOWN, partner: 0, pregnant: 0,
      isAvatar: false, facing: 1,
      psyche: ps, memory: [], social: [], knowledge: 0,
      profession: "", profBase: "", profCat: "", heritProf: "",
      religion: "", powerHungry: false, money: 0, controlled: false,
      dark: person.dark, archetype: classify(ps.five, person.dark), crimes: 0, business: false,
      health: 88, mental: 78, irritability: Math.max(0.05, Math.min(0.95, ps.five.n * 0.6 + rand() * 0.2)),
    }
    c.life = newLife(c)
    return c
  }

  scatterFood() {
    const g = rnd(this.gardens)
    this.food.push({ x: clampn(g.x + (rand() * 2 - 1) * 90, MARGIN, WORLD_W - MARGIN), y: clampn(g.y + (rand() * 2 - 1) * 90, MARGIN, WORLD_H - MARGIN) })
  }

  // the town GROWS: build a house in a free lot (the world stops being static as the population rises)
  private addHouse(surname: string): House | null {
    for (let t = 0; t < 40; t++) {
      // anywhere with room (not only block corners) so the town can keep sprouting new households
      const cx = MARGIN + 45 + rand() * (WORLD_W - 2 * MARGIN - 90)
      const cy = MARGIN + 45 + rand() * (WORLD_H - 2 * MARGIN - 90)
      let ok = true
      for (const h of this.houses) if ((h.x + h.w / 2 - cx) ** 2 + (h.y + h.h / 2 - cy) ** 2 < 62 * 62) { ok = false; break }
      if (ok) { const h: House = { x: cx - 29, y: cy - 25, w: 58, h: 50, surname, hue: (this.houses.length * 47) % 360, tier: 0, value: 30, rent: 0, landlord: 0 }; this.houses.push(h); return h }
    }
    return null
  }

  // creatures talk AMONG THEMSELVES (cheap + templated) and KEEP the memory in each one — family at
  // home, teachers + students at school, neighbours in the street. It persists in their `social`.
  private prettyTopic(c: Creature): string { return c.profBase ? `el oficio de ${c.profBase}` : c.religion ? `${c.religion}` : "la vida en el caldo" }
  private socialNotes(a: Creature, b: Creature): [string, string] {
    const sameHome = a.home === b.home
    const gap = ageYears(a) - ageYears(b)
    const topic = rnd([this.prettyTopic(a), this.prettyTopic(b), "la cosecha", "los viejos tiempos", "el clima", "los jardines", "la familia", "los precios del mercado", "un vecino", "un bebé recién nacido", "una boda", "los chismes del pueblo", "el cansancio del trabajo", "una fiesta", "los hijos"])
    if (a.profCat === "enseñanza" && !isMature(b)) return [`le enseñé a ${b.name} en la escuela`, `mi maestro ${a.name} me enseñó de ${topic}`]
    if (b.profCat === "enseñanza" && !isMature(a)) return [`mi maestro ${b.name} me enseñó de ${topic}`, `le enseñé a ${a.name} en la escuela`]
    if (sameHome && Math.abs(gap) > 13) {
      const elder = gap > 0 ? a.name : b.name, young = gap > 0 ? b.name : a.name
      const elderNote = `le hablé a ${young}, de mi familia, sobre ${topic}`, youngNote = `${elder}, de mi familia, me habló de ${topic}`
      return gap > 0 ? [elderNote, youngNote] : [youngNote, elderNote]
    }
    if (sameHome) return [`charlé en casa con ${b.name} sobre ${topic}`, `charlé en casa con ${a.name} sobre ${topic}`]
    return [`crucé palabras con ${b.name} sobre ${topic}`, `crucé palabras con ${a.name} sobre ${topic}`]
  }
  private socialTick(wild: Creature[]) {
    // unobserved, they chatter in CODE — cheap enough to run MANY exchanges per tick; only ~1 in 5 also
    // leaves a full-text memory (so memory stays light). gossip, ideas, feelings spread through the codes.
    const pairs = Math.min(30, Math.ceil(wild.length / 5))
    for (let k = 0; k < pairs; k++) {
      const a = wild[Math.floor(rand() * wild.length)]
      const b = this.nearestCreature(a, 70, (o) => !o.isAvatar && o !== a)
      if (!b) continue
      this.exchangeSignals(a, b, wild)
      if (rand() < 0.2) { const [na, nb] = this.socialNotes(a, b); a.social.push(na); b.social.push(nb); while (a.social.length > 6) a.social.shift(); while (b.social.length > 6) b.social.shift() }
    }
  }
  // two minds trade a burst of compact signals — each updates the other (bonds, reputation, knowledge, mood)
  private exchangeSignals(a: Creature, b: Creature, wild: Creature[]) {
    const sigs: Sig[] = []
    const click = ((a.psyche.five.a + b.psyche.five.a) / 2 - 0.4) - Math.abs(a.psyche.five.e - b.psyche.five.e) * 0.25
    const kin = a.surname === b.surname ? 0.08 : 0, neigh = (a.home.x - b.home.x) ** 2 + (a.home.y - b.home.y) ** 2 < 160 * 160 ? 0.05 : 0
    if (a.irritability > 0.6 && b.irritability > 0.6 && rand() < 0.4) { bond(a, b.id, -0.18); bond(b, a.id, -0.18); feel(a, "enojado", 0.5); feel(b, "enojado", 0.5); sigs.push({ k: KIND.EMOTE, s: a.id, v: -5 }) }
    else { bond(a, b.id, click * 0.07 + kin + neigh); bond(b, a.id, click * 0.07 + kin + neigh); sigs.push({ k: KIND.GREET, s: b.id, v: click > 0 ? 2 : -2 }) }
    if (a.dark.mach > 0.6 && rand() < 0.25) bond(b, a.id, -0.12)
    // KINDRED SPIRITS: people who share a trade, a hobby or a life dream click — they bond + trade more ideas
    const shared = (a.profCat && a.profCat === b.profCat) || (a.life?.hobby && a.life.hobby === b.life?.hobby) || (a.life?.goalKey && a.life.goalKey === b.life?.goalKey)
    if (shared) { bond(a, b.id, 0.05); bond(b, a.id, 0.05); if (a.knowledge !== b.knowledge) { const hi = a.knowledge > b.knowledge ? a : b, lo = hi === a ? b : a; lo.knowledge = Math.min(hi.knowledge, lo.knowledge + 0.4) } }
    // GOSSIP / WARN about a third party — reputation travels the network
    const third = wild[Math.floor(rand() * wild.length)]
    if (third !== a && third !== b && third.life && Math.abs(third.life.rep) > 0.12) {
      bond(a, third.id, third.life.rep * 0.04); bond(b, third.id, third.life.rep * 0.04)
      const g: Sig = { k: third.life.rep < -0.3 ? KIND.WARN : KIND.GOSSIP, s: third.id, v: third.life.rep * 6 }
      sigs.push(g); b.heard = decode(g, `${third.name} ${third.surname}`); a.heard = b.heard // both now carry the rumour
    }
    // IDEA — learning DIFFUSES socially: the more learned rubs off on the less (knowledge spreads by talking)
    if (Math.abs(a.knowledge - b.knowledge) > 6) { const hi = a.knowledge > b.knowledge ? a : b, lo = hi === a ? b : a; lo.knowledge = Math.min(hi.knowledge, lo.knowledge + 0.5); sigs.push({ k: KIND.IDEA, s: hi.id, v: 3 }) }
    if (a.profCat && a.profCat === b.profCat && a.life && b.life) { const jr = a.life.mastery < b.life.mastery ? a : b, sr = jr === a ? b : a; if ((sr.life!.mastery - jr.life!.mastery) > 0.2) jr.life!.mastery = Math.min(1, jr.life!.mastery + 0.012) }
    // EMOTE — feelings rub off (mood contagion)
    if (a.life && a.life.emoInt > 0.35 && b.life) { const good = a.life.emotion === "alegre" || a.life.emotion === "enamorado" || a.life.emotion === "orgulloso"; feel(b, good ? "alegre" : "triste", 0.25); sigs.push({ k: KIND.EMOTE, s: a.id, v: good ? 4 : -4 }) }
    // OPINION / BELIEF spreads — the more charismatic + respected talker can pass on a conviction (or a faith)
    const persuader = (a.psyche.five.e + (a.life?.rep || 0)) > (b.psyche.five.e + (b.life?.rep || 0)) ? a : b, listener = persuader === a ? b : a
    const charisma = persuader.psyche.five.e * (0.55 + (persuader.life?.rep || 0) * 0.45)
    if (persuader.psyche.beliefs.length && listener.psyche.beliefs.length && rand() < 0.06 * charisma) {
      const blf = persuader.psyche.beliefs[Math.floor(rand() * persuader.psyche.beliefs.length)]
      if (!listener.psyche.beliefs.includes(blf)) { listener.psyche.beliefs[Math.floor(rand() * listener.psyche.beliefs.length)] = blf; sigs.push({ k: KIND.OPINION, s: persuader.id, v: 3 }) }
    }
    if (persuader.religion && listener.religion && persuader.religion !== listener.religion && rand() < 0.015 * charisma) { listener.religion = persuader.religion; if (listener.life) feel(listener, "esperanzado", 0.3) } // a conversion of faith
    // NEWS spreads with NETWORK EFFECTS: juicy + already-popular news goes viral, and a chatty extravert is an
    // influencer who pushes it further. as it travels it can MUTATE — sentiment distorts into misinformation.
    if (this.news.length) {
      const n = this.news[this.news.length - 1 - Math.floor(rand() * Math.min(5, this.news.length))]
      const influence = 0.22 * (0.6 + a.psyche.five.e * 0.8) * (1 + Math.min(2, n.reach * 0.012)) // viral + influencer
      if (rand() < influence) {
        n.reach++; b.heard = n.txt; sigs.push({ k: KIND.NEWS, s: 0, v: n.sent * 4 })
        if (rand() < 0.06 && !n.txt.startsWith("(se dice)")) { n.sent = Math.max(-1, Math.min(1, n.sent + (rand() < 0.5 ? -0.7 : 0.7))); n.txt = "(se dice) " + n.txt } // the rumour distorts
        if (n.sent < 0 && b.life) feel(b, "asustado", 0.2); else if (n.sent > 0 && b.life) feel(b, "alegre", 0.15)
      }
    }
    if (sigs.length) { const codes = sigs.map(codeOf); a.sigs = [...(a.sigs || []), ...codes].slice(-6); b.sigs = [...(b.sigs || []), ...codes].slice(-6) }
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
  // homes EVOLVE: a family that accumulates wealth invests it in a finer house (choza → casa → casona → mansión)
  private upgradeHomes() {
    const wealth = new Map<House, number>()
    for (const c of this.creatures) if (!c.isAvatar) wealth.set(c.home, (wealth.get(c.home) || 0) + c.money)
    const COST = [0, 150, 700, 3000], NAMES = ["choza", "casa", "casona", "mansión"]
    for (const h of this.houses) {
      if (h.tier >= 3) continue
      const cost = COST[h.tier + 1]
      if ((wealth.get(h) || 0) > cost * 1.4) {
        h.tier++; h.value = cost * 2.2; h.w = 50 + h.tier * 16; h.h = 44 + h.tier * 11
        // building it really drains the household's coin (a major investment) → keeps wealth scarce
        const fam = this.creatures.filter((c) => c.home === h && !c.isAvatar).sort((a, b) => b.money - a.money)
        let owe = cost; for (const c of fam) { const pay = Math.min(c.money, owe); c.money -= pay; owe -= pay; if (owe <= 0) break }
        if (fam[0]?.life) feel(fam[0], "orgulloso", 0.6)
        this.logEvent(`los ${h.surname} prosperaron a una ${NAMES[h.tier]}`)
      }
    }
  }
  // RENTAL MARKET: the wealthy buy spare houses + rent them out; tenants pay rent → passive income widens the gap
  private housingMarket(wild: Creature[], byId: Map<number, Creature>) {
    const occupants = new Map<House, Creature[]>()
    for (const c of wild) { const a = occupants.get(c.home) || []; a.push(c); occupants.set(c.home, a) }
    // a rich aldeano invests spare coin in a vacant house → becomes a landlord
    for (const c of wild) {
      if (c.money < 600 || ageYears(c) < 22 || rand() > 0.03) continue
      const vacant = this.houses.find((h) => !occupants.has(h) && h.landlord === 0 && h.surname !== c.surname)
      if (vacant) { vacant.landlord = c.id; vacant.rent = Math.max(2, Math.round(vacant.value * 0.05)); c.money -= vacant.value * 0.5; if (c.life) feel(c, "orgulloso", 0.4); this.logEvent(`${c.name} ${c.surname} compró una casa para alquilar`) }
    }
    // APARTMENT BUILDINGS: from the industrial era, a tycoon erects a tall block that houses many families
    if (this.era >= 9 && this.houses.filter((h) => h.tier === 4).length < Math.floor(wild.length / 45) && this.houses.length < 170) {
      const tycoon = wild.filter((c) => c.money > 1600 && ageYears(c) > 24).sort((a, b) => b.money - a.money)[0]
      if (tycoon && rand() < 0.2) { const nh = this.addHouse(tycoon.surname); if (nh) { nh.tier = 4; nh.w = 74; nh.h = 66; nh.value = 2200; nh.rent = 18; nh.landlord = tycoon.id; tycoon.money -= 1100; this.logEvent(`${tycoon.name} ${tycoon.surname} construyó un edificio de apartamentos`) } }
    }
    // tenants pay their landlord; the destitute fall behind (→ pressure toward homelessness)
    for (const c of wild) {
      const h = c.home
      if (!h.landlord || h.landlord === c.id || h.surname === c.surname) continue
      const ll = byId.get(h.landlord); if (!ll) { h.landlord = 0; continue } // landlord died → house reverts
      const pay = Math.min(c.money, h.rent)
      c.money -= pay; ll.money += pay
      if (pay < h.rent) c.mental = Math.max(0, c.mental - 3) // can't make rent → stress
    }
  }
  // ANIMALS: wild beasts roam + raid; the town hunts, tames, or suffers them — depending on WHO lives there
  private runAnimals(wild: Creature[]) {
    if (!wild.length) return
    const want = Math.min(16, 4 + Math.floor(wild.length / 22))
    while (this.animals.length < want) { // wild animals wander in from the edges
      const avail = SPECIES_KEYS.filter((k) => SPECIES[k].era <= this.era)
      const kind = avail[Math.floor(rand() * avail.length)]
      const edge = rand() < 0.5
      this.animals.push({ id: NEXT_ID++, x: edge ? MARGIN + rand() * 60 : WORLD_W - MARGIN - rand() * 60, y: MARGIN + rand() * (WORLD_H - 2 * MARGIN), vx: 0, vy: 0, kind, hp: SPECIES[kind].danger > 0 ? 3 : 1, tame: false, owner: 0 })
    }
    const fighters = wild.filter((c) => isMature(c) && (c.profCat === "defensa" || c.profCat === "comida" || c.profCat === "exploración")).length // hunters + soldiers = the town's muscle
    const tamers = wild.filter((c) => isMature(c) && (c.profCat === "cuidado" || c.profCat === "comida")).length
    const cx = WORLD_W / 2, cy = WORLD_H / 2
    for (let i = this.animals.length - 1; i >= 0; i--) {
      const a = this.animals[i], sp = SPECIES[a.kind]
      if (rand() < 0.08) { // beasts drift toward where the people are — predators to hunt, grazers to feed
        const dx = cx - a.x, dy = cy - a.y, d = Math.hypot(dx, dy) || 1, pull = sp.hostile ? 1.4 : 0.9
        a.vx = (dx / d) * pull + (rand() * 2 - 1) * 1.2; a.vy = (dy / d) * pull + (rand() * 2 - 1) * 1.2
      }
      if (a.tame) { const o = a.owner ? this.creatures.find((c) => c.id === a.owner) : null; if (o) { a.vx = (o.x - a.x) * 0.03 + a.vx * 0.5; a.vy = (o.y - a.y) * 0.03 + a.vy * 0.5 } a.x = clampn(a.x + a.vx, MARGIN, WORLD_W - MARGIN); a.y = clampn(a.y + a.vy, MARGIN, WORLD_H - MARGIN); continue } // pets follow their owner
      a.x = clampn(a.x + a.vx, MARGIN, WORLD_W - MARGIN); a.y = clampn(a.y + a.vy, MARGIN, WORLD_H - MARGIN)
      const v = this.nearestCreature({ x: a.x, y: a.y } as Creature, 110, (o) => !o.isAvatar && isMature(o))
      if (!v) continue
      if (sp.hostile) { // a PREDATOR is close to a villager
        if (fighters > 0 && rand() < 0.5) { a.hp--; if (a.hp <= 0) { this.dropMeat(a.x, a.y, sp.food); this.animals.splice(i, 1); if (v.life) feel(v, "orgulloso", 0.4); this.logEvent(`cazaron un ${a.kind} que merodeaba`) } } // fought off → meat
        else if (rand() < sp.danger * 0.3) { v.health = Math.max(0, v.health - 24); if (v.life) feel(v, "asustado", 0.85); this.logEvent(v.health <= 0 ? `un ${a.kind} mató a ${v.name} ${v.surname}` : `un ${a.kind} atacó a ${v.name} ${v.surname}`) } // it mauls a villager
      } else if (sp.tameable && tamers > 0 && rand() < 0.12) { a.tame = true; a.owner = v.id; if (v.life) feel(v, "alegre", 0.4); this.logEvent(`${v.name} ${v.surname} domesticó un ${a.kind}`) } // tamed → livestock/pet
      else if (sp.food > 0 && fighters > 0 && rand() < 0.1) { this.dropMeat(a.x, a.y, sp.food); this.animals.splice(i, 1) } // hunted for meat
    }
  }
  private dropMeat(x: number, y: number, n: number) { for (let k = 0; k < n; k++) this.food.push({ x: clampn(x + (rand() * 2 - 1) * 40, MARGIN, WORLD_W - MARGIN), y: clampn(y + (rand() * 2 - 1) * 40, MARGIN, WORLD_H - MARGIN) }) }
  // the town's fighting power: soldiers (by skill) + scouts + a militia of everyone else, sharper each era
  militaryStrength(): number {
    let s = 0
    for (const c of this.creatures) { if (c.isAvatar || !isMature(c)) continue; s += c.profCat === "defensa" ? 1.6 + (c.life?.mastery || 0) * 1.2 : c.profCat === "exploración" ? 0.6 : 0.12 }
    s += this.animals.reduce((a, an) => a + (an.tame && an.kind === "perro" ? 0.5 : 0), 0) // war dogs
    return s * (1 + this.era * 0.07) // better arms each era
  }
  // RAIDS from peoples that don't exist as towns: savages → nomads/barbarians/pirates → terrorists, by era.
  // Real-ish odds: pre-modern raiding is common; modern terrorism is rarer. Wealth tempts, an army deters.
  private runRaids(wild: Creature[]) {
    if (!wild.length) return
    const army = this.militaryStrength()
    for (let i = this.raiders.length - 1; i >= 0; i--) {
      const r = this.raiders[i]
      const dx = WORLD_W / 2 - r.x, dy = WORLD_H / 2 - r.y, d = Math.hypot(dx, dy) || 1
      r.x = clampn(r.x + (dx / d) * 2.4, MARGIN, WORLD_W - MARGIN); r.y = clampn(r.y + (dy / d) * 2.4, MARGIN, WORLD_H - MARGIN)
      const v = this.nearestCreature({ x: r.x, y: r.y } as Creature, 95, (o) => !o.isAvatar && isMature(o))
      if (!v) continue
      if (army > 3 && rand() < 0.28 + Math.min(0.4, army * 0.012)) { r.hp--; if (r.hp <= 0) { this.raiders.splice(i, 1); if (v.life) feel(v, "orgulloso", 0.5) } } // the militia cuts one down
      else if (rand() < 0.06 * (ENEMIES[r.kind]?.power || 1)) { // a villager is struck + food/coin looted
        const lethal = Math.max(0, 0.42 - army * 0.05) // the weaker the militia, the deadlier the raid
        v.health = Math.max(0, rand() < lethal ? 0 : v.health - 30); v.money = Math.max(0, v.money - 25)
        if (v.life) feel(v, "asustado", 0.95); this.logEvent(v.health <= 0 ? `${v.name} ${v.surname} cayó ante ${ENEMIES[r.kind]?.label || "los invasores"}` : `${v.name} ${v.surname} fue herido en el ataque`)
        for (let k = 0; k < 5 && this.food.length; k++) this.food.pop()
      }
    }
    if (this.raiders.length) { if (rand() < 0.05) { const n = this.raiders.length; this.raiders = []; this.logEvent(n > 0 ? `el pueblo resistió y los invasores huyeron` : ``) } return }
    // chance to START a raid (per ~20-tick period)
    const avail = Object.keys(ENEMIES).filter((k) => this.era >= ENEMIES[k].min && this.era <= ENEMIES[k].max)
    if (!avail.length) return
    const wealth = wild.reduce((a, c) => a + c.money, 0) / wild.length
    const base = this.era < 9 ? 0.014 : 0.004 // pre-modern raiding common; modern terrorism rare
    const p = base * (1 + this.violence * 1.2) * (1 + Math.min(1.2, wealth / 350)) / (1 + army * 0.035)
    if (rand() < p) {
      const kind = avail[Math.floor(rand() * avail.length)]
      const n = 2 + Math.floor(rand() * 4), ex = rand() < 0.5 ? MARGIN + 30 : WORLD_W - MARGIN - 30, ey = MARGIN + rand() * (WORLD_H - 2 * MARGIN)
      for (let k = 0; k < n; k++) this.raiders.push({ x: ex + (rand() * 2 - 1) * 50, y: ey + (rand() * 2 - 1) * 50, vx: 0, vy: 0, kind, hp: 2 })
      this.logEvent(`¡${ENEMIES[kind].label} ataca el pueblo!`)
    }
  }
  // MARKET: producers supply goods (food, crafts, art), the town demands them; the price floats with the
  // balance. merchants profit by trading, and the rich spend on luxuries → coin flows to artisans (a sink).
  private runMarket(wild: Creature[]) {
    let producers = 0
    for (const c of wild) if (c.profCat === "comida" || c.profCat === "oficio" || c.profCat === "construcción" || c.profCat === "arte") producers++
    const target = Math.max(0.5, Math.min(3, wild.length / (producers * 7 + 1)))
    this.marketPrice = this.marketPrice * 0.92 + target * 0.08 // prices drift toward supply/demand balance
    for (const c of wild) {
      if (c.profCat === "comercio") c.money += this.marketPrice * 3.2 // merchants live off the spread
      if (c.money > 220 && rand() < 0.12) { // the well-off buy luxuries → artisans + merchants earn
        const spend = Math.min(c.money * 0.12, 35); c.money -= spend
        const seller = wild[Math.floor(rand() * wild.length)]
        if (seller.profCat === "arte" || seller.profCat === "oficio" || seller.profCat === "comercio") seller.money += spend
        if (c.life) feel(c, "alegre", 0.28)
      }
    }
  }
  // POVERTY → HOMELESSNESS: the destitute lose their footing and end up on the street, where life wears them
  // down further; if they claw back some coin they find shelter again.
  private poverty(wild: Creature[]) {
    for (const c of wild) {
      if (!c.life || !isMature(c)) continue
      if (c.life.condition === "sin techo") {
        c.health = Math.max(0, c.health - 0.6); c.mental = Math.max(0, c.mental - 0.5) // sleeping rough wears you down
        if (c.money > 28) { c.life.condition = ""; c.life.condDays = 0; feel(c, "esperanzado", 0.6); this.logEvent(`${c.name} ${c.surname} consiguió techo de nuevo`) }
      } else if (c.money < 1 && c.mental < 38 && !c.life.condition && rand() < 0.025) {
        c.life.condition = "sin techo"; c.life.condDays = 9999; feel(c, "afligido", 0.65); c.life.rep = Math.max(-1, c.life.rep - 0.15); this.logEvent(`${c.name} ${c.surname} quedó en la calle`)
      }
      // MADNESS: crushing, prolonged despair can break a mind — they lose their trade and wander, muttering
      if (c.life.condition === "locura") { c.mental = Math.min(28, c.mental + 0.05); c.irritability = Math.min(1, c.irritability + 0.002) }
      else if (c.mental < 11 && c.life.condition !== "locura" && rand() < 0.012) {
        c.life.condition = "locura"; c.life.condDays = 9999; c.profBase = ""; c.profCat = ""; c.profession = "perdió la razón"; feel(c, "asustado", 0.7); this.logEvent(`${c.name} ${c.surname} perdió la cordura`)
      }
    }
  }
  // a family line: how many living members share the surname + their collective standing (dynasty reputation)
  dynasty(surname: string): { size: number; rep: number } {
    let size = 0, rep = 0
    for (const c of this.creatures) if (!c.isAvatar && c.surname === surname) { size++; rep += c.life?.rep || 0 }
    return { size, rep: size ? rep / size : 0 }
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
  // where an aldeano goes to ACT ON their own intent — work at their trade's place, mingle at the plaza, etc.
  // POINTS OF INTEREST — a tidy market square + benches around the plaza that people CLAIM + stand at, so the
  // crowd lines up at stalls + work stations instead of piling onto one pixel (much more orderly + alive).
  buildPois() {
    this.pois = []
    const cx = WORLD_W / 2, cy = WORLD_H / 2
    for (let i = 0; i < 6; i++) for (let j = 0; j < 5; j++) {
      const x = cx + (i - 2.5) * 46, y = cy - 74 + j * 42
      if (Math.hypot(x - cx, y - cy) < 34) continue // keep the very centre open
      this.pois.push({ x, y, kind: (i + j) % 3 === 0 ? "market" : "work", by: 0 })
    }
    for (let a = 0; a < 10; a++) this.pois.push({ x: cx + Math.cos((a / 10) * Math.PI * 2) * 178, y: cy + Math.sin((a / 10) * Math.PI * 2) * 152, kind: "social", by: 0 })
  }
  claimSlot(c: Creature, kind: string, ax: number, ay: number): { x: number; y: number } | null {
    if (c.poi !== undefined && c.poi >= 0) { const p = this.pois[c.poi]; if (p && p.by === c.id && p.kind === kind) return { x: p.x, y: p.y }; this.releaseSlot(c) }
    let best = -1, bd = 1e9
    for (let i = 0; i < this.pois.length; i++) { const p = this.pois[i]; if (p.kind !== kind || p.by) continue; const d = (p.x - ax) ** 2 + (p.y - ay) ** 2; if (d < bd) { bd = d; best = i } }
    if (best < 0) return null
    this.pois[best].by = c.id; c.poi = best; return { x: this.pois[best].x, y: this.pois[best].y }
  }
  releaseSlot(c: Creature) { if (c.poi !== undefined && c.poi >= 0 && this.pois[c.poi] && this.pois[c.poi].by === c.id) this.pois[c.poi].by = 0; c.poi = -1 }
  private intentTarget(c: Creature, intent: string): { x: number; y: number } {
    // a per-person offset so a crowd SPREADS around a spot instead of piling onto one pixel
    const ox = Math.cos(c.id * 2.4) * 70, oy = Math.sin(c.id * 1.7) * 60
    const home = { x: c.home.x + c.home.w / 2, y: c.home.y + c.home.h + 14 }
    const cx = WORLD_W / 2, cy = WORLD_H / 2
    if (intent === "estudiar" && this.universities[0]) { this.releaseSlot(c); const u = this.universities[0]; return { x: u.x + u.w / 2 + ox, y: u.y + u.h / 2 + oy } }
    if (intent === "descansar") { this.releaseSlot(c); return home }
    if (intent === "socializar" || intent === "cortejar") return this.claimSlot(c, "social", cx, cy) || { x: cx + ox, y: cy + oy } // claim a bench
    if (intent === "disfrutar") { this.releaseSlot(c); const g = this.nearestGarden(c); return { x: g.x + ox, y: g.y + oy } }
    if (intent === "trabajar") {
      const cat = c.profCat
      if (cat === "enseñanza") { this.releaseSlot(c); const s = this.nearestSchool(c); return { x: s.x + s.w / 2 + ox, y: s.y + s.h / 2 + oy } }
      if ((cat === "saber" || cat === "ingeniería" || cat === "salud") && this.universities[0]) { this.releaseSlot(c); const u = this.universities[0]; return { x: u.x + u.w / 2 + ox, y: u.y + u.h / 2 + oy } }
      if (cat === "comida" || cat === "cuidado") { this.releaseSlot(c); const g = this.nearestGarden(c); return { x: g.x + ox, y: g.y + oy } }
      // merchants, leaders + crafters claim a stall (commerce) or a work station in the market square
      return this.claimSlot(c, cat === "comercio" || cat === "liderazgo" ? "market" : "work", cx, cy) || { x: cx + ox, y: cy + oy }
    }
    this.releaseSlot(c); return home
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
    // CLIMATE shapes the land: cold lands grow little + freeze in winter, deserts are lean, the tropics teem.
    // (region 0 templado · 1 frío · 2 desierto · 3 selvático)
    const seas = seasonOf(this.clockDays)
    const climF = [1.0, seas === 3 ? 0.5 : 0.9, 0.7, 1.25][this.region % 4] // food yield by climate + season
    const livestock = this.animals.reduce((s, a) => s + (a.tame && SPECIES[a.kind].food > 0 ? 1 : 0), 0) // herds give steady food
    { let n = Math.min(this.foodTarget - this.food.length, Math.ceil((2 + this.creatures.length * 0.5) * climF + livestock * 0.5)); while (n-- > 0) this.scatterFood() }

    // ── civilisation: EMERGENT discoveries — real aldeanos get IDEAS and try to BUILD them ──
    // no global counter: progress on a tech only comes from actual mature, educated, curious individuals
    // whose mind/trade fits what the tech needs. a town of dim, unschooled people simply doesn't advance.
    const avail = availableTechs(this.discovered, this.era)
    if (avail.length) {
      const minK = 6 + this.era * 3 // you need enough learning to even attempt the era's ideas
      const boost = 1 + this.techBoost.research * 0.08
      for (const v of this.creatures) {
        if (v.isAvatar || !isMature(v) || v.knowledge < minK) continue
        // this mind is drawn to a tech that fits their trade, and to things near a breakthrough
        let pick: Tech | null = null, ps = -1
        for (const t of avail) {
          // their trade-fit + how close it is to done + their CULTURE's leaning toward this kind of tech
          const score = driveMatch(v.profCat, t.drive) + ((this.techProgress.get(t.n) || 0) / t.cost) * 0.6 + ((this.cultureBias[t.drive] ?? 1) - 1) * 0.7
          if (score > ps) { ps = score; pick = t }
        }
        if (!pick) continue
        const m = driveMatch(v.profCat, pick.drive)
        if (m < 0.5 && rand() > 0.25) continue // outside your field you only dabble
        const curiosity = 0.7 + (v.archetype === "emprendedor" || v.archetype === "líder" ? 0.5 : 0)
        const connect = 1 + Math.min(0.55, Object.keys(v.life?.rels || {}).length * 0.07) // a well-connected mind has more idea inputs → COLLECTIVE intelligence
        const contrib = v.genome.intellect * (v.knowledge / 100) * m * curiosity * boost * INNOV_RATE * (this.cultureBias[pick.drive] ?? 1) * connect
        this.techProgress.set(pick.n, (this.techProgress.get(pick.n) || 0) + contrib)
        const top = this.techTop.get(pick.n) // remember the most capable mind that worked on it = the inventor
        if (!top || contrib > top.amt) this.techTop.set(pick.n, { id: v.id, name: v.name, surname: v.surname, prof: v.profession || "aldeano", amt: contrib })
      }
      const costMul = eraCostMult(this.era)
      for (const t of avail) if ((this.techProgress.get(t.n) || 0) >= t.cost * costMul) this.discoverTech(t)
    }
    // a milestone-gated era advance: all keystones + enough of the era's discoveries (a civ-style tech tree)
    if (this.era < 18 && canAdvanceEra(this.discovered, this.era)) {
      this.era++; this.logEvent(`✦ amanece la era ${eraName(this.era)}`)
      const np = PROFS.filter((p) => p.e === this.era).slice(0, 3).map((p) => p.n) // each generation gains new trades to learn
      if (np.length) this.logEvent(`se abren nuevos oficios: ${np.join(", ")}`)
    }
    // FESTIVAL: a few times a year the whole town gathers to celebrate — spirits, fun + togetherness lift
    if (this.clockDays > 0 && this.clockDays % 90 === 0) {
      for (const c of this.creatures) if (!c.isAvatar && c.life) { c.mental = Math.min(100, c.mental + 4); c.life.fun = Math.min(100, c.life.fun + 35); c.life.social = Math.min(100, c.life.social + 22); feel(c, "alegre", 0.55) }
      this.logEvent(`✦ el pueblo celebra una fiesta`)
    }
    // SEASONS colour daily life: a hard winter weighs on everyone, a bright spring lifts them
    const season = seasonOf(this.clockDays)
    if (this.tick % 10 === 0) for (const c of this.creatures) if (!c.isAvatar && c.life) { if (season === 3) c.life.fun = Math.max(0, c.life.fun - 1.2); else if (season === 0) c.life.fun = Math.min(100, c.life.fun + 0.8) }
    // MARKET DAY: a few times a month merchants gather at the plaza to trade — extra coin + a hum of gossip
    if (this.clockDays % 14 === 0) for (const c of this.creatures) if (!c.isAvatar && c.life && (c.profCat === "comercio" || c.profCat === "oficio")) { c.money += 6; c.life.social = Math.min(100, c.life.social + 14) }
    // plague: a rare epidemic that can take the wise and tip the village into a dark age
    if (this.clockDays > this.plagueUntil + 1500 && rand() < 0.00012) {
      this.plagueUntil = this.clockDays + 130 + Math.floor(rand() * 160)
      this.logEvent("⚠ una peste cayó sobre el pueblo")
    }
    const plague = this.clockDays < this.plagueUntil ? 3.4 : 1
    const healthM = 1 + this.econ.health + this.techBoost.health
    const learnM = 1 + this.econ.learn + this.techBoost.learn
    // violence is fed by the configured level, the share of power-obsessed, monarchy, and a cruel monarch
    const violenceRate = this.violence * (1 + 2.2 * this.psychopathy) * (this.gov === "monarquía" ? 1.3 : 1) * (this.monarch?.powerHungry ? 1.5 : 1)

    const survivors: Creature[] = []
    const newborns: Creature[] = []
    const byId = new Map<number, Creature>()
    for (const c of this.creatures) byId.set(c.id, c)
    const homeCount = new Map<House, number>() // cheap household size, for the social need
    for (const c of this.creatures) if (!c.isAvatar) homeCount.set(c.home, (homeCount.get(c.home) || 0) + 1)

    for (const c of this.creatures) {
      c.ageDays++

      if (!c.isAvatar && !c.controlled) {
        let tx: number, ty: number
        if (!isMature(c)) {
          // CHILDREN live with their family — they never roam the world alone. Toddlers stay home;
          // school-age kids go to the school. Adults (16+) leave to forage. (Family feeds the kids.)
          if (ageYears(c) < 6) { tx = c.home.x + c.home.w / 2; ty = c.home.y + c.home.h + 14 }
          else { const s = this.nearestSchool(c); tx = s.x + s.w / 2; ty = s.y + s.h / 2 }
        } else {
          // AUTONOMY: each adult decides for themselves. hunger always overrides; otherwise they act on
          // their OWN intent (work, seek company, rest, leisure, court) — two people choose differently.
          if (c.energy < GO_FORAGE_AT) c.goingHome = false
          else if (c.energy > GO_HOME_AT) c.goingHome = true
          if (c.life && (this.clockDays + c.id) % 3 === 0) c.life.intent = decideIntent(c)
          // higher education: a studious young adult enrols at the university to keep learning a trade
          const ay = ageYears(c)
          if (c.life && this.universities[0] && ay >= 18 && ay <= 27 && c.psyche.five.c + c.psyche.five.o > 1.05 && c.energy > GO_FORAGE_AT && rand() < 0.5) c.life.intent = "estudiar"
          const intent = c.life?.intent || "comer"
          // hunger only commands them when they're genuinely hungry; the rest of the time they live their OWN life
          if (c.energy < 62 || intent === "comer") { const f = this.nearestFood(c, c.genome.vision * 3); const gd = this.nearestGarden(c); tx = f ? f.x : gd.x; ty = f ? f.y : gd.y }
          else { const t = this.intentTarget(c, intent); tx = t.x; ty = t.y }
        }
        const [vx, vy] = this.roadSteer(c, tx, ty)
        c.vx = vx; c.vy = vy
      }

      // MOVEMENT OWNERSHIP: the sim is the single source of position. When this world is the one on screen,
      // the view (main.ts) moves creatures smoothly every frame toward the sim's chosen velocity, so the sim
      // skips its own per-tick position write to avoid the two fighting. Headless + background worlds: sim moves.
      if (!c.isAvatar && !c.controlled && !this.viewControlled) {
        c.x += c.vx; c.y += c.vy
        if (c.vx > 0.05) c.facing = 1; else if (c.vx < -0.05) c.facing = -1
        c.x = clampn(c.x, MARGIN, WORLD_W - MARGIN)
        c.y = clampn(c.y, MARGIN, WORLD_H - MARGIN)
      }

      const g = c.genome
      // upkeep follows the genome trait (not the scaled px velocity): a flat idle tax + a movement tax
      // proportional to how fast it's actually going relative to its max. Faster genomes pay more.
      const moving = Math.min(1, Math.hypot(c.vx, c.vy) / (g.speed * SPEED_SCALE || 1))
      let upkeep = IDLE_COST * g.metabolism * g.size + MOVE_COST * g.speed * g.speed * g.size * g.metabolism * moving
      if (c.sick) upkeep *= SICK_EXTRA
      c.energy -= upkeep
      if (!c.isAvatar && !isMature(c)) c.energy = Math.min(MAX_ENERGY, c.energy + 0.6) // the family feeds the children (well above their upkeep, so they don't starve before growing up)
      // A MEAL AT HOME: settled adults eat stored/bought food when home — so they don't forage all day and
      // actually have time to LIVE (work, socialise, study). In later eras the meal costs a little coin.
      if (!c.isAvatar && isMature(c) && c.energy < MAX_ENERGY && c.life?.condition !== "sin techo") { // the homeless have no hearth
        if ((c.x - (c.home.x + c.home.w / 2)) ** 2 + (c.y - (c.home.y + c.home.h + 14)) ** 2 < 80 * 80) c.energy = Math.min(MAX_ENERGY, c.energy + 6) // the household's stored harvest
      }

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
        // the ceiling RISES with the civilisation's institutions — printing, universities, encyclopaedias,
        // computers (the learn boosts) push how much a person can learn, so knowledge keeps accelerating
        const ceiling = this.wisdom + 18 + this.techBoost.learn * 22 + this.universities.length * 14
        if (!isMature(c)) {
          const s = this.nearestSchool(c)
          const atSchool = (c.x - (s.x + s.w / 2)) ** 2 + (c.y - (s.y + s.h / 2)) ** 2 < 95 * 95
          const lr = stageOf(ageYears(c)).learnRate // young children absorb fastest
          if (atSchool && c.knowledge < ceiling) c.knowledge = Math.min(ceiling, c.knowledge + 0.11 * g.intellect * learnM * lr)
        } else if (c.knowledge < ceiling + 20) {
          // adults keep learning; a student AT the university learns far faster + can rise ABOVE the common ceiling (higher ed)
          const u = this.universities[0]
          const atUni = !!u && (c.x - (u.x + u.w / 2)) ** 2 + (c.y - (u.y + u.h / 2)) ** 2 < 115 * 115
          const rate = atUni ? 0.06 * g.intellect * learnM : (0.0014 + 0.004 * this.techBoost.learn) * g.intellect
          c.knowledge = Math.min(ceiling + (atUni ? 20 : 0), c.knowledge + rate)
        }
        // pick a trade when grown up
        if (!c.profBase && isMature(c)) this.assignProfession(c)
        lifeTick(c, !!c.partner && byId.has(c.partner), homeCount.get(c.home) || 1) // the inner life ticks
      }

      const ay = ageYears(c)
      const ageRisk = 1 + Math.max(0, ay - 45) / 40
      const frail = 1 + (1 - c.health / 100) * 1.6 // poor physical health → far more prone to illness
      const cling = this.creatures.length < 30 ? 0.32 : 1 // a near-wiped tribe clings to life (lower mortality) so it can recover
      // climate: the tropics breed fevers (summer worst), the cold lands sicken in deep winter
      const climS = this.region % 4 === 3 ? (seasonOf(this.clockDays) === 1 ? 1.7 : 1.3) : this.region % 4 === 1 && seasonOf(this.clockDays) === 3 ? 1.6 : 1
      if (!c.sick) { if (rand() < 0.00009 * (1.25 - g.resistance) * ageRisk * plague / healthM * frail * climS) { c.sick = true; c.sickDays = 0 } }
      else {
        c.sickDays++
        if (rand() < 0.022 * (0.5 + g.resistance) * healthM) { c.sick = false; c.sickDays = 0 }
        else if (rand() < 0.006 * (1.3 - g.resistance) * ageRisk / healthM * cling) { if (!c.isAvatar && !c.controlled) { this.deaths++; this.deathCauses.enfermedad++; continue } }
      }

      if (!c.isAvatar && !c.controlled) {
        if (!isMature(c)) c.energy = Math.max(c.energy, 40) // CHILDREN are fed by their family — they don't forage
        else if (this.era < 2) c.energy = Math.max(c.energy, 48) // a hunter-gatherer BAND shares its catch — a stable tribe doesn't mass-starve (foraging tops them up well above this; this is the floor that keeps the long stone age alive + fertile)
        else if (c.energy < 25) c.energy = 25 // farming/market eras: food is BOUGHT — survival rides on health/money
        if (c.health <= 0) { this.deaths++; this.deathCauses.pobreza++; continue } // died of poverty (couldn't afford food/care)
        if (c.ageDays > c.lifespanDays && rand() < (c.ageDays - c.lifespanDays) / (0.18 * c.lifespanDays) * cling) { if (c.life && c.life.rep > 0.35) { this.graves.push({ x: c.x, y: c.y, name: `${c.name} ${c.surname}` }); if (this.graves.length > 40) this.graves.shift() } this.deaths++; this.deathCauses.vejez++; continue } // a respected elder gets a remembered grave
        if (isMature(c) && rand() < 0.0000052 * violenceRate) { this.deaths++; this.deathCauses.violencia++; this.logEvent(`${c.name} ${c.surname} murió en un acto de violencia`); continue }
      }

      // gestation → BIRTH (pairing + conception happen in the periodic demographics block below)
      if (!c.isAvatar && c.pregnant > 0) {
        c.pregnant--
        if (c.life && rand() < 0.02) feel(c, "esperanzado", 0.45) // carrying a life, full of hope
        if (c.pregnant <= 0 && this.creatures.length + newborns.length < POP_CAP) {
          const mate = byId.get(c.partner)
          const mateG = mate ? mate.genome : randomGenome(this.spriteCount), mateP = mate ? mate.psyche : randomPsyche() // unknown father if out of wedlock
          const boom = this.creatures.length < 22 ? 3 : this.creatures.length < 40 ? 1.5 : 1 // only a tiny tribe has big broods; normal villages = mostly single births
          const litter = litterSize(boom)
          for (let b = 0; b < litter; b++) {
            const child = this.spawn(recombine(g, mateG, this.spriteCount), c.generation + 1, c.home, c.home.x + (rand() * 24 - 12), c.home.y + (rand() * 18 - 9), inheritPsyche(c.psyche, mateP))
            child.energy = CHILD_ENERGY
            child.parents = [c.id, c.partner]
            child.heritProf = rand() < 0.5 ? c.profBase : (mate ? mate.profBase : c.profBase)
            child.religion = rand() < 0.85 ? (rand() < 0.5 ? c.religion : (mate ? mate.religion : c.religion)) : pickReligion(this.religionsCfg)
            child.powerHungry = rand() < this.psychopathy * ((c.powerHungry || (mate && mate.powerHungry)) ? 1.8 : 1)
            child.dark = inheritDark(c.dark, mate ? mate.dark : c.dark); child.archetype = classify(child.psyche.five, child.dark)
            if (child.life) child.life.rep = (((c.life?.rep || 0) + (mate?.life?.rep || 0)) / 2) * 0.4 // born into the family's standing
            newborns.push(child); this.births++
            if (child.generation > this.peakGen) this.peakGen = child.generation
          }
          c.children += litter; if (mate) mate.children += litter
          feel(c, "alegre", 0.9); if (c.life && c.life.goalKey === "familia") c.life.goalProg = Math.min(1, c.life.goalProg + 0.12) // the joy of a newborn
          if (mate) { feel(mate, "alegre", 0.85); if (mate.life && mate.life.goalKey === "familia") mate.life.goalProg = Math.min(1, mate.life.goalProg + 0.12) }
          c.energy -= REPRO_COST; if (mate) mate.energy = Math.max(5, mate.energy - REPRO_COST)
          c.lastRepro = this.clockDays; if (mate) mate.lastRepro = this.clockDays
          if (this.houses.length < 130 && this.creatures.length + newborns.length > this.houses.length * 2.4) { const nh = this.addHouse(c.surname); if (nh) newborns[newborns.length - 1].home = nh } // town grows
        }
      }

      survivors.push(c)
    }

    // GRIEF: whoever just lost a partner, parent, child or housemate carries the sorrow for weeks
    const survSet = new Set(survivors.map((c) => c.id))
    for (const dead of this.creatures) {
      if (dead.isAvatar || survSet.has(dead.id)) continue
      const heirs: Creature[] = [] // their estate passes to the family
      for (const m of survivors) {
        if (!m.life) continue
        const partner = m.partner === dead.id
        const child = dead.parents?.includes(m.id) || m.parents?.includes(dead.id)
        const kin = partner || m.home === dead.home || (child ?? false)
        if (!kin) continue
        feel(m, "afligido", partner ? 0.95 : 0.7); m.mental = Math.max(0, m.mental - (partner ? 14 : 7))
        m.life.condition = "duelo"; m.life.condDays = Math.max(m.life.condDays, partner ? 45 : 22)
        m.social.push(`perdí a ${dead.name} ${dead.surname}`); while (m.social.length > 6) m.social.shift() // they carry the memory
        if (partner || child) heirs.push(m) // INHERITANCE: estate splits among partner + children
      }
      if (heirs.length && dead.money > 0) { const share = dead.money / heirs.length; for (const h of heirs) h.money += share }
    }
    this.creatures = survivors.concat(newborns)

    // a thriving, advanced civilisation founds a SECOND university as it grows
    if (this.era >= 9 && this.universities.length < 2 && this.creatures.length > 160) this.universities.push({ x: WORLD_W * 0.5 + 90, y: WORLD_H * 0.5 + 70, w: 128, h: 104 })
    if (this.tick % 20 === 0) {
      const wild = this.creatures.filter((c) => !c.isAvatar)
      const n = wild.length || 1
      const avg = (f: (c: Creature) => number) => wild.reduce((s, c) => s + f(c), 0) / n
      this.history.push({ pop: wild.length, speed: avg((c) => c.genome.speed), vision: avg((c) => c.genome.vision), size: avg((c) => c.genome.size), metabolism: avg((c) => c.genome.metabolism), intellect: avg((c) => c.genome.intellect), knowledge: avg((c) => c.knowledge) })
      if (this.history.length > 400) this.history.shift()
      // wisdom = the average knowledge of living adults → the ceiling kids can learn toward (the ratchet)
      const adults = wild.filter(isMature)
      if (adults.length) this.wisdom = adults.reduce((s, c) => s + c.knowledge, 0) / adults.length
      // a monarch reigns until death; the throne goes to the most ambitious/learned/old elder
      if (this.gov === "monarquía") {
        if (!this.monarch || !wild.includes(this.monarch)) {
          let best: Creature | null = null, bs = -1
          for (const c of adults) { const s = (c.powerHungry ? 45 : 0) + c.knowledge + ageYears(c) * 0.6 + (c.profCat === "liderazgo" ? 35 : 0); if (s > bs) { bs = s; best = c } }
          if (best) { this.monarch = best; this.logEvent(`👑 ${best.name} ${best.surname} asciende al trono${best.powerHungry ? " (un déspota)" : ""}`) }
        }
      } else this.monarch = null
      // recompute the working economy → drives food, health, learning + research output
      const counts: Partial<Record<Cat, number>> = {}, pop: Record<string, number> = {}
      for (const c of wild) { if (c.profCat) counts[c.profCat] = (counts[c.profCat] || 0) + 1; if (c.profBase) pop[c.profBase] = (pop[c.profBase] || 0) + 1 }
      this.profCounts = counts; this.profPop = pop
      this.econ = economyOf(counts, wild.length)
      this.foodTarget = Math.min(2200, Math.round((260 + wild.length * 7) * (1 + this.econ.food + this.techBoost.food))) // food supply scales with the town
      this.foodTarget = Math.max(260, this.foodTarget)
      this.socialTick(wild) // creatures chat amongst themselves + remember it

      // income: working adults earn money from their trade (visible + spendable when you possess them)
      const eraPay = 1 + this.era * 0.12
      for (const c of wild) if (c.profCat && isMature(c)) {
        const pay = c.profCat === "comercio" || c.profCat === "liderazgo" ? 7.5 : c.profCat === "saber" || c.profCat === "ingeniería" ? 6.5 : c.profCat === "salud" ? 6 : 4.5
        c.money += pay * eraPay * (1 + (c.life?.mastery || 0) * 0.6) // a master of their craft earns more; supporting a big family on a low wage strains it
        if (c.life && c.life.intent === "trabajar") c.life.mastery = Math.min(1, c.life.mastery + 0.0025) // deliberate practice hones the craft
        this.maybeRetrain(c) // the deeply unhappy may switch trades
      }
      // COST OF LIVING: food + upkeep drains coin so wealth is SCARCE — the skilled + propertied pull ahead,
      // the unlucky slide toward poverty. this is what makes class, rent + homelessness real.
      for (const c of wild) {
        if (!isMature(c)) continue
        c.money -= (1.3 + this.era * 0.35) * (1 + c.home.tier * 0.22)
        if (c.money < 0) { c.money = 0; c.mental = Math.max(0, c.mental - 2.2); c.health = Math.max(0, c.health - 0.5) } // can't make ends meet
      }
      // INDEPENDENCE: a restless young adult leaves home — they RENT a landlord's spare house if there is one
      // (becoming a tenant), otherwise they build their own. Either way the family tree branches outward.
      const homeCt = new Map<House, number>(); for (const c of wild) homeCt.set(c.home, (homeCt.get(c.home) || 0) + 1)
      for (const c of wild) {
        if (c.partner || !c.life || c.psyche.five.o < 0.62 || c.money < 18) continue
        const ay = ageYears(c); if (ay < 18 || ay > 30 || rand() > 0.012) continue
        // a vacant rental, OR an apartment building with room (they hold many families)
        const rental = this.houses.find((h) => h.landlord && h.landlord !== c.id && h.surname !== c.surname && ((homeCt.get(h) || 0) === 0 || (h.tier === 4 && (homeCt.get(h) || 0) < 9)))
        if (rental) { c.home = rental; homeCt.set(rental, (homeCt.get(rental) || 0) + 1); feel(c, "esperanzado", 0.5); this.logEvent(`${c.name} ${c.surname} alquiló su primera casa`) }
        else if (this.houses.length < 130) { const nh = this.addHouse(c.surname); if (nh) { c.home = nh; homeCt.set(nh, 1); c.money -= 12; feel(c, "esperanzado", 0.6); c.mental = Math.min(100, c.mental + 6); this.logEvent(`${c.name} ${c.surname} dejó la casa familiar para hacer su propia vida`) } }
      }
      // FRIENDS HELP each other: someone with means quietly lends a hand to a poor close friend
      for (const c of wild) {
        if (!c.life || c.money < 20) continue
        for (const k of Object.keys(c.life.rels)) if (c.life.rels[+k] > 0.5) { const fr = byId.get(+k); if (fr && fr.money < 4 && rand() < 0.3) { fr.money += 6; c.money -= 6; feel(fr, "alegre", 0.4); break } }
      }

      // ── demographics: form couples, then conceive (logistic growth toward a tech-scaled capacity) ──
      for (const c of wild) if (c.partner && !byId.has(c.partner)) { c.partner = 0; c.pregnant = 0 } // widowed → free again
      // divorce: irritability + low mental health + incompatibility can break a marriage → both re-pair
      for (const c of wild) {
        if (!c.partner || c.id > c.partner) continue
        const p = byId.get(c.partner); if (!p) continue
        const incompat = Math.abs(c.psyche.five.a - p.psyche.five.a) + (c.religion && c.religion !== p.religion ? 0.3 : 0)
        const strain = (c.irritability + p.irritability) * 0.5 + (1 - (c.mental + p.mental) / 200) * 0.5 + incompat * 0.4
        if (rand() < strain * 0.012) {
          c.partner = 0; p.partner = 0; c.pregnant = 0
          feel(c, "afligido", 0.7); feel(p, "afligido", 0.7); bond(c, p.id, -0.5); bond(p, c.id, -0.5) // heartbreak + resentment
          this.logDeed({ day: this.clockDays, gen: c.generation, who: c.id, name: `${c.name} ${c.surname}`, kind: "divorcio", text: `se divorció de ${p.name} ${p.surname}`, impact: -1 })
        }
      }
      // COURTSHIP: people pair with someone they CLICK with — but a WIDOW(ER) raising children seeks a new partner
      // sooner + more widely (they need a co-parent), so a lone parent with a houseful of young children re-pairs.
      const depKids = new Map<number, number>() // how many young children each adult is raising (their own household)
      for (const k of wild) if (ageYears(k) < 14 && k.parents) for (const pid of k.parents) depKids.set(pid, (depKids.get(pid) || 0) + 1)
      const singles = wild.filter((c) => isMature(c) && !c.partner && (ageYears(c) <= FERTILE_MAX + 10 || (depKids.get(c.id) || 0) > 0))
      const taken = new Set<number>()
      for (const a of singles) {
        if (taken.has(a.id)) continue
        const aKids = depKids.get(a.id) || 0
        let best: Creature | null = null, bs = -2
        for (const b of singles) {
          if (b.id === a.id || taken.has(b.id) || (b.surname === a.surname && wild.length > 26)) continue // kin taboo (relaxed when the tribe is tiny + must repopulate)
          const compat = 1 - Math.abs(a.psyche.five.a - b.psyche.five.a) * 0.6 - (a.religion && a.religion !== b.religion ? 0.3 : 0)
          const warmth = (a.life?.rels[b.id] || 0) * 1.5, ageGap = Math.abs(ageYears(a) - ageYears(b)) / 22
          const coParent = Math.min(0.9, (aKids + (depKids.get(b.id) || 0)) * 0.18) // children to raise → a partner is sorely needed
          const score = compat + warmth - ageGap + coParent + rand() * 0.5 // values + warmth + a spark of chemistry
          if (score > bs) { bs = score; best = b }
        }
        if (!best) continue
        a.partner = best.id; best.partner = a.id; taken.add(a.id); taken.add(best.id)
        feel(a, "enamorado", 0.85); feel(best, "enamorado", 0.85); bond(a, best.id, 0.7); bond(best, a.id, 0.7)
        // they LEAVE their parents to set up their own home: RENT a landlord's spare house/apartment if there is
        // one (becoming tenants), else BUILD their own (a new family branch). Poorer couples tend to rent.
        const cash = a.money + best.money
        const ct = new Map<House, number>(); for (const o of wild) ct.set(o.home, (ct.get(o.home) || 0) + 1)
        const rental = this.houses.find((h) => h.landlord && h.landlord !== a.id && h.landlord !== best.id && ((ct.get(h) || 0) === 0 || (h.tier === 4 && (ct.get(h) || 0) < 9)))
        if (rental && (cash < 60 || rand() < 0.5)) { a.home = rental; best.home = rental } // become tenants
        else if (this.houses.length < 130 && rand() < 0.7) {
          const sn = foundSurname(a.surname, best.surname); const nh = this.addHouse(sn)
          if (nh) { a.home = nh; best.home = nh; a.surname = sn; best.surname = sn }
        }
        if (a.life?.goalKey === "amor") a.life.goalProg = Math.min(1, a.life.goalProg + 0.5)
        if (best.life?.goalKey === "amor") best.life.goalProg = Math.min(1, best.life.goalProg + 0.5)
        this.logDeed({ day: this.clockDays, gen: a.generation, who: a.id, name: `${a.name} ${a.surname}`, kind: "boda", text: `se unió a ${best.name} ${best.surname}`, impact: 3 })
      }
      const K = Math.min(POP_CAP, 120 + this.era * 8) // carrying capacity (above the ~100 founders so the long early eras SUSTAIN a stable tribe instead of decaying) — grows with technology
      // SMALL-TRIBE RESILIENCE: a struggling band breeds hard (high pre-modern fertility) so the long early eras
      // sustain themselves + a near-wiped tribe can claw back, instead of dwindling to extinction before tech helps.
      const lowPop = wild.length < 32 // only a near-wiped tribe breeds hard; normal villages stay at natural fertility
      const growth = Math.max(0.05, Math.min(lowPop ? 2.2 : 1, 1.35 * (1 - wild.length / K) + (lowPop ? (32 - wild.length) * 0.04 : 0)))
      for (const c of wild) {
        const ay = ageYears(c)
        if (!c.partner || c.pregnant > 0 || ay < MATURITY_YEARS || ay > FERTILE_MAX || c.energy <= REPRO_MIN_ENERGY ||
            this.clockDays - c.lastRepro < REPRO_COOLDOWN || !byId.has(c.partner)) continue
        const mate = byId.get(c.partner)!, mAy = ageYears(mate)
        if (mAy >= MATURITY_YEARS && mAy <= FERTILE_MAX && c.id > c.partner) continue // both fertile → only lower-id bears
        const parity = Math.max(0.2, 1 - c.children * 0.07) // fertility wanes after many children (age, fatigue) → families top out ~6-9, not 17
        if (rand() < 0.85 * growth * parity) c.pregnant = GESTATION_MIN + Math.floor(rand() * 60) // conceive (~7-9 months)
      }
      // children out of wedlock: an unpartnered fertile adult may conceive with a passing fling
      for (const c of wild) {
        if (c.partner || c.pregnant > 0) continue
        const ay = ageYears(c)
        if (ay < MATURITY_YEARS || ay > FERTILE_MAX || c.energy <= REPRO_MIN_ENERGY || this.clockDays - c.lastRepro < REPRO_COOLDOWN) continue
        if (this.nearestCreature(c, 75, (o) => !o.isAvatar && isMature(o) && o !== c && ageYears(o) <= FERTILE_MAX) && rand() < 0.06 * growth) {
          c.pregnant = GESTATION_MIN + Math.floor(rand() * 60) // single-parent pregnancy (father uninvolved)
        }
      }

      runSociety(this, wild) // economy, crime + courts, and culture (books/art)
      this.upgradeHomes() // prosperous families move up to a finer home
      this.housingMarket(wild, byId) // landlords buy + rent out property; tenants pay rent
      this.poverty(wild) // the destitute fall into homelessness; the recovered find shelter
      this.runMarket(wild) // goods trade at a floating price; merchants profit; the rich buy luxuries
      for (const p of this.pois) if (p.by && !byId.has(p.by)) p.by = 0 // free spots held by the departed/dead
      this.runAnimals(wild) // wild beasts roam, raid, get hunted or tamed
      this.runRaids(wild) // raids from beyond the map — savages, nomads, pirates, terrorists by era
      for (const n of this.news) n.reach = Math.max(1, n.reach - 0.6) // yesterday's news fades from the talk
      if (rand() < 0.04 && wild.length > 20) { const v = wild[Math.floor(rand() * wild.length)]; this.news.push({ txt: `(rumor) dicen que ${v.name} ${v.surname} esconde algo`, sent: -0.6, reach: 1, day: this.clockDays }); if (this.news.length > 14) this.news.shift() } // a juicy false rumour is born
    }

    if (this.creatures.filter((c) => !c.isAvatar).length < 8) { // keep a struggling village from going extinct
      for (let i = 0; i < 10; i++) { const c = this.spawn(randomGenome(this.spriteCount), 1, rnd(this.houses)); c.ageDays = (16 + rand() * 16) * DAYS_PER_YEAR; this.assignProfession(c); this.creatures.push(c) }
    }
  }
}

export interface Food { x: number; y: number }
