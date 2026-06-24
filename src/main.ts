// main.ts — bootstrap, the game loop, your avatar's controls, the TIME slider + in-world calendar,
// and the chat panel. 1 tick = 1 in-world DAY. You are a creature under the same rules: you walk
// (WASD), age, must eat, and can die of hunger or old age. Your one "non-power": press E to talk.
// Conversation pauses the world automatically, so you can talk at any time scale.

import "./style.css"
import { World, Creature, formatClock, ageYears, isMature, seasonOf, SEASONS, WORLD_W, WORLD_H, SPEED_SCALE } from "./world"
import { loadAssets } from "./sprites"
import { drawWorld, drawChart } from "./render"
import { respond, greeting, remember } from "./chat"
import { Msg, setLlm, pingLLM, llmConfigured, llmUrl, llmModel } from "./llm"
import { eraName, professionSpace } from "./civ"
import { ENNEAGRAM } from "./psyche"

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

const canvas = document.getElementById("world") as HTMLCanvasElement
const ctx = canvas.getContext("2d")!

function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight }
resize()
window.addEventListener("resize", resize)

let zoom = 1
window.addEventListener("wheel", (e) => {
  e.preventDefault()
  zoom = clamp(zoom * (e.deltaY < 0 ? 1.12 : 0.89), 0.35, 2.6)
}, { passive: false })

// time scale: ticks (days) per real frame. Fractions run via an accumulator so we get sub-day rates.
const SCALES = [
  { tpf: 0.12, label: "≈ 1 semana/s" },
  { tpf: 0.5, label: "≈ 1 mes/s" },
  { tpf: 1, label: "≈ 2 meses/s" },
  { tpf: 3, label: "≈ medio año/s" },
  { tpf: 6, label: "≈ 1 año/s" },
  { tpf: 15, label: "≈ 2½ años/s" },
]

// the world is split into COUNTRIES — each its own simulation, biome and language; airports + migration
// connect them, and the tabs let you embed yourself in a different one.
interface Country { world: World; name: string; flag: string; lang: string }
const COUNTRY_DEFS = [
  { name: "Solandia", flag: "🟧", lang: "español rioplatense" },
  { name: "Norvik", flag: "🔵", lang: "English" },
  { name: "Akahara", flag: "⛩️", lang: "日本語 (japonés)" },
  { name: "Verdane", flag: "🟢", lang: "português do Brasil" },
]
let countries: Country[] = []
let active = 0
let migrateAcc = 0

const keys = new Set<string>()
let world: World
let avatar: Creature | null = null
let chatTarget: Creature | null = null
let paused = false
let scaleIndex = 2
let chatting = false
let pausedByChat = false
let tickAcc = 0
let session: Msg[] = []

const CHAT_RANGE = 70

const hud = document.getElementById("hud")!
const tabsEl = document.getElementById("tabs")!
const chatBox = document.getElementById("chat") as HTMLDivElement
const chatLog = document.getElementById("chat-log") as HTMLDivElement
const chatInput = document.getElementById("chat-input") as HTMLInputElement
const chatWho = document.getElementById("chat-who") as HTMLDivElement
const deathScreen = document.getElementById("death") as HTMLDivElement
const deathReason = document.getElementById("death-reason")!
const speedSlider = document.getElementById("speed") as HTMLInputElement
const scaleLabel = document.getElementById("scale-label")!
const clockEl = document.getElementById("clock")!
const pauseBtn = document.getElementById("pause")!

function setScale(i: number) {
  scaleIndex = Math.max(0, Math.min(SCALES.length - 1, i))
  speedSlider.value = String(scaleIndex)
  scaleLabel.textContent = SCALES[scaleIndex].label
}
function togglePause() { paused = !paused; pauseBtn.textContent = paused ? "▶" : "⏸" }
speedSlider.addEventListener("input", () => { setScale(+speedSlider.value); speedSlider.blur() })
pauseBtn.addEventListener("click", () => { togglePause(); pauseBtn.blur() })

