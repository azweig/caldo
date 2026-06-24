// main.ts — bootstrap, the game loop, your avatar's controls, the TIME slider + in-world calendar,
// and the chat panel. 1 tick = 1 in-world DAY. You are a creature under the same rules: you walk
// (WASD), age, must eat, and can die of hunger or old age. Your one "non-power": press E to talk.
// Conversation pauses the world automatically, so you can talk at any time scale.

import "./style.css"
import { World, Creature, formatClock, ageYears, isMature, seasonOf, SEASONS, WORLD_W, WORLD_H } from "./world"
import { loadAssets } from "./sprites"
import { drawWorld, drawChart } from "./render"
import { respond, greeting, remember, ambientDialogue } from "./chat"
import { Msg, setLlm, pingLLM, autoDetect, llmConfigured, llmUrl, llmModel } from "./llm"
import { eraName, professionSpace, ERAS } from "./civ"
import { ENNEAGRAM } from "./psyche"
import { LangCode, WRITE_LANG, langName, heard } from "./i18n"
import { CivConfig, RELIGIONS, buildCountries, foodSystem, transportOf, transportLevel } from "./civconfig"

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

// time scale = in-world MINUTES per real second. Default 1 s = 1 min (calm, conversational world);
// max 1 min = 1 año (8640 min/s) to watch evolution. The day-based dynamics step once per in-world day.
const SCALES = [
  { rate: 1, label: "1 s = 1 min" },
  { rate: 5, label: "1 s = 5 min" },
  { rate: 30, label: "1 s = 30 min" },
  { rate: 180, label: "1 s = 3 h" },
  { rate: 1440, label: "1 s = 1 día" },
  { rate: 8640, label: "1 min = 1 año" },
  { rate: 43200, label: "1 min = 5 años" },
  { rate: 216000, label: "1 min = 25 años" },
]

// the world is split into COUNTRIES — each its own simulation, biome and language; airports + migration
// connect them, and the tabs let you embed yourself in a different one.
interface Country { world: World; name: string; flag: string; lang: LangCode }
let countries: Country[] = []
let active = 0
let migrateAcc = 0
let frame = 0
let spriteCount = 8
let loopStarted = false
let saveAt = 0
const SAVE_KEY = "caldo_save_v1"
let ambient: { lines: { who: Creature; text: string }[]; idx: number; nextAt: number } | null = null
let ambientCool = 0
const OVERHEAR = 240

const keys = new Set<string>()
let world: World
let avatar: Creature | null = null
let chatTarget: Creature | null = null
let paused = false
let scaleIndex = 0
let chatting = false
let pausedByChat = false
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
  if (sx < 0 || !world) return null
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
    <div class="row dim">cree en ${c.religion || "nada"}${c.powerHungry ? " · <b style='color:#ff8c6a'>sed de poder</b>" : ""}</div>
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
document.getElementById("menubtn")!.addEventListener("click", () => { paused = true; pauseBtn.textContent = "▶"; saveGame(); showMenu(); (document.getElementById("menubtn") as HTMLElement).blur() })

