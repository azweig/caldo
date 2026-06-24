// civ.ts — CIVILISATION engine: eras, a tech tree of discoveries, and a generative profession system.
// Nothing about the PROGRESSION is hardcoded: the village accumulates research from its scholars and
// engineers; whenever research can afford the cheapest tech whose prerequisites are met, it's
// discovered — which advances the era, boosts the economy and unlocks new professions. Professions
// spread socially (family apprenticeship + peers + schooling) and via universities. The authored data
// is the *space*; what a given village becomes emerges from its people.

export type Cat =
  | "comida" | "salud" | "saber" | "enseñanza" | "construcción" | "oficio"
  | "arte" | "liderazgo" | "comercio" | "exploración" | "defensa" | "espíritu"
  | "ingeniería" | "cuidado"

export const ERAS = [
  "Paleolítica (neandertal)", "Mesolítica", "Neolítica", "Edad de Bronce", "Edad de Hierro",
  "Clásica", "Medieval", "Renacimiento", "Ilustración", "Industrial", "Eléctrica", "Atómica",
  "Informática", "Espacial", "Biotecnológica", "Nanotecnológica", "Inteligencia Artificial",
  "Posthumana", "Galáctica",
] as const

export interface Tech { n: string; e: number; cost: number; req?: string[]; b?: Partial<Boosts> }
export interface Boosts { food: number; health: number; research: number; learn: number; life: number }