// ── ⚙ LLM settings (point the creatures' voice at your GPU box's Ollama) ──
const settings = document.getElementById("settings") as HTMLDivElement
const cfgUrl = document.getElementById("cfg-url") as HTMLInputElement
const cfgModel = document.getElementById("cfg-model") as HTMLInputElement
const cfgStatus = document.getElementById("cfg-status")!
document.getElementById("cfg")!.addEventListener("click", () => {
  cfgUrl.value = llmUrl(); cfgModel.value = llmModel(); cfgStatus.textContent = ""
  settings.classList.remove("hidden")
})
document.getElementById("cfg-close")!.addEventListener("click", () => settings.classList.add("hidden"))
document.getElementById("cfg-save")!.addEventListener("click", () => { setLlm(cfgUrl.value, cfgModel.value); settings.classList.add("hidden") })
document.getElementById("cfg-test")!.addEventListener("click", async () => {
  setLlm(cfgUrl.value, cfgModel.value)
  cfgStatus.textContent = "probando…"; cfgStatus.style.color = "#9fb2c2"
  const r = await pingLLM()
  cfgStatus.textContent = r.ok ? `✓ conectado — dijo: "${r.detail}"` : `✗ falló: ${r.detail}`
  cfgStatus.style.color = r.ok ? "#8fe39a" : "#ff8c6a"
})
;[cfgUrl, cfgModel].forEach((inp) => inp.addEventListener("keydown", (e) => e.stopPropagation()))

// ── mouse: hover + click-to-inspect ──
let mouseX = -1, mouseY = -1
let lastCam = { x: WORLD_W / 2, y: WORLD_H / 2, zoom: 1 }
let hovered: Creature | null = null
canvas.addEventListener("mousemove", (e) => { mouseX = e.clientX; mouseY = e.clientY })
canvas.addEventListener("mouseleave", () => { mouseX = -1; mouseY = -1 })
function screenToWorld(sx: number, sy: number) { return { x: (sx - canvas.width / 2) / lastCam.zoom + lastCam.x, y: (sy - canvas.height / 2) / lastCam.zoom + lastCam.y } }
function creatureAt(sx: number, sy: number): Creature | null {
  if (sx < 0) return null
  const w = screenToWorld(sx, sy)
  let best: Creature | null = null, bd = (30 / lastCam.zoom) ** 2
  for (const c of world.creatures) { if (c.isAvatar) continue; const d = (c.x - w.x) ** 2 + (c.y - w.y) ** 2; if (d < bd) { bd = d; best = c } }
  return best
}
canvas.addEventListener("click", () => { const c = creatureAt(mouseX, mouseY); if (c) showInspect(c) })

const inspect = document.getElementById("inspect") as HTMLDivElement
const inspectBody = document.getElementById("inspect-body")!
document.getElementById("inspect-close")!.addEventListener("click", () => inspect.classList.add("hidden"))
function pbar(v: number, color: string) { return `<span class="pbar"><i style="width:${Math.round(v * 100)}%;background:${color}"></i></span>` }
function showInspect(c: Creature) {
  const p = c.psyche, t = ENNEAGRAM[p.type]
  const five: [string, number][] = [["apertura", p.five.o], ["responsab.", p.five.c], ["extrav.", p.five.e], ["amabilidad", p.five.a], ["neurot.", p.five.n]]
  inspectBody.innerHTML = `
    <h2>${c.name} ${c.surname}</h2>
    <div class="row dim">${c.profession || "sin oficio"} · ${Math.round(ageYears(c))} años · gen ${c.generation}</div>
    <div class="row">${c.children} ${c.children === 1 ? "hijo" : "hijos"} · saber ${Math.round(c.knowledge)} · ${c.sick ? '<b style="color:#8fe39a">enfermo ✚</b>' : "sano"}</div>
    <h3>núcleo · ${t.name}</h3><div class="row dim">anhela ${t.desire}; teme ${t.fear}</div>
    <h3>personalidad</h3>${five.map(([l, v]) => `<div class="prow"><span>${l}</span>${pbar(v, "#9bb8ff")}</div>`).join("")}
    <h3>creencias</h3><div class="row dim">${[t.belief, ...p.beliefs].map((b) => `“${b}”`).join("<br>")}</div>
    <h3>genoma</h3><div class="row dim">vel ${c.genome.speed.toFixed(1)} · visión ${Math.round(c.genome.vision)} · longevidad ${Math.round(c.genome.longevity)}a · intelecto ${c.genome.intellect.toFixed(2)} · resistencia ${c.genome.resistance.toFixed(2)}</div>`
  inspect.classList.remove("hidden")
}

