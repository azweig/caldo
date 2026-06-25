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

// n=name e=era cost=difficulty req=prereqs b=boosts drive=which kind of mind/trade powers it key=keystone (required to advance)
export interface Tech { n: string; e: number; cost: number; req?: string[]; b?: Partial<Boosts>; drive: Cat; key?: boolean }
export interface Boosts { food: number; health: number; research: number; learn: number; life: number }

// the tech tree — ~10 real historical milestones per era. each is DRIVEN by a kind of mind/trade, and a few
// are KEYSTONES (required to advance). cost = how much sustained individual effort it takes to realize.
export const TECHS: Tech[] = [
  // ── e0 Paleolítica ──
  { n: "Fuego", e: 0, cost: 22, drive: "exploración", key: true, b: { health: 0.05, food: 0.05 } },
  { n: "Lenguaje", e: 0, cost: 30, drive: "saber", key: true, b: { research: 0.4, learn: 0.1 } },
  { n: "Herramientas de piedra", e: 0, cost: 34, req: ["Fuego"], drive: "oficio", b: { food: 0.08 } },
  { n: "Hacha de mano", e: 0, cost: 40, req: ["Herramientas de piedra"], drive: "oficio", b: { food: 0.05 } },
  { n: "Caza con lanza", e: 0, cost: 46, req: ["Hacha de mano"], drive: "defensa", b: { food: 0.08 } },
  { n: "Vestimenta de piel", e: 0, cost: 52, req: ["Herramientas de piedra"], drive: "cuidado", b: { health: 0.06 } },
  { n: "Refugio", e: 0, cost: 58, req: ["Lenguaje"], drive: "construcción", b: { health: 0.06 } },
  { n: "Cocción", e: 0, cost: 64, req: ["Fuego"], drive: "comida", b: { health: 0.08, food: 0.05 } },
  { n: "Pintura rupestre", e: 0, cost: 70, req: ["Lenguaje"], drive: "arte", b: { research: 0.2 } },
  { n: "Entierro ritual", e: 0, cost: 76, req: ["Lenguaje"], drive: "espíritu", b: { research: 0.2 } },
  // ── e1 Mesolítica ──
  { n: "Caza coordinada", e: 1, cost: 90, req: ["Caza con lanza", "Lenguaje"], drive: "liderazgo", b: { food: 0.1 } },
  { n: "Arco y flecha", e: 1, cost: 105, req: ["Caza coordinada"], drive: "oficio", key: true, b: { food: 0.1 } },
  { n: "Pesca y anzuelo", e: 1, cost: 118, req: ["Caza con lanza"], drive: "comida", b: { food: 0.1 } },
  { n: "Canoa y balsa", e: 1, cost: 130, req: ["Refugio"], drive: "construcción", b: { food: 0.05, research: 0.2 } },
  { n: "Domesticación del perro", e: 1, cost: 140, req: ["Caza coordinada"], drive: "cuidado", key: true, b: { food: 0.06, health: 0.04 } },
  { n: "Cestería", e: 1, cost: 150, req: ["Vestimenta de piel"], drive: "oficio", b: { food: 0.05 } },
  { n: "Cuerda y nudos", e: 1, cost: 160, req: ["Cestería"], drive: "oficio", b: { food: 0.04 } },
  { n: "Trampas de caza", e: 1, cost: 170, req: ["Arco y flecha"], drive: "exploración", b: { food: 0.08 } },
  { n: "Calendario lunar", e: 1, cost: 182, req: ["Pintura rupestre"], drive: "saber", b: { research: 0.4 } },
  { n: "Medicina herbal", e: 1, cost: 195, req: ["Entierro ritual"], drive: "salud", b: { health: 0.1 } },
  // ── e2 Neolítica ──
  { n: "Agricultura", e: 2, cost: 220, req: ["Trampas de caza", "Calendario lunar"], drive: "comida", key: true, b: { food: 0.25 } },
  { n: "Ganadería", e: 2, cost: 250, req: ["Agricultura"], drive: "comida", b: { food: 0.15, health: 0.05 } },
  { n: "Cerámica", e: 2, cost: 275, req: ["Agricultura"], drive: "oficio", b: { food: 0.08 } },
  { n: "Tejido y telar", e: 2, cost: 300, req: ["Cuerda y nudos"], drive: "oficio", b: { health: 0.06 } },
  { n: "Casa de adobe", e: 2, cost: 325, req: ["Cerámica"], drive: "construcción", b: { health: 0.08 } },
  { n: "Almacén de grano", e: 2, cost: 350, req: ["Cerámica"], drive: "comercio", b: { food: 0.12 } },
  { n: "Azada y arado", e: 2, cost: 375, req: ["Agricultura"], drive: "construcción", b: { food: 0.12 } },
  { n: "Aldea permanente", e: 2, cost: 400, req: ["Casa de adobe"], drive: "liderazgo", b: { research: 0.3, health: 0.05 } },
  { n: "Proto-escritura", e: 2, cost: 430, req: ["Almacén de grano"], drive: "saber", b: { research: 0.5, learn: 0.15 } },
  { n: "Escritura", e: 2, cost: 470, req: ["Proto-escritura"], drive: "saber", key: true, b: { research: 0.8, learn: 0.25 } },
  // ── e3 Edad de Bronce ──
  { n: "Metalurgia del bronce", e: 3, cost: 540, req: ["Escritura"], drive: "ingeniería", key: true, b: { food: 0.08 } },
  { n: "La rueda", e: 3, cost: 600, req: ["Azada y arado"], drive: "ingeniería", key: true, b: { food: 0.1, research: 0.3 } },
  { n: "Vela y navegación", e: 3, cost: 660, req: ["Canoa y balsa", "Metalurgia del bronce"], drive: "exploración", b: { research: 0.4 } },
  { n: "Carro", e: 3, cost: 710, req: ["La rueda"], drive: "ingeniería", b: { food: 0.06 } },
  { n: "Riego y canales", e: 3, cost: 760, req: ["Aldea permanente"], drive: "construcción", b: { food: 0.18 } },
  { n: "Cuneiforme", e: 3, cost: 810, req: ["Escritura"], drive: "saber", b: { research: 0.4, learn: 0.2 } },
  { n: "Código de leyes", e: 3, cost: 860, req: ["Cuneiforme"], drive: "liderazgo", b: { research: 0.3, health: 0.05 } },
  { n: "Sistema numérico", e: 3, cost: 910, req: ["Cuneiforme"], drive: "saber", b: { research: 0.5 } },
  { n: "Vidrio", e: 3, cost: 960, req: ["Cerámica", "Metalurgia del bronce"], drive: "oficio", b: { research: 0.2 } },
  { n: "Astronomía", e: 3, cost: 1020, req: ["Sistema numérico", "Calendario lunar"], drive: "saber", b: { research: 0.6 } },
  // ── e4 Edad de Hierro ──
  { n: "Hierro", e: 4, cost: 1150, req: ["Metalurgia del bronce"], drive: "ingeniería", key: true, b: { food: 0.1 } },
  { n: "Moneda", e: 4, cost: 1280, req: ["Código de leyes", "Sistema numérico"], drive: "comercio", key: true, b: { research: 0.5 } },
  { n: "Acueducto", e: 4, cost: 1400, req: ["Hierro", "Riego y canales"], drive: "construcción", b: { health: 0.15 } },
  { n: "Alfabeto", e: 4, cost: 1520, req: ["Cuneiforme"], drive: "saber", b: { research: 0.6, learn: 0.3 } },
  { n: "Hormigón", e: 4, cost: 1640, req: ["Acueducto"], drive: "construcción", b: { health: 0.08 } },
  { n: "Caminos pavimentados", e: 4, cost: 1760, req: ["Carro", "Hormigón"], drive: "construcción", b: { research: 0.3, food: 0.06 } },
  { n: "Arco y bóveda", e: 4, cost: 1880, req: ["Hormigón"], drive: "ingeniería", b: { research: 0.2 } },
  { n: "Molino de agua", e: 4, cost: 2000, req: ["La rueda", "Riego y canales"], drive: "ingeniería", b: { food: 0.12 } },
  { n: "Catapulta", e: 4, cost: 2120, req: ["Hierro", "Astronomía"], drive: "defensa", b: { research: 0.2 } },
  { n: "Astronomía posicional", e: 4, cost: 2250, req: ["Astronomía", "Alfabeto"], drive: "saber", b: { research: 0.7 } },
  // ── e5 Clásica ──
  { n: "Filosofía", e: 5, cost: 2500, req: ["Moneda", "Alfabeto"], drive: "saber", key: true, b: { research: 1.0, learn: 0.3 } },
  { n: "Geometría", e: 5, cost: 2750, req: ["Astronomía posicional"], drive: "saber", key: true, b: { research: 0.8 } },
  { n: "Medicina hipocrática", e: 5, cost: 3000, req: ["Filosofía", "Medicina herbal"], drive: "salud", b: { health: 0.2, life: 0.05 } },
  { n: "Democracia", e: 5, cost: 3200, req: ["Filosofía", "Código de leyes"], drive: "liderazgo", b: { research: 0.5, health: 0.05 } },
  { n: "Biblioteca", e: 5, cost: 3400, req: ["Filosofía"], drive: "enseñanza", b: { learn: 0.5, research: 0.6 } },
  { n: "Teatro", e: 5, cost: 3600, req: ["Democracia"], drive: "arte", b: { research: 0.3 } },
  { n: "Palanca y polea", e: 5, cost: 3800, req: ["Geometría", "Arco y bóveda"], drive: "ingeniería", b: { food: 0.08, research: 0.3 } },
  { n: "Cartografía", e: 5, cost: 4000, req: ["Geometría", "Vela y navegación"], drive: "exploración", b: { research: 0.4 } },
  { n: "Reloj de agua", e: 5, cost: 4200, req: ["Geometría"], drive: "ingeniería", b: { research: 0.3 } },
  { n: "Higiene pública", e: 5, cost: 4400, req: ["Medicina hipocrática", "Acueducto"], drive: "salud", b: { health: 0.18, life: 0.06 } },
  // ── e6 Medieval ──
  { n: "Papel", e: 6, cost: 4900, req: ["Biblioteca"], drive: "oficio", b: { learn: 0.3, research: 0.4 } },
  { n: "Números arábigos", e: 6, cost: 5300, req: ["Geometría", "Moneda"], drive: "saber", b: { research: 0.6 } },
  { n: "Imprenta", e: 6, cost: 5800, req: ["Papel", "Alfabeto"], drive: "ingeniería", key: true, b: { learn: 0.6, research: 1.0 } },
  { n: "Universidad", e: 6, cost: 6300, req: ["Imprenta", "Biblioteca"], drive: "enseñanza", key: true, b: { research: 1.5, learn: 0.5 } },
  { n: "Brújula", e: 6, cost: 6700, req: ["Cartografía", "Hierro"], drive: "exploración", b: { research: 0.4 } },
  { n: "Pólvora", e: 6, cost: 7100, req: ["Hierro", "Números arábigos"], drive: "defensa", b: { research: 0.3 } },
  { n: "Molino y arado pesado", e: 6, cost: 7500, req: ["Molino de agua"], drive: "construcción", b: { food: 0.2 } },
  { n: "Reloj mecánico", e: 6, cost: 7900, req: ["Palanca y polea", "Números arábigos"], drive: "ingeniería", b: { research: 0.5 } },
  { n: "Banca", e: 6, cost: 8300, req: ["Números arábigos", "Moneda"], drive: "comercio", b: { research: 0.5 } },
  { n: "Arquitectura gótica", e: 6, cost: 8700, req: ["Arco y bóveda", "Reloj mecánico"], drive: "construcción", b: { research: 0.3, health: 0.05 } },
  // ── e7 Renacimiento ──
  { n: "Método científico", e: 7, cost: 9600, req: ["Universidad"], drive: "saber", key: true, b: { research: 2.0 } },
  { n: "Perspectiva", e: 7, cost: 10200, req: ["Geometría", "Universidad"], drive: "arte", b: { research: 0.4 } },
  { n: "Carabela oceánica", e: 7, cost: 10800, req: ["Brújula", "Vela y navegación"], drive: "exploración", b: { research: 0.5, food: 0.08 } },
  { n: "Telescopio", e: 7, cost: 11500, req: ["Método científico", "Vidrio"], drive: "saber", key: true, b: { research: 1.2 } },
  { n: "Microscopio", e: 7, cost: 12200, req: ["Vidrio", "Método científico"], drive: "saber", b: { research: 0.8, health: 0.1 } },
  { n: "Anatomía moderna", e: 7, cost: 12900, req: ["Método científico", "Medicina hipocrática"], drive: "salud", b: { health: 0.25, life: 0.08 } },
  { n: "Heliocentrismo", e: 7, cost: 13600, req: ["Telescopio", "Astronomía posicional"], drive: "saber", b: { research: 1.0 } },
  { n: "Contabilidad", e: 7, cost: 14300, req: ["Banca", "Números arábigos"], drive: "comercio", b: { research: 0.5 } },
  { n: "Cartografía moderna", e: 7, cost: 15000, req: ["Carabela oceánica", "Cartografía"], drive: "exploración", b: { research: 0.6 } },
  { n: "Música polifónica", e: 7, cost: 15700, req: ["Perspectiva", "Imprenta"], drive: "arte", b: { research: 0.3 } },
  // ── e8 Ilustración ──
  { n: "Cálculo", e: 8, cost: 17000, req: ["Método científico", "Heliocentrismo"], drive: "saber", key: true, b: { research: 2.5 } },
  { n: "Física newtoniana", e: 8, cost: 18000, req: ["Cálculo"], drive: "saber", b: { research: 2.0 } },
  { n: "Enciclopedia", e: 8, cost: 19000, req: ["Imprenta", "Universidad"], drive: "enseñanza", b: { learn: 1.0, research: 1.0 } },
  { n: "Vacunas", e: 8, cost: 20000, req: ["Anatomía moderna", "Microscopio"], drive: "salud", key: true, b: { health: 0.4, life: 0.12 } },
  { n: "Química moderna", e: 8, cost: 21000, req: ["Física newtoniana"], drive: "ingeniería", b: { research: 1.5, health: 0.1 } },
  { n: "Pararrayos", e: 8, cost: 22000, req: ["Física newtoniana"], drive: "ingeniería", b: { research: 0.8 } },
  { n: "Termómetro", e: 8, cost: 23000, req: ["Química moderna"], drive: "saber", b: { research: 0.6, health: 0.06 } },
  { n: "Clasificación biológica", e: 8, cost: 24000, req: ["Microscopio", "Enciclopedia"], drive: "saber", b: { research: 0.8 } },
  { n: "Constitución", e: 8, cost: 25000, req: ["Democracia", "Enciclopedia"], drive: "liderazgo", b: { health: 0.08, research: 0.4 } },
  { n: "Bomba de vapor", e: 8, cost: 26000, req: ["Química moderna", "Reloj mecánico"], drive: "ingeniería", b: { research: 1.0, food: 0.1 } },
  // ── e9 Industrial ──
  { n: "Máquina de vapor", e: 9, cost: 29000, req: ["Bomba de vapor", "Cálculo"], drive: "ingeniería", key: true, b: { food: 0.25, research: 1.5 } },
  { n: "Ferrocarril", e: 9, cost: 31000, req: ["Máquina de vapor"], drive: "ingeniería", key: true, b: { food: 0.15, research: 1.0 } },
  { n: "Fábrica", e: 9, cost: 33000, req: ["Máquina de vapor"], drive: "comercio", b: { food: 0.2 } },
  { n: "Acero", e: 9, cost: 35000, req: ["Máquina de vapor", "Química moderna"], drive: "ingeniería", b: { research: 0.8, food: 0.1 } },
  { n: "Teoría microbiana", e: 9, cost: 37000, req: ["Vacunas", "Clasificación biológica"], drive: "salud", b: { health: 0.4, life: 0.15 } },
  { n: "Fotografía", e: 9, cost: 39000, req: ["Química moderna", "Telescopio"], drive: "arte", b: { research: 0.6 } },
  { n: "Telégrafo", e: 9, cost: 41000, req: ["Pararrayos", "Fábrica"], drive: "ingeniería", b: { research: 1.5, learn: 0.6 } },
  { n: "Anestesia", e: 9, cost: 43000, req: ["Teoría microbiana"], drive: "salud", b: { health: 0.3, life: 0.1 } },
  { n: "Dínamo", e: 9, cost: 45000, req: ["Acero", "Pararrayos"], drive: "ingeniería", b: { research: 1.2 } },
  { n: "Motor de combustión", e: 9, cost: 47000, req: ["Acero", "Química moderna"], drive: "ingeniería", b: { food: 0.2, research: 1.0 } },
  // ── e10 Eléctrica ──
  { n: "Electricidad", e: 10, cost: 52000, req: ["Dínamo"], drive: "ingeniería", key: true, b: { research: 3.0 } },
  { n: "Bombilla", e: 10, cost: 55000, req: ["Electricidad"], drive: "ingeniería", b: { research: 1.0, health: 0.06 } },
  { n: "Teléfono", e: 10, cost: 58000, req: ["Electricidad", "Telégrafo"], drive: "ingeniería", b: { research: 2.0, learn: 1.0 } },
  { n: "Radio", e: 10, cost: 61000, req: ["Teléfono"], drive: "ingeniería", b: { research: 1.5, learn: 0.8 } },
  { n: "Automóvil", e: 10, cost: 64000, req: ["Motor de combustión"], drive: "ingeniería", b: { food: 0.15, research: 1.0 } },
  { n: "Avión", e: 10, cost: 67000, req: ["Automóvil"], drive: "exploración", b: { research: 1.2 } },
  { n: "Antibióticos", e: 10, cost: 70000, req: ["Teoría microbiana"], drive: "salud", key: true, b: { health: 0.6, life: 0.25 } },
  { n: "Línea de montaje", e: 10, cost: 73000, req: ["Automóvil", "Fábrica"], drive: "comercio", b: { food: 0.2, research: 0.8 } },
  { n: "Cine", e: 10, cost: 76000, req: ["Fotografía", "Bombilla"], drive: "arte", b: { research: 0.6 } },
  { n: "Motor eléctrico", e: 10, cost: 79000, req: ["Electricidad", "Dínamo"], drive: "ingeniería", b: { food: 0.12, research: 1.0 } },
  // ── e11 Atómica ──
  { n: "Energía nuclear", e: 11, cost: 88000, req: ["Motor eléctrico", "Química moderna"], drive: "ingeniería", key: true, b: { research: 4.0 } },
  { n: "Radar", e: 11, cost: 93000, req: ["Radio"], drive: "ingeniería", b: { research: 2.0 } },
  { n: "Cohetes", e: 11, cost: 98000, req: ["Avión", "Energía nuclear"], drive: "ingeniería", b: { research: 3.0 } },
  { n: "ADN", e: 11, cost: 103000, req: ["Antibióticos"], drive: "salud", key: true, b: { health: 0.5, life: 0.2, research: 2.0 } },
  { n: "Penicilina masiva", e: 11, cost: 108000, req: ["Antibióticos", "Línea de montaje"], drive: "salud", b: { health: 0.5, life: 0.2 } },
  { n: "Televisión", e: 11, cost: 113000, req: ["Radio", "Cine"], drive: "arte", b: { learn: 1.0, research: 1.0 } },
  { n: "Plásticos", e: 11, cost: 118000, req: ["Química moderna", "Línea de montaje"], drive: "ingeniería", b: { research: 1.5, food: 0.1 } },
  { n: "Computadora", e: 11, cost: 123000, req: ["Energía nuclear", "Radar"], drive: "saber", b: { research: 6.0, learn: 2.0 } },
  { n: "Transistor", e: 11, cost: 128000, req: ["Computadora"], drive: "ingeniería", b: { research: 6.0 } },
  { n: "Energía solar", e: 11, cost: 133000, req: ["Transistor"], drive: "ingeniería", b: { research: 1.5, food: 0.1 } },
  // ── e12 Informática ──
  { n: "Microprocesador", e: 12, cost: 150000, req: ["Transistor"], drive: "saber", key: true, b: { research: 8.0, learn: 2.0 } },
  { n: "Satélites", e: 12, cost: 160000, req: ["Cohetes", "Transistor"], drive: "ingeniería", b: { research: 4.0, food: 0.2 } },
  { n: "Internet", e: 12, cost: 175000, req: ["Microprocesador", "Teléfono"], drive: "saber", key: true, b: { research: 6.0, learn: 4.0 } },
  { n: "Computadora personal", e: 12, cost: 185000, req: ["Microprocesador"], drive: "ingeniería", b: { research: 5.0, learn: 3.0 } },
  { n: "Láser", e: 12, cost: 195000, req: ["Transistor", "Energía nuclear"], drive: "saber", b: { research: 3.0, health: 0.1 } },
  { n: "Ingeniería genética", e: 12, cost: 205000, req: ["ADN", "Computadora"], drive: "salud", b: { health: 0.8, life: 0.4 } },
  { n: "Fibra óptica", e: 12, cost: 215000, req: ["Láser", "Internet"], drive: "ingeniería", b: { research: 4.0, learn: 2.0 } },
  { n: "GPS", e: 12, cost: 225000, req: ["Satélites", "Microprocesador"], drive: "ingeniería", b: { research: 2.0, food: 0.15 } },
  { n: "Telefonía móvil", e: 12, cost: 235000, req: ["Microprocesador", "Radio"], drive: "comercio", b: { research: 3.0, learn: 2.0 } },
  { n: "Robótica", e: 12, cost: 245000, req: ["Computadora personal", "Plásticos"], drive: "ingeniería", b: { food: 0.3, research: 3.0 } },
  { n: "Cohete orbital", e: 13, cost: 270000, req: ["Cohetes", "Microprocesador"], drive: "ingeniería", key: true, b: { research: 5.0 } },
  { n: "Estación espacial", e: 13, cost: 300000, req: ["Cohete orbital", "Satélites"], drive: "ingeniería", b: { research: 5.0 } },
  { n: "Sonda interplanetaria", e: 13, cost: 330000, req: ["Cohete orbital", "GPS"], drive: "exploración", b: { research: 4.0 } },
  { n: "CRISPR", e: 14, cost: 380000, req: ["Ingeniería genética"], drive: "salud", key: true, b: { health: 0.8, life: 0.4 } },
  { n: "Células madre", e: 14, cost: 420000, req: ["CRISPR"], drive: "salud", b: { health: 0.6, life: 0.5 } },
  { n: "Biocomputación", e: 14, cost: 460000, req: ["CRISPR", "Internet"], drive: "saber", b: { research: 12.0 } },
  { n: "Nanomáquinas", e: 15, cost: 540000, req: ["Biocomputación"], drive: "ingeniería", key: true, b: { health: 1.0, food: 0.5, research: 10.0 } },
  { n: "Materiales programables", e: 15, cost: 600000, req: ["Nanomáquinas"], drive: "ingeniería", b: { research: 10.0 } },
  { n: "Medicina celular total", e: 15, cost: 660000, req: ["Nanomáquinas", "Células madre"], drive: "salud", b: { life: 1.0, health: 1.0 } },
  { n: "IA general", e: 16, cost: 780000, req: ["Biocomputación", "Materiales programables"], drive: "saber", key: true, b: { research: 40.0, learn: 10.0 } },
  { n: "Robótica autónoma", e: 16, cost: 860000, req: ["IA general", "Robótica"], drive: "ingeniería", b: { food: 1.0, research: 20.0 } },
  { n: "Interfaz mente-máquina", e: 16, cost: 940000, req: ["IA general"], drive: "salud", b: { learn: 20.0, research: 20.0 } },
  { n: "Subida de la mente", e: 17, cost: 1100000, req: ["Interfaz mente-máquina", "Medicina celular total"], drive: "saber", key: true, b: { life: 5.0, research: 30.0 } },
  { n: "Cuerpos sintéticos", e: 17, cost: 1250000, req: ["Subida de la mente", "Robótica autónoma"], drive: "ingeniería", b: { health: 3.0, life: 3.0 } },
  { n: "Fusión y antimateria", e: 17, cost: 1400000, req: ["IA general"], drive: "ingeniería", b: { research: 50.0, food: 2.0 } },
  { n: "Viaje interestelar", e: 18, cost: 1700000, req: ["Fusión y antimateria", "Cuerpos sintéticos"], drive: "exploración", key: true, b: { research: 40.0 } },
  { n: "Esfera de Dyson", e: 18, cost: 2200000, req: ["Viaje interestelar"], drive: "ingeniería", b: { research: 100.0, food: 5.0 } },
  { n: "Mente colmena galáctica", e: 18, cost: 2800000, req: ["Esfera de Dyson", "Subida de la mente"], drive: "espíritu", b: { research: 200.0, learn: 50.0 } },
]