// the tech tree — one chain mostly by era, with a few cross-prereqs. cost rises with era.
export const TECHS: Tech[] = [
  { n: "Fuego", e: 0, cost: 30, b: { health: 0.05, food: 0.05 } },
  { n: "Lenguaje", e: 0, cost: 45, b: { research: 0.4, learn: 0.1 } },
  { n: "Herramientas de piedra", e: 0, cost: 55, req: ["Fuego"], b: { food: 0.08 } },
  { n: "Entierro ritual", e: 0, cost: 70, req: ["Lenguaje"], b: { research: 0.2 } },
  { n: "Caza coordinada", e: 1, cost: 95, req: ["Herramientas de piedra", "Lenguaje"], b: { food: 0.1 } },
  { n: "Arco y flecha", e: 1, cost: 120, req: ["Caza coordinada"], b: { food: 0.1 } },
  { n: "Domesticación del perro", e: 1, cost: 140, req: ["Caza coordinada"], b: { food: 0.06, health: 0.04 } },
  { n: "Agricultura", e: 2, cost: 180, req: ["Arco y flecha"], b: { food: 0.25 } },
  { n: "Ganadería", e: 2, cost: 210, req: ["Agricultura"], b: { food: 0.15, health: 0.05 } },
  { n: "Cerámica", e: 2, cost: 240, req: ["Agricultura"], b: { food: 0.08 } },
  { n: "Escritura", e: 2, cost: 300, req: ["Cerámica"], b: { research: 0.8, learn: 0.25 } },
  { n: "Metalurgia del bronce", e: 3, cost: 360, req: ["Escritura"], b: { food: 0.08 } },
  { n: "La rueda", e: 3, cost: 410, req: ["Metalurgia del bronce"], b: { food: 0.1, research: 0.3 } },
  { n: "Vela y navegación", e: 3, cost: 470, req: ["La rueda"], b: { research: 0.4 } },
  { n: "Código de leyes", e: 3, cost: 520, req: ["Escritura"], b: { research: 0.3, health: 0.05 } },
  { n: "Hierro", e: 4, cost: 600, req: ["Metalurgia del bronce"], b: { food: 0.1 } },
  { n: "Moneda", e: 4, cost: 680, req: ["Código de leyes"], b: { research: 0.5 } },
  { n: "Acueducto", e: 4, cost: 760, req: ["Hierro"], b: { health: 0.15 } },
  { n: "Filosofía", e: 5, cost: 860, req: ["Moneda", "Escritura"], b: { research: 1.0, learn: 0.3 } },
  { n: "Medicina hipocrática", e: 5, cost: 960, req: ["Filosofía"], b: { health: 0.2, life: 0.05 } },
  { n: "Geometría", e: 5, cost: 1060, req: ["Filosofía"], b: { research: 0.8 } },
  { n: "Imprenta", e: 6, cost: 1300, req: ["Geometría"], b: { learn: 0.6, research: 1.0 } },
  { n: "Molino y arado pesado", e: 6, cost: 1450, req: ["Hierro"], b: { food: 0.2 } },
  { n: "Universidad", e: 6, cost: 1650, req: ["Imprenta"], b: { research: 1.5, learn: 0.5 } },
  { n: "Método científico", e: 7, cost: 2000, req: ["Universidad"], b: { research: 2.0 } },
  { n: "Telescopio", e: 7, cost: 2300, req: ["Método científico"], b: { research: 1.2 } },
  { n: "Anatomía moderna", e: 7, cost: 2600, req: ["Método científico"], b: { health: 0.25, life: 0.08 } },
  { n: "Cálculo", e: 8, cost: 3100, req: ["Método científico"], b: { research: 2.5 } },
  { n: "Enciclopedia", e: 8, cost: 3500, req: ["Imprenta", "Cálculo"], b: { learn: 1.0, research: 1.0 } },
  { n: "Vacunas", e: 8, cost: 3900, req: ["Anatomía moderna"], b: { health: 0.4, life: 0.12 } },
  { n: "Máquina de vapor", e: 9, cost: 4700, req: ["Cálculo"], b: { food: 0.25, research: 1.5 } },
  { n: "Ferrocarril", e: 9, cost: 5300, req: ["Máquina de vapor"], b: { food: 0.15, research: 1.0 } },
  { n: "Fábrica", e: 9, cost: 6000, req: ["Máquina de vapor"], b: { food: 0.2 } },
  { n: "Germ teoría", e: 9, cost: 6600, req: ["Vacunas"], b: { health: 0.4, life: 0.15 } },
  { n: "Electricidad", e: 10, cost: 7800, req: ["Fábrica"], b: { research: 3.0 } },
  { n: "Telégrafo y teléfono", e: 10, cost: 8800, req: ["Electricidad"], b: { research: 2.0, learn: 1.0 } },
  { n: "Motor de combustión", e: 10, cost: 9800, req: ["Electricidad"], b: { food: 0.2, research: 1.5 } },
  { n: "Antibióticos", e: 10, cost: 11000, req: ["Germ teoría"], b: { health: 0.6, life: 0.25 } },
  { n: "Energía nuclear", e: 11, cost: 13500, req: ["Motor de combustión"], b: { research: 4.0 } },
  { n: "Radar y cohetes", e: 11, cost: 15500, req: ["Energía nuclear"], b: { research: 3.0 } },
  { n: "ADN", e: 11, cost: 17500, req: ["Antibióticos"], b: { health: 0.5, life: 0.2, research: 2.0 } },
  { n: "Transistor", e: 12, cost: 21000, req: ["Energía nuclear"], b: { research: 6.0 } },
  { n: "Computadora", e: 12, cost: 25000, req: ["Transistor"], b: { research: 8.0, learn: 2.0 } },
  { n: "Internet", e: 12, cost: 30000, req: ["Computadora", "Telégrafo y teléfono"], b: { research: 6.0, learn: 4.0 } },
  { n: "Cohete orbital", e: 13, cost: 38000, req: ["Radar y cohetes", "Computadora"], b: { research: 5.0 } },
  { n: "Satélites", e: 13, cost: 45000, req: ["Cohete orbital", "Internet"], b: { research: 4.0, food: 0.2 } },
  { n: "Estación espacial", e: 13, cost: 55000, req: ["Satélites"], b: { research: 5.0 } },
  { n: "Ingeniería genética", e: 14, cost: 70000, req: ["ADN", "Computadora"], b: { health: 0.8, life: 0.4 } },
  { n: "Células madre", e: 14, cost: 85000, req: ["Ingeniería genética"], b: { health: 0.6, life: 0.5 } },
  { n: "Biocomputación", e: 14, cost: 100000, req: ["Ingeniería genética", "Internet"], b: { research: 12.0 } },
  { n: "Nanomáquinas", e: 15, cost: 130000, req: ["Biocomputación"], b: { health: 1.0, food: 0.5, research: 10.0 } },
  { n: "Materiales programables", e: 15, cost: 160000, req: ["Nanomáquinas"], b: { research: 10.0 } },
  { n: "Medicina celular total", e: 15, cost: 190000, req: ["Nanomáquinas", "Células madre"], b: { life: 1.0, health: 1.0 } },
  { n: "IA general", e: 16, cost: 250000, req: ["Biocomputación", "Materiales programables"], b: { research: 40.0, learn: 10.0 } },
  { n: "Robótica autónoma", e: 16, cost: 320000, req: ["IA general"], b: { food: 1.0, research: 20.0 } },
  { n: "Interfaz mente-máquina", e: 16, cost: 400000, req: ["IA general"], b: { learn: 20.0, research: 20.0 } },
  { n: "Subida de la mente", e: 17, cost: 550000, req: ["Interfaz mente-máquina", "Medicina celular total"], b: { life: 5.0, research: 30.0 } },
  { n: "Cuerpos sintéticos", e: 17, cost: 700000, req: ["Subida de la mente", "Robótica autónoma"], b: { health: 3.0, life: 3.0 } },
  { n: "Fusión y antimateria", e: 17, cost: 900000, req: ["IA general"], b: { research: 50.0, food: 2.0 } },
  { n: "Viaje interestelar", e: 18, cost: 1300000, req: ["Fusión y antimateria", "Cuerpos sintéticos"], b: { research: 40.0 } },
  { n: "Esfera de Dyson", e: 18, cost: 1800000, req: ["Viaje interestelar"], b: { research: 100.0, food: 5.0 } },
  { n: "Mente colmena galáctica", e: 18, cost: 2500000, req: ["Esfera de Dyson", "Subida de la mente"], b: { research: 200.0, learn: 50.0 } },
]

