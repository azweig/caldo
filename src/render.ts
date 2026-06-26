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
const imgCache = new Map<string, HTMLImageElement>()
function pix(path: string): HTMLImageElement {
  let im = imgCache.get(path); if (!im) { im = new Image(); im.src = path; imgCache.set(path, im) }
  return im
}
function eraTier2D(era: number): string {
  if (era <= 1) return "prehist"; if (era <= 4) return "ancient"; if (era <= 7) return "medieval"
  if (era <= 9) return "renais"; if (era <= 11) return "industrial"; if (era <= 14) return "modern"; return "future"
}
function roleOf2D(c: Creature): string {
  const cat = c.profCat
  if (cat === "comercio" || cat === "liderazgo") return "merchant"
  if (cat === "defensa") return "warrior"
  if (cat === "saber" || cat === "enseñanza" || cat === "ingeniería" || cat === "arte" || cat === "espíritu" || cat === "salud") return "scholar"
  return "commoner"
}
function personImg(c: Creature, era: number): HTMLImageElement {
  return pix(`/people/${eraTier2D(era)}_${roleOf2D(c)}_${c.id % 2 ? "m" : "f"}_${(c.genome.sprite + c.id) % 2}.png`)
}

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
  // scattered trees + bushes give the land texture (deterministic positions, seasonal colour)
  const sea = seasonOf(world.clockDays)
  const leaf = sea === 3 ? "#3a4a3a" : sea === 2 ? "#5a4a24" : "#2f5a2c"
  for (let i = 0; i < 70; i++) {
    const px = seedR(i * 1.3) * WORLD_W, py = seedR(i * 2.7 + 5) * WORLD_H
    const onRoad = Math.abs((px % BLOCK) - BLOCK / 2) > BLOCK / 2 - ROAD_HALF - 4 || Math.abs((py % BLOCK) - BLOCK / 2) > BLOCK / 2 - ROAD_HALF - 4
    if (onRoad) continue
    const r = 5 + seedR(i * 3.1) * 7
    ctx.fillStyle = "rgba(0,0,0,0.12)"; ctx.beginPath(); ctx.ellipse(px + 2, py + r * 0.7, r, r * 0.4, 0, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = leaf; ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill()
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

  // houses — the sprite reflects the home's TIER (choza→casa→casona→mansión→edificio) in an era style
  const et = world.era, hstyle = et >= 12 ? "modern" : et >= 9 ? "industrial" : "medieval"
  const tierName = ["choza", "casa", "casona", "mansion", "edificio"]
  const nightNow = (() => { const h = (world.clockMinutes % 1440) / 60; return h < 6 || h >= 19 })()
  for (const h of world.houses) {
    const n = present.get(h) || 0
    let hImg = pix(`/house_tiers/${hstyle}_${tierName[h.tier || 0]}.png`)
    if (hImg.complete && hImg.naturalWidth === 0) hImg = pix(`/pix_houses/${eraTier2D(world.era)}.png`) // fallback if that combo wasn't generated
    if (hImg.naturalWidth > 0) { // pixel-art house sprite, sized to the lot (roof rises above)
      const hw = h.w * 1.7, hh = hw * (hImg.naturalHeight / hImg.naturalWidth)
      ctx.save(); ctx.globalAlpha = 0.18; ctx.fillStyle = "#000" // soft shadow grounds the building
      ctx.beginPath(); ctx.ellipse(h.x + h.w / 2 + 6, h.y + h.h - 2, hw * 0.42, h.h * 0.3, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore()
      ctx.imageSmoothingEnabled = false; ctx.globalAlpha = n > 0 ? 1 : 0.82
      ctx.drawImage(hImg, h.x + h.w / 2 - hw / 2, h.y + h.h - hh, hw, hh); ctx.globalAlpha = 1
      if (n > 0 && world.era < 12) { // smoke curls from the chimney of a lived-in home (a hearth burning)
        ctx.save(); ctx.fillStyle = "rgba(210,210,215,0.35)"
        const cxh = h.x + h.w * 0.66, ry = h.y + h.h - hh * 0.72
        for (let s = 0; s < 3; s++) { const t = (wT * 0.4 + s * 9 + h.x) % 27; ctx.globalAlpha = 0.3 * (1 - t / 27); ctx.beginPath(); ctx.arc(cxh + Math.sin(t * 0.3 + s) * 5, ry - t, 3 + t * 0.12, 0, Math.PI * 2); ctx.fill() }
        ctx.restore()
      }
      if (nightNow && n > 0) { // warm light spills from an occupied home at night
        ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.5
        const gg = ctx.createRadialGradient(h.x + h.w / 2, h.y + h.h - hh * 0.45, 2, h.x + h.w / 2, h.y + h.h - hh * 0.45, hw * 0.5)
        gg.addColorStop(0, "rgba(255,205,120,0.9)"); gg.addColorStop(1, "rgba(255,205,120,0)")
        ctx.fillStyle = gg; ctx.fillRect(h.x - hw, h.y - hh, hw * 3, hh * 2); ctx.restore()
      }
    } else { // fallback rectangle until the sprite loads
      ctx.fillStyle = `hsl(${h.hue}, 30%, ${n > 0 ? 43 : 35}%)`; ctx.fillRect(h.x, h.y, h.w, h.h)
    }
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
  for (const c of folk) drawCreature(ctx, c, world.era)

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
  if (hr < 5 || hr >= 21) tint = "rgba(20,28,66,0.46)"            // deep night, cool blue
  else if (hr < 7) tint = "rgba(255,150,90,0.20)"                 // dawn, warm
  else if (hr < 17) tint = ""                                     // bright day
  else if (hr < 19) tint = "rgba(255,150,70,0.18)"                // late afternoon, golden
  else tint = "rgba(90,70,130,0.34)"                              // dusk, violet
  if (tint) { ctx.fillStyle = tint; ctx.fillRect(0, 0, cw, ch) }

  // a soft vignette darkens the screen edges → focus + depth (screen space, after the world transform)
  const vg = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.4, cw / 2, ch / 2, Math.max(cw, ch) * 0.72)
  vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.34)")
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

function drawCreature(ctx: CanvasRenderingContext2D, c: Creature, era: number) {
  const img = personImg(c, era)
  const ageScale = c.isAvatar || isMature(c) ? 1 : 0.5 + 0.5 * Math.min(1, ageYears(c) / 16)
  const w = (24 + c.genome.size * 16) * ageScale
  // inside their own house → drawn faint (they "went in"; the lit windows represent them)
  const hh = c.home
  const indoors = !c.isAvatar && c.x > hh.x - 2 && c.x < hh.x + hh.w + 2 && c.y > hh.y - 8 && c.y < hh.y + hh.h + 2
  const dim = indoors ? 0.34 : 1

  // a natural walk: bob up + sway gently while moving (a still person stands quiet)
  const moving = !indoors && Math.abs(c.vx) + Math.abs(c.vy) > 0.15
  const phase = wT * 0.45 + c.id
  const bob = moving ? Math.abs(Math.sin(phase)) * w * 0.07 : Math.sin(wT * 0.08 + c.id) * w * 0.013 // walk bounce, or a gentle breathing when still
  const sway = moving ? Math.sin(phase) * 0.05 : 0

  // soft ground shadow — grounds the figure + gives the scene depth
  ctx.save()
  ctx.globalAlpha = 0.2 * dim
  ctx.fillStyle = "#000"
  ctx.beginPath(); ctx.ellipse(c.x, c.y, w * 0.4, w * 0.15, 0, 0, Math.PI * 2); ctx.fill()
  ctx.restore()

  ctx.save()
  ctx.globalAlpha = (c.isAvatar ? 1 : Math.max(0.5, Math.min(1, c.energy / 70))) * dim
  ctx.translate(c.x, c.y - bob)
  ctx.rotate(sway)
  if (c.facing < 0) ctx.scale(-1, 1)
  if (img && img.naturalWidth > 0) { ctx.imageSmoothingEnabled = true; const ph = w * 1.7; ctx.drawImage(img, -w / 2, -ph, w, ph) } // full-body, feet on the ground
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
  // a felt emotion floats over the head (only when strong, so it reads as a living reaction not clutter)
  if (!c.isAvatar && c.life && c.life.emoInt > 0.4 && c.life.emotion !== "neutral") {
    const e = (EMO as Record<string, string>)[c.life.emotion]
    if (e) { ctx.font = "16px serif"; ctx.textAlign = "center"; ctx.fillText(e, c.x, c.y - w - (c.sick ? 18 : 6)); ctx.textAlign = "left" }
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