// PROFESSIONS — the named base set, tagged by era + economic category (+ uni = needs a university).
// The combinatorial specialisations below multiply this into tens of thousands of distinct titles.
export interface Prof { n: string; e: number; c: Cat; u?: 1 }
export const PROFS: Prof[] = [
  // 0 Paleolítica
  { n: "recolector", e: 0, c: "comida" }, { n: "cazador", e: 0, c: "comida" }, { n: "guardián del fuego", e: 0, c: "construcción" },
  { n: "tallador de piedra", e: 0, c: "oficio" }, { n: "rastreador", e: 0, c: "exploración" }, { n: "curandero de hierbas", e: 0, c: "salud" },
  { n: "narrador de historias", e: 0, c: "arte" }, { n: "chamán", e: 0, c: "espíritu" }, { n: "pintor de cuevas", e: 0, c: "arte" },
  { n: "escriba", e: 2, c: "arte" }, { n: "escritor", e: 5, c: "arte" }, { n: "novelista", e: 9, c: "arte" }, { n: "guionista", e: 12, c: "arte" },
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

// techs an aldeano could actually work on NOW: in this era (or earlier), prereqs met, not yet found
export function availableTechs(discovered: Set<string>, era: number): Tech[] {
  return TECHS.filter((t) => !discovered.has(t.n) && t.e <= era && (!t.req || t.req.every((r) => discovered.has(r))))
}
export function eraTechs(era: number): Tech[] { return TECHS.filter((t) => t.e === era) }
// to advance: ALL keystones of the era + at least 7 milestones total (keystones-plus-optional, like a civ tree)
export function canAdvanceEra(discovered: Set<string>, era: number): boolean {
  const et = eraTechs(era); if (!et.length) return true
  if (!et.filter((t) => t.key).every((t) => discovered.has(t.n))) return false
  return et.filter((t) => discovered.has(t.n)).length >= Math.min(et.length, 7)
}
export function eraProgress(discovered: Set<string>, era: number) {
  const et = eraTechs(era), keys = et.filter((t) => t.key)
  return { got: et.filter((t) => discovered.has(t.n)).length, total: et.length, keysGot: keys.filter((t) => discovered.has(t.n)).length, keys: keys.length }
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