// PROFESSIONS — the named base set, tagged by era + economic category (+ uni = needs a university).
// The combinatorial specialisations below multiply this into tens of thousands of distinct titles.
export interface Prof { n: string; e: number; c: Cat; u?: 1 }
export const PROFS: Prof[] = [
  // 0 Paleolítica
  { n: "recolector", e: 0, c: "comida" }, { n: "cazador", e: 0, c: "comida" }, { n: "guardián del fuego", e: 0, c: "construcción" },
  { n: "tallador de piedra", e: 0, c: "oficio" }, { n: "rastreador", e: 0, c: "exploración" }, { n: "curandero de hierbas", e: 0, c: "salud" },
  { n: "narrador de historias", e: 0, c: "arte" }, { n: "chamán", e: 0, c: "espíritu" }, { n: "pintor de cuevas", e: 0, c: "arte" },
  { n: "matriarca del clan", e: 0, c: "liderazgo" },
  // 1 Mesolítica
  { n: "pescador", e: 1, c: "comida" }, { n: "arquero", e: 1, c: "defensa" }, { n: "domador de perros", e: 1, c: "cuidado" },
  { n: "tejedor de redes", e: 1, c: "oficio" }, { n: "constructor de chozas", e: 1, c: "construcción" }, { n: "partera", e: 1, c: "salud" },
  // 2 Neolítica
  { n: "agricultor", e: 2, c: "comida" }, { n: "pastor", e: 2, c: "comida" }, { n: "alfarero", e: 2, c: "oficio" },
  { n: "molinero", e: 2, c: "comida" }, { n: "sacerdote", e: 2, c: "espíritu" }, { n: "escriba", e: 2, c: "saber" },
  { n: "jefe de aldea", e: 2, c: "liderazgo" }, { n: "comadrona", e: 2, c: "cuidado" }, { n: "tejedor", e: 2, c: "oficio" },
  // 3 Bronce
  { n: "herrero de bronce", e: 3, c: "oficio" }, { n: "carpintero de ruedas", e: 3, c: "ingeniería" }, { n: "marinero", e: 3, c: "exploración" },
  { n: "mercader", e: 3, c: "comercio" }, { n: "legislador", e: 3, c: "liderazgo" }, { n: "astrónomo", e: 3, c: "saber" },
  { n: "soldado", e: 3, c: "defensa" }, { n: "albañil", e: 3, c: "construcción" }, { n: "músico", e: 3, c: "arte" },
  // 4 Hierro
  { n: "herrero de hierro", e: 4, c: "oficio" }, { n: "banquero", e: 4, c: "comercio" }, { n: "ingeniero de acueductos", e: 4, c: "ingeniería" },
  { n: "médico", e: 4, c: "salud" }, { n: "general", e: 4, c: "defensa" }, { n: "cartógrafo", e: 4, c: "exploración" },
  { n: "juez", e: 4, c: "liderazgo" }, { n: "poeta", e: 4, c: "arte" },
  // 5 Clásica
  { n: "filósofo", e: 5, c: "saber" }, { n: "matemático", e: 5, c: "saber" }, { n: "arquitecto", e: 5, c: "ingeniería" },
  { n: "maestro", e: 5, c: "enseñanza" }, { n: "historiador", e: 5, c: "saber" }, { n: "boticario", e: 5, c: "salud" },
  { n: "senador", e: 5, c: "liderazgo" }, { n: "escultor", e: 5, c: "arte" }, { n: "dramaturgo", e: 5, c: "arte" },
  // 6 Medieval
  { n: "monje copista", e: 6, c: "saber" }, { n: "caballero", e: 6, c: "defensa" }, { n: "impresor", e: 6, c: "oficio" },
  { n: "maestro gremial", e: 6, c: "oficio" }, { n: "alquimista", e: 6, c: "saber" }, { n: "cirujano barbero", e: 6, c: "salud" },
  { n: "cartero", e: 6, c: "comercio" }, { n: "trovador", e: 6, c: "arte" }, { n: "profesor universitario", e: 6, c: "enseñanza", u: 1 },
  // 7 Renacimiento
  { n: "científico", e: 7, c: "saber", u: 1 }, { n: "ingeniero", e: 7, c: "ingeniería", u: 1 }, { n: "anatomista", e: 7, c: "salud", u: 1 },
  { n: "pintor maestro", e: 7, c: "arte" }, { n: "navegante explorador", e: 7, c: "exploración" }, { n: "cartógrafo celeste", e: 7, c: "saber" },
  { n: "banquero mercantil", e: 7, c: "comercio" }, { n: "diplomático", e: 7, c: "liderazgo" },
  // 8 Ilustración
  { n: "físico", e: 8, c: "saber", u: 1 }, { n: "químico", e: 8, c: "saber", u: 1 }, { n: "enciclopedista", e: 8, c: "enseñanza", u: 1 },
  { n: "médico vacunador", e: 8, c: "salud", u: 1 }, { n: "economista", e: 8, c: "comercio", u: 1 }, { n: "naturalista", e: 8, c: "saber" },
  { n: "ingeniero civil", e: 8, c: "ingeniería", u: 1 }, { n: "periodista", e: 8, c: "arte" },
  // 9 Industrial
  { n: "ingeniero mecánico", e: 9, c: "ingeniería", u: 1 }, { n: "obrero de fábrica", e: 9, c: "construcción" }, { n: "maquinista", e: 9, c: "oficio" },
  { n: "bacteriólogo", e: 9, c: "salud", u: 1 }, { n: "geólogo", e: 9, c: "saber", u: 1 }, { n: "empresario", e: 9, c: "comercio" },
  { n: "fotógrafo", e: 9, c: "arte" }, { n: "sindicalista", e: 9, c: "liderazgo" },
  // 10 Eléctrica
  { n: "ingeniero eléctrico", e: 10, c: "ingeniería", u: 1 }, { n: "telefonista", e: 10, c: "comercio" }, { n: "piloto", e: 10, c: "exploración" },
  { n: "farmacólogo", e: 10, c: "salud", u: 1 }, { n: "cineasta", e: 10, c: "arte" }, { n: "radiooperador", e: 10, c: "oficio" },
  { n: "automovilista mecánico", e: 10, c: "oficio" }, { n: "publicista", e: 10, c: "comercio" },
  // 11 Atómica
  { n: "físico nuclear", e: 11, c: "saber", u: 1 }, { n: "ingeniero aeroespacial", e: 11, c: "ingeniería", u: 1 }, { n: "genetista", e: 11, c: "salud", u: 1 },
  { n: "piloto de jet", e: 11, c: "exploración" }, { n: "epidemiólogo", e: 11, c: "salud", u: 1 }, { n: "diseñador industrial", e: 11, c: "arte" },
  // 12 Informática
  { n: "programador", e: 12, c: "ingeniería", u: 1 }, { n: "científico de datos", e: 12, c: "saber", u: 1 }, { n: "ingeniero de software", e: 12, c: "ingeniería", u: 1 },
  { n: "administrador de redes", e: 12, c: "oficio" }, { n: "biólogo molecular", e: 12, c: "salud", u: 1 }, { n: "diseñador de videojuegos", e: 12, c: "arte" },
  { n: "analista", e: 12, c: "comercio" }, { n: "robotista", e: 12, c: "ingeniería", u: 1 },
  // 13 Espacial
  { n: "astronauta", e: 13, c: "exploración" }, { n: "ingeniero de cohetes", e: 13, c: "ingeniería", u: 1 }, { n: "astrofísico", e: 13, c: "saber", u: 1 },
  { n: "controlador orbital", e: 13, c: "liderazgo" }, { n: "minero de asteroides", e: 13, c: "comida" }, { n: "geógrafo planetario", e: 13, c: "saber", u: 1 },
  // 14 Biotecnológica
  { n: "bioingeniero", e: 14, c: "ingeniería", u: 1 }, { n: "médico genómico", e: 14, c: "salud", u: 1 }, { n: "cultivador de tejidos", e: 14, c: "salud", u: 1 },
  { n: "bioinformático", e: 14, c: "saber", u: 1 }, { n: "agrónomo genético", e: 14, c: "comida", u: 1 }, { n: "bioético", e: 14, c: "espíritu", u: 1 },
  // 15 Nanotecnológica
  { n: "nanoingeniero", e: 15, c: "ingeniería", u: 1 }, { n: "médico de nanobots", e: 15, c: "salud", u: 1 }, { n: "arquitecto de materiales", e: 15, c: "ingeniería", u: 1 },
  { n: "ecólogo de enjambres", e: 15, c: "saber", u: 1 }, { n: "artista molecular", e: 15, c: "arte" },
  // 16 IA
  { n: "entrenador de IA", e: 16, c: "saber", u: 1 }, { n: "filósofo de la mente", e: 16, c: "espíritu", u: 1 }, { n: "diseñador de mundos", e: 16, c: "arte" },
  { n: "ingeniero de robótica", e: 16, c: "ingeniería", u: 1 }, { n: "neurointerfacista", e: 16, c: "salud", u: 1 }, { n: "guardián de la IA", e: 16, c: "liderazgo", u: 1 },
  // 17 Posthumana
  { n: "ingeniero de mentes", e: 17, c: "ingeniería", u: 1 }, { n: "diseñador de cuerpos", e: 17, c: "salud", u: 1 }, { n: "curador de recuerdos", e: 17, c: "cuidado", u: 1 },
  { n: "físico de la fusión", e: 17, c: "saber", u: 1 }, { n: "artista de realidades", e: 17, c: "arte" }, { n: "ético posthumano", e: 17, c: "espíritu", u: 1 },
  // 18 Galáctica
  { n: "navegante interestelar", e: 18, c: "exploración" }, { n: "ingeniero de Dyson", e: 18, c: "ingeniería", u: 1 }, { n: "terraformador", e: 18, c: "comida", u: 1 },
  { n: "diplomático galáctico", e: 18, c: "liderazgo", u: 1 }, { n: "cartógrafo estelar", e: 18, c: "saber", u: 1 }, { n: "tejedor de la mente colmena", e: 18, c: "espíritu", u: 1 },
]

