// sprites.ts — load the pixel-art creature sprites (reused from Puglit) + the food sprite.

export const CREATURE_FILES = [
  "researcher", "analyst", "art-director", "frontend-designer",
  "queen-bee", "dba", "security-engineer", "tech-writer",
]

export interface Assets {
  creatures: HTMLImageElement[]
  food: HTMLImageElement
}

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(img) // resolve anyway; render guards on naturalWidth
    img.src = src
  })
}

export async function loadAssets(): Promise<Assets> {
  const creatures = await Promise.all(CREATURE_FILES.map((n) => load(`/sprites/creatures/${n}.png`)))
  const food = await load("/sprites/food.png")
  return { creatures, food }
}
