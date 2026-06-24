// render.ts — draw the TOWN through a camera (zoom + follow): streets, houses, gardens, food, and
// creatures; plus a screen-space HUD chart. The camera transform is applied for the world, then
// reset so the chart/labels-overlay draw in screen pixels.

import { World, Creature, ageYears, isMature, WORLD_W, WORLD_H, BLOCK, ROAD_HALF } from "./world"
import { Assets } from "./sprites"
import { TRAIT_BOUNDS } from "./genome"

export interface Cam { x: number; y: number; zoom: number }

export function drawWorld(
  ctx: CanvasRenderingContext2D,
  world: World,
  assets: Assets,
  avatar: Creature | null,
  chatTarget: Creature | null,
  promptTalk: boolean,
  cam: Cam,
) {
  const cw = ctx.canvas.width, ch = ctx.canvas.height
  ctx.fillStyle = "#06090d"
  ctx.fillRect(0, 0, cw, ch)

  ctx.save()
  ctx.translate(cw / 2, ch / 2)
  ctx.scale(cam.zoom, cam.zoom)
  ctx.translate(-cam.x, -cam.y)

  // ground
  ctx.fillStyle = "#0e1822"
  ctx.fillRect(0, 0, WORLD_W, WORLD_H)

  // gardens (where food grows)
  for (const g of world.gardens) {
    ctx.fillStyle = "rgba(60,150,90,0.10)"
    ctx.beginPath(); ctx.arc(g.x, g.y, 95, 0, Math.PI * 2); ctx.fill()
  }

  // streets (grid)
  ctx.fillStyle = "#172230"
  for (let x = BLOCK; x < WORLD_W; x += BLOCK) ctx.fillRect(x - ROAD_HALF, 0, ROAD_HALF * 2, WORLD_H)
  for (let y = BLOCK; y < WORLD_H; y += BLOCK) ctx.fillRect(0, y - ROAD_HALF, WORLD_W, ROAD_HALF * 2)
  ctx.strokeStyle = "rgba(255,255,255,0.05)"; ctx.lineWidth = 1
  ctx.setLineDash([8, 10])
  for (let x = BLOCK; x < WORLD_W; x += BLOCK) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, WORLD_H); ctx.stroke() }
  for (let y = BLOCK; y < WORLD_H; y += BLOCK) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WORLD_W, y); ctx.stroke() }
  ctx.setLineDash([])

  // houses
  for (const h of world.houses) {
    ctx.fillStyle = `hsl(${h.hue}, 30%, 40%)`
    ctx.fillRect(h.x, h.y, h.w, h.h)
    ctx.fillStyle = `hsl(${h.hue}, 38%, 27%)` // roof
    ctx.beginPath(); ctx.moveTo(h.x - 5, h.y); ctx.lineTo(h.x + h.w + 5, h.y); ctx.lineTo(h.x + h.w / 2, h.y - 22); ctx.closePath(); ctx.fill()
    ctx.fillStyle = "rgba(0,0,0,0.45)" // door
    ctx.fillRect(h.x + h.w / 2 - 6, h.y + h.h - 16, 12, 16)
    if (cam.zoom > 1.4) label(ctx, h.surname, h.x + h.w / 2, h.y - 26, "rgba(200,215,230,0.6)")
  }

  // food
  const foodOk = assets.food.naturalWidth > 0
  for (const f of world.food) {
    if (foodOk) ctx.drawImage(assets.food, f.x - 7, f.y - 11, 14, 14)
    else { ctx.fillStyle = "#3fb56b"; ctx.beginPath(); ctx.arc(f.x, f.y, 3, 0, Math.PI * 2); ctx.fill() }
  }

  // creatures
  for (const c of world.creatures) { if (!c.isAvatar) drawCreature(ctx, c, assets) }

  if (chatTarget) {
    ctx.strokeStyle = "rgba(120,200,255,0.18)"; ctx.lineWidth = 1
    ctx.beginPath(); ctx.arc(chatTarget.x, chatTarget.y, chatTarget.genome.vision, 0, Math.PI * 2); ctx.stroke()
    ctx.strokeStyle = "#78c8ff"; ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(chatTarget.x, chatTarget.y, 22 + chatTarget.genome.size * 8, 0, Math.PI * 2); ctx.stroke()
    label(ctx, chatTarget.name, chatTarget.x, chatTarget.y - 26 - chatTarget.genome.size * 10, "#cdeaff")
    if (promptTalk) {
      const py = chatTarget.y - 40 - chatTarget.genome.size * 10
      ctx.font = "bold 12px ui-monospace, monospace"; ctx.textAlign = "center"
      const w = ctx.measureText("⌨ E · hablar").width + 16
      ctx.fillStyle = "rgba(120,200,255,0.95)"; ctx.beginPath(); ctx.roundRect(chatTarget.x - w / 2, py - 13, w, 19, 6); ctx.fill()
      ctx.fillStyle = "#06223a"; ctx.fillText("⌨ E · hablar", chatTarget.x, py); ctx.textAlign = "left"
    }
  }

  if (avatar) {
    ctx.strokeStyle = "#ffd76a"; ctx.lineWidth = 2.5
    ctx.beginPath(); ctx.arc(avatar.x, avatar.y, 20 + avatar.genome.size * 8, 0, Math.PI * 2); ctx.stroke()
    drawCreature(ctx, avatar, assets)
    label(ctx, "Tú", avatar.x, avatar.y - 24 - avatar.genome.size * 10, "#ffe6a3")
  }

  ctx.restore()
}