// specialisation domains — appended to scholar/engineer/artist/healer titles from the Classical era on,
// turning ~150 base professions into tens of thousands of distinct lived titles.
export const DOMAINS = [
  "de las plantas", "de los astros", "de los metales", "de la mente", "de la vida", "de las máquinas",
  "del clima", "de los números", "de la luz", "de los fluidos", "de las redes", "de los genes",
  "de las partículas", "del tiempo", "de los sueños", "de la materia", "de las estrellas", "de los enjambres",
  "de los virus", "de la energía", "de los símbolos", "de las profundidades", "de los cristales", "del vacío",
  "de las raíces", "de las corrientes", "de los ecos", "de las semillas", "de los huesos", "del horizonte",
]
const SPECIALISABLE: Cat[] = ["saber", "ingeniería", "arte", "salud", "enseñanza"]

export function eraName(i: number): string { return ERAS[Math.max(0, Math.min(ERAS.length - 1, i))] }

/** professions a creature could plausibly take, given the village era, university, and its schooling */
export function availableProfs(era: number, hasUni: boolean, knowledge: number): Prof[] {
  return PROFS.filter((p) => p.e <= era && (!p.u || hasUni) && knowledge >= profMinKnowledge(p))
}
export function profMinKnowledge(p: Prof): number { return p.u ? 45 + p.e * 1.5 : p.e * 3.5 }

