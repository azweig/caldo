// genome.ts — the heritable code of a creature. Evolution engine: children inherit a MIX of both
// parents' genomes (recombination) plus small mutations; selection (who survives to reproduce) does
// the rest. Now includes life-history traits: longevity (how long it can live) and resistance (to
// illness) — so health and lifespan themselves evolve.

export interface Genome {
  speed: number       // px/step it can move (costs energy ∝ speed)
  vision: number      // px radius it senses food/others
  size: number        // body scale; bigger = more energy to run but more reproduction reserve
  metabolism: number  // base energy burn multiplier (a tax on simply existing)
  longevity: number   // natural lifespan in YEARS (~80 avg) — heritable
  resistance: number  // 0..1 resistance to illness — heritable
  intellect: number   // 0..1 cognitive capacity: learning speed + a small foraging edge — heritable
  sprite: number      // which creature sprite (visual "species")
  hue: number         // 0..360 colour tint, drifts → lineages visibly diverge
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const jitter = (v: number, amt: number) => v + (Math.random() * 2 - 1) * amt

export const TRAIT_BOUNDS = {
  speed: [0.3, 3.2] as const,
  vision: [20, 220] as const,
  size: [0.6, 2.2] as const,
  metabolism: [0.4, 2.0] as const,
  longevity: [45, 110] as const,
  resistance: [0.05, 0.95] as const,
  intellect: [0.1, 1.0] as const,
}

export function randomGenome(spriteCount: number): Genome {
  return {
    speed: 0.6 + Math.random() * 1.4,
    vision: 50 + Math.random() * 90,
    size: 0.8 + Math.random() * 0.8,
    metabolism: 0.7 + Math.random() * 0.6,
    longevity: 72 + Math.random() * 16,   // centred near 80
    resistance: 0.3 + Math.random() * 0.5,
    intellect: 0.3 + Math.random() * 0.4,
    sprite: Math.floor(Math.random() * spriteCount),
    hue: Math.random() * 360,
  }
}

// Mutate a copy — most offspring barely differ; occasionally a trait jumps.
export function mutate(g: Genome, spriteCount: number): Genome {
  const r = 0.12
  return {
    speed: clamp(jitter(g.speed, r * 1.2), ...TRAIT_BOUNDS.speed),
    vision: clamp(jitter(g.vision, r * 30), ...TRAIT_BOUNDS.vision),
    size: clamp(jitter(g.size, r), ...TRAIT_BOUNDS.size),
    metabolism: clamp(jitter(g.metabolism, r), ...TRAIT_BOUNDS.metabolism),
    longevity: clamp(jitter(g.longevity, r * 8), ...TRAIT_BOUNDS.longevity),
    resistance: clamp(jitter(g.resistance, r * 0.5), ...TRAIT_BOUNDS.resistance),
    intellect: clamp(jitter(g.intellect, r * 0.5), ...TRAIT_BOUNDS.intellect),
    sprite: Math.random() < 0.02 ? Math.floor(Math.random() * spriteCount) : g.sprite,
    hue: (g.hue + (Math.random() * 2 - 1) * 14 + 360) % 360,
  }
}

// A child of TWO parents: each gene comes from one parent at random (recombination), then mutates.
export function recombine(a: Genome, b: Genome, spriteCount: number): Genome {
  const pick = <K extends keyof Genome>(k: K): Genome[K] => (Math.random() < 0.5 ? a[k] : b[k])
  const child: Genome = {
    speed: pick("speed"),
    vision: pick("vision"),
    size: pick("size"),
    metabolism: pick("metabolism"),
    longevity: pick("longevity"),
    resistance: pick("resistance"),
    intellect: pick("intellect"),
    sprite: pick("sprite"),
    hue: (a.hue + b.hue) / 2,
  }
  return mutate(child, spriteCount)
}