// ── help + chronicle overlays ──
const help = document.getElementById("help") as HTMLDivElement
const chronicleEl = document.getElementById("chronicle") as HTMLDivElement
const chronicleBody = document.getElementById("chronicle-body")!
function toggleHelp() { help.classList.toggle("hidden") }
function toggleChronicle() {
  if (chronicleEl.classList.contains("hidden"))
    chronicleBody.innerHTML = world.chronicle.length ? world.chronicle.slice().reverse().map((e) => `<div class="row"><b>${formatClock(e.day)}</b> — ${e.text}</div>`).join("") : "<div class='row dim'>aún no pasó nada digno de registro…</div>"
  chronicleEl.classList.toggle("hidden")
}
document.getElementById("help-close")!.addEventListener("click", () => help.classList.add("hidden"))
document.getElementById("chronicle-close")!.addEventListener("click", () => chronicleEl.classList.add("hidden"))
document.getElementById("cron")!.addEventListener("click", () => { toggleChronicle(); (document.getElementById("cron") as HTMLElement).blur() })

function nearestTalkable(): Creature | null { return avatar ? world.nearestCreature(avatar, CHAT_RANGE, (o) => !o.isAvatar) : null }
function openChat() {
  const t = nearestTalkable()
  if (!t) return
  chatTarget = t; chatting = true; session = []
  if (!paused) { paused = true; pausedByChat = true; pauseBtn.textContent = "▶" }
  chatBox.classList.remove("hidden")
  chatWho.textContent = greeting(t) + (llmConfigured() ? " 🧠" : "")
  chatLog.innerHTML = ""
  addLine(t.name, t.memory.length ? "Te reconoce. ¿Qué le decís?" : "Te mira. ¿Querés decirle algo?", "them")
  chatInput.value = ""; chatInput.focus()
}
function closeChat() {
  chatting = false
  if (chatTarget) remember(chatTarget, session)
  if (pausedByChat) { paused = false; pausedByChat = false; pauseBtn.textContent = "⏸" }
  chatBox.classList.add("hidden")
}
function addLine(who: string, text: string, cls: "me" | "them"): HTMLDivElement {
  const el = document.createElement("div")
  el.className = "line " + cls
  el.innerHTML = `<b>${who}:</b> ${text}`
  chatLog.appendChild(el); chatLog.scrollTop = chatLog.scrollHeight
  return el
}
chatInput.addEventListener("keydown", async (e) => {
  e.stopPropagation()
  if (e.key === "Escape") { closeChat(); return }
  if (e.key === "Enter" && chatInput.value.trim() && chatTarget) {
    const who = chatTarget
    const msg = chatInput.value.trim()
    addLine("Tú", msg, "me"); chatInput.value = ""
    session.push({ role: "user", content: msg })
    const typing = addLine(who.name, "<i>…</i>", "them")
    const reply = await respond(who, msg, session, eraName(world.era), countries[active].lang)
    typing.innerHTML = `<b>${who.name}:</b> ${reply}`
    chatLog.scrollTop = chatLog.scrollHeight
    session.push({ role: "assistant", content: reply })
  }
})

window.addEventListener("keydown", (e) => {
  if (chatting) return
  keys.add(e.key.toLowerCase())
  if (e.key === "e" || e.key === "E") openChat()
  if (e.key === " ") { togglePause(); e.preventDefault() }
  if (e.key === "+" || e.key === "=") setScale(scaleIndex + 1)
  if (e.key === "-" || e.key === "_") setScale(scaleIndex - 1)
  if (e.key === "h" || e.key === "?") toggleHelp()
  if (e.key === "c" || e.key === "C") toggleChronicle()
  if ((e.key === "r" || e.key === "R") && avatar && isAvatarDead()) respawn()
})
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()))