// ── "ver más": full statistics panel ──
const statsEl = document.getElementById("stats") as HTMLDivElement
const statsBody = document.getElementById("stats-body")!
function statsHTML(): string {
  const wild = world.creatures.filter((c) => !c.isAvatar)
  const n = wild.length || 1
  const kids = wild.filter((c) => !isMature(c)).length
  const elders = wild.filter((c) => ageYears(c) > 65).length
  const adults = n - kids - elders
  const pregnant = wild.filter((c) => c.pregnant > 0).length
  const couples = Math.round(wild.filter((c) => c.partner).length / 2)
  const families = wild.filter((c) => c.children > 0).length
  const sick = wild.filter((c) => c.sick).length
  const hungry = wild.filter((c) => c.energy < 35).length
  const avgAge = Math.round(wild.reduce((s, c) => s + ageYears(c), 0) / n)
  const avgKids = (wild.reduce((s, c) => s + c.children, 0) / n).toFixed(1)
  const K = Math.min(280, 80 + world.era * 7)
  const rel: Record<string, number> = {}; for (const c of wild) if (c.religion) rel[c.religion] = (rel[c.religion] || 0) + 1
  const cat: Record<string, number> = {}; for (const c of wild) if (c.profCat) cat[c.profCat] = (cat[c.profCat] || 0) + 1
  const topics: Record<string, number> = {}
  for (const c of wild) for (const s of c.social) { const m = s.match(/(?:sobre|de) (.+)$/); const t = m?.[1]?.trim(); if (t && t.length < 30) topics[t] = (topics[t] || 0) + 1 }
  const ambitious = wild.filter((c) => c.powerHungry).length
  const despot = world.monarch?.powerHungry ? 1 : 0
  const crime = Math.round(100 * Math.min(1, world.violence * (1 + world.psychopathy * 2) * (world.gov === "monarquía" ? 1.2 : 1)))
  const war = Math.round(100 * Math.min(1, world.violence * 0.6 + world.psychopathy + despot * 0.25))
  const top = (o: Record<string, number>, fmt: (k: string, v: number) => string, lim = 6) =>
    Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, lim).map(([k, v]) => fmt(k, v)).join(" · ") || "—"
  const row = (label: string, val: string) => `<div class="srow"><span>${label}</span><b>${val}</b></div>`
  return `
    <h3>Población</h3>
    ${row("total / capacidad", `${n} / ${K}`)}
    ${row("niños · adultos · ancianos", `${kids} · ${adults} · ${elders}`)}
    ${row("edad media", `${avgAge} años`)}
    ${row("estado", `${sick} enfermos · ${hungry} con hambre`)}
    <h3>Familias y nacimientos</h3>
    ${row("parejas · familias", `${couples} · ${families}`)}
    ${row("embarazos ahora", `${pregnant}`)}
    ${row("nacimientos · muertes (histórico)", `${world.births} · ${world.deaths}`)}
    ${row("hijos por persona", avgKids)}
    <h3>Ideologías / religiones</h3>
    <div class="sline">${top(rel, (k, v) => `${k} ${Math.round(100 * v / n)}%`)}</div>
    <h3>Oficios (por categoría)</h3>
    <div class="sline">${top(cat, (k, v) => `${k} ${v}`)}</div>
    <h3>De qué hablan</h3>
    <div class="sline">${Object.keys(topics).length ? Object.entries(topics).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k]) => k).join(" · ") : "todavía nada"}</div>
    <h3>Transporte</h3>
    <div class="sline">${transportOf(world.era)}</div>
    <h3>Relaciones exteriores</h3>
    <div class="sline">${countries.filter((c) => c !== countries[active]).map((c) => `${c.flag} ${c.name}: ${relationLabel(relationScore(countries[active], c))}`).join("<br>") || "—"}</div>
    <h3>Conflictividad</h3>
    ${row("ambiciosos (sed de poder)", `${ambitious}`)}
    ${row("nivel de crimen", `${crime}%`)}
    ${row("riesgo de guerra", `${war}%`)}`
}
function toggleStats() { if (statsEl.classList.contains("hidden")) statsBody.innerHTML = statsHTML(); statsEl.classList.toggle("hidden") }
document.getElementById("stats-close")!.addEventListener("click", () => statsEl.classList.add("hidden"))
document.getElementById("statsbtn")!.addEventListener("click", () => { toggleStats(); (document.getElementById("statsbtn") as HTMLElement).blur() })

function nearestTalkable(): Creature | null { return avatar ? world.nearestCreature(avatar, CHAT_RANGE, (o) => !o.isAvatar) : null }
function openChat() {
  const t = nearestTalkable()
  if (!t) return
  chatTarget = t; chatting = true; session = []
  if (!paused) { paused = true; pausedByChat = true; pauseBtn.textContent = "▶" }
  chatBox.classList.remove("hidden")
  chatWho.textContent = `${greeting(t)} · habla ${langName(countries[active].lang)}${llmConfigured() ? " 🧠" : ""}`
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
    const ctx = `Tu pueblo come de ${foodSystem(world.era)}; es una ${world.gov}${world.monarch ? `, gobernada por ${world.monarch.name} ${world.monarch.surname}` : ""}.`
    const info = { era: eraName(world.era), country: countries[active].name, food: foodSystem(world.era), lang: countries[active].lang }
    const reply = await respond(who, msg, session, eraName(world.era), WRITE_LANG, ctx, info)
    const h = heard(reply, countries[active].lang)
    typing.innerHTML = `<b>${who.name}:</b> <span class="tag">${h.tag}</span> ${h.text}`
    chatLog.scrollTop = chatLog.scrollHeight
    session.push({ role: "assistant", content: reply })
  }
})

