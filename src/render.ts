// render.ts — draw the TOWN through a camera (zoom + follow): streets, houses, gardens, food, and
// creatures; plus a screen-space HUD chart. The camera transform is applied for the world, then
// reset so the chart/labels-overlay draw in screen pixels.

import { World, Creature, House, ageYears, isMature, seasonOf, WORLD_W, WORLD_H, BLOCK, ROAD_HALF } from "./world"
import { Assets } from "./sprites"
import { TRAIT_BOUNDS } from "./genome"

export interface Cam { x: number; y: number; zoom: number }

let vehT = 0 // real-time animation clock for vehicles (so they move even when the world is slow)
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

const REGION_GROUND = [
  ["#0f1d1a", "#121d16", "#1b1810", "#0c131b"], // templado
  ["#101b22", "#0e1f1f", "#17191a", "#0b1016"], // frío/norteño
  ["#1a1614", "#1d1810", "#1c140e", "#120f0e"], // cálido/desierto
  ["#101d14", "#0e1e12", "#16190f", "#0c150f"], // selvático
]
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

  // occupancy: who's currently home (near their own house) → drives the lit windows + the head-count
  const present = new Map<House, number>()
  for (const c of world.creatures) {
    if (c.isAvatar) continue
    const hx = c.home.x + c.home.w / 2, hy = c.home.y + c.home.h / 2
    if ((c.x - hx) ** 2 + (c.y - hy) ** 2 < 80 * 80) present.set(c.home, (present.get(c.home) || 0) + 1)
  }

  // houses
  for (const h of world.houses) {
    const n = present.get(h) || 0
    ctx.fillStyle = `hsl(${h.hue}, 30%, ${n > 0 ? 43 : 35}%)`
    ctx.fillRect(h.x, h.y, h.w, h.h)
    // windows — warm + lit when someone's home, dark otherwise
    ctx.fillStyle = n > 0 ? "rgba(255,212,128,0.92)" : "rgba(16,26,36,0.85)"
    ctx.fillRect(h.x + 9, h.y + 13, 13, 12)
    ctx.fillRect(h.x + h.w - 22, h.y + 13, 13, 12)
    // roof
    ctx.fillStyle = `hsl(${h.hue}, 38%, 27%)`
    ctx.beginPath(); ctx.moveTo(h.x - 5, h.y); ctx.lineTo(h.x + h.w + 5, h.y); ctx.lineTo(h.x + h.w / 2, h.y - 22); ctx.closePath(); ctx.fill()
    // door — glows if occupied
    ctx.fillStyle = n > 0 ? "rgba(255,200,110,0.55)" : "rgba(0,0,0,0.5)"
    ctx.fillRect(h.x + h.w / 2 - 7, h.y + h.h - 17, 14, 17)
    // head-count badge
    if (n > 0) {
      const txt = `👥 ${n}`
      ctx.font = "bold 12px ui-monospace, monospace"; ctx.textAlign = "center"
      const bw = ctx.measureText(txt).width + 12
      ctx.fillStyle = "rgba(8,14,20,0.85)"; ctx.beginPath(); ctx.roundRect(h.x + h.w / 2 - bw / 2, h.y - 41, bw, 18, 6); ctx.fill()
      ctx.fillStyle = "#ffe6a3"; ctx.fillText(txt, h.x + h.w / 2, h.y - 28); ctx.textAlign = "left"
    }
    if (cam.zoom > 1.1) label(ctx, h.surname, h.x + h.w / 2, h.y + h.h + 13, "rgba(200,215,230,0.6)")
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

  vehT += 1.3
  drawVehicles(ctx, world, vehT)

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

function drawCreature(ctx: CanvasRenderingContext2D, c: Creature, assets: Assets) {
  const img = assets.creatures[c.genome.sprite % assets.creatures.length]
  const ageScale = c.isAvatar || isMature(c) ? 1 : 0.5 + 0.5 * Math.min(1, ageYears(c) / 16)
  const w = (22 + c.genome.size * 18) * ageScale
  // inside their own house → drawn faint (they "went in"; the lit windows represent them)
  const hh = c.home
  const indoors = !c.isAvatar && c.x > hh.x - 2 && c.x < hh.x + hh.w + 2 && c.y > hh.y - 8 && c.y < hh.y + hh.h + 2
  const dim = indoors ? 0.34 : 1

  ctx.save()
  ctx.globalAlpha = (c.isAvatar ? 0.5 : Math.max(0.12, Math.min(0.4, c.energy / 120))) * dim
  ctx.fillStyle = `hsl(${c.genome.hue}, 70%, 55%)`
  ctx.beginPath(); ctx.arc(c.x, c.y - w * 0.35, w * 0.7, 0, Math.PI * 2); ctx.fill()
  ctx.restore()

  ctx.save()
  ctx.globalAlpha = (c.isAvatar ? 1 : Math.max(0.45, Math.min(1, c.energy / 70))) * dim
  ctx.translate(c.x, c.y)
  if (c.facing < 0) ctx.scale(-1, 1)
  if (img && img.naturalWidth > 0) { ctx.imageSmoothingEnabled = false; ctx.drawImage(img, -w / 2, -w, w, w) }
  else { ctx.fillStyle = `hsl(${c.genome.hue}, 60%, 60%)`; ctx.beginPath(); ctx.arc(0, -w / 2, w / 2, 0, Math.PI * 2); ctx.fill() }
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
