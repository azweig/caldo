// animals.ts — wild + domestic beasts share the land. Predators (wolves, bears, boars) raid the town; the
// people fight them off (if they have warriors/hunters), flee, or fall. Gentle beasts (deer, rabbits) are
// hunted for meat. Tameable ones (sheep, cattle, horses, dogs) can be DOMESTICATED into livestock + companions.
// What a town DOES — hunt, tame, or cower — emerges from who lives there (warriors vs caretakers vs farmers).

export interface Animal { id: number; x: number; y: number; vx: number; vy: number; kind: string; hp: number; tame: boolean; owner: number }

export interface Species { emoji: string; hostile: boolean; tameable: boolean; food: number; danger: number; era: number }
export const SPECIES: Record<string, Species> = {
  lobo: { emoji: "🐺", hostile: true, tameable: false, food: 6, danger: 0.8, era: 0 },
  oso: { emoji: "🐻", hostile: true, tameable: false, food: 14, danger: 1.0, era: 0 },
  jabalí: { emoji: "🐗", hostile: true, tameable: false, food: 10, danger: 0.6, era: 0 },
  ciervo: { emoji: "🦌", hostile: false, tameable: false, food: 9, danger: 0, era: 0 },
  conejo: { emoji: "🐇", hostile: false, tameable: false, food: 3, danger: 0, era: 0 },
  oveja: { emoji: "🐑", hostile: false, tameable: true, food: 5, danger: 0, era: 1 },
  cabra: { emoji: "🐐", hostile: false, tameable: true, food: 5, danger: 0, era: 1 },
  vaca: { emoji: "🐄", hostile: false, tameable: true, food: 13, danger: 0, era: 2 },
  caballo: { emoji: "🐎", hostile: false, tameable: true, food: 0, danger: 0, era: 3 },
  perro: { emoji: "🐕", hostile: false, tameable: true, food: 0, danger: 0, era: 1 },
}
export const SPECIES_KEYS = Object.keys(SPECIES)
export const emojiOf = (kind: string) => SPECIES[kind]?.emoji || "🐾"

// RAIDERS from beyond the map — peoples that don't exist as towns. Era-appropriate: stone-age savages, then
// nomad + barbarian war-bands, sea pirates, and in the modern world, terrorists. They strike, loot, and flee.
export interface Enemy { x: number; y: number; vx: number; vy: number; kind: string; hp: number }
export const ENEMIES: Record<string, { emoji: string; label: string; min: number; max: number; power: number }> = {
  salvajes: { emoji: "🪓", label: "una horda salvaje", min: 0, max: 3, power: 0.8 },
  nomadas: { emoji: "🏹", label: "nómadas saqueadores", min: 1, max: 8, power: 1.0 },
  barbaros: { emoji: "⚔️", label: "bárbaros", min: 3, max: 9, power: 1.2 },
  piratas: { emoji: "🏴‍☠️", label: "piratas", min: 5, max: 10, power: 1.1 },
  terroristas: { emoji: "💣", label: "terroristas", min: 9, max: 18, power: 1.4 },
}
export const enemyEmoji = (kind: string) => ENEMIES[kind]?.emoji || "💀"