function isAvatarDead(): boolean {
  return !!avatar && (avatar.energy <= 0 || avatar.ageDays > avatar.lifespanDays)
}
function respawn() { avatar = world.addAvatar(); deathScreen.classList.add("hidden") }

function driveAvatar() {
  if (!avatar) return
  let dx = 0, dy = 0
  if (keys.has("w") || keys.has("arrowup")) dy -= 1
  if (keys.has("s") || keys.has("arrowdown")) dy += 1
  if (keys.has("a") || keys.has("arrowleft")) dx -= 1
  if (keys.has("d") || keys.has("arrowright")) dx += 1
  const m = Math.hypot(dx, dy)
  if (m > 0) { avatar.vx = (dx / m) * avatar.genome.speed * SPEED_SCALE * 1.1; avatar.vy = (dy / m) * avatar.genome.speed * SPEED_SCALE * 1.1 }
  else { avatar.vx *= 0.6; avatar.vy *= 0.6 }
}

function updateHud() {
  const wild = world.creatures.filter((c) => !c.isAvatar)
  const n = wild.length || 1
  const avgAge = Math.round(wild.reduce((s, c) => s + ageYears(c), 0) / n)
  const families = wild.filter((c) => c.children > 0).length
  const sick = wild.filter((c) => c.sick).length
  const e = avatar ? Math.max(0, avatar.energy) : 0
  const aAge = avatar ? Math.round(ageYears(avatar)) : 0
  const bar = "█".repeat(Math.round(e / 10)).padEnd(13, "·")
  const rp = world.researchProgress()
  hud.innerHTML = `
    <div class="stat"><span>país</span> <b style="color:#fff">${countries[active]?.flag || ""} ${countries[active]?.name || ""}</b></div>
    <div class="stat"><span>población</span> ${wild.length} · <span>familias</span> ${families}</div>
    <div class="stat"><span>edad media</span> ${avgAge}a · <span>enfermos ✚</span> ${sick}</div>
    <div class="stat"><span>generación</span> ${world.peakGen} · <span>nac</span> ${world.births} · <span>muertes</span> ${world.deaths}</div>
    <div class="stat"><span>era</span> <b style="color:#bcd9ff">${eraName(world.era)}</b> · ${SEASONS[seasonOf(world.clockDays)]}</div>
    <div class="stat"><span>saber 📚</span> ${Math.round(world.wisdom)} · <span>oficios</span> ${professionSpace().toLocaleString()} · <span>univ.</span> ${world.universities.length}</div>
    <div class="stat"><span>investigando</span> ${rp.name} <span class="rbar"><i style="width:${Math.round(rp.frac * 100)}%"></i></span></div>
    ${world.recentTech ? `<div class="stat"><span>💡 último</span> ${world.recentTech}</div>` : ""}
    <div class="stat energy"><span>vos</span> ${aAge}a · ${bar} ${Math.round(e)}</div>
    <div class="hint">${(!chatting && chatTarget) ? `▸ apretá <b>E</b> para hablar con ${chatTarget.name}` : "WASD moverte · E hablar · espacio pausa"}</div>
  `
  clockEl.textContent = formatClock(world.clockDays)
  for (let i = 0; i < tabsEl.children.length; i++) if (countries[i]) (tabsEl.children[i] as HTMLElement).title = `${eraName(countries[i].world.era)} · ${countries[i].world.creatures.filter((c) => !c.isAvatar).length} hab.`
}