window.addEventListener("keydown", (e) => {
  if (!loopStarted || chatting) return
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

function isAvatarDead(): boolean { return false } // you age, but as a visitor you never die
function respawn() { avatar = world.addAvatar(); deathScreen.classList.add("hidden") }

function driveAvatar() {
  if (!avatar) return
  let dx = 0, dy = 0
  if (keys.has("w") || keys.has("arrowup")) dy -= 1
  if (keys.has("s") || keys.has("arrowdown")) dy += 1
  if (keys.has("a") || keys.has("arrowleft")) dx -= 1
  if (keys.has("d") || keys.has("arrowright")) dx += 1
  const m = Math.hypot(dx, dy)
  if (m > 0) { avatar.vx = (dx / m) * AV_SPEED; avatar.vy = (dy / m) * AV_SPEED } // real-time px/frame
  else { avatar.vx *= 0.6; avatar.vy *= 0.6 }
}
const AV_SPEED = 4.2

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
  const relCount: Record<string, number> = {}
  for (const c of wild) if (c.religion) relCount[c.religion] = (relCount[c.religion] || 0) + 1
  const topRel = Object.entries(relCount).sort((a, b) => b[1] - a[1])[0]
  const psychos = wild.filter((c) => c.powerHungry).length
  hud.innerHTML = `
    <div class="stat"><span>país</span> <b style="color:#fff">${countries[active]?.flag || ""} ${countries[active]?.name || ""}</b> · ${world.gov === "monarquía" ? "👑 monarquía" : "🏛 república"}</div>
    ${world.monarch ? `<div class="stat"><span>monarca</span> ${world.monarch.name} ${world.monarch.surname}${world.monarch.powerHungry ? " (déspota)" : ""}</div>` : ""}
    <div class="stat"><span>población</span> ${wild.length} · <span>familias</span> ${families}</div>
    <div class="stat"><span>edad media</span> ${avgAge}a · <span>enfermos ✚</span> ${sick}</div>
    <div class="stat"><span>generación</span> ${world.peakGen} · <span>nac</span> ${world.births} · <span>muertes</span> ${world.deaths}</div>
    <div class="stat"><span>era</span> <b style="color:#bcd9ff">${eraName(world.era)}</b> · ${SEASONS[seasonOf(world.clockDays)]}</div>
    <div class="stat"><span>alimento</span> ${foodSystem(world.era)} · <span>transporte</span> ${transportOf(world.era)}</div>
    <div class="stat"><span>religión</span> ${topRel ? `${topRel[0]} ${Math.round(100 * topRel[1] / (wild.length || 1))}%` : "—"} · <span>ambiciosos</span> ${psychos}</div>
    <div class="stat"><span>saber 📚</span> ${Math.round(world.wisdom)} · <span>oficios</span> ${professionSpace().toLocaleString()} · <span>univ.</span> ${world.universities.length}</div>
    <div class="stat"><span>investigando</span> ${rp.name} <span class="rbar"><i style="width:${Math.round(rp.frac * 100)}%"></i></span></div>
    ${world.recentTech ? `<div class="stat"><span>💡 último</span> ${world.recentTech}</div>` : ""}
    <div class="stat energy"><span>vos</span> ${aAge}a · ${bar} ${Math.round(e)}</div>
    <div class="hint">${(!chatting && chatTarget) ? `▸ apretá <b>E</b> para hablar con ${chatTarget.name}` : "WASD moverte · E hablar · espacio pausa"}</div>
  `
  clockEl.textContent = formatClock(world.clockMinutes)
  for (let i = 0; i < tabsEl.children.length; i++) if (countries[i]) (tabsEl.children[i] as HTMLElement).title = `${eraName(countries[i].world.era)} · ${countries[i].world.creatures.filter((c) => !c.isAvatar).length} hab.`
  if (!statsEl.classList.contains("hidden") && frame % 15 === 0) statsBody.innerHTML = statsHTML()
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
// ── inter-country relations: peace / alliance / war computed from compatibility ──
function topReligion(w: World): string {
  const r: Record<string, number> = {}
  for (const c of w.creatures) if (!c.isAvatar && c.religion) r[c.religion] = (r[c.religion] || 0) + 1
  return Object.entries(r).sort((a, b) => b[1] - a[1])[0]?.[0] || ""
}
function relationScore(A: Country, B: Country): number {
  let s = 1
  const ra = topReligion(A.world), rb = topReligion(B.world)
  if (ra && ra === rb) s += 2.5; else s -= 1                       // shared faith bonds; different divides
  if (A.world.gov === B.world.gov) s += 1; else s -= 0.5           // like governments get along
  s -= Math.abs(A.world.era - B.world.era) * 0.25                  // a big tech gap breeds resentment
  s -= (A.world.violence + B.world.violence) * 1.8                 // violent peoples clash
  s -= (A.world.psychopathy + B.world.psychopathy) * 2.5
  if (A.world.monarch?.powerHungry || B.world.monarch?.powerHungry) s -= 1.5 // a despot wants conquest
  return s
}
function relationLabel(s: number): string { return s > 3 ? "aliados 🤝" : s > 1 ? "paz" : s > -1 ? "neutral" : s > -3 ? "tensión" : "guerra ⚔" }

function warDeaths(w: World, n: number) {
  const adults = w.creatures.filter((c) => !c.isAvatar && isMature(c))
  for (let k = 0; k < n && adults.length > 6; k++) {
    const v = adults.splice(Math.floor(Math.random() * adults.length), 1)[0]
    const idx = w.creatures.indexOf(v); if (idx >= 0) { w.creatures.splice(idx, 1); w.deaths++ }
  }
}
function migrateBetween(from: Country, to: Country) {
  if (from === to) return
  const pool = from.world.creatures.filter((c) => !c.isAvatar && isMature(c))
  if (pool.length < 16) return
  const c = pool[Math.floor(Math.random() * pool.length)]
  from.world.creatures.splice(from.world.creatures.indexOf(c), 1)
  c.x = to.world.airport.x + Math.random() * 80; c.y = to.world.airport.y + Math.random() * 50
  c.home = to.world.houses[Math.floor(Math.random() * to.world.houses.length)]; c.goingHome = false; c.partner = 0; c.pregnant = 0
  to.world.creatures.push(c)
  from.world.chronicle.push({ day: from.world.clockDays, text: `${c.name} ${c.surname} partió a ${to.name} ✈` })
  to.world.chronicle.push({ day: to.world.clockDays, text: `llegó ${c.name} ${c.surname} desde ${from.name} ✈` })
}
// runs periodically: transport gates contact, the relation decides migration / alliance / war
function worldAffairs(steps: number) {
  migrateAcc += steps
  if (migrateAcc < 450 || countries.length < 2) return
  migrateAcc = 0
  const i = Math.floor(Math.random() * countries.length)
  const j = (i + 1 + Math.floor(Math.random() * (countries.length - 1))) % countries.length
  const A = countries[i], B = countries[j]
  if (Math.min(transportLevel(A.world.era), transportLevel(B.world.era)) < 1) return // isolated until carts/boats (~era 3)
  const label = relationLabel(relationScore(A, B))
  if (label.startsWith("guerra")) {
    warDeaths(A.world, 1 + Math.floor(Math.random() * 2)); warDeaths(B.world, 1 + Math.floor(Math.random() * 2))
    A.world.chronicle.push({ day: A.world.clockDays, text: `⚔ guerra con ${B.name}` })
    B.world.chronicle.push({ day: B.world.clockDays, text: `⚔ guerra con ${A.name}` })
  } else if (label === "aliados 🤝") {
    migrateBetween(A, B); migrateBetween(B, A)                       // open borders — the peoples mix
    const lag = A.world.era <= B.world.era ? A : B; lag.world.research += 5000 // shared technology
  } else if (label === "paz") {
    if (Math.random() < 0.5) migrateBetween(A, B); else migrateBetween(B, A)
  } else if (Math.random() < 0.4) {
    migrateBetween(A, B)                                            // neutral/tense — the rare traveller
  }
}

// overheard AI-to-AI chatter near the avatar (you can listen, not intervene)
function nearAvatarPair(): [Creature, Creature] | null {
  if (!avatar) return null
  const av = avatar
  const near = world.creatures.filter((c) => !c.isAvatar && isMature(c) && (c.x - av.x) ** 2 + (c.y - av.y) ** 2 < OVERHEAR * OVERHEAR)
  for (const a of near) {
    const b = world.nearestCreature(a, 66, (o) => !o.isAvatar && isMature(o))
    if (b && near.includes(b)) return [a, b]
  }
  return null
}
function tryAmbient() {
  if (ambient || chatting || frame < ambientCool || !avatar) return
  const pair = nearAvatarPair()
  if (!pair) return
  ambientCool = frame + 99999 // lock while generating
  ambientDialogue(pair[0], pair[1], WRITE_LANG)
    .then((lines) => {
      if (lines.length) {
        ambient = { lines, idx: 0, nextAt: frame + 165 }
        pair[0].social.push(`hablé con ${pair[1].name}`); pair[1].social.push(`hablé con ${pair[0].name}`)
        while (pair[0].social.length > 6) pair[0].social.shift(); while (pair[1].social.length > 6) pair[1].social.shift()
      } else ambientCool = frame + 300
    })
    .catch(() => { ambientCool = frame + 300 })
}

function loop() {
  frame++
  // the avatar moves in REAL TIME (smooth) no matter how slow or fast the world clock runs
  if (avatar && !chatting && !paused) {
    driveAvatar()
    avatar.x += avatar.vx; avatar.y += avatar.vy
    if (avatar.vx > 0.05) avatar.facing = 1; else if (avatar.vx < -0.05) avatar.facing = -1
    avatar.x = clamp(avatar.x, 60, WORLD_W - 60); avatar.y = clamp(avatar.y, 60, WORLD_H - 60)
  }
  if (!paused) {
    const minPerFrame = SCALES[scaleIndex].rate / 60 // in-world minutes added this frame (~60fps)
    let steps = 0
    for (const cn of countries) {
      cn.world.clockMinutes += minPerFrame
      const want = Math.floor(cn.world.clockMinutes / 1440) // whole in-world days elapsed
      const cap = cn.world === world ? 40 : 10
      let s = 0
      while (cn.world.clockDays < want && s < cap) { cn.world.step(); s++ }
      steps += s
    }
    if (steps) worldAffairs(steps)
  }
  if (avatar) avatar.energy = Math.max(60, Math.min(150, avatar.energy)) // immortal visitor: ages, never starves
  // advance / start overheard chatter
  if (ambient) { if (frame >= ambient.nextAt) { ambient.idx++; if (ambient.idx >= ambient.lines.length) { ambient = null; ambientCool = frame + 480 } else ambient.nextAt = frame + 165 } }
  else tryAmbient()
  chatTarget = chatting ? chatTarget : nearestTalkable()

  // camera: follow the avatar, clamped to the world (centre it on any axis smaller than the view)
  const halfW = canvas.width / (2 * zoom), halfH = canvas.height / (2 * zoom)
  let cx = avatar ? avatar.x : WORLD_W / 2
  let cy = avatar ? avatar.y : WORLD_H / 2
  cx = WORLD_W <= 2 * halfW ? WORLD_W / 2 : clamp(cx, halfW, WORLD_W - halfW)
  cy = WORLD_H <= 2 * halfH ? WORLD_H / 2 : clamp(cy, halfH, WORLD_H - halfH)
  lastCam = { x: cx, y: cy, zoom }
  hovered = chatting ? null : creatureAt(mouseX, mouseY)

  const speech: { x: number; y: number; tag: string; text: string; understood: boolean }[] = []
  if (ambient && avatar) {
    const line = ambient.lines[ambient.idx]
    if (line && (line.who.x - avatar.x) ** 2 + (line.who.y - avatar.y) ** 2 < OVERHEAR * OVERHEAR) {
      const h = heard(line.text, countries[active].lang)
      speech.push({ x: line.who.x, y: line.who.y, tag: h.tag, text: h.text, understood: h.understood })
    }
  }

  drawWorld(ctx, world, assets, avatar, chatTarget, !!chatTarget && !chatting, lastCam, hovered, speech)
  drawChart(ctx, world, canvas.width - 230, 16, 214, 116)

  if (isAvatarDead()) {
    const old = avatar!.ageDays > avatar!.lifespanDays
    deathReason.textContent = old
      ? `viviste ${Math.round(ageYears(avatar!))} años. la vejez te alcanzó — así es el caldo.`
      : "te quedaste sin energía. el que no come, se apaga."
    deathScreen.classList.remove("hidden")
  }

  if (++saveAt >= 900) { saveAt = 0; saveGame() } // autosave ~every 15s
  updateHud()
  requestAnimationFrame(loop)
}

// ── game lifecycle: new / continue / save (a civilisation persists until you start a new one) ──
function startRunning() {
  buildTabs()
  document.getElementById("menu")!.classList.add("hidden")
  document.getElementById("newciv")!.classList.add("hidden")
  if (!loopStarted) { loopStarted = true; setScale(scaleIndex); loop() }
}
function newGame(cfg: CivConfig) {
  countries = cfg.countries.map((c, i) => ({
    name: c.name, flag: c.flag, lang: c.lang,
    world: new World(spriteCount, i, { startEra: cfg.startEra, religions: cfg.religions, violence: cfg.violence, psychopathy: cfg.psychopathy, gov: c.gov }),
  }))
  active = 0; world = countries[0].world; avatar = world.addAvatar()
  startRunning(); saveGame()
}
function continueGame(save: { active: number; savedAt: number; countries: { name: string; flag: string; lang: LangCode; state: unknown }[] }) {
  countries = save.countries.map((cc) => ({ name: cc.name, flag: cc.flag, lang: cc.lang, world: World.fromState(cc.state, spriteCount) }))
  active = Math.min(save.active || 0, countries.length - 1)
  world = countries[active].world; avatar = world.addAvatar()
  // offline progression — the civilisations kept advancing while you were away (capped so load is fast)
  const catchUp = Math.min(2500, Math.floor(Math.max(0, (Date.now() - (save.savedAt || Date.now())) / 1000)) * 20)
  for (let t = 0; t < catchUp; t++) for (const c of countries) c.world.step()
  startRunning()
}
function saveGame() {
  if (!countries.length) return
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ savedAt: Date.now(), active, countries: countries.map((c) => ({ name: c.name, flag: c.flag, lang: c.lang, state: c.world.toState() })) }))
  } catch { /* quota — non-fatal */ }
}
function loadSave(): { active: number; savedAt: number; countries: { name: string; flag: string; lang: LangCode; state: any }[] } | null {
  try { const raw = localStorage.getItem(SAVE_KEY); return raw ? JSON.parse(raw) : null } catch { return null }
}
window.addEventListener("beforeunload", saveGame)

