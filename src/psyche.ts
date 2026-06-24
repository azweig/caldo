// psyche.ts — psychology-grounded personalities. Three layers, all heritable:
//   1) Big Five / OCEAN (Costa & McCrae) — the validated trait model, continuous (0..1).
//   2) Enneagram core (9 types) — the deep DESIRE + FEAR + central belief that drives behaviour.
//   3) World beliefs — a pool of caldo convictions (2-3 each), inherited → cultures spread by lineage.
// Combined: 9 cores × ~18 beliefs (choose 2-3) × continuous Big Five = thousands of distinct minds.

const cl = (v: number) => Math.max(0, Math.min(1, v))

export interface BigFive { o: number; c: number; e: number; a: number; n: number }
export interface Psyche { five: BigFive; type: number; beliefs: string[] }

export const ENNEAGRAM: { name: string; desire: string; fear: string; belief: string; lean: Partial<BigFive> }[] = [
  { name: "el Reformador", desire: "vivir con rectitud", fear: "ser corrupto o equivocarte", belief: "hay una forma correcta de vivir y hay que honrarla", lean: { c: 0.22, n: 0.1 } },
  { name: "el Cuidador", desire: "ser querido y necesitado", fear: "no importarle a nadie", belief: "cuidar a los demás es lo que da sentido", lean: { a: 0.25, e: 0.1 } },
  { name: "el Triunfador", desire: "valer y dejar huella", fear: "no ser nada", belief: "hay que prosperar y dejar mucha descendencia", lean: { e: 0.2, c: 0.15 } },
  { name: "el Solitario", desire: "ser auténtico y único", fear: "no tener identidad propia", belief: "soy distinto al resto, nadie siente lo que yo siento", lean: { n: 0.25, o: 0.15 } },
  { name: "el Observador", desire: "entender cómo funciona todo", fear: "ser inútil o invadido", belief: "si entiendo el caldo, sobrevivo", lean: { o: 0.25, e: -0.22 } },
  { name: "el Leal", desire: "seguridad y pertenencia", fear: "el peligro y el abandono", belief: "el mundo es peligroso, hay que estar alerta y unidos", lean: { n: 0.25, a: 0.12 } },
  { name: "el Entusiasta", desire: "gozar y ser libre", fear: "el dolor y el encierro", belief: "la vida es corta, hay que moverse y disfrutarla", lean: { e: 0.25, o: 0.15 } },
  { name: "el Desafiante", desire: "ser fuerte y dueño de sí", fear: "ser sometido o parecer débil", belief: "el fuerte sobrevive y no muestra debilidad", lean: { a: -0.25, e: 0.15 } },
  { name: "el Pacificador", desire: "paz y armonía", fear: "el conflicto y la pérdida", belief: "mejor que todo fluya tranquilo, sin pelear", lean: { a: 0.2, n: -0.2 } },
]

export const BELIEFS = [
  "los muertos nos siguen mirando desde el linaje",
  "no hay ningún plan: todo es azar y hambre",
  "hay un orden oculto en el caldo, un designio",
  "la comida se está acabando, hay que acaparar",
  "siempre habrá comida si sabemos compartir",
  "la enfermedad es un castigo que algo se merece",
  "la enfermedad es azar cruel, le toca a cualquiera",
  "la familia es lo único sagrado",
  "cada uno por su cuenta; la familia ata",
  "el forastero trae desgracia",
  "hay que recibir al forastero, trae vida nueva",
  "mejor una vida corta y libre que larga y temerosa",
  "hay que durar para llegar a conocer a los nietos",
  "los jardines son sagrados, arrasarlos es pecado",
  "el que no se mueve, muere",
  "los viejos guardan la verdad, hay que escucharlos",
  "el futuro es de los jóvenes, los viejos estorban",
  "soñar con irse del caldo es una enfermedad del alma",
]