function drawCreature(ctx: CanvasRenderingContext2D, c: Creature, assets: Assets) {
  const img = assets.creatures[c.genome.sprite % assets.creatures.length]
  const ageScale = c.isAvatar || isMature(c) ? 1 : 0.5 + 0.5 * Math.min(1, ageYears(c) / 16)
  const w = (22 + c.genome.size * 18) * ageScale

  ctx.save()
  ctx.globalAlpha = c.isAvatar ? 0.5 : Math.max(0.12, Math.min(0.4, c.energy / 120))
  ctx.fillStyle = `hsl(${c.genome.hue}, 70%, 55%)`
  ctx.beginPath(); ctx.arc(c.x, c.y - w * 0.35, w * 0.7, 0, Math.PI * 2); ctx.fill()
  ctx.restore()

  ctx.save()
  ctx.globalAlpha = c.isAvatar ? 1 : Math.max(0.45, Math.min(1, c.energy / 70))
  ctx.translate(c.x, c.y)
  if (c.facing < 0) ctx.scale(-1, 1)
  if (img && img.naturalWidth > 0) { ctx.imageSmoothingEnabled = false; ctx.drawImage(img, -w / 2, -w, w, w) }
  else { ctx.fillStyle = `hsl(${c.genome.hue}, 60%, 60%)`; ctx.beginPath(); ctx.arc(0, -w / 2, w / 2, 0, Math.PI * 2); ctx.fill() }
  ctx.restore()

  if (c.sick) {
    ctx.font = "bold 12px ui-monospace, monospace"; ctx.textAlign = "center"
    ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillText("✚", c.x + 1, c.y - w - 3)
    ctx.fillStyle = "#8fe39a"; ctx.fillText("✚", c.x, c.y - w - 4); ctx.textAlign = "left"
  }
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string) {
  ctx.font = "11px ui-monospace, monospace"; ctx.textAlign = "center"
  ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.fillText(text, x + 1, y + 1)
  ctx.fillStyle = color; ctx.fillText(text, x, y); ctx.textAlign = "left"
}

const TRAITS = [
  { key: "speed", color: "#ff7b7b", label: "velocidad" },
  { key: "vision", color: "#7bd0ff", label: "visión" },
  { key: "size", color: "#9cff7b", label: "tamaño" },
  { key: "metabolism", color: "#ffd166", label: "metabolismo" },
] as const

export function drawChart(ctx: CanvasRenderingContext2D, world: World, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = "rgba(8,14,20,0.78)"; ctx.fillRect(x, y, w, h)
  ctx.strokeStyle = "rgba(255,255,255,0.12)"; ctx.strokeRect(x + 0.5, y + 0.5, w, h)
  const hist = world.history
  if (hist.length < 2) {
    ctx.fillStyle = "rgba(255,255,255,0.4)"; ctx.font = "11px ui-monospace, monospace"
    ctx.fillText("recolectando datos…", x + 10, y + h / 2); return
  }
  const norm = (key: string, v: number) => { const b = (TRAIT_BOUNDS as any)[key] as readonly [number, number]; return (v - b[0]) / (b[1] - b[0]) }
  for (const t of TRAITS) {
    ctx.strokeStyle = t.color; ctx.lineWidth = 1.5; ctx.beginPath()
    hist.forEach((s, i) => {
      const px = x + (i / (hist.length - 1)) * w
      const py = y + h - norm(t.key, (s as any)[t.key]) * (h - 4) - 2
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)
    })
    ctx.stroke()
  }
  ctx.font = "10px ui-monospace, monospace"
  TRAITS.forEach((t, i) => { ctx.fillStyle = t.color; ctx.fillText("● " + t.label, x + 8 + (i % 2) * 95, y + 12 + Math.floor(i / 2) * 13) })
}
