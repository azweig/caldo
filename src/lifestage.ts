// lifestage.ts — the 9 human life stages and how psychology + capabilities shift with age.
// Pure data + functions (no DOM). The INHERITED Big Five is a genetic set-point; AGE modulates it
// along the lifespan trends found in developmental psychology (Piaget, Big-Five maturation, etc.).

import { BigFive, Psyche } from "./psyche"

export interface Stage {
  key: string
  name: string
  min: number
  max: number            // upper bound (exclusive), in years
  language: number       // 0..1 command of language
  theoryOfMind: boolean  // can model that others know/want different things
  abstractThought: boolean // Piaget's formal-operational reasoning
  independence: number   // 0..1 how self-sufficient (drives roaming, work, leaving home)
  learnRate: number      // multiplier on how fast they absorb knowledge
  note: string
}

// Stages 2–9 of the classic 9 (the prenatal stage 1 is before a creature spawns, so it's omitted).
export const STAGES: Stage[] = [
  { key: "infancia1",   name: "Primera infancia",  min: 0,  max: 3,   language: 0.4, theoryOfMind: false, abstractThought: false, independence: 0.0,  learnRate: 1.6, note: "el lenguaje explota; aprende cómo se mueve el mundo" },
  { key: "ninez_temp",  name: "Niñez temprana",    min: 3,  max: 6,   language: 0.8, theoryOfMind: true,  abstractThought: false, independence: 0.1,  learnRate: 1.4, note: "autoconcepto + teoría de la mente; juego social" },
  { key: "ninez_int",   name: "Niñez intermedia",  min: 6,  max: 11,  language: 1.0, theoryOfMind: true,  abstractThought: false, independence: 0.25, learnRate: 1.3, note: "operaciones concretas; grupos de amistad" },
  { key: "adolescencia",name: "Adolescencia",      min: 11, max: 18,  language: 1.0, theoryOfMind: true,  abstractThought: true,  independence: 0.5,  learnRate: 1.1, note: "pensamiento abstracto; identidad; labilidad emocional" },
  { key: "juventud",    name: "Juventud",          min: 18, max: 35,  language: 1.0, theoryOfMind: true,  abstractThought: true,  independence: 1.0,  learnRate: 1.0, note: "techo físico/mental; independencia; vínculos duraderos" },
  { key: "madurez",     name: "Madurez",           min: 35, max: 50,  language: 1.0, theoryOfMind: true,  abstractThought: true,  independence: 1.0,  learnRate: 0.8, note: "consolidación laboral; se orienta a la estabilidad" },
  { key: "adultez_mad", name: "Adultez madura",    min: 50, max: 65,  language: 1.0, theoryOfMind: true,  abstractThought: true,  independence: 1.0,  learnRate: 0.6, note: "estabilidad; cambios corporales que gestionar" },
  { key: "tercera",     name: "Tercera edad",      min: 65, max: 200, language: 1.0, theoryOfMind: true,  abstractThought: true,  independence: 0.8,  learnRate: 0.4, note: "nueva independencia; duelos; sabiduría acumulada" },
]

export function stageOf(ageYears: number): Stage {
  for (const s of STAGES) if (ageYears < s.max) return s
  return STAGES[STAGES.length - 1]
}

const cl = (v: number, lo = 0.03, hi = 0.99) => Math.max(lo, Math.min(hi, v))

// Additive offsets to the genetic set-point, following lifespan personality research:
//  C rises low→high into adulthood · A rises with age (adolescent dip) · N falls with age (teen spike) ·
//  O peaks in youth then declines · E mild decline. A 2-year-old can't be "disciplined" no matter the genes.
export function ageShift(age: number): BigFive {
  let c = cl(-0.40 + age * 0.013, -0.40, 0.20)
  if (age > 65) c -= (age - 65) * 0.003
  let a = cl(-0.22 + age * 0.0075, -0.22, 0.24)
  if (age >= 11 && age < 18) a -= 0.10
  let n = cl(0.12 - age * 0.0035, -0.22, 0.30)
  if (age >= 11 && age < 18) n += 0.20
  if (age > 75) n += 0.06
  const o = age < 20 ? age * 0.010 : cl(0.20 - (age - 20) * 0.005, -0.30, 0.20)
  const e = cl(-age * 0.0028, -0.18, 0.001)
  return { o, c, e, a, n }
}

// The personality you actually act with at a given age = genetic set-point shifted by the age curve.
export function agePsyche(base: Psyche, age: number): { five: BigFive; stage: Stage } {
  const s = ageShift(age), b = base.five
  return {
    five: { o: cl(b.o + s.o), c: cl(b.c + s.c), e: cl(b.e + s.e), a: cl(b.a + s.a), n: cl(b.n + s.n) },
    stage: stageOf(age),
  }
}