/** the cheapest tech the village can discover right now (prereqs met, era within reach), else null */
export function nextTech(discovered: Set<string>, era: number): Tech | null {
  let best: Tech | null = null
  for (const t of TECHS) {
    if (discovered.has(t.n)) continue
    if (t.e > era + 1) continue // can't leap more than one era ahead
    if (t.req && !t.req.every((r) => discovered.has(r))) continue
    if (!best || t.cost < best.cost) best = t
  }
  return best
}

/** aggregate economic multipliers from the working population's categories (with diminishing returns) */
export function economyOf(counts: Partial<Record<Cat, number>>, pop: number): Boosts {
  const per = (c: Cat) => (counts[c] || 0) / Math.max(8, pop) // share of workforce
  const dim = (x: number) => 1 + Math.log1p(x) // diminishing returns
  return {
    food: dim(per("comida") * 6) - 1,
    health: dim(per("salud") * 5 + per("cuidado") * 2) - 1,
    // a small base (the tribe slowly figures things out) + scholars/engineers/teachers, plus proto-knowledge
    // from shamans, storytellers and explorers — so even the paleolithic can crawl toward the neolithic.
    research: 0.25 + (counts["saber"] || 0) * 1.0 + (counts["ingeniería"] || 0) * 0.7 + (counts["enseñanza"] || 0) * 0.35
      + (counts["espíritu"] || 0) * 0.15 + (counts["arte"] || 0) * 0.12 + (counts["exploración"] || 0) * 0.1,
    learn: dim(per("enseñanza") * 5) - 1,
    life: 0,
  }
}

// deterministic specialisation pick from a seed (so a creature's title is stable)
function seeded(seed: number, mod: number): number { const x = Math.sin(seed * 12.9898) * 43758.5453; return Math.floor((x - Math.floor(x)) * mod) }

/** turn a base profession into a full lived title (maybe specialised), stable per creature seed */
export function professionTitle(p: Prof, era: number, seed: number): string {
  if (era >= 5 && SPECIALISABLE.includes(p.c) && seeded(seed, 100) < 65) {
    return `${p.n} ${DOMAINS[seeded(seed >> 3, DOMAINS.length)]}`
  }
  return p.n
}

/** total distinct titles reachable (for the HUD's bragging) */
export function professionSpace(): number {
  const spec = PROFS.filter((p) => SPECIALISABLE.includes(p.c) && p.e >= 5).length
  return PROFS.length + spec * DOMAINS.length
}
