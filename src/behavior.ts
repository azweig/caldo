// behavior.ts — decisions under UNCERTAINTY, poker-style (hidden info + risk), NOT chess (perfect info).
// An action is a GAMBLE: a set of outcomes with probabilities the agent can only ESTIMATE (bounded
// rationality). The psychological profile shapes how they read the odds, how much risk they stomach,
// and how much they weigh the future. The goal isn't the "optimal" move — it's the MOST PROBABLE one.

import { BigFive } from "./psyche"
import { Stage } from "./lifestage"

const cl = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v))

export interface Outcome { p: number; utility: number; label?: string } // one branch of a gamble (subjective p)
export interface Option { key: string; outcomes: Outcome[] }            // an action = a lottery
export interface Mind { five: BigFive; knowledge: number; intellect: number; stage?: Stage }

// SUBJECTIVE read of a true probability — like reading an opponent in poker, you don't see the cards.
// Smart/learned minds estimate closer to the truth; the ignorant sit near 50/50; hope/anxiety bias it.
export function perceiveProb(trueP: number, m: Mind): number {
  const acc = cl(0.32 + 0.5 * m.intellect + 0.004 * m.knowledge) // accuracy 0..1
  const optimism = (m.five.o - m.five.n) * 0.12                  // hopeful inflate good odds, anxious deflate
  return cl(0.5 + (trueP - 0.5) * acc + optimism, 0.02, 0.98)
}

// subjective expected utility, penalised (or rewarded) for RISK = spread of outcomes.
//   high neuroticism → risk-averse (fears the downside) · high openness → risk-seeking (chases the new)
export function evaluate(opt: Option, m: Mind): number {
  const ev = opt.outcomes.reduce((s, o) => s + o.p * o.utility, 0)
  const sd = Math.sqrt(opt.outcomes.reduce((s, o) => s + o.p * (o.utility - ev) ** 2, 0))
  const riskAversion = (m.five.n - 0.5) * 1.3 - (m.five.o - 0.5) * 0.7
  return ev - riskAversion * sd * 0.6
}

// pick among options by SOFTMAX over their subjective utility (so it's PROBABLE, not deterministic).
// the impulsive (low conscientiousness) choose more erratically; the disciplined sharpen on the best bet.
export function decide(options: Option[], m: Mind): { best: string; probs: Record<string, number> } {
  const us = options.map((o) => evaluate(o, m))
  const temp = 12 + (1 - m.five.c) * 22 // higher temperature = flatter, more random choice
  const ex = us.map((u) => Math.exp(u / temp))
  const z = ex.reduce((a, b) => a + b, 0)
  const probs: Record<string, number> = {}
  let best = options[0].key, bp = -1
  options.forEach((o, i) => { const p = ex[i] / z; probs[o.key] = p; if (p > bp) { bp = p; best = o.key } })
  return { best, probs }
}

// ── EXAMPLE 1: should I LIE? (hidden info — you can't see how sharp the listener is) ──
export function lieDecision(m: Mind, lie: { brazen: number; benefit: number }, listenerTrueSkill: number) {
  const trueCaught = cl(lie.brazen * 0.5 + listenerTrueSkill * 0.5, 0, 0.97) // truth is HIDDEN from the liar
  const estCaught = perceiveProb(trueCaught, m)                              // they only read the odds
  const moralCost = (m.five.a * 18 + m.five.c * 10)                          // kind/dutiful feel guilt
  const lieOpt: Option = { key: "mentir", outcomes: [
    { p: estCaught, utility: -lie.benefit - 35 - moralCost, label: "lo descubren" },
    { p: 1 - estCaught, utility: lie.benefit - moralCost, label: "se sale con la suya" },
  ] }
  const truthOpt: Option = { key: "decir verdad", outcomes: [{ p: 1, utility: 0, label: "honesto" }] }
  return { ...decide([lieOpt, truthOpt], m), estCaught: Math.round(estCaught * 100), trueCaught: Math.round(trueCaught * 100) }
}

// ── EXAMPLE 2: which trade? (future uncertainty — the train may be killed by the coming car) ──
export function careerDecision(m: Mind, jobs: { key: string; payNow: number; obsolescenceRisk: number }[]) {
  const opts: Option[] = jobs.map((j) => {
    const estObs = perceiveProb(j.obsolescenceRisk, m) // foresight: smart/open minds SEE the disruption coming
    return { key: j.key, outcomes: [
      { p: estObs, utility: j.payNow * 0.2 - 28, label: "el oficio muere" },
      { p: 1 - estObs, utility: j.payNow, label: "prospera" },
    ] }
  })
  return decide(opts, m)
}
