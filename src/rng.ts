// rng.ts — a single SEEDABLE pseudo-random generator for the whole simulation, so a run is reproducible:
// the same seed + the same sequence of sim operations produces the same world. This is what makes the sim
// testable (snapshot/invariant tests), debuggable (reproduce a "my town died" report), and makes the offline
// catch-up deterministic. Cosmetic-only randomness (render jitter, particles) may keep Math.random().
//
// Usage: seed once at app start (fresh or from the save), persist rngState() in the save, restore on load.

let _state = 0x9e3779b9 >>> 0

export function seedRng(seed: number): void { _state = (seed >>> 0) || 1 }
export function rngState(): number { return _state >>> 0 }
export function setRngState(s: number): void { _state = (s >>> 0) || 1 }

// mulberry32 — small, fast, good enough statistical quality for a game sim.
export function rand(): number {
  _state = (_state + 0x6d2b79f5) | 0
  let t = Math.imul(_state ^ (_state >>> 15), 1 | _state)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
