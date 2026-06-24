// population.ts — generate people whose PERSONALITIES follow real-world base rates (no cheating):
// Big Five ~ normal distribution; Dark-Triad traits derived from the profile + noise; clinical/archetype
// labels thresholded to match prevalences reported in the psychology literature (psychopathy ~1%, NPD
// ~1-3%, high-Machiavellianism ~15%, etc.). We GENERATE from principled distributions, then MEASURE the
// emergent prevalence and confirm it matches — calibration, not hand-placing.

import { BigFive } from "./psyche"

const cl = (v: number, lo = 0.02, hi = 0.98) => Math.max(lo, Math.min(hi, v))

// standard normal via Box–Muller
export function gauss(mean: number, sd: number): number {
  let u = 0, v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

export interface DarkTriad { mach: number; narc: number; psycho: number } // each 0..1
export type Archetype =
  | "psicópata" | "narcisista" | "manipulador" | "emprendedor" | "líder"
  | "altruista" | "ansioso" | "solitario" | "promedio"

export interface Person { five: BigFive; dark: DarkTriad; archetype: Archetype }

// Big Five are roughly normal in the population (mean .5, moderate spread)
function normalFive(): BigFive {
  return {
    o: cl(gauss(0.5, 0.17)), c: cl(gauss(0.5, 0.17)), e: cl(gauss(0.5, 0.17)),
    a: cl(gauss(0.52, 0.17)), n: cl(gauss(0.5, 0.18)),
  }
}

// Dark-Triad scores are mostly low with a heavy upper tail; they correlate with LOW agreeableness,
// and psychopathy adds low fear (low N) + impulsivity (low C). Derived from the profile + private noise.
function darkTriad(f: BigFive): DarkTriad {
  const lowA = 0.5 - f.a
  return {
    mach: cl(gauss(0.30, 0.16) + lowA * 0.5),
    narc: cl(gauss(0.26, 0.15) + (f.e - 0.5) * 0.35 + lowA * 0.35),
    psycho: cl(gauss(0.20, 0.14) + lowA * 0.45 + (0.5 - f.n) * 0.22 + (0.5 - f.c) * 0.22),
  }
}

// thresholds tuned so the emergent prevalence matches the literature (verified in test/population_check.ts)
function classify(f: BigFive, d: DarkTriad): Archetype {
  if (d.psycho > 0.575) return "psicópata"        // ~1% (Hare)
  if (d.narc > 0.62) return "narcisista"          // ~1-3% (NPD)
  if (d.mach > 0.50) return "manipulador"         // high-Mach ~12-16%
  if (f.o > 0.58 && f.e > 0.56 && f.n < 0.5 && f.a < 0.62 && f.c > 0.45) return "emprendedor" // risk-taking, driven
  if (f.e > 0.56 && f.c > 0.56 && f.a > 0.45) return "líder"
  if (f.a > 0.64 && f.c > 0.5) return "altruista"
  if (f.n > 0.68) return "ansioso"
  if (f.e < 0.34) return "solitario"
  return "promedio"
}

export function genPerson(): Person {
  const five = normalFive()
  const dark = darkTriad(five)
  return { five, dark, archetype: classify(five, dark) }
}

// children inherit a blend of both parents' Big Five + Dark-Triad (+ a little noise), then are re-classified
export function inheritPerson(a: { five: BigFive; dark: DarkTriad }, b: { five: BigFive; dark: DarkTriad }): Person {
  const mix = (x: number, y: number) => cl((x + y) / 2 + gauss(0, 0.08))
  const five: BigFive = { o: mix(a.five.o, b.five.o), c: mix(a.five.c, b.five.c), e: mix(a.five.e, b.five.e), a: mix(a.five.a, b.five.a), n: mix(a.five.n, b.five.n) }
  const dark: DarkTriad = { mach: mix(a.dark.mach, b.dark.mach), narc: mix(a.dark.narc, b.dark.narc), psycho: mix(a.dark.psycho, b.dark.psycho) }
  return { five, dark, archetype: classify(five, dark) }
}
export function inheritDark(a: DarkTriad, b: DarkTriad): DarkTriad {
  const mix = (x: number, y: number) => cl((x + y) / 2 + gauss(0, 0.08))
  return { mach: mix(a.mach, b.mach), narc: mix(a.narc, b.narc), psycho: mix(a.psycho, b.psycho) }
}
export { classify }

export function genPopulation(n: number): Person[] {
  const out: Person[] = new Array(n)
  for (let i = 0; i < n; i++) out[i] = genPerson()
  return out
}
