// render.ts — draw the TOWN through a camera (zoom + follow): streets, houses, gardens, food, and
// creatures; plus a screen-space HUD chart. The camera transform is applied for the world, then
// reset so the chart/labels-overlay draw in screen pixels.

import { World, Creature, House, ageYears, isMature, seasonOf, WORLD_W, WORLD_H, BLOCK, ROAD_HALF } from "./world"
import { Assets } from "./sprites"
import { TRAIT_BOUNDS } from "./genome"
import { EMO } from "./life"
import { emojiOf, SPECIES, enemyEmoji } from "./animals"

export interface Cam { x: number; y: number; zoom: number }

// the 2D view now uses the SAME generated characters as the 3D (so they match) + pixel-art house sprites
let vehT = 0 // real-time animation clock for vehicles (so they move even when the world is slow)
let wT = 0   // walk-cycle clock for the people's bob + sway
const seedR = (s: number) => { const x = Math.sin(s) * 43758.5453; return x - Math.floor(x) }
// vehicles appear with the era: carts (3+), trains (9+), cars (10+), planes (11+). Decorative, on roads.
function drawVehicles(ctx: CanvasRenderingContext2D, world: World, t: number) {
  const era = world.era
  if (era < 3) return
  const cols = Math.floor(WORLD_W / BLOCK), rows = Math.floor(WORLD_H / BLOCK)
  const N = era >= 9 ? 16 : 9
  for (let i = 0; i < N; i++) {
    const s = i * 1.7
    const vertical = seedR(s) < 0.5
    const lane = BLOCK * (1 + Math.floor(seedR(s + 1) * ((vertical ? cols : rows) - 1)))
    const dir = seedR(s + 2) < 0.5 ? 1 : -1
    const spd = 0.6 + seedR(s + 3) * 1.3
    const len = vertical ? WORLD_H : WORLD_W
    const along = (((t * spd * dir) + seedR(s + 4) * len) % len + len) % len
    const x = vertical ? lane : along, y = vertical ? along : lane
    let w = 6, h = 11, col = "#a87c4a" // cart
    if (era >= 9 && i % 5 === 0) { h = 26; col = "#3a3a44" } // train (long)
    else if (era >= 10) { w = 5; h = 9; col = i % 2 ? "#d8d8e0" : "#c06060" } // car
    ctx.fillStyle = col
    if (vertical) ctx.fillRect(x - w / 2, y - h / 2, w, h)
    else ctx.fillRect(x - h / 2, y - w / 2, h, w)
  }
  if (era >= 11) for (let i = 0; i < 3; i++) { // planes fly above the grid
    const s = 50 + i * 3.3
    const px = (t * 1.8 + seedR(s) * WORLD_W) % WORLD_W, py = 120 + seedR(s + 1) * (WORLD_H - 240)
    ctx.fillStyle = "rgba(220,230,245,0.9)"
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - 16, py - 5); ctx.lineTo(px - 16, py + 5); ctx.closePath(); ctx.fill()
  }
}

// a bright, cohesive "cozy town" palette — grass by biome × season (spring, summer, autumn, winter)
const REGION_GROUND = [
  ["#7cb15e", "#6fa854", "#b09a52", "#aeb6a4"], // templado
  ["#74a37c", "#6f9e74", "#9aa45e", "#c2cabe"], // frío/norteño
  ["#c6b277", "#cbb672", "#c2a35e", "#cabf94"], // cálido/desierto
  ["#5ea65a", "#56a052", "#86994e", "#8fb086"], // selvático
]
const PATH_COL = ["#cbb083", "#cbb083", "#c2a875", "#c4bca8"] // warm dirt path, paler in winter
const SKIN = ["#f8d5b4", "#f4cba6", "#eebf96", "#e0ac82", "#d79e6f", "#c68a52", "#b07a48", "#9c6b43", "#84572f", "#6b4524"]
const HAIR = ["#15110c", "#2a1d12", "#3d2a18", "#4a3220", "#6b4a2e", "#8a6a3a", "#b89048", "#d8b25a", "#b0461f", "#7a3a1a", "#d6cfc4"] // black→brown→blonde→ginger; grey last (for ageing)
const CAT_COLOR: Record<string, string> = {
  comida: "#9cff7b", salud: "#ff8c8c", saber: "#9bb8ff", enseñanza: "#7bd0ff", construcción: "#c9a06a",
  oficio: "#d9b25a", arte: "#ff9bdd", liderazgo: "#ffd166", comercio: "#7be0c0", exploración: "#8fd6ff",
  defensa: "#ff7b7b", espíritu: "#c79bff", ingeniería: "#aebfff", cuidado: "#ffb3c9",
}