// ── start menu + new-civilisation form ──
const menuEl = document.getElementById("menu")!
const newcivEl = document.getElementById("newciv")!
function showMenu() {
  const save = loadSave()
  const cont = document.getElementById("menu-continue") as HTMLButtonElement
  if (save?.countries?.length) {
    cont.classList.remove("hidden")
    cont.innerHTML = `▶ Continuar — ${save.countries.length} ${save.countries.length === 1 ? "país" : "países"} · ${eraName(save.countries[0].state.era)}`
    cont.onclick = () => { const s = loadSave(); if (s) continueGame(s) }
  } else cont.classList.add("hidden")
  newcivEl.classList.add("hidden")
  menuEl.classList.remove("hidden")
}
function buildNewCiv() {
  ;(document.getElementById("nc-era") as HTMLSelectElement).innerHTML = ERAS.map((e, i) => `<option value="${i}">${i}. ${e}</option>`).join("")
  document.getElementById("nc-religions")!.innerHTML = RELIGIONS.map((r, i) => `<label class="ncrow"><span>${r}</span><input type="range" min="0" max="100" value="${i === 0 ? 30 : 14}" data-rel="${i}"></label>`).join("")
  newcivEl.classList.remove("hidden")
}
function readConfig(): CivConfig {
  const num = (id: string) => Number((document.getElementById(id) as HTMLInputElement).value)
  const religions = RELIGIONS.map((name, i) => ({ name, pct: Number((newcivEl.querySelector(`[data-rel="${i}"]`) as HTMLInputElement).value) }))
  return {
    startEra: num("nc-era"),
    religions: religions.some((r) => r.pct > 0) ? religions : [{ name: RELIGIONS[1], pct: 100 }],
    violence: num("nc-violence") / 100,
    psychopathy: num("nc-psych") / 100,
    countries: buildCountries(Math.max(0, num("nc-mon")), Math.max(0, num("nc-rep"))),
  }
}
document.getElementById("menu-new")!.addEventListener("click", () => { menuEl.classList.add("hidden"); buildNewCiv() })
document.getElementById("nc-create")!.addEventListener("click", () => newGame(readConfig()))
document.getElementById("nc-back")!.addEventListener("click", () => { newcivEl.classList.add("hidden"); showMenu() })

let assets: Awaited<ReturnType<typeof loadAssets>>
loadAssets().then((a) => { assets = a; spriteCount = a.creatures.length; autoDetect(); showMenu() })
