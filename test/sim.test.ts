import { describe, it, expect } from "vitest"
import { seedRng, rand, rngState, setRngState } from "../src/rng"
import { World, resetCreatureIds, ageYears, isMature } from "../src/world"

const cfg = { startEra: 0, religions: [], violence: 0.3, psychopathy: 0.02, gov: "república" as const, system: "capitalista" as const }
function fresh(seed: number) { seedRng(seed); resetCreatureIds(); return new World(2, 0, cfg) }
function run(seed: number, ticks: number) { const w = fresh(seed); for (let i = 0; i < ticks; i++) w.step(); return w }

describe("rng", () => {
  it("is deterministic for a given seed", () => {
    seedRng(42); const a = [rand(), rand(), rand()]
    seedRng(42); const b = [rand(), rand(), rand()]
    expect(a).toEqual(b)
  })
  it("state can be captured + restored", () => {
    seedRng(1); rand(); rand(); const s = rngState(); const next = rand()
    setRngState(s); expect(rand()).toBe(next)
  })
})

describe("simulation determinism", () => {
  it("same seed → identical world after many ticks", { timeout: 60000 }, () => {
    const sig = (w: World) => { const c = w.creatures.filter((x) => !x.isAvatar); return c.length + "|" + w.era + "|" + Math.round(c.reduce((s, x) => s + x.x + x.energy + x.knowledge, 0)) }
    expect(sig(run(777, 2000))).toBe(sig(run(777, 2000)))
  })
  it("different seeds → different worlds", { timeout: 60000 }, () => {
    const pop = (s: number) => run(s, 2000).creatures.length
    expect(pop(1)).not.toBe(pop(123456))
  })
})

describe("serialization round-trip", () => {
  it("toState → fromState preserves the world signature", { timeout: 60000 }, () => {
    const w = run(55, 1500)
    const sig = (x: World) => x.creatures.filter((c) => !c.isAvatar).length + "|" + x.era + "|" + x.discovered.size + "|" + x.houses.length
    const restored = World.fromState(w.toState(), 2)
    expect(sig(restored)).toBe(sig(w))
  })
  it("survives a hostile crafted save (no throw, sanitized)", () => {
    const w = run(9, 500)
    const state: any = w.toState()
    state.creatures[0].nm = "<img src=x onerror=alert(1)>"
    state.creatures[0].soc = ["<script>bad</script>"]
    state.creatures[0].x = "not a number"
    const r = World.fromState(state, 2)
    expect(r.creatures[0].name).not.toContain("<")
    expect(r.creatures[0].social.join("")).not.toContain("<")
    expect(Number.isFinite(r.creatures[0].x)).toBe(true)
  })
})

describe("invariants over a long run", () => {
  it("holds for 4000 ticks across several seeds", { timeout: 120000 }, () => {
    for (const seed of [3, 31, 314]) {
      const w = fresh(seed)
      for (let i = 0; i < 4000; i++) {
        w.step()
        for (const c of w.creatures) {
          if (c.isAvatar) continue
          expect(Number.isFinite(c.x) && Number.isFinite(c.y)).toBe(true)
          expect(c.energy).toBeGreaterThan(-5) // small transient dips before the per-step floor are ok; no runaway
          expect(ageYears(c)).toBeGreaterThanOrEqual(0)
        }
      }
      const wild = w.creatures.filter((c) => !c.isAvatar)
      expect(wild.length).toBeLessThanOrEqual(280 * 1.1) // POP_CAP-ish
      // no dangling partner references
      const ids = new Set(w.creatures.map((c) => c.id))
      for (const c of wild) if (c.partner) expect(ids.has(c.partner)).toBe(true)
      // a parent of a young child is never left alone (childcare invariant)
      const youngParents = new Set<number>()
      for (const k of wild) if (ageYears(k) < 14 && k.parents) k.parents.forEach((p) => youngParents.add(p))
      const lone = wild.filter((c) => youngParents.has(c.id) && !c.partner && isMature(c)).length
      // allow a few (just-widowed, awaiting re-pairing) but not a structural failure
      expect(lone).toBeLessThan(Math.max(4, wild.length * 0.15))
    }
  })
})