function buildTabs() {
  tabsEl.innerHTML = ""
  countries.forEach((c, i) => {
    const b = document.createElement("button")
    b.className = "tab" + (i === active ? " active" : "")
    b.innerHTML = `${c.flag} ${c.name}`
    b.addEventListener("click", () => switchCountry(i))
    tabsEl.appendChild(b)
  })
}
function switchCountry(i: number) {
  if (i === active || !countries[i]) return
  if (avatar) { const k = world.creatures.indexOf(avatar); if (k >= 0) world.creatures.splice(k, 1) }
  active = i; world = countries[i].world
  if (avatar) { avatar.x = world.airport.x + world.airport.w / 2; avatar.y = world.airport.y + world.airport.h; avatar.vx = avatar.vy = 0; world.creatures.push(avatar) }
  closeChat(); inspect.classList.add("hidden")
  ;[...tabsEl.children].forEach((el, j) => (el as HTMLElement).classList.toggle("active", j === i))
}
// occasionally fly a grown creature to another country — cross-pollinating genes, beliefs + trades
function maybeMigrate(ticks: number) {
  migrateAcc += ticks
  if (migrateAcc < 500 || countries.length < 2) return
  migrateAcc = 0
  const from = countries[Math.floor(Math.random() * countries.length)]
  const pool = from.world.creatures.filter((c) => !c.isAvatar && isMature(c))
  if (pool.length < 24) return
  let toI = Math.floor(Math.random() * countries.length)
  if (countries[toI] === from) toI = (toI + 1) % countries.length
  const to = countries[toI], c = pool[Math.floor(Math.random() * pool.length)]
  from.world.creatures.splice(from.world.creatures.indexOf(c), 1)
  c.x = to.world.airport.x + Math.random() * 80; c.y = to.world.airport.y + Math.random() * 50
  c.home = to.world.houses[Math.floor(Math.random() * to.world.houses.length)]; c.goingHome = false
  to.world.creatures.push(c)
  from.world.chronicle.push({ day: from.world.clockDays, text: `${c.name} ${c.surname} emigró a ${to.name} ✈` })
  to.world.chronicle.push({ day: to.world.clockDays, text: `llegó ${c.name} ${c.surname} desde ${from.name} (${c.profession || "forastero"}) ✈` })
}

function loop() {
  if (!paused) {
    tickAcc += SCALES[scaleIndex].tpf
    let n = Math.floor(tickAcc)
    tickAcc -= n
    if (n > 40) n = 40
    for (let i = 0; i < n; i++) {
      driveAvatar()
      for (const c of countries) { if (c.world === world || i < 8) c.world.step() } // inactive countries capped for perf
    }
    maybeMigrate(n)
  }
  chatTarget = chatting ? chatTarget : nearestTalkable()

  // camera: follow the avatar, clamped to the world (centre it on any axis smaller than the view)
  const halfW = canvas.width / (2 * zoom), halfH = canvas.height / (2 * zoom)
  let cx = avatar ? avatar.x : WORLD_W / 2
  let cy = avatar ? avatar.y : WORLD_H / 2
  cx = WORLD_W <= 2 * halfW ? WORLD_W / 2 : clamp(cx, halfW, WORLD_W - halfW)
  cy = WORLD_H <= 2 * halfH ? WORLD_H / 2 : clamp(cy, halfH, WORLD_H - halfH)
  lastCam = { x: cx, y: cy, zoom }
  hovered = chatting ? null : creatureAt(mouseX, mouseY)

  drawWorld(ctx, world, assets, avatar, chatTarget, !!chatTarget && !chatting, lastCam, hovered)
  drawChart(ctx, world, canvas.width - 230, 16, 214, 116)

  if (isAvatarDead()) {
    const old = avatar!.ageDays > avatar!.lifespanDays
    deathReason.textContent = old
      ? `viviste ${Math.round(ageYears(avatar!))} años. la vejez te alcanzó — así es el caldo.`
      : "te quedaste sin energía. el que no come, se apaga."
    deathScreen.classList.remove("hidden")
  }

  updateHud()
  requestAnimationFrame(loop)
}

const intro = document.getElementById("intro")!
document.getElementById("start")!.addEventListener("click", () => intro.classList.add("hidden"))

let assets: Awaited<ReturnType<typeof loadAssets>>
loadAssets().then((a) => {
  assets = a
  countries = COUNTRY_DEFS.map((c, i) => ({ ...c, world: new World(a.creatures.length, i) }))
  active = 0
  world = countries[0].world
  avatar = world.addAvatar()
  buildTabs()
  setScale(scaleIndex)
  loop()
})