export function drawWorld(
  ctx: CanvasRenderingContext2D,
  world: World,
  assets: Assets,
  avatar: Creature | null,
  chatTarget: Creature | null,
  promptTalk: boolean,
  cam: Cam,
  hovered: Creature | null = null,
  speech: { x: number; y: number; tag: string; text: string; understood: boolean }[] = [],
) {
  const cw = ctx.canvas.width, ch = ctx.canvas.height
  ctx.fillStyle = "#06090d"
  ctx.fillRect(0, 0, cw, ch)

  ctx.save()
  ctx.translate(cw / 2, ch / 2)
  ctx.scale(cam.zoom, cam.zoom)
  ctx.translate(-cam.x, -cam.y)

  // ground — tinted by the country's biome + the season
  ctx.fillStyle = REGION_GROUND[world.region % REGION_GROUND.length][seasonOf(world.clockDays)]
  ctx.fillRect(0, 0, WORLD_W, WORLD_H)
  // scattered trees + bushes give the land texture (deterministic positions, seasonal colour)
  const sea = seasonOf(world.clockDays)
  const leaf = sea === 3 ? "#9fb39a" : sea === 2 ? "#c79a3e" : "#4e9442", leafHi = sea === 3 ? "#b6c6b0" : sea === 2 ? "#dcb45a" : "#69ab52"
  for (let i = 0; i < 80; i++) {
    const px = seedR(i * 1.3) * WORLD_W, py = seedR(i * 2.7 + 5) * WORLD_H
    const onRoad = Math.abs((px % BLOCK) - BLOCK / 2) > BLOCK / 2 - ROAD_HALF - 4 || Math.abs((py % BLOCK) - BLOCK / 2) > BLOCK / 2 - ROAD_HALF - 4
    if (onRoad) continue
    const r = 6 + seedR(i * 3.1) * 8
    ctx.fillStyle = "rgba(40,60,30,0.16)"; ctx.beginPath(); ctx.ellipse(px + 3, py + r * 0.75, r * 1.05, r * 0.42, 0, 0, Math.PI * 2); ctx.fill() // shadow
    ctx.fillStyle = "#6b4a2e"; ctx.fillRect(px - 1.5, py - 2, 3, r * 0.8) // little trunk
    ctx.fillStyle = leaf; ctx.beginPath(); ctx.arc(px, py - r * 0.5, r, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = leafHi; ctx.beginPath(); ctx.arc(px - r * 0.3, py - r * 0.8, r * 0.5, 0, Math.PI * 2); ctx.fill() // sun-lit top
  }

  // gardens (where food grows) — a tilled patch with rows of crops that green up in summer, fade in winter
  const season = seasonOf(world.clockDays)
  const cropCol = season === 3 ? "rgba(150,160,120,0.5)" : season === 2 ? "rgba(170,150,70,0.55)" : "rgba(90,170,80,0.6)" // winter pale, autumn gold, else green
  for (const g of world.gardens) {
    ctx.fillStyle = season === 3 ? "rgba(120,135,120,0.12)" : "rgba(70,150,90,0.12)"
    ctx.beginPath(); ctx.arc(g.x, g.y, 95, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = cropCol // little crop tufts in rows (deterministic so they don't shimmer)
    for (let i = 0; i < 22; i++) { const a = i * 2.39996, r = 18 + (i % 6) * 13; const px = g.x + Math.cos(a) * r, py = g.y + Math.sin(a) * r * 0.8; ctx.fillRect(px - 1, py - 4, 2, 5) }
  }

  // streets — warm dirt paths (cobbled in modern eras), with a worn centre line
  const path = world.era >= 9 ? "#b3ada3" : PATH_COL[sea]
  ctx.fillStyle = path
  for (let x = BLOCK; x < WORLD_W; x += BLOCK) ctx.fillRect(x - ROAD_HALF, 0, ROAD_HALF * 2, WORLD_H)
  for (let y = BLOCK; y < WORLD_H; y += BLOCK) ctx.fillRect(0, y - ROAD_HALF, WORLD_W, ROAD_HALF * 2)
  ctx.fillStyle = "rgba(90,70,40,0.13)"
  for (let x = BLOCK; x < WORLD_W; x += BLOCK) ctx.fillRect(x - 1, 0, 2, WORLD_H)
  for (let y = BLOCK; y < WORLD_H; y += BLOCK) ctx.fillRect(0, y - 1, WORLD_W, 2)

  // occupancy: who's currently home (near their own house) → drives the lit windows + the head-count
  const present = new Map<House, number>()
  for (const c of world.creatures) {
    if (c.isAvatar) continue
    const hx = c.home.x + c.home.w / 2, hy = c.home.y + c.home.h / 2
    if ((c.x - hx) ** 2 + (c.y - hy) ** 2 < 80 * 80) present.set(c.home, (present.get(c.home) || 0) + 1)
  }

  // houses — drawn procedurally in ONE cohesive style: walls + pitched roof (or a flat-roofed block for
  // apartment buildings), tier drives the height + grandeur, lights warm up at night when someone's home.
  const nightNow = (() => { const h = (world.clockMinutes % 1440) / 60; return h < 6 || h >= 19 })()
  for (const h of world.houses) {
    const n = present.get(h) || 0, tier = h.tier || 0, cx = h.x + h.w / 2, lit = n > 0
    const wallH = tier === 4 ? 34 + tier * 5 + h.h * 0.3 : 8 + tier * 5
    const roofH = tier === 4 ? 0 : 16 + tier * 5
    const topY = h.y + h.h - wallH
    ctx.save(); ctx.globalAlpha = 0.17; ctx.fillStyle = "#243012" // soft grounded shadow
    ctx.beginPath(); ctx.ellipse(cx + 5, h.y + h.h + 1, h.w * 0.62, h.h * 0.34, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore()
    const wall = `hsl(${h.hue}, 24%, ${lit ? 74 : 68}%)`, wallSh = `hsl(${h.hue}, 24%, ${lit ? 60 : 55}%)`
    ctx.fillStyle = wall; ctx.fillRect(h.x, topY, h.w, wallH)
    ctx.fillStyle = wallSh; ctx.fillRect(h.x + h.w * 0.74, topY, h.w * 0.26, wallH) // right-side shading for volume
    const winC = nightNow && lit ? "#ffd98a" : "rgba(176,206,236,0.9)"
    if (tier === 4) { // APARTMENT BLOCK — flat roof + grid of windows
      ctx.fillStyle = `hsl(${h.hue}, 28%, 44%)`; ctx.fillRect(h.x - 2, topY - 5, h.w + 4, 6)
      const rows = Math.max(2, Math.floor(wallH / 16))
      for (let r = 0; r < rows; r++) for (let cI = 0; cI < 3; cI++) { ctx.fillStyle = winC; ctx.fillRect(h.x + 6 + cI * (h.w - 12) / 3, topY + 7 + r * 15, (h.w - 12) / 3 - 5, 8) }
    } else { // pitched roof
      ctx.fillStyle = `hsl(${(h.hue + 14) % 360}, 40%, 44%)`; ctx.beginPath(); ctx.moveTo(h.x - 6, topY + 2); ctx.lineTo(h.x + h.w + 6, topY + 2); ctx.lineTo(cx, topY - roofH); ctx.closePath(); ctx.fill()
      ctx.fillStyle = "rgba(0,0,0,0.13)"; ctx.beginPath(); ctx.moveTo(cx, topY - roofH); ctx.lineTo(h.x + h.w + 6, topY + 2); ctx.lineTo(cx, topY + 2); ctx.closePath(); ctx.fill()
      ctx.fillStyle = "#5d4733"; ctx.fillRect(cx - 6, h.y + h.h - 15, 12, 15) // door
      ctx.fillStyle = winC; if (h.w > 30) { ctx.fillRect(h.x + 7, topY + 7, 9, 9); ctx.fillRect(h.x + h.w - 16, topY + 7, 9, 9) } else ctx.fillRect(cx - 5, topY + 7, 10, 9)
    }
    if (lit && world.era < 12) { // hearth smoke from a lived-in home
      ctx.save(); ctx.fillStyle = "rgba(225,225,230,0.4)"
      for (let s = 0; s < 3; s++) { const t = (wT * 0.4 + s * 9 + h.x) % 27; ctx.globalAlpha = 0.32 * (1 - t / 27); ctx.beginPath(); ctx.arc(h.x + h.w * 0.7 + Math.sin(t * 0.3 + s) * 5, topY - roofH - t, 3 + t * 0.12, 0, Math.PI * 2); ctx.fill() }
      ctx.restore()
    }
    if (nightNow && lit) { // warm light pooling around an occupied home
      ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.45
      const gg = ctx.createRadialGradient(cx, topY + wallH * 0.5, 2, cx, topY + wallH * 0.5, h.w * 0.9)
      gg.addColorStop(0, "rgba(255,205,120,0.85)"); gg.addColorStop(1, "rgba(255,205,120,0)")
      ctx.fillStyle = gg; ctx.fillRect(h.x - h.w, topY - wallH, h.w * 3, wallH * 3); ctx.restore()
    }
    if (n > 0) {
      const txt = `👥 ${n}`; ctx.font = "bold 12px ui-monospace, monospace"; ctx.textAlign = "center"
      const bw = ctx.measureText(txt).width + 12
      ctx.fillStyle = "rgba(20,28,16,0.8)"; ctx.beginPath(); ctx.roundRect(cx - bw / 2, topY - (tier === 4 ? 16 : 16 + tier * 5) - 22, bw, 18, 6); ctx.fill()
      ctx.fillStyle = "#ffe6a3"; ctx.fillText(txt, cx, topY - (tier === 4 ? 16 : 16 + tier * 5) - 9); ctx.textAlign = "left"
    }
    if (cam.zoom > 1.1) label(ctx, h.surname, cx, h.y + h.h + 13, "rgba(70,90,60,0.85)")
  }

  // schools — distinct civic buildings; the cultural ratchet flows through here
  for (const s of world.schools) {
    ctx.fillStyle = "hsl(205, 36%, 38%)"
    ctx.fillRect(s.x, s.y, s.w, s.h)
    ctx.fillStyle = "hsl(205, 42%, 25%)" // roof
    ctx.beginPath(); ctx.moveTo(s.x - 8, s.y); ctx.lineTo(s.x + s.w + 8, s.y); ctx.lineTo(s.x + s.w / 2, s.y - 28); ctx.closePath(); ctx.fill()
    ctx.fillStyle = "rgba(186,214,255,0.55)" // window row
    for (let i = 0; i < 3; i++) ctx.fillRect(s.x + 14 + i * 28, s.y + 20, 16, 22)
    ctx.fillStyle = "rgba(0,0,0,0.5)" // door
    ctx.fillRect(s.x + s.w / 2 - 10, s.y + s.h - 24, 20, 24)
    label(ctx, "📚 escuela", s.x + s.w / 2, s.y - 36, "#bcd9ff")
  }

  // universities — civic landmark, built when discovered; gate the advanced professions
  for (const u of world.universities) {
    ctx.fillStyle = "hsl(45, 28%, 50%)"
    ctx.fillRect(u.x, u.y, u.w, u.h)
    ctx.fillStyle = "rgba(255,250,235,0.85)" // columns
    for (let i = 0; i < 5; i++) ctx.fillRect(u.x + 12 + i * ((u.w - 28) / 4), u.y + 18, 8, u.h - 32)
    ctx.fillStyle = "hsl(45, 32%, 38%)" // pediment
    ctx.beginPath(); ctx.moveTo(u.x - 12, u.y + 18); ctx.lineTo(u.x + u.w + 12, u.y + 18); ctx.lineTo(u.x + u.w / 2, u.y - 24); ctx.closePath(); ctx.fill()
    label(ctx, "🏛️ universidad", u.x + u.w / 2, u.y - 32, "#ffe9b8")
  }

  // airport — the gateway between countries
  {
    const a = world.airport
    ctx.fillStyle = "rgba(40,48,56,0.9)"; ctx.fillRect(a.x - 44, a.y + a.h - 16, a.w + 88, 14) // runway
    ctx.strokeStyle = "rgba(255,220,120,0.5)"; ctx.setLineDash([7, 7]); ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(a.x - 40, a.y + a.h - 9); ctx.lineTo(a.x + a.w + 40, a.y + a.h - 9); ctx.stroke(); ctx.setLineDash([])
    ctx.fillStyle = "hsl(210, 12%, 32%)"; ctx.fillRect(a.x, a.y, a.w, a.h) // terminal
    ctx.fillStyle = "rgba(150,200,255,0.5)"; for (let i = 0; i < 4; i++) ctx.fillRect(a.x + 12 + i * 26, a.y + 16, 18, 22)
    label(ctx, "✈ aeropuerto", a.x + a.w / 2, a.y - 12, "#cfe0ee")
  }

  vehT += 1.3; wT += 1
  drawVehicles(ctx, world, vehT)

  // AMBIENT drift: pale pollen motes by day, glimmering fireflies by night
  for (let i = 0; i < 44; i++) {
    const bx = (seedR(i * 1.7) * WORLD_W + wT * 0.3) % WORLD_W
    const by = seedR(i * 2.3 + 1) * WORLD_H + Math.sin(wT * 0.05 + i) * 12
    ctx.fillStyle = nightNow ? `rgba(255,232,150,${0.3 + 0.4 * (0.5 + 0.5 * Math.sin(wT * 0.12 + i))})` : "rgba(255,255,255,0.16)"
    ctx.beginPath(); ctx.arc(bx, by, nightNow ? 1.8 : 1.2, 0, Math.PI * 2); ctx.fill()
  }
  if (!nightNow) for (let b = 0; b < 3; b++) { // a few birds drift across the sky by day
    const bx = (wT * 1.1 + b * 360 + seedR(b * 9) * WORLD_W) % WORLD_W, by = 70 + b * 80 + Math.sin(wT * 0.04 + b) * 18
    ctx.strokeStyle = "rgba(40,45,55,0.5)"; ctx.lineWidth = 1.4
    ctx.beginPath(); ctx.moveTo(bx - 6, by); ctx.lineTo(bx, by - 4); ctx.lineTo(bx + 6, by); ctx.stroke()
  }

  // market square — stalls, work stations + benches the townsfolk claim + stand at (brighter when in use)
  for (const p of world.pois) {
    const occ = p.by !== 0
    ctx.save(); ctx.globalAlpha = 0.15; ctx.fillStyle = "#2a2010"; ctx.beginPath(); ctx.ellipse(p.x, p.y + 6, 12, 4, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore()
    if (p.kind === "market") {
      ctx.fillStyle = "#8a5a3a"; ctx.fillRect(p.x - 12, p.y - 2, 24, 8)
      ctx.fillStyle = occ ? "#d96a4a" : "#bb8460"; ctx.beginPath(); ctx.moveTo(p.x - 15, p.y - 13); ctx.lineTo(p.x + 15, p.y - 13); ctx.lineTo(p.x + 12, p.y - 3); ctx.lineTo(p.x - 12, p.y - 3); ctx.closePath(); ctx.fill()
      ctx.fillStyle = "rgba(255,255,255,0.5)"; for (let s = -1; s <= 1; s++) ctx.fillRect(p.x + s * 9 - 1, p.y - 13, 2, 10)
    } else if (p.kind === "work") {
      ctx.fillStyle = occ ? "#9a7a4a" : "#7a6038"; ctx.fillRect(p.x - 9, p.y - 3, 18, 7); ctx.fillStyle = "#5a4528"; ctx.fillRect(p.x - 9, p.y + 3, 3, 5); ctx.fillRect(p.x + 6, p.y + 3, 3, 5)
    } else {
      ctx.fillStyle = occ ? "#a07848" : "#86663c"; ctx.fillRect(p.x - 11, p.y - 1, 22, 4); ctx.fillRect(p.x - 9, p.y + 3, 2, 5); ctx.fillRect(p.x + 7, p.y + 3, 2, 5)
    }
  }

  // graves — where respected elders are remembered (small headstones, name shown up close)
  for (const gr of world.graves) {
    ctx.fillStyle = "#8a8a7a"; ctx.fillRect(gr.x - 3, gr.y - 8, 6, 9); ctx.fillRect(gr.x - 5, gr.y - 5, 10, 3)
    if (cam.zoom > 1.6) { ctx.font = "8px ui-monospace, monospace"; ctx.fillStyle = "rgba(200,200,210,0.6)"; ctx.textAlign = "center"; ctx.fillText(gr.name, gr.x, gr.y - 12); ctx.textAlign = "left" }
  }

  // animals — wild beasts (predators ringed red) + tamed livestock/pets (green collar)
  for (const a of world.animals) {
    ctx.save(); ctx.globalAlpha = 0.22; ctx.fillStyle = "#000"; ctx.beginPath(); ctx.ellipse(a.x, a.y + 6, 12, 5, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore()
    if (SPECIES[a.kind]?.hostile && !a.tame) { ctx.strokeStyle = "rgba(255,80,80,0.6)"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(a.x, a.y, 15, 0, Math.PI * 2); ctx.stroke() }
    else if (a.tame) { ctx.strokeStyle = "rgba(110,227,154,0.55)"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(a.x, a.y, 14, 0, Math.PI * 2); ctx.stroke() }
    ctx.font = "20px serif"; ctx.textAlign = "center"; ctx.fillText(emojiOf(a.kind), a.x, a.y + 7); ctx.textAlign = "left"
  }
  // RAIDERS — invaders from beyond the map (pulsing red menace)
  for (const r of world.raiders) {
    ctx.save(); ctx.globalAlpha = 0.22; ctx.fillStyle = "#000"; ctx.beginPath(); ctx.ellipse(r.x, r.y + 6, 11, 5, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore()
    ctx.strokeStyle = "rgba(255,40,40,0.85)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(r.x, r.y, 16 + Math.sin(wT * 0.3 + r.x) * 2, 0, Math.PI * 2); ctx.stroke()
    ctx.font = "21px serif"; ctx.textAlign = "center"; ctx.fillText(enemyEmoji(r.kind), r.x, r.y + 7); ctx.textAlign = "left"
  }

  // food
  const foodOk = assets.food.naturalWidth > 0
  for (const f of world.food) {
    if (foodOk) ctx.drawImage(assets.food, f.x - 7, f.y - 11, 14, 14)
    else { ctx.fillStyle = "#3fb56b"; ctx.beginPath(); ctx.arc(f.x, f.y, 3, 0, Math.PI * 2); ctx.fill() }
  }

  // creatures
  // DEPTH: draw people sorted front-to-back by their feet (y), so those in front overlap those behind
  const folk = world.creatures.filter((c) => !c.isAvatar).sort((a, b) => a.y - b.y)
  for (const c of folk) {
    // if they've reached the spot they claimed, they're at their station → a working / seated pose
    let atSpot: string | null = null
    if (c.poi !== undefined && c.poi >= 0) { const p = world.pois[c.poi]; if (p && p.by === c.id && (c.x - p.x) ** 2 + (c.y - p.y) ** 2 < 26 * 26) atSpot = p.kind }
    drawCreature(ctx, c, world.era, atSpot)
  }

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
    drawCreature(ctx, avatar, world.era)
    label(ctx, "Tú", avatar.x, avatar.y - 24 - avatar.genome.size * 10, "#ffe6a3")
  }

  // overheard chatter — floating speech bubbles (visible only when you're near)
  for (const s of speech) {
    ctx.font = "12px ui-monospace, monospace"
    const full = `${s.tag} ${s.text}`
    const tw = Math.min(280, ctx.measureText(full).width)
    const bw = tw + 18, bx = s.x - bw / 2, by = s.y - 54
    ctx.fillStyle = "rgba(12,18,26,0.92)"
    ctx.strokeStyle = s.understood ? "rgba(150,200,255,0.5)" : "rgba(150,160,170,0.35)"; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(bx, by, bw, 24, 8); ctx.fill(); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(s.x - 5, by + 24); ctx.lineTo(s.x + 5, by + 24); ctx.lineTo(s.x, by + 31); ctx.closePath(); ctx.fill()
    ctx.textAlign = "center"; ctx.fillStyle = s.understood ? "#e6f0fa" : "#8a98a6"
    ctx.fillText(full, s.x, by + 16, tw)
    ctx.textAlign = "left"
  }

  // hover label (quick identity without clicking)
  if (hovered && hovered !== chatTarget && !hovered.isAvatar) {
    const t = `${hovered.name} · ${hovered.profession || "sin oficio"} · ${Math.round(ageYears(hovered))}a`
    label(ctx, t, hovered.x, hovered.y - 28 - hovered.genome.size * 10, "#e6f0fa")
  }

  ctx.restore()

  // DAY/NIGHT: a colour wash over the whole scene follows the in-world hour (dawn glow → bright day → dusk → night)
  const hr = (world.clockMinutes % 1440) / 60
  let tint = ""
  if (hr < 5 || hr >= 21) tint = "rgba(28,38,80,0.32)"           // night, cool blue (lighter so it stays readable)
  else if (hr < 7) tint = "rgba(255,170,110,0.14)"              // dawn, warm
  else if (hr < 17) tint = ""                                    // bright day
  else if (hr < 19) tint = "rgba(255,175,90,0.12)"             // late afternoon, golden
  else tint = "rgba(110,90,150,0.20)"                            // dusk, violet
  if (tint) { ctx.fillStyle = tint; ctx.fillRect(0, 0, cw, ch) }

  // a gentle vignette for depth (kept light so the town stays bright + cheerful)
  const vg = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.45, cw / 2, ch / 2, Math.max(cw, ch) * 0.78)
  vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.18)")
  ctx.fillStyle = vg; ctx.fillRect(0, 0, cw, ch)

  drawMinimap(ctx, world, avatar, cam, cw, ch)
}

function drawMinimap(ctx: CanvasRenderingContext2D, world: World, avatar: Creature | null, cam: Cam, cw: number, ch: number) {
  const mw = 178, mh = Math.round(mw * (WORLD_H / WORLD_W))
  const ox = cw - mw - 16, oy = ch - mh - 16
  const sx = mw / WORLD_W, sy = mh / WORLD_H
  ctx.fillStyle = "rgba(6,10,14,0.82)"; ctx.fillRect(ox, oy, mw, mh)
  ctx.strokeStyle = "rgba(255,255,255,0.12)"; ctx.strokeRect(ox + 0.5, oy + 0.5, mw, mh)
  ctx.fillStyle = "rgba(80,160,100,0.45)"
  for (const g of world.gardens) ctx.fillRect(ox + g.x * sx - 1, oy + g.y * sy - 1, 3, 3)
  for (const a of world.animals) { ctx.fillStyle = a.tame ? "rgba(110,227,154,0.9)" : SPECIES[a.kind]?.hostile ? "rgba(255,70,70,0.95)" : "rgba(220,200,120,0.8)"; ctx.fillRect(ox + a.x * sx - 1, oy + a.y * sy - 1, 2.5, 2.5) } // beasts: red=predator, green=tame
  ctx.fillStyle = "rgba(255,30,30,1)"; for (const r of world.raiders) ctx.fillRect(ox + r.x * sx - 2, oy + r.y * sy - 2, 4, 4) // invaders flash big + red
  for (const c of world.creatures) {
    if (c.isAvatar) continue
    ctx.fillStyle = `hsl(${c.genome.hue},65%,62%)`
    ctx.fillRect(ox + c.x * sx, oy + c.y * sy, 1.6, 1.6)
  }
  if (avatar) { ctx.fillStyle = "#ffd76a"; ctx.fillRect(ox + avatar.x * sx - 1.5, oy + avatar.y * sy - 1.5, 3, 3) }
  const halfW = cw / (2 * cam.zoom), halfH = ch / (2 * cam.zoom)
  ctx.strokeStyle = "rgba(255,231,106,0.7)"; ctx.lineWidth = 1
  ctx.strokeRect(ox + (cam.x - halfW) * sx, oy + (cam.y - halfH) * sy, 2 * halfW * sx, 2 * halfH * sy)
}

// each person's deterministic look, STABLE across their whole life, but it CHANGES as they age + by their lot.
// PERF: a person's look is stable except across age-stage / wealth / condition changes — so cache it and only
// recompute when one of those buckets flips (was recomputed 280×/frame).
const _lookCache = new WeakMap<Creature, { sig: string; look: ReturnType<typeof computeAppear> }>()
function appear(c: Creature, era = 5): ReturnType<typeof computeAppear> {
  const ay = ageYears(c)
  const stage = ay < 2 ? 0 : ay < 13 ? 1 : ay < 19 ? 2 : ay < 55 ? 3 : 4
  const grey = ay < 28 ? 0 : ay < 46 ? 1 : ay < 62 ? 2 : 3
  const sig = `${stage}|${grey}|${era}|${c.profCat}|${c.money > 700 ? 2 : c.money > 120 ? 1 : 0}|${c.life?.condition || ""}|${(c.pregnant || 0) > 0 ? 1 : 0}`
  const hit = _lookCache.get(c)
  if (hit && hit.sig === sig) return hit.look
  const look = computeAppear(c, era)
  _lookCache.set(c, { sig, look })
  return look
}
function computeAppear(c: Creature, era = 5) {
  // seed the look from HERITABLE genome (hue + sprite), not the id — so children resemble their parents,
  // and family lines share a look. recombine() mixes these at birth, so siblings are alike but not identical.
  const g = c.genome as { hue: number; sprite?: number }
  const seed = Math.abs(g.hue * 7.13 + (g.sprite || 0) * 31.7 + (Math.abs(c.id) % 3)) + 1
  const r = (n: number) => { const x = Math.sin(seed * 12.9898 + n * 78.233) * 43758.5; return x - Math.floor(x) }
  const ay = ageYears(c)
  const female = Math.abs(c.id) % 2 === 0
  const skin = c.isAvatar ? "#ffe0b0" : SKIN[Math.floor(r(1) * SKIN.length)]
  const base = HAIR[Math.floor(r(2) * (HAIR.length - 1))] // a coloured hair (not the grey swatch)
  const greyT = Math.max(0, Math.min(1, (ay - 46) / 32)) // hair greys + whitens with the years
  const hair = greyT > 0.62 ? "#d6cfc4" : greyT > 0.28 ? "#9a948a" : base
  const hairStyle = ay < 2 ? "none" : female ? (r(3) < 0.5 ? "long" : "bun") : r(3) < 0.16 ? "bald" : r(3) < 0.55 ? "short" : "crop"
  const beard = !female && ay > 22 && r(4) < 0.4 ? (r(5) < 0.5 ? "full" : "stubble") : "none"
  // CLOTHING by trade, wealth + era: a scholar's robe, a soldier's armour, a merchant's fine coat; the rich
  // wear brighter, trimmed cloth, the poor drab + patched; deep past = earthy furs, late eras = brighter dyes.
  const cat = c.profCat
  const garb = c.life?.condition === "sin techo" ? "rags" : cat === "defensa" ? "armour" : cat === "saber" || cat === "enseñanza" || cat === "espíritu" || cat === "salud" ? "robe" : cat === "comercio" || cat === "liderazgo" ? "fine" : cat === "comida" || cat === "construcción" || cat === "oficio" ? "work" : "tunic"
  const money = c.money || 0
  const wealth = garb === "rags" ? 0 : money > 700 ? 2 : money > 120 ? 1 : 0
  const sat = (garb === "rags" ? 8 : era <= 1 ? 22 : 30) + wealth * 10 + Math.floor(r(6) * 12)
  const lum = (garb === "rags" ? 36 : 46) + wealth * 6 + Math.floor(r(7) * 12)
  const cloth = c.isAvatar ? "#ffd34d" : garb === "armour" ? `hsl(${(c.genome.hue + 200) % 360}, 12%, 42%)` : `hsl(${c.genome.hue}, ${sat}%, ${lum}%)`
  // HEADWEAR + a tool in hand, by trade (only grown folk; not every soul wears one)
  const adult = ay >= 14
  const hat = !adult ? "none" : garb === "armour" && r(8) < 0.7 ? "helmet" : cat === "comida" && r(8) < 0.6 ? "straw" : cat === "liderazgo" ? "circlet" : garb === "fine" && wealth >= 1 && r(8) < 0.7 ? "tophat" : garb === "robe" && r(8) < 0.5 ? "hood" : "none"
  const prop = !adult || c.life?.condition === "locura" ? "none" : cat === "defensa" ? "spear" : cat === "saber" || cat === "enseñanza" ? "book" : cat === "espíritu" ? "staff" : cat === "comida" && r(9) < 0.6 ? "basket" : "none"
  // individual build: some stocky, some slim; some tall, some short — so no two share a silhouette
  const bw = 0.8 + r(10) * 0.4, bh = 0.9 + r(11) * 0.2
  const preg = (c.pregnant || 0) > 0 // an expecting mother carries a belly
  const freckles = r(12) < 0.24, rosy = ay < 12 || r(13) < 0.3 // freckles + rosy cheeks add little human touches
  return { ay, female, skin, hair, hairStyle, beard, cloth, garb, wealth, hat, prop, bw, bh, preg, freckles, rosy, r }
}

// draw a person built up from the feet (y=0). proportions shift across life: babies are tiny + big-headed,
// children small, teens lanky, adults full, elders a touch stooped — so you SEE someone grow + grow old.
function drawVillager(ctx: CanvasRenderingContext2D, c: Creature, w: number, moving: boolean, phase: number, era = 5, atSpot: string | null = null) {
  const ap = appear(c, era), ay = ap.ay
  const stage = ay < 2 ? 0 : ay < 13 ? 1 : ay < 19 ? 2 : ay < 55 ? 3 : 4 // baby child teen adult elder
  const hr = w * [0.5, 0.43, 0.37, 0.36, 0.35][stage]
  const H = w * [0.85, 1.12, 1.4, 1.5, 1.44][stage] * ap.bh
  const bw = ap.bw // individual girth
  const working = !moving && (atSpot === "market" || atSpot === "work"), seated = !moving && atSpot === "social"
  const workArm = working ? Math.max(0, Math.sin(wT * 0.5 + c.id)) * H * 0.28 : 0 // a hammering / handing-goods motion
  const sit = seated ? H * 0.22 : 0 // sink down onto the bench
  const swing = moving ? Math.sin(phase) * w * 0.13 : 0
  const legH = H * (stage <= 1 ? 0.24 : 0.3) - sit, hipY = -legH, shoY = -H * (stage === 0 ? 0.7 : 0.82) + sit, hcy = shoY - hr * 0.72
  const cloth = ap.cloth, clothSh = c.isAvatar ? "#e0b020" : `hsl(${c.genome.hue}, 40%, 40%)`
  // legs (step in opposition while walking; folded forward when seated)
  ctx.fillStyle = "#473828"
  if (seated) { ctx.fillRect(-w * 0.21, hipY, w * 0.16, Math.max(3, legH)); ctx.fillRect(-w * 0.05, hipY + legH - w * 0.14, w * 0.28, w * 0.14) }
  else { ctx.fillRect(-w * 0.21, hipY - swing * 0.4, w * 0.16, legH + swing * 0.4); ctx.fillRect(w * 0.05, hipY + swing * 0.4, w * 0.16, legH - swing * 0.4) }
  // arms swing opposite the legs (one arm lifts to work)
  ctx.fillStyle = cloth
  ctx.fillRect(-w * 0.38 * bw, shoY + w * 0.06 + swing * 0.4, w * 0.12, H * 0.42)
  ctx.fillRect((w * 0.26 * bw + w * 0.02), shoY + w * 0.06 - swing * 0.4 - workArm, w * 0.12, H * 0.42 - workArm * 0.3)
  // torso (individual girth)
  ctx.fillStyle = cloth; ctx.beginPath(); ctx.roundRect(-w * 0.3 * bw, shoY, w * 0.6 * bw, hipY - shoY + 3, w * 0.16); ctx.fill()
  ctx.fillStyle = clothSh; ctx.beginPath(); ctx.roundRect(w * 0.06 * bw, shoY, w * 0.24 * bw, hipY - shoY + 3, w * 0.12); ctx.fill()
  if (ap.preg) { ctx.fillStyle = cloth; ctx.beginPath(); ctx.arc(0, (shoY + hipY) / 2 + w * 0.1, w * 0.34 * bw, 0, Math.PI * 2); ctx.fill() } // an expecting belly
  // GARB — the cut of their clothes tells their trade + station (drawn over the legs where it's a robe/skirt)
  if (stage >= 2) {
    if (ap.garb === "robe") { ctx.fillStyle = cloth; ctx.beginPath(); ctx.moveTo(-w * 0.3, hipY - 2); ctx.lineTo(w * 0.3, hipY - 2); ctx.lineTo(w * 0.42, -1); ctx.lineTo(-w * 0.42, -1); ctx.closePath(); ctx.fill(); ctx.fillStyle = clothSh; ctx.fillRect(w * 0.04, hipY - 2, w * 0.3, legH) }
    else if (ap.garb === "armour") { ctx.fillStyle = "rgba(225,228,236,0.22)"; ctx.fillRect(-w * 0.34, shoY - 1, w * 0.68, w * 0.13); ctx.fillStyle = "#4a3a26"; ctx.fillRect(-w * 0.3, hipY - w * 0.12, w * 0.6, w * 0.08) }
    else if (ap.garb === "fine") { ctx.fillStyle = ap.wealth >= 2 ? "#e8c560" : "rgba(255,255,255,0.32)"; ctx.fillRect(-w * 0.04, shoY, w * 0.08, hipY - shoY) }
    else if (ap.garb === "work") { ctx.fillStyle = "rgba(110,82,46,0.55)"; ctx.fillRect(-w * 0.17, shoY + w * 0.16, w * 0.34, (hipY - shoY) * 0.82) }
    else if (ap.garb === "rags") { ctx.fillStyle = "rgba(0,0,0,0.28)"; ctx.fillRect(-w * 0.12, shoY + w * 0.22, w * 0.13, w * 0.13); ctx.fillRect(w * 0.1, hipY - w * 0.2, w * 0.1, w * 0.1) }
    if (ap.wealth >= 2 && ap.garb !== "rags") { ctx.fillStyle = "rgba(232,200,96,0.6)"; ctx.fillRect(-w * 0.3, hipY - 3, w * 0.6, 2.5) } // gold hem of the well-off
  }
  // head
  ctx.fillStyle = ap.skin; ctx.beginPath(); ctx.arc(0, hcy, hr, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = "rgba(0,0,0,0.10)"; ctx.beginPath(); ctx.arc(hr * 0.35, hcy, hr, -Math.PI * 0.5, Math.PI * 0.5); ctx.fill()
  // beard
  if (ap.beard !== "none") { ctx.fillStyle = ap.hair; ctx.globalAlpha *= ap.beard === "stubble" ? 0.45 : 1; ctx.beginPath(); ctx.arc(0, hcy + hr * 0.25, hr * 0.85, 0.1 * Math.PI, 0.9 * Math.PI); ctx.fill(); ctx.globalAlpha = ctx.globalAlpha / (ap.beard === "stubble" ? 0.45 : 1) }
  // hair by style
  ctx.fillStyle = ap.hair
  if (ap.hairStyle === "long") { ctx.beginPath(); ctx.roundRect(-hr * 1.05, hcy - hr * 0.4, hr * 2.1, hr * 1.7, hr * 0.6); ctx.fill(); ctx.fillStyle = ap.skin; ctx.beginPath(); ctx.arc(0, hcy + hr * 0.1, hr * 0.92, 0, Math.PI * 2); ctx.fill() }
  else if (ap.hairStyle === "bun") { ctx.beginPath(); ctx.arc(0, hcy - hr * 0.95, hr * 0.45, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(0, hcy - hr * 0.1, hr * 1.02, Math.PI * 1.02, Math.PI * 2.02); ctx.fill() }
  else if (ap.hairStyle === "bald") { ctx.beginPath(); ctx.arc(0, hcy + hr * 0.05, hr * 1.0, Math.PI * 1.15, Math.PI * 1.85); ctx.fill() } // just a fringe
  else if (ap.hairStyle !== "none") { ctx.beginPath(); ctx.arc(0, hcy - hr * (ap.hairStyle === "crop" ? 0.18 : 0.12), hr * 1.02, Math.PI * 1.0, Math.PI * 2.04); ctx.fill() }
  // an eye, when facing the camera — plus a mouth + brow that read their current MOOD
  if (c.facing >= 0) {
    const mad = c.life?.condition === "locura"
    const blink = !mad && Math.sin(wT * 0.05 + Math.abs(c.id) * 2.1) > 0.975 // an occasional blink brings them to life
    ctx.fillStyle = "rgba(30,20,15,0.78)"
    if (blink) ctx.fillRect(hr * 0.18, hcy + hr * 0.02, hr * 0.32, hr * 0.06)
    else { ctx.beginPath(); ctx.arc(hr * 0.34, hcy + hr * 0.04, hr * (mad ? 0.18 : 0.13), 0, Math.PI * 2); ctx.fill() }
    if (mad) { ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(hr * 0.34, hcy + hr * 0.04, hr * 0.26, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "rgba(20,10,5,0.85)"; ctx.beginPath(); ctx.arc(hr * 0.34, hcy + hr * 0.04, hr * 0.1, 0, Math.PI * 2); ctx.fill() } // wild eye
    const emo = c.life?.emotion, ei = c.life?.emoInt || 0, mx = hr * 0.22, my = hcy + hr * 0.46
    const happy = emo === "alegre" || emo === "enamorado" || emo === "orgulloso" || emo === "esperanzado"
    const sad = emo === "triste" || emo === "afligido" || emo === "asustado" || emo === "solo"
    ctx.strokeStyle = "rgba(45,28,20,0.6)"; ctx.lineWidth = Math.max(0.8, hr * 0.08); ctx.beginPath()
    if (happy && ei > 0.2) ctx.arc(mx, my - hr * 0.12, hr * 0.22, 0.12 * Math.PI, 0.88 * Math.PI)
    else if (sad && ei > 0.2) ctx.arc(mx, my + hr * 0.22, hr * 0.22, 1.12 * Math.PI, 1.88 * Math.PI)
    else { ctx.moveTo(mx - hr * 0.14, my); ctx.lineTo(mx + hr * 0.14, my) }
    ctx.stroke()
    if (emo === "enojado" && ei > 0.3) { ctx.beginPath(); ctx.moveTo(hr * 0.14, hcy - hr * 0.16); ctx.lineTo(hr * 0.52, hcy - hr * 0.02); ctx.stroke() } // furrowed brow
    if (ap.rosy) { ctx.fillStyle = "rgba(220,120,110,0.28)"; ctx.beginPath(); ctx.arc(hr * 0.5, hcy + hr * 0.34, hr * 0.18, 0, Math.PI * 2); ctx.fill() } // a rosy cheek
    if (ap.freckles && ap.beard === "none") { ctx.fillStyle = "rgba(120,75,45,0.5)"; for (let f = 0; f < 4; f++) ctx.fillRect(hr * (0.32 + (f % 2) * 0.22), hcy + hr * (0.2 + Math.floor(f / 2) * 0.16), hr * 0.07, hr * 0.07) } // freckles
  }
  if (c.sick) { ctx.fillStyle = "rgba(150,200,160,0.28)"; ctx.beginPath(); ctx.arc(0, hcy, hr, 0, Math.PI * 2); ctx.fill() } // a sickly pallor
  const cond = c.life?.condition
  if (cond === "sin techo") { ctx.fillStyle = "rgba(80,60,40,0.4)"; ctx.beginPath(); ctx.arc(-hr * 0.3, hcy + hr * 0.3, hr * 0.18, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(hr * 0.5, hcy + hr * 0.5, hr * 0.12, 0, Math.PI * 2); ctx.fill() } // grime of the street
  if (cond === "locura" || cond === "sin techo") { ctx.fillStyle = ap.hair; for (let t = 0; t < 5; t++) { const a = (t / 5) * Math.PI - Math.PI * 0.9; ctx.fillRect(Math.cos(a) * hr - hr * 0.04, hcy + Math.sin(a) * hr - hr * 0.3, hr * 0.09, hr * 0.4) } } // wild, unkempt tufts
  // HEADWEAR
  if (ap.hat === "helmet") { ctx.fillStyle = "#9098a4"; ctx.beginPath(); ctx.arc(0, hcy, hr * 1.05, Math.PI, 2 * Math.PI); ctx.fill(); ctx.fillRect(-hr * 1.05, hcy - 1, hr * 2.1, hr * 0.18); ctx.fillStyle = "#c2c8d2"; ctx.fillRect(-hr * 0.1, hcy - hr * 1.45, hr * 0.2, hr * 0.5) }
  else if (ap.hat === "straw") { ctx.fillStyle = "#c9a850"; ctx.beginPath(); ctx.arc(0, hcy - hr * 0.55, hr * 0.72, Math.PI, 2 * Math.PI); ctx.fill(); ctx.fillStyle = "#d8b86a"; ctx.beginPath(); ctx.ellipse(0, hcy - hr * 0.5, hr * 1.5, hr * 0.4, 0, 0, Math.PI * 2); ctx.fill() }
  else if (ap.hat === "circlet") { ctx.fillStyle = "#e8c560"; ctx.fillRect(-hr * 0.95, hcy - hr * 0.86, hr * 1.9, hr * 0.22); for (let p = -1; p <= 1; p++) { ctx.beginPath(); ctx.moveTo(p * hr * 0.5 - hr * 0.13, hcy - hr * 0.86); ctx.lineTo(p * hr * 0.5, hcy - hr * 1.18); ctx.lineTo(p * hr * 0.5 + hr * 0.13, hcy - hr * 0.86); ctx.fill() } }
  else if (ap.hat === "tophat") { ctx.fillStyle = "#2a2a30"; ctx.fillRect(-hr * 1.1, hcy - hr * 0.72, hr * 2.2, hr * 0.18); ctx.fillRect(-hr * 0.68, hcy - hr * 1.55, hr * 1.36, hr * 0.88) }
  else if (ap.hat === "hood") { ctx.fillStyle = clothSh; ctx.beginPath(); ctx.arc(0, hcy - hr * 0.08, hr * 1.16, Math.PI * 0.88, Math.PI * 2.12); ctx.fill() }
  // a tool in hand, to the side
  const px = w * 0.44, py = -H * 0.42
  if (ap.prop === "spear") { ctx.fillStyle = "#6b4a2e"; ctx.fillRect(px, -H * 0.98, w * 0.05, H * 0.98); ctx.fillStyle = "#aab0bc"; ctx.beginPath(); ctx.moveTo(px - w * 0.04, -H * 0.98); ctx.lineTo(px + w * 0.1, -H * 0.98); ctx.lineTo(px + w * 0.025, -H * 1.12); ctx.fill() }
  else if (ap.prop === "staff") { ctx.fillStyle = "#7a5a36"; ctx.fillRect(px, -H * 0.92, w * 0.05, H * 0.92); ctx.fillStyle = "#cfa94e"; ctx.beginPath(); ctx.arc(px + w * 0.025, -H * 0.95, w * 0.08, 0, Math.PI * 2); ctx.fill() }
  else if (ap.prop === "book") { ctx.fillStyle = "#8a3a2a"; ctx.fillRect(px - w * 0.02, py, w * 0.15, w * 0.19); ctx.fillStyle = "#e8e0d0"; ctx.fillRect(px + w * 0.06, py, w * 0.03, w * 0.19) }
  else if (ap.prop === "basket") { ctx.fillStyle = "#a07840"; ctx.beginPath(); ctx.arc(px + w * 0.05, py + w * 0.12, w * 0.12, 0, Math.PI); ctx.fill(); ctx.fillStyle = "#7fb05a"; ctx.fillRect(px - w * 0.04, py + w * 0.1, w * 0.18, w * 0.04) }
}

function drawCreature(ctx: CanvasRenderingContext2D, c: Creature, era: number, atSpot: string | null = null) {
  const ageScale = c.isAvatar || isMature(c) ? 1 : 0.5 + 0.5 * Math.min(1, ageYears(c) / 16)
  const w = (24 + c.genome.size * 16) * ageScale
  // inside their own house → drawn faint (they "went in"; the lit windows represent them)
  const hh = c.home
  const indoors = !c.isAvatar && c.x > hh.x - 2 && c.x < hh.x + hh.w + 2 && c.y > hh.y - 8 && c.y < hh.y + hh.h + 2
  const away = !c.isAvatar && (c.away || 0) > 0 // off on a journey to another town → drawn as a faint traveller
  const dim = away ? 0.22 : indoors ? 0.34 : 1

  // a natural walk: bob up + sway gently while moving (a still person stands quiet)
  const moving = !indoors && Math.abs(c.vx) + Math.abs(c.vy) > 0.15
  const phase = wT * 0.45 + c.id
  const bob = moving ? Math.abs(Math.sin(phase)) * w * 0.07 : Math.sin(wT * 0.08 + c.id) * w * 0.013 // walk bounce, or a gentle breathing when still
  const sway = moving ? Math.sin(phase) * 0.05 : Math.sin(wT * 0.025 + c.id) * 0.016 // walk sway, or a subtle idle weight-shift

  // RENOWN: a soul who has earned great regard over their life carries a soft golden aura — earned, not given
  const rep = c.life?.rep || 0
  if (!c.isAvatar && rep > 0.5 && !indoors) {
    ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = Math.min(0.5, (rep - 0.5) * 0.9)
    const gg = ctx.createRadialGradient(c.x, c.y - w * 0.8, 2, c.x, c.y - w * 0.8, w * 1.3)
    gg.addColorStop(0, "rgba(255,220,120,0.7)"); gg.addColorStop(1, "rgba(255,220,120,0)")
    ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(c.x, c.y - w * 0.8, w * 1.3, 0, Math.PI * 2); ctx.fill(); ctx.restore()
  }
  // soft ground shadow — grounds the figure + gives the scene depth
  ctx.save()
  ctx.globalAlpha = 0.2 * dim
  ctx.fillStyle = "#000"
  ctx.beginPath(); ctx.ellipse(c.x, c.y, w * 0.4, w * 0.15, 0, 0, Math.PI * 2); ctx.fill()
  ctx.restore()

  ctx.save()
  ctx.globalAlpha = (c.isAvatar ? 1 : Math.max(0.9, Math.min(1, c.energy / 55))) * dim // solid, so the grass doesn't tint them
  ctx.translate(c.x, c.y - bob)
  ctx.rotate(sway)
  if (c.facing < 0) ctx.scale(-1, 1)
  drawVillager(ctx, c, w, moving, phase, era, atSpot)
  ctx.restore()

  // profession-category arc at the feet (see the social fabric at a glance)
  if (!c.isAvatar && c.profCat && CAT_COLOR[c.profCat] && !indoors) {
    ctx.strokeStyle = CAT_COLOR[c.profCat]; ctx.globalAlpha = 0.75; ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(c.x, c.y - 1, w * 0.52, 0.18 * Math.PI, 0.82 * Math.PI); ctx.stroke(); ctx.globalAlpha = 1
  }

  if (c.sick) {
    ctx.font = "bold 12px ui-monospace, monospace"; ctx.textAlign = "center"
    ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillText("✚", c.x + 1, c.y - w - 3)
    ctx.fillStyle = "#8fe39a"; ctx.fillText("✚", c.x, c.y - w - 4); ctx.textAlign = "left"
  }
  // a felt emotion floats well ABOVE the head when very strong (the face already carries the everyday mood)
  if (!c.isAvatar && c.life && c.life.emoInt > 0.62 && c.life.emotion !== "neutral") {
    const e = (EMO as Record<string, string>)[c.life.emotion]
    if (e) { ctx.font = "15px serif"; ctx.textAlign = "center"; ctx.fillText(e, c.x, c.y - w * 1.9 - 8); ctx.textAlign = "left" }
  }
  // the machine-chatter they trade floats up as faint 0s and 1s when they pause to talk (idle = conversing)
  if (!c.isAvatar && !moving && c.sigs && c.sigs.length) {
    const bits = c.sigs[c.sigs.length - 1].replace(/[+\-]\d+$/, "")
    const rise = (wT * 0.5 + c.id * 7) % 32
    ctx.font = "9px ui-monospace, monospace"; ctx.fillStyle = "rgba(110,227,154,0.6)"; ctx.textAlign = "center"
    ctx.globalAlpha = 0.55 * (1 - rise / 32); ctx.fillText(bits, c.x, c.y - w - 16 - rise); ctx.globalAlpha = 1; ctx.textAlign = "left"
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
  { key: "intellect", color: "#c79bff", label: "intelecto" },
] as const

export function drawChart(ctx: CanvasRenderingContext2D, world: World, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = "rgba(8,14,20,0.78)"; ctx.fillRect(x, y, w, h)
  ctx.strokeStyle = "rgba(255,255,255,0.12)"; ctx.strokeRect(x + 0.5, y + 0.5, w, h)
  const hist = world.history
  if (hist.length < 2) {
    ctx.fillStyle = "rgba(255,255,255,0.4)"; ctx.font = "11px ui-monospace, monospace"
    ctx.fillText("recolectando datos…", x + 10, y + h / 2); return
  }
  const norm = (key: string, v: number) => { const b = (TRAIT_BOUNDS as Record<string, readonly [number, number]>)[key]; return (v - b[0]) / (b[1] - b[0]) }
  for (const t of TRAITS) {
    ctx.strokeStyle = t.color; ctx.lineWidth = 1.5; ctx.beginPath()
    hist.forEach((s, i) => {
      const px = x + (i / (hist.length - 1)) * w
      const py = y + h - norm(t.key, (s as unknown as Record<string, number>)[t.key]) * (h - 4) - 2
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)
    })
    ctx.stroke()
  }
  ctx.font = "10px ui-monospace, monospace"
  TRAITS.forEach((t, i) => { ctx.fillStyle = t.color; ctx.fillText("● " + t.label, x + 8 + (i % 2) * 95, y + 12 + Math.floor(i / 2) * 13) })
}