// beliefs are NOT a fixed menu — cultures invent NEW ones over generations (genuine cultural evolution).
// A belief = a subject the people fixate on + a stance toward it. The curated BELIEFS above are seeds;
// genBelief() composes fresh ones (incl. subjects/stances no founder ever held), so mythologies drift.
const BELIEF_SUBJECTS = ["la comida", "la muerte", "el forastero", "los astros", "el trabajo", "los sueños", "el poder", "los ríos", "el fuego", "la sangre", "los nombres", "el silencio", "la risa", "los espejos", "la luna", "el hambre", "la palabra dada", "los hijos", "el oro", "la montaña", "el primer aliento", "las sombras largas"]
const BELIEF_STANCES: ((s: string) => string)[] = [
  (s) => `${cap(s)} es sagrado y no debe tocarse`,
  (s) => `${cap(s)} es una mentira que nos contaron`,
  (s) => `hay que temer a ${s}`,
  (s) => `${cap(s)} traerá la salvación al pueblo`,
  (s) => `los antepasados hablan a través de ${s}`,
  (s) => `quien domina ${s} domina el mundo`,
  (s) => `${cap(s)} no significa nada: es puro azar`,
  (s) => `hay que ofrendar a ${s} para seguir vivos`,
  (s) => `${cap(s)} corrompe a quien lo persigue`,
  (s) => `el que comprende ${s} no muere del todo`,
]
const rnd = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)]
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
export function genBelief(): string {
  return rnd(BELIEF_STANCES)(rnd(BELIEF_SUBJECTS))
    .replace(/\bde el /g, "del ").replace(/\ba el /g, "al ")          // de el → del · a el → al
    .replace(/^(Los|Las) (\S+) es /, "$1 $2 son ")                    // plural subject agreement
    .replace(/^(Los|Las) (\S+) traerá /, "$1 $2 traerán ")
}

const randFive = (): BigFive => ({ o: Math.random(), c: Math.random(), e: Math.random(), a: Math.random(), n: Math.random() })
const applyLean = (f: BigFive, l: Partial<BigFive>): BigFive => ({ o: cl(f.o + (l.o || 0)), c: cl(f.c + (l.c || 0)), e: cl(f.e + (l.e || 0)), a: cl(f.a + (l.a || 0)), n: cl(f.n + (l.n || 0)) })

function pickBeliefs(n: number, from = BELIEFS): string[] {
  const pool = [...from], out: string[] = []
  for (let i = 0; i < n && pool.length; i++) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0])
  return out
}

export function randomPsyche(): Psyche {
  const type = Math.floor(Math.random() * ENNEAGRAM.length)
  return { five: applyLean(randFive(), ENNEAGRAM[type].lean), type, beliefs: pickBeliefs(2 + (Math.random() < 0.5 ? 0 : 1)) }
}

// children inherit a blended Big Five (+noise), usually a parent's core, and a mix of parents' beliefs
// — with a small chance of a NEW belief (drift) so cultures evolve down the generations.
export function inheritPsyche(a: Psyche, b: Psyche): Psyche {
  const mix = (x: number, y: number) => cl((x + y) / 2 + (Math.random() * 2 - 1) * 0.14)
  const five: BigFive = { o: mix(a.five.o, b.five.o), c: mix(a.five.c, b.five.c), e: mix(a.five.e, b.five.e), a: mix(a.five.a, b.five.a), n: mix(a.five.n, b.five.n) }
  const type = Math.random() < 0.7 ? (Math.random() < 0.5 ? a.type : b.type) : Math.floor(Math.random() * ENNEAGRAM.length)
  const inherited = [...new Set([...a.beliefs, ...b.beliefs])]
  const beliefs = pickBeliefs(Math.min(2, inherited.length), inherited)
  // cultural drift: a new generation may take up a belief from elsewhere — or INVENT one nobody held before
  if (Math.random() < 0.32) { const fresh = Math.random() < 0.45 ? genBelief() : pickBeliefs(1)[0]; if (fresh && !beliefs.includes(fresh)) beliefs.push(fresh) }
  return { five, type, beliefs }
}

function fiveWords(f: BigFive): string {
  const w: string[] = []
  const ax = (v: number, hi: string, lo: string) => { if (v > 0.6) w.push(hi); else if (v < 0.4) w.push(lo) }
  ax(f.o, "abierto a lo nuevo", "práctico y conservador")
  ax(f.c, "disciplinado y ordenado", "despreocupado e impulsivo")
  ax(f.e, "sociable y expresivo", "solitario y reservado")
  ax(f.a, "compasivo y confiado", "crítico y competitivo")
  ax(f.n, "ansioso y sensible", "calmo y estable")
  return w.join(", ") || "de temperamento equilibrado"
}

/** Rich personality block for the LLM system prompt (lived, never recited). */
export function describePsyche(p: Psyche): string {
  const t = ENNEAGRAM[p.type]
  const beliefs = [t.belief, ...p.beliefs]
  return `Tu núcleo: sos ${t.name} — en el fondo anhelás ${t.desire} y temés ${t.fear}.
Tu temperamento: ${fiveWords(p.five)}.
Creés profundamente (lo vivís, no lo recitás): ${beliefs.map((b) => `"${b}"`).join("; ")}.`
}

/** Short label for the chat header. */
export function psycheLabel(p: Psyche): string {
  return `${ENNEAGRAM[p.type].name} · ${fiveWords(p.five).split(",")[0]}`
}
