// main.ts — bootstrap, the game loop, your avatar's controls, the TIME slider + in-world calendar,
// and the chat panel. 1 tick = 1 in-world DAY. You are a creature under the same rules: you walk
// (WASD), age, must eat, and can die of hunger or old age. Your one "non-power": press E to talk.
// Conversation pauses the world automatically, so you can talk at any time scale.

import "./style.css"
import { World, Creature, House, formatClock, ageYears, isMature, seasonOf, SEASONS, WORLD_W, WORLD_H, resetCreatureIds } from "./world"
import { loadAssets } from "./sprites"
import { drawWorld, drawChart } from "./render"
import { respond, greeting, remember, ambientDialogue } from "./chat"
import { Msg, setLlm, pingLLM, autoDetect, llmConfigured, llmUrl, llmModel } from "./llm"
import { seedRng, rngState, setRngState, rand } from "./rng"
import { worldAffairs, relationScore, relationLabel } from "./affairs"
import { eraName, professionSpace, ERAS, eraProgress } from "./civ"
import { ENNEAGRAM } from "./psyche"
import { LangCode, WRITE_LANG, langName, heard } from "./i18n"
import { CivConfig, RELIGIONS, buildCountries, foodSystem, transportOf, climateOf } from "./civconfig"
import { ethosOf, cultureReligions } from "./cultures"
import { innerLine, EMO } from "./life"
import { init3D, resize3D, render3D, renderInterior, ROOM, pick3D, project3D } from "./three3d"
import { wealthStats, influentialByGen } from "./society"
import { composeWork, cachedWork } from "./works"

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
// SECURITY: escape any dynamic string before putting it in innerHTML (creature names/professions/chronicle can
// come from a crafted save; LLM output is fully untrusted). Defined early so every template can use it.
const esc = (s: string) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")

const canvas = document.getElementById("world") as HTMLCanvasElement
const ctx = canvas.getContext("2d")!
const canvas3d = document.getElementById("world3d") as HTMLCanvasElement
const speech3d = document.getElementById("speech3d") as HTMLDivElement
const chatterfeed = document.getElementById("chatterfeed") as HTMLDivElement
let chatterLines: string[] = []
function updateChatter() { // a live murmur of what people NEAR you are gossiping about (decoded from the codes)
  const me = possessed || avatar
  if (!me) { chatterfeed.classList.add("hidden"); return }
  for (const c of world.creatures) {
    if (c === me || c.isAvatar || !c.heard) continue
    const dx = c.x - me.x, dy = c.y - me.y; if (dx * dx + dy * dy > 300 * 300) continue
    const line = `${c.name}: ${c.heard}`
    if (chatterLines[chatterLines.length - 1] !== line) { chatterLines.push(line); if (chatterLines.length > 5) chatterLines.shift() }
  }
  if (chatterLines.length) { chatterfeed.innerHTML = "📻 <b>se murmura cerca</b><br>" + chatterLines.map((l) => "· " + esc(l)).join("<br>"); chatterfeed.classList.remove("hidden") }
}
const npccard = document.getElementById("npccard") as HTMLDivElement
// click a person in 3D → show their card (info + actions) on the left, like you asked
function showNpcCard(c: Creature | null) {
  if (!c || !possessed) { npccard.classList.add("hidden"); return }
  const rel = c.partner === possessed.id ? "💗 tu pareja" : c.surname === possessed.surname ? "💚 familia" : "🤍 vecino/a"
  const canCourt = isMature(c) && isMature(possessed) && !c.partner && !possessed.partner && c.id % 2 !== possessed.id % 2
  const L = c.life
  const emo = L && L.emoInt > 0.2 && L.emotion !== "neutral" ? `${(EMO as Record<string, string>)[L.emotion] || ""} ${L.emotion}` : ""
  const repTag = L ? (L.rep > 0.35 ? "🌟 admirado/a" : L.rep < -0.35 ? "⚠️ mal visto/a" : "") : ""
  let relsRow = ""
  if (L && Object.keys(L.rels).length) {
    const es = Object.entries(L.rels).map(([id, v]) => ({ o: world.creatures.find((x) => x.id === +id), v })).filter((e) => e.o)
    const fr = es.filter((e) => e.v > 0.3).sort((a, b) => b.v - a.v)[0], rv = es.filter((e) => e.v < -0.3).sort((a, b) => a.v - b.v)[0]
    const parts = [fr ? `💚 ${esc(fr.o!.name)}` : "", rv ? `💔 ${esc(rv.o!.name)}` : ""].filter(Boolean).join(" · ")
    if (parts) relsRow = `<div class="nc-row">${parts}</div>`
  }
  const dyn = world.dynasty(c.surname)
  const par = c.parents ? c.parents.map((pid) => world.creatures.find((x) => x.id === pid)).filter(Boolean) : []
  const parLine = par.length ? `<div class="nc-row">👪 hijo/a de ${par.map((p) => esc(p!.name)).join(" y ")}${c.children > 0 ? ` · ${c.children} hijos` : ""}</div>` : c.children > 0 ? `<div class="nc-row">👪 ${c.children} hijos</div>` : ""
  npccard.innerHTML = `
    <div class="nc-name">${esc(c.name)} ${esc(c.surname)}</div>
    <div class="nc-row">${esc(c.profession || "sin oficio")}${L && L.mastery > 0.6 ? " 🛠️ maestro/a" : L && L.mastery > 0.3 ? " · oficial" : ""} · ${Math.round(ageYears(c))} años · ${rel} ${repTag}</div>
    <div class="nc-row">🏛 casa ${esc(c.surname)} · ${dyn.size} ${dyn.size === 1 ? "miembro" : "miembros"}${dyn.rep > 0.3 ? " · linaje admirado" : dyn.rep < -0.3 ? " · linaje en desgracia" : ""}</div>
    ${parLine}
    ${L ? `<div class="nc-inner">${emo ? emo + " · " : ""}${innerLine(c)}</div>` : ""}
    ${(c.away || 0) > 0 ? `<div class="nc-row">🧳 de viaje a ${esc(c.awayTo || "otro pueblo")}</div>` : ""}
    ${c.langs && c.langs.length ? `<div class="nc-row">🗣 lenguas: ${esc([countries[active]?.name || "su pueblo", ...c.langs].join(", "))}</div>` : ""}
    ${c.heard ? `<div class="nc-row">💬 escuchó: «${esc(c.heard)}»</div>` : ""}
    ${c.social?.length ? `<div class="nc-feed">${c.social.slice(-3).map((s) => "· " + esc(s)).join("<br>")}</div>` : ""}
    ${c.sigs?.length ? `<div class="nc-code">📡 hablando en código: ${esc(c.sigs.slice(-4).join(" "))}</div>` : ""}
    ${L ? `<div class="nc-row">🎯 ${esc(L.goal)} <span class="rbar"><i style="width:${Math.round(L.goalProg * 100)}%"></i></span></div><div class="nc-row">🎨 ${esc(L.hobby)} · «${esc(L.quirk)}»</div>` : ""}
    ${relsRow}
    <div class="nc-row">💰 ${Math.round(c.money)} · ${c.money > 800 ? "🎩 rico/a" : c.money > 200 ? "acomodado/a" : c.money > 15 ? "clase media" : "pobre"}${c.home.landlord && c.home.landlord !== c.id && c.home.surname !== c.surname ? " · 🔑 inquilino/a" : ""}${world.houses.some((h) => h.landlord === c.id) ? " · 🏘 propietario/a" : ""}</div>
    <div class="nc-row">🧠 ${Math.round(c.mental)} · 😤 ${Math.round(c.irritability * 100)}% · 🍔 ${Math.round(c.energy)}${L && L.condition ? ` · <b style="color:#d68">${L.condition}</b>` : ""}</div>
    <div class="nc-acts"><button id="nc-talk">💬 Hablar</button>${possessed.items?.length ? `<button id="nc-gift">🎁 Regalar ${itemEmoji(possessed.items[0])}</button>` : ""}${canCourt ? '<button id="nc-court">💘 Cortejar</button>' : ""}${isMature(c) ? '<button id="nc-possess">🎭 Ser</button>' : ""}<button id="nc-x">✕</button></div>`
  npccard.classList.remove("hidden")
  document.getElementById("nc-talk")!.onclick = () => { showNpcCard(null); openChat(c) }
  document.getElementById("nc-x")!.onclick = () => showNpcCard(null)
  const cb = document.getElementById("nc-court"); if (cb) cb.onclick = () => { showNpcCard(null); chatTarget = c; doAction("court") }
  const gb = document.getElementById("nc-gift")
  if (gb) gb.onclick = () => { // give them your first item — a gift warms the friendship + their spirit
    if (!possessed || !possessed.items?.length) return
    const k = possessed.items[0]; possessed.items = possessed.items.slice(1)
    c.items = [...(c.items || []), k].slice(-12)
    if (c.life) { c.life.rels[possessed.id] = Math.min(8, (c.life.rels[possessed.id] || 0) + 2); c.life.emotion = "alegre"; c.life.emoInt = 0.85 }
    c.mental = Math.min(100, c.mental + 6)
    world.chronicle.push({ day: world.clockDays, text: `${possessed.name} le regaló ${itemEmoji(k)} a ${c.name} 🎁` })
    flash(`le regalaste ${itemEmoji(k)} a ${c.name} 🎁`); showNpcCard(c)
  }
  const pb = document.getElementById("nc-possess") // jump into THIS body (possess the one you clicked, not the nearest)
  if (pb) pb.onclick = () => { if (possessed) possessed.controlled = false; possessed = c; c.controlled = true; possessTarget = null; possessBusy = null; insideHouse = null; chatTarget = null; showNpcCard(null); flash(`ahora sos ${c.name} 🎭`); renderPossess() }
}
// drag the 3D view to look around (yaw + pitch); a CLICK (no drag) on a person talks to them
let dragging = false, dragX = 0, dragY = 0, dragDist = 0
canvas3d.addEventListener("mousedown", (e) => { dragging = true; dragX = e.clientX; dragY = e.clientY; dragDist = 0 })
window.addEventListener("mouseup", (e) => {
  if (dragging && dragDist < 7 && possessed && !insideHouse && !chatting) {
    const r = canvas3d.getBoundingClientRect()
    const t = pick3D(world, possessed, e.clientX - r.left, e.clientY - r.top, r.width, r.height)
    if (t) { chatTarget = t; showNpcCard(t) } // click a person → show their card (info + actions)
  }
  dragging = false
})
window.addEventListener("mousemove", (e) => {
  if (!dragging || !possessed) return
  dragDist += Math.abs(e.clientX - dragX) + Math.abs(e.clientY - dragY)
  camYaw3d += (e.clientX - dragX) * 0.005
  camPitch3d = Math.max(-0.55, Math.min(0.9, camPitch3d - (e.clientY - dragY) * 0.005))
  dragX = e.clientX; dragY = e.clientY
})

function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; resize3D(window.innerWidth, window.innerHeight) }
resize()
window.addEventListener("resize", resize)

let zoom = 1, targetZoom = 1 // zoom eases toward targetZoom for a cinematic possess zoom-in
window.addEventListener("wheel", (e) => {
  e.preventDefault()
  targetZoom = clamp(targetZoom * (e.deltaY < 0 ? 1.12 : 0.89), 0.35, 2.8)
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
let frame = 0
let gameSeed = 1          // the run's RNG seed (reproducible); persisted in the save
let pendingCatchUp = 0    // offline-progression ticks still to process, chunked across frames
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
let possessed: Creature | null = null // the creature you've taken over (P) — you play AS them
let possessTarget: { x: number; y: number } | null = null
let possessBusy: { until: number; label: string; reward: "work" | "study" } | null = null // working/studying a shift
let flashMsg = "", flashUntil = 0 // transient toast in the possession panel
let camYaw3d = Math.PI / 2 // 3rd-person camera facing (A/D turn it; W/S walk along it)
let camPitch3d = 0 // vertical look (drag the mouse up/down)
let insideHouse: House | null = null // the house you've entered (interior view)
let roomX = 0, roomZ = 0 // your position inside the room (3D units)
let chatTarget: Creature | null = null
let paused = false
let scaleIndex = 0
// while possessing, time runs near-real-time so you can live the day; a small button steps 1x→2x→3x→5x (min/s)
const POSSESS_SPEEDS = [1, 2, 3, 5]
let possessSpeedIdx = 0
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
const pspeedBtn = document.getElementById("pspeed") as HTMLButtonElement
pspeedBtn.addEventListener("click", (e) => {
  e.stopPropagation()
  possessSpeedIdx = (possessSpeedIdx + 1) % POSSESS_SPEEDS.length
  pspeedBtn.textContent = `⏩ ${POSSESS_SPEEDS[possessSpeedIdx]}x`
  pspeedBtn.blur()
})
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
document.getElementById("cfg-save")!.addEventListener("click", () => {
  if (!setLlm(cfgUrl.value, cfgModel.value)) { cfgStatus.textContent = "✗ usá una URL https:// (o localhost) — http inseguro rechazado"; cfgStatus.style.color = "#ff8c6a"; return }
  settings.classList.add("hidden")
})
document.getElementById("cfg-test")!.addEventListener("click", async () => {
  if (!setLlm(cfgUrl.value, cfgModel.value)) { cfgStatus.textContent = "✗ usá una URL https:// (o localhost)"; cfgStatus.style.color = "#ff8c6a"; return }
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
    <h2>${esc(c.name)} ${esc(c.surname)}</h2>
    <div class="row dim">${esc(c.profession || "sin oficio")} · ${Math.round(ageYears(c))} años · gen ${c.generation}</div>
    <div class="row dim">cree en ${esc(c.religion || "nada")}${c.powerHungry ? " · <b style='color:#ff8c6a'>sed de poder</b>" : ""}</div>
    <div class="row">${c.children} ${c.children === 1 ? "hijo" : "hijos"} · saber ${Math.round(c.knowledge)} · ${c.sick ? '<b style="color:#8fe39a">enfermo ✚</b>' : "sano"}</div>
    <h3>núcleo · ${t.name}</h3><div class="row dim">anhela ${t.desire}; teme ${t.fear}</div>
    <h3>personalidad</h3>${five.map(([l, v]) => `<div class="prow"><span>${l}</span>${pbar(v, "#9bb8ff")}</div>`).join("")}
    <h3>creencias</h3><div class="row dim">${[t.belief, ...p.beliefs].map((b) => `“${esc(b)}”`).join("<br>")}</div>
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
    chronicleBody.innerHTML = world.chronicle.length ? world.chronicle.slice().reverse().map((e) => `<div class="row"><b>${formatClock(e.day)}</b> — ${esc(e.text)}</div>`).join("") : "<div class='row dim'>aún no pasó nada digno de registro…</div>"
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
    ${(() => { const a = wild.filter(isMature); const av = (f: (c: typeof wild[0]) => number) => a.length ? Math.round(a.reduce((s, c) => s + f(c), 0) / a.length) : 0; return row("salud · ánimo · irritab.", `${av((c) => c.health)} · ${av((c) => c.mental)} · ${av((c) => c.irritability * 100)}%`) })()}
    <h3>Familias y nacimientos</h3>
    ${row("parejas · familias", `${couples} · ${families}`)}
    ${row("divorcios · hijos s/casar", `${world.deeds.filter((d) => d.kind === "divorcio").length} · ${wild.filter((c) => c.parents && c.parents[1] === 0).length}`)}
    ${row("embarazos ahora", `${pregnant}`)}
    ${row("nacimientos · muertes (histórico)", `${world.births} · ${world.deaths}`)}
    ${row("hijos por persona", avgKids)}
    <h3>Ideologías / religiones</h3>
    <div class="sline">${top(rel, (k, v) => `${k} ${Math.round(100 * v / n)}%`)}</div>
    <h3>Oficios (por categoría)</h3>
    <div class="sline">${top(cat, (k, v) => `${k} ${v}`)}</div>
    <h3>De qué hablan</h3>
    <div class="sline">${Object.keys(topics).length ? Object.entries(topics).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k]) => esc(k)).join(" · ") : "todavía nada"}</div>
    <h3>Transporte</h3>
    <div class="sline">${transportOf(world.era)}</div>
    <h3>Relaciones exteriores</h3>
    <div class="sline">${countries.filter((c) => c !== countries[active]).map((c) => `${esc(c.flag)} ${esc(c.name)}: ${relationLabel(relationScore(countries[active], c))}`).join("<br>") || "—"}</div>
    <h3>Riqueza</h3>
    ${(() => { const ws = wealthStats(world); return `${row("desigualdad (Gini)", ws.gini.toFixed(2))}${row("pobre · medio · rico", `${ws.p10} · ${ws.p50} · ${ws.p90}`)}${row("emprendedores · en deuda", `${ws.entrepreneurs} · ${ws.poor}`)}<div class="sline">más ricos: ${ws.richest.slice(0, 3).map((r) => `${esc(r.name)} (${r.money})`).join(" · ") || "—"}</div>` })()}
    <h3>Sociedad (histórico)</h3>
    ${(() => { const k = (kind: string) => world.deeds.filter((d) => d.kind === kind).length; return `${row("crímenes · juicios", `${k("crimen")} · ${k("justicia")}`)}${row("negocios · quiebras", `${k("negocio")} · ${k("quiebra")}`)}${row("libros · obras de arte", `${k("libro")} · ${k("obra")}`)}` })()}
    <h3>Política y movimientos</h3>
    ${(() => { const k = (kind: string) => world.deeds.filter((d) => d.kind === kind).length; const sysl = world.system === "capitalista" ? "💵 capitalista" : world.system === "socialista" ? "🤝 socialista" : "⛓ dictadura"; return `${row("sistema", sysl)}${row("sindicatos · subversivos", `${k("sindicato")} · ${k("subversivo") + k("reforma")}`)}${row("represión (desaparecidos)", `${world.repressed}`)}` })()}
    <h3>Conflictividad</h3>
    ${row("ambiciosos (sed de poder)", `${ambitious}`)}
    ${row("nivel de crimen", `${crime}%`)}
    ${row("riesgo de guerra", `${war}%`)}`
}
function toggleStats() { if (statsEl.classList.contains("hidden")) statsBody.innerHTML = statsHTML(); statsEl.classList.toggle("hidden") }
document.getElementById("stats-close")!.addEventListener("click", () => statsEl.classList.add("hidden"))
document.getElementById("statsbtn")!.addEventListener("click", () => { toggleStats(); (document.getElementById("statsbtn") as HTMLElement).blur() })

// ── legends: the most influential people per generation, and what they did ──
const legendsEl = document.getElementById("legends") as HTMLDivElement
const legendsBody = document.getElementById("legends-body")!
function legendsHTML(): string {
  const gens = influentialByGen(world, 4)
  if (!gens.length) return "<p class='dim'>Todavía no hay hechos memorables en esta civilización.</p>"
  return gens.slice().reverse().map((g) =>
    `<h3>Generación ${g.gen}</h3>` + g.people.map((p) =>
      `<div class="srow"><span>${esc(p.name)}</span><b style="color:${p.impact >= 0 ? "#8fe3a0" : "#e0788a"}">${p.impact >= 0 ? "+" : ""}${p.impact}</b></div>` +
      `<div class="sline">${esc(p.deeds.slice(-3).join(" · ")) || "figura de su tiempo"}</div>` +
      p.works.slice(-3).map((w) => {
        const key = `${w.who}:${w.title}`, r = cachedWork(key)
        const body = r && !r.loading
          ? `<div class="excerpt">${esc(r.text)}${r.prompt ? `<div class="prompt">🎨 prompt: ${esc(r.prompt)}</div>` : ""}</div>`
          : r && r.loading ? `<div class="excerpt">generando… ✨</div>`
          : `<div class="excerpt">${esc(w.content)} <span class="gen">— click para ${w.kind === "libro" ? "leerlo" : "verlo"} 🤖</span></div>`
        return `<div class="work" data-wk="${esc(key)}" data-kind="${esc(w.kind)}" data-author="${esc(p.name)}" data-title="${esc(w.title)}">${w.kind === "libro" ? "📖" : "🖼️"} <i>${esc(w.text)}</i>${body}</div>`
      }).join("")
    ).join("")
  ).join("")
}
function toggleLegends() { if (legendsEl.classList.contains("hidden")) legendsBody.innerHTML = legendsHTML(); legendsEl.classList.toggle("hidden") }
document.getElementById("legends-close")!.addEventListener("click", () => legendsEl.classList.add("hidden"))
document.getElementById("legendsbtn")!.addEventListener("click", () => { toggleLegends(); (document.getElementById("legendsbtn") as HTMLElement).blur() })
legendsBody.addEventListener("click", async (e) => { // click a work → the LLM writes/describes it for real
  const el = (e.target as HTMLElement).closest(".work") as HTMLElement | null
  if (!el || !el.dataset.wk || cachedWork(el.dataset.wk)) return
  const p = composeWork(el.dataset.wk, el.dataset.kind as "libro" | "obra", el.dataset.author!, eraName(world.era), el.dataset.title!, countries[active].lang)
  legendsBody.innerHTML = legendsHTML() // show "generando…"
  await p
  legendsBody.innerHTML = legendsHTML() // show the result
})

// ── possession (P): take over a creature and play AS them, Sims-style ──
const possessEl = document.getElementById("possess") as HTMLDivElement
const possessBody = document.getElementById("possess-body")!
function togglePossess() {
  if (possessed) { // release → back to the 2D god-view
    possessed.controlled = false; possessed = null; possessTarget = null; insideHouse = null
    possessEl.classList.add("hidden"); hud.classList.remove("hidden"); canvas3d.classList.add("hidden")
    return
  }
  const me = possessed || avatar // possess a grown villager nearby (not a baby — they can't work/court/etc.)
  const t = me ? world.nearestCreature(me, CHAT_RANGE * 1.6, (o) => !o.isAvatar && o !== possessed && isMature(o)) : null
  if (!t) return
  possessed = t; t.controlled = true; possessTarget = null; possessBusy = null; insideHouse = null; camYaw3d = Math.PI / 2
  init3D(canvas3d, assets.creatures); resize3D(canvas.width, canvas.height) // real 3D, only while possessing
  canvas3d.classList.remove("hidden"); possessEl.classList.remove("hidden"); hud.classList.add("hidden")
  renderPossess()
}
// ── context-aware actions: hours, places, eligibility, refusal, work/study shifts ──
function hourOf(): number { return (world.clockMinutes % 1440) / 60 }
function dist2(ax: number, ay: number, bx: number, by: number) { return (ax - bx) ** 2 + (ay - by) ** 2 }
function nearestPt(arr: { x: number; y: number; w?: number; h?: number }[], c: Creature) {
  let best: { x: number; y: number } | null = null, bd = Infinity
  for (const b of arr) { const x = b.x + (b.w ? b.w / 2 : 0), y = b.y + (b.h ? b.h / 2 : 0); const d = dist2(x, y, c.x, c.y); if (d < bd) { bd = d; best = { x, y } } }
  return best
}
// the 2D answer to NavMesh pathfinding: if a person ends a step inside a house that isn't their own home, slide
// them out along the nearest wall — so they flow around buildings + down the streets instead of clipping through.
function avoidBuildings(c: Creature) {
  const pad = 6, push = 2.6
  for (const h of world.houses) {
    if (h === c.home) continue
    if (c.x > h.x - pad && c.x < h.x + h.w + pad && c.y > h.y - pad && c.y < h.y + h.h + pad) {
      const dl = c.x - (h.x - pad), dr = (h.x + h.w + pad) - c.x, dt = c.y - (h.y - pad), db = (h.y + h.h + pad) - c.y
      const m = Math.min(dl, dr, dt, db)
      if (m === dl) c.x -= push; else if (m === dr) c.x += push; else if (m === dt) c.y -= push; else c.y += push
      return // one nudge per frame is enough; it'll keep sliding next frame
    }
  }
}
function workplaceOf(c: Creature): { x: number; y: number; name: string } | null {
  if (!c.profCat) { world.releaseSlot(c); return null }
  if (c.profCat === "enseñanza") { world.releaseSlot(c); const s = nearestPt(world.schools, c); return s && { ...s, name: "la escuela" } }
  if (c.profCat === "saber" || c.profCat === "ingeniería" || c.profCat === "salud") { world.releaseSlot(c); const u = nearestPt(world.universities, c); return u ? { ...u, name: "la universidad" } : { x: WORLD_W / 2, y: WORLD_H / 2, name: "la plaza" } }
  if (c.profCat === "comida" || c.profCat === "cuidado") { world.releaseSlot(c); const g = nearestPt(world.gardens, c); return g && { ...g, name: "los campos" } }
  // merchants, leaders + crafters claim a market stall / work station + stand at it (no more piling on the centre)
  const s = world.claimSlot(c, c.profCat === "comercio" || c.profCat === "liderazgo" ? "market" : "work", WORLD_W / 2, WORLD_H / 2)
  return s ? { ...s, name: "el mercado" } : { x: WORLD_W / 2, y: WORLD_H / 2, name: "la plaza / mercado" }
}
// where a person SHOULD be right now — drives their daily rhythm so the town is never frozen
let routinePhase = 0
function studyPlaceOf(c: Creature): { x: number; y: number; name: string } | null {
  const a = ageYears(c)
  if (a >= 6 && a < 18) { const s = nearestPt(world.schools, c); return s && { ...s, name: "la escuela" } }
  if (a >= 18 && a <= 28 && world.universities.length) return { ...nearestPt(world.universities, c)!, name: "la universidad" }
  return null
}
function courtTargetNear(c: Creature) { return world.nearestCreature(c, 95, (o) => !o.isAvatar && isMature(o) && !o.partner && o !== c && ageYears(o) <= 52) }
type ActState = { ok: boolean; reason: string; walkTo?: { x: number; y: number } }
// things you can find, carry, USE (an effect) or GIFT to someone (a token of friendship)
const ITEMS: Record<string, { emoji: string; use: (c: Creature) => void; msg: string }> = {
  flor: { emoji: "🌸", use: (c) => { c.mental = Math.min(100, c.mental + 10) }, msg: "la flor te alegró 🌸" },
  fruta: { emoji: "🍎", use: (c) => { c.energy = Math.min(150, c.energy + 30) }, msg: "comiste la fruta 🍎" },
  baya: { emoji: "🫐", use: (c) => { c.energy = Math.min(150, c.energy + 18) }, msg: "comiste unas bayas 🫐" },
  hierba: { emoji: "🌿", use: (c) => { c.health = Math.min(100, c.health + 12) }, msg: "la hierba medicinal te curó 🌿" },
  concha: { emoji: "🐚", use: (c) => { c.mental = Math.min(100, c.mental + 6) }, msg: "admiraste la concha 🐚" },
  amuleto: { emoji: "🪬", use: (c) => { c.mental = Math.min(100, c.mental + 9) }, msg: "el amuleto te dio ánimo 🪬" },
  piedra: { emoji: "🪨", use: (c) => { c.mental = Math.min(100, c.mental + 3) }, msg: "una piedra curiosa 🪨" },
  miel: { emoji: "🍯", use: (c) => { c.energy = Math.min(150, c.energy + 26); c.mental = Math.min(100, c.mental + 5) }, msg: "la miel te endulzó el día 🍯" },
  raiz: { emoji: "🥕", use: (c) => { c.energy = Math.min(150, c.energy + 22); c.health = Math.min(100, c.health + 4) }, msg: "comiste una raíz nutritiva 🥕" },
  pluma: { emoji: "🪶", use: (c) => { c.mental = Math.min(100, c.mental + 7) }, msg: "guardaste la pluma como talismán 🪶" },
}
const itemEmoji = (k: string) => ITEMS[k]?.emoji || "❔"
function nearGarden(c: Creature): boolean { return world.gardens.some((g) => dist2(g.x, g.y, c.x, c.y) < 120 * 120) }

function actionState(act: string): ActState {
  const c = possessed
  if (!c) return { ok: false, reason: "" }
  if (possessBusy) return { ok: false, reason: "ocupado…" }
  const h = hourOf(), AT = 130 * 130
  if (act === "gather") return (c.items?.length || 0) >= 12 ? { ok: false, reason: "no podés cargar más" } : { ok: true, reason: "buscar algo por los alrededores 🔎" }
  if (act === "use") return c.items?.length ? { ok: true, reason: `usar ${itemEmoji(c.items[0])} ${c.items[0]}` } : { ok: false, reason: "no tenés nada que usar" }
  if (act === "harvest") return world.nearestFood(c, 85) ? { ok: true, reason: "cosechar el cultivo de acá 🌾" } : { ok: false, reason: "acercate a un cultivo (los brotes verdes)" }
  if (act === "rest") return c.energy > 135 ? { ok: false, reason: "no estás cansado" } : { ok: true, reason: "descansar un rato (recupera energía + ánimo) 😴" }
  if (act === "eat") return { ok: true, reason: "comer (recupera energía)" }
  if (act === "home") return { ok: true, reason: "caminar a tu casa" }
  if (act === "talk") return chatTarget ? { ok: true, reason: `hablar con ${chatTarget.name}` } : { ok: false, reason: "no hay nadie cerca" }
  if (act === "work") {
    const wp = workplaceOf(c)
    if (!wp) return { ok: false, reason: "todavía no tenés oficio" }
    if (h < 8 || h >= 17) return { ok: false, reason: `tu turno es 8–17h (son las ${Math.floor(h)}h)` }
    if (dist2(wp.x, wp.y, c.x, c.y) > AT) return { ok: false, reason: `andá a ${wp.name} para trabajar`, walkTo: wp }
    return { ok: true, reason: `trabajar en ${wp.name} (jornada)` }
  }
  if (act === "study") {
    const sp = studyPlaceOf(c)
    if (!sp) return { ok: false, reason: ageYears(c) < 6 ? "muy chico para estudiar" : "ya no estás en edad escolar" }
    if (h < 8 || h >= 14) return { ok: false, reason: `clases 8–14h (son las ${Math.floor(h)}h)` }
    if (dist2(sp.x, sp.y, c.x, c.y) > AT) return { ok: false, reason: `andá a ${sp.name}`, walkTo: sp }
    return { ok: true, reason: `estudiar en ${sp.name}` }
  }
  if (act === "court") {
    if (!isMature(c)) return { ok: false, reason: "muy joven para cortejar" }
    if (c.partner) return { ok: false, reason: "ya tenés pareja" }
    const t = courtTargetNear(c)
    return t ? { ok: true, reason: `cortejar a ${t.name} (puede negarse)` } : { ok: false, reason: "no hay soltero/a cerca" }
  }
  if (act === "enter") {
    if (insideHouse) return { ok: true, reason: "salir de la casa" }
    const h = houseAtDoor(c)
    if (!h) return { ok: false, reason: "acercate a la puerta de una casa" }
    if (!mayEnter(c, h)) return { ok: false, reason: "la puerta está cerrada (no te dejan pasar)" }
    return { ok: true, reason: c.home === h ? "entrar a tu casa" : "te dejan pasar" }
  }
  if (act === "child") {
    if (!c.partner) return { ok: false, reason: "necesitás una pareja" }
    const p = world.creatures.find((o) => o.id === c.partner)
    if (!p) return { ok: false, reason: "tu pareja no está acá" }
    if (dist2(p.x, p.y, c.x, c.y) > 120 * 120) return { ok: false, reason: `acercate a ${p.name}`, walkTo: { x: p.x, y: p.y } }
    if (c.pregnant > 0) return { ok: false, reason: "ya estás embarazada" }
    if (c.energy < 55) return { ok: false, reason: "necesitás energía (comé)" }
    return { ok: true, reason: `formar familia con ${p.name} (puede negarse)` }
  }
  return { ok: false, reason: "" }
}
function flash(t: string) { flashMsg = t; flashUntil = frame + 150 }
function startBusy(reward: "work" | "study", mins: number, label: string) { possessBusy = { until: world.clockMinutes + mins, label, reward }; possessTarget = null; flash(label + "…"); renderPossess() }
function finishBusy() {
  const c = possessed
  if (c && possessBusy) {
    if (possessBusy.reward === "work") { const g = Math.round(40 * (1 + world.era * 0.12)); c.money += g; c.energy = Math.max(0, c.energy - 25); flash(`jornada cumplida · +${g} 💰`) }
    else { c.knowledge = Math.min(100, c.knowledge + 10); c.energy = Math.max(0, c.energy - 12); flash("día de clases · +saber 🧠") }
  }
  possessBusy = null; renderPossess()
}
function renderPossess() {
  const c = possessed; if (!c) return
  const e = Math.round(Math.max(0, c.energy))
  const bar = "█".repeat(Math.max(0, Math.round(e / 12))).padEnd(12, "·")
  const partner = c.partner ? world.creatures.find((o) => o.id === c.partner) : null
  const toast = possessBusy ? `<div class="ptoast">⏳ ${esc(possessBusy.label)}… 🌙</div>` : (frame < flashUntil ? `<div class="ptoast">${esc(flashMsg)}</div>` : "")
  possessBody.innerHTML = `
    <div class="pname">🎭 ${esc(c.name)} ${esc(c.surname)}</div>
    <div class="prow2">${esc(c.profession || "sin oficio")} · ${Math.round(ageYears(c))} años · 🕐 ${Math.floor(hourOf())}h</div>
    <div class="prow2">💰 <b>${Math.round(c.money)}</b> · 🍔 ${bar} ${e}${c.pregnant > 0 ? " · 🤰" : ""}</div>
    <div class="prow2">❤️ salud ${Math.round(c.health)} · 🧠 ánimo ${Math.round(c.mental)} · 😤 irrit. ${Math.round(c.irritability * 100)}%</div>
    <div class="prow2">${partner ? "❤️ " + esc(partner.name) : "💔 sin pareja"} · 👶 ${c.children} · 🧠 ${Math.round(c.knowledge)}</div>
    <div class="prow2">${esc(c.religion || "sin credo")}${c.sick ? " · <b style='color:#8fe39a'>enfermo ✚</b>" : ""}</div>
    ${c.items?.length ? `<div class="prow2">🎒 ${c.items.map((k) => itemEmoji(k)).join(" ")}</div>` : ""}
    <div class="plegend">⚪ vos · 💗 pareja · 💚 familia · 💛 conocido · ❤️ rival</div>
    ${toast}`
  possessEl.querySelectorAll("button[data-act]").forEach((b) => {
    const st = actionState((b as HTMLElement).dataset.act!)
    ;(b as HTMLButtonElement).disabled = !st.ok && !st.walkTo
    ;(b as HTMLButtonElement).title = st.reason
    b.classList.toggle("dim", !st.ok)
  })
  const eb = possessEl.querySelector('button[data-act="enter"]') as HTMLButtonElement | null
  if (eb) eb.textContent = insideHouse ? "🚪 Salir" : "🚪 Entrar"
}
function doAction(act: string) {
  const c = possessed; if (!c) return
  const st = actionState(act)
  if (!st.ok) { if (st.walkTo) { possessTarget = st.walkTo; flash("caminando… 🚶") } else if (st.reason) flash(st.reason); renderPossess(); return }
  if (act === "eat") { c.energy = Math.min(150, c.energy + 50); c.money = Math.max(0, c.money - 4); flash("comiste 🍎") }
  else if (act === "gather") { // search the surroundings — gardens yield food/herbs, the wilds trinkets
    if (rand() < 0.18) { flash("buscaste pero no encontraste nada 🤷") }
    else { const pool = nearGarden(c) ? ["fruta", "baya", "hierba", "flor", "raiz", "miel"] : ["flor", "concha", "piedra", "amuleto", "hierba", "pluma"]; const k = pool[Math.floor(rand() * pool.length)]; c.items = [...(c.items || []), k].slice(-12); flash(`encontraste ${itemEmoji(k)} ${k}`) }
  }
  else if (act === "use") { if (c.items?.length) { const k = c.items[0]; ITEMS[k]?.use(c); c.items = c.items.slice(1); flash(ITEMS[k]?.msg || "lo usaste") } }
  else if (act === "harvest") { const f = world.nearestFood(c, 85); if (f) { world.food.splice(world.food.indexOf(f), 1); c.items = [...(c.items || []), "fruta"].slice(-12); flash("cosechaste 🌾🍎") } }
  else if (act === "rest") { c.energy = Math.min(150, c.energy + 35); c.mental = Math.min(100, c.mental + 12); c.health = Math.min(100, c.health + 3); flash("descansaste 😴") }
  else if (act === "home") { possessTarget = { x: c.home.x + c.home.w / 2, y: c.home.y + c.home.h }; flash("yendo a casa 🏠") }
  else if (act === "talk") openChat()
  else if (act === "work") startBusy("work", 480, "trabajando 💼")
  else if (act === "study") startBusy("study", 360, "estudiando 📚")
  else if (act === "court") {
    const t = courtTargetNear(c)
    if (t) {
      let p = 0.4; if (c.religion && c.religion === t.religion) p += 0.2; p -= Math.min(0.3, Math.abs(ageYears(c) - ageYears(t)) / 60)
      if (rand() < clamp(p, 0.12, 0.9)) { c.partner = t.id; t.partner = c.id; world.chronicle.push({ day: world.clockDays, text: `${c.name} y ${t.name} se enamoraron ❤️` }); flash(`¡${t.name} aceptó! ❤️`) }
      else flash(`${t.name} te rechazó 💔`)
    }
  } else if (act === "enter") {
    if (insideHouse) { exitHouse(); flash("saliste 🚪") }
    else { const h = houseAtDoor(c); if (h && mayEnter(c, h)) { enterHouse(h); flash(c.home === h ? "entraste a tu casa 🏠" : "te dejaron pasar 🚪") } }
  } else if (act === "child") {
    const p = world.creatures.find((o) => o.id === c.partner)
    if (p) { if (rand() < 0.7) { c.pregnant = 210 + Math.floor(rand() * 60); flash("¡van a tener un hijo! 🤰") } else flash(`${p.name} no quiere ahora`) }
  }
  renderPossess()
}
possessEl.querySelectorAll("button[data-act]").forEach((b) => b.addEventListener("click", () => { doAction((b as HTMLElement).dataset.act!); (b as HTMLElement).blur() }))

function nearestTalkable(): Creature | null { const me = possessed || avatar; return me ? world.nearestCreature(me, CHAT_RANGE, (o) => !o.isAvatar && o !== possessed) : null }
function openChat(target?: Creature) {
  const t = target ?? nearestTalkable()
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
// SECURITY: chat text is LLM/user output — build it from inert DOM nodes, never innerHTML, so a model that
// returns markup (e.g. an onerror payload) can't execute in our origin.
function addLine(who: string, text: string, cls: "me" | "them", tag?: string): HTMLDivElement {
  const el = document.createElement("div")
  el.className = "line " + cls
  const b = document.createElement("b"); b.textContent = who + ": "
  el.appendChild(b)
  if (tag) { const t = document.createElement("span"); t.className = "tag"; t.textContent = tag; el.append(t, document.createTextNode(" ")) }
  el.appendChild(document.createTextNode(text))
  chatLog.appendChild(el); chatLog.scrollTop = chatLog.scrollHeight
  return el
}
function setLine(el: HTMLDivElement, who: string, text: string, tag?: string) {
  el.textContent = ""
  const b = document.createElement("b"); b.textContent = who + ": "
  el.appendChild(b)
  if (tag) { const t = document.createElement("span"); t.className = "tag"; t.textContent = tag; el.append(t, document.createTextNode(" ")) }
  el.appendChild(document.createTextNode(text))
}
chatInput.addEventListener("keydown", async (e) => {
  e.stopPropagation()
  if (e.key === "Escape") { closeChat(); return }
  if (e.key === "Enter" && chatInput.value.trim() && chatTarget) {
    const who = chatTarget
    const msg = chatInput.value.trim()
    addLine("Tú", msg, "me"); chatInput.value = ""
    session.push({ role: "user", content: msg })
    const typing = addLine(who.name, "…", "them")
    const ctx = `Tu pueblo come de ${foodSystem(world.era)}; es una ${world.gov}${world.monarch ? `, gobernada por ${world.monarch.name} ${world.monarch.surname}` : ""}.`
    const info = { era: eraName(world.era), country: countries[active].name, food: foodSystem(world.era), lang: countries[active].lang }
    const reply = await respond(who, msg, session, eraName(world.era), WRITE_LANG, ctx, info)
    const h = heard(reply, countries[active].lang)
    setLine(typing, who.name, h.text, h.tag)
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
  if (e.key === "p" || e.key === "P") togglePossess()
  if ((e.key === "r" || e.key === "R") && avatar && isAvatarDead()) respawn()
})
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()))

function isAvatarDead(): boolean { return false } // you age, but as a visitor you never die
function respawn() { avatar = world.addAvatar(); deathScreen.classList.add("hidden") }

function driveControlled(me: Creature) {
  const up = keys.has("w") || keys.has("arrowup"), down = keys.has("s") || keys.has("arrowdown")
  const left = keys.has("a") || keys.has("arrowleft"), right = keys.has("d") || keys.has("arrowright")
  if (possessed) {
    // third-person: A/D turn the camera, W/S walk forward/back along where you face
    if (left) camYaw3d -= 0.05
    if (right) camYaw3d += 0.05
    const fwd = (up ? 1 : 0) - (down ? 1 : 0)
    if (insideHouse) { // moving inside a room (local coords); walk out the front door to leave
      me.vx = me.vy = 0
      if (fwd) {
        roomX = clamp(roomX + Math.cos(camYaw3d) * fwd * 0.26, -ROOM.W / 2 + 0.6, ROOM.W / 2 - 0.6)
        roomZ = clamp(roomZ + Math.sin(camYaw3d) * fwd * 0.26, -ROOM.D / 2 + 0.6, ROOM.D / 2 - 0.6)
        if (roomZ > ROOM.D / 2 - 0.75 && Math.abs(roomX) < 1.1) exitHouse()
      }
      return
    }
    if (fwd) { possessTarget = null; me.vx = Math.cos(camYaw3d) * fwd * AV_SPEED; me.vy = Math.sin(camYaw3d) * fwd * AV_SPEED }
    else if (possessTarget) { // auto-walk to an action destination + turn to face it
      const tx = possessTarget.x - me.x, ty = possessTarget.y - me.y, d = Math.hypot(tx, ty)
      if (d < 16) { possessTarget = null; me.vx *= 0.4; me.vy *= 0.4 }
      else { me.vx = (tx / d) * AV_SPEED; me.vy = (ty / d) * AV_SPEED; let dd = Math.atan2(ty, tx) - camYaw3d; while (dd > Math.PI) dd -= 2 * Math.PI; while (dd < -Math.PI) dd += 2 * Math.PI; camYaw3d += dd * 0.1 }
    } else { me.vx *= 0.55; me.vy *= 0.55 }
    return
  }
  // 2D avatar: WASD = screen axes
  let dx = 0, dy = 0
  if (up) dy -= 1; if (down) dy += 1; if (left) dx -= 1; if (right) dx += 1
  const m = Math.hypot(dx, dy)
  if (m > 0) { me.vx = (dx / m) * AV_SPEED; me.vy = (dy / m) * AV_SPEED }
  else { me.vx *= 0.6; me.vy *= 0.6 }
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
  const ep = eraProgress(world.discovered, world.era)
  const relCount: Record<string, number> = {}
  for (const c of wild) if (c.religion) relCount[c.religion] = (relCount[c.religion] || 0) + 1
  const topRel = Object.entries(relCount).sort((a, b) => b[1] - a[1])[0]
  const psychos = wild.filter((c) => c.powerHungry).length
  hud.innerHTML = `
    <div class="stat"><span>pueblo</span> <b style="color:#fff">${esc(countries[active]?.flag || "")} ${esc(countries[active]?.name || "")}</b>${world.cultureEthos ? ` · <i style="color:#cdbf9a">${esc(world.cultureEthos)}</i>` : ""} · ${world.gov === "monarquía" ? "👑 monarquía" : "🏛 república"} · ${world.system === "capitalista" ? "💵 capitalista" : world.system === "socialista" ? "🤝 socialista" : "⛓ dictadura"}</div>
    ${world.monarch ? `<div class="stat"><span>monarca</span> ${esc(world.monarch.name)} ${esc(world.monarch.surname)}${world.monarch.powerHungry ? " (déspota)" : ""}</div>` : ""}
    <div class="stat"><span>población</span> ${wild.length} · <span>familias</span> ${families} · ⚔️ ${wild.filter((c) => isMature(c) && c.profCat === "defensa").length}${world.animals.some((a) => !a.tame) ? ` · 🐾 ${world.animals.filter((a) => !a.tame).length}` : ""}</div>
    ${world.raiders.length ? `<div class="stat" style="background:rgba(200,30,30,0.25);border-radius:6px;padding:2px 6px"><b style="color:#ff6b6b">🚨 ¡EL PUEBLO ESTÁ BAJO ATAQUE! ${world.raiders.length} invasores</b></div>` : ""}
    <div class="stat"><span>edad media</span> ${avgAge}a · <span>enfermos ✚</span> ${sick}</div>
    <div class="stat"><span>generación</span> ${world.peakGen} · <span>nac</span> ${world.births} · <span>muertes</span> ${world.deaths}</div>
    <div class="stat"><span>era</span> <b style="color:#bcd9ff">${eraName(world.era)}</b> · ${SEASONS[seasonOf(world.clockDays)]}</div>
    <div class="stat"><span>alimento</span> ${foodSystem(world.era)} · <span>clima</span> ${climateOf(world.region)}</div>
    <div class="stat"><span>transporte</span> ${transportOf(world.era)} · <span>mercado</span> ${world.marketPrice.toFixed(2)}×</div>
    <div class="stat"><span>religión</span> ${topRel ? `${topRel[0]} ${Math.round(100 * topRel[1] / (wild.length || 1))}%` : "—"} · <span>ambiciosos</span> ${psychos}</div>
    <div class="stat"><span>saber 📚</span> ${Math.round(world.wisdom)} · <span>oficios</span> ${professionSpace().toLocaleString()} · <span>univ.</span> ${world.universities.length}</div>
    <div class="stat"><span>investigando</span> ${rp.name} <span class="rbar"><i style="width:${Math.round(rp.frac * 100)}%"></i></span></div>
    <div class="stat"><span>hitos era</span> ${ep.got}/${ep.total} · 🔑 ${ep.keysGot}/${ep.keys} para avanzar</div>
    ${world.talkOfTown()[0] ? `<div class="stat"><span>se habla de</span> <i style="color:#bcd9ff">${esc(world.talkOfTown()[0].txt)}</i></div>` : ""}
    <div class="stat"><span>historia</span> ${Math.floor(world.clockDays / 360)} años${world.greatestEver() ? ` · 🏆 <i style="color:#ffd98a">${esc(world.greatestEver()!.name)}</i>, la figura más grande` : ""}</div>
    ${world.recentTech ? `<div class="stat"><span>💡 último</span> ${esc(world.recentTech)}</div>` : ""}
    <div class="stat energy"><span>vos</span> ${aAge}a · ${bar} ${Math.round(e)}</div>
    <div class="hint">${possessed ? `🎭 poseés a <b>${possessed.name}</b> · P para soltar` : (!chatting && chatTarget) ? `▸ <b>E</b> hablar · <b>P</b> poseer a ${chatTarget.name}` : "WASD moverte · E hablar · P poseer · espacio pausa"}</div>
  `
  clockEl.textContent = formatClock(world.clockMinutes)
  for (let i = 0; i < tabsEl.children.length; i++) if (countries[i]) {
    const cw = countries[i].world, pop = cw.creatures.filter((c) => !c.isAvatar).length, el = tabsEl.children[i] as HTMLElement
    el.title = `${eraName(cw.era)} · ${pop} hab.`
    const dead = pop === 0 // a civilisation that died out — mark it with a skull
    el.classList.toggle("dead", dead)
    if (dead && !el.innerHTML.includes("💀")) el.innerHTML = `💀 ${esc(countries[i].name)}`
    else if (!dead && el.innerHTML.includes("💀")) el.innerHTML = `${esc(countries[i].flag)} ${esc(countries[i].name)}`
  }
  if (!statsEl.classList.contains("hidden") && frame % 15 === 0) statsBody.innerHTML = statsHTML()
  if (possessed && frame % 8 === 0) renderPossess()
}

function buildTabs() {
  tabsEl.innerHTML = ""
  countries.forEach((c, i) => {
    const b = document.createElement("button")
    b.className = "tab" + (i === active ? " active" : "")
    b.innerHTML = `${esc(c.flag)} ${esc(c.name)}`
    b.addEventListener("click", () => switchCountry(i))
    tabsEl.appendChild(b)
  })
}
function switchCountry(i: number) {
  if (i === active || !countries[i]) return
  if (avatar) { const k = world.creatures.indexOf(avatar); if (k >= 0) world.creatures.splice(k, 1) }
  active = i; world = countries[i].world; countries.forEach((cn) => (cn.world.viewControlled = cn.world === world))
  if (avatar) { avatar.x = world.airport.x + world.airport.w / 2; avatar.y = world.airport.y + world.airport.h; avatar.vx = avatar.vy = 0; world.creatures.push(avatar) }
  closeChat(); inspect.classList.add("hidden")
  ;[...tabsEl.children].forEach((el, j) => (el as HTMLElement).classList.toggle("active", j === i))
}

// overheard AI-to-AI chatter near the avatar (you can listen, not intervene)
function nearAvatarPair(): [Creature, Creature] | null {
  const av = possessed || avatar
  if (!av) return null
  const near = world.creatures.filter((c) => !c.isAvatar && isMature(c) && (c.x - av.x) ** 2 + (c.y - av.y) ** 2 < OVERHEAR * OVERHEAR)
  for (const a of near) {
    const b = world.nearestCreature(a, 66, (o) => !o.isAvatar && isMature(o))
    if (b && near.includes(b)) return [a, b]
  }
  return null
}
function tryAmbient() {
  if (ambient || chatting || frame < ambientCool || !(possessed || avatar)) return
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

// solid houses: you can't walk through a building (you slide along its wall). You MAY step onto your OWN
// home; everyone else's is closed (the basis for the door/owner-permission system to come).
function blockedByHouse(x: number, y: number, mover?: Creature): boolean {
  for (const h of world.houses) {
    if (mover && mover.home === h) continue
    if (x > h.x - 12 && x < h.x + h.w + 12 && y > h.y - 12 && y < h.y + h.h + 12) return true
  }
  return false
}

// ── house entry: only through the door, and only if the owner lets you (or it's your home) ──
function houseAtDoor(c: Creature): House | null {
  for (const h of world.houses) {
    const dx = c.x - (h.x + h.w / 2), dy = c.y - (h.y + h.h)
    if (dx * dx + dy * dy < 64 * 64) return h // standing near the south door
  }
  return null
}
function mayEnter(c: Creature, h: House): boolean {
  if (c.home === h) return true // your own home
  const occ = world.creatures.filter((o) => o.home === h && !o.isAvatar && isMature(o))
  if (!occ.length) return true // nobody home
  return occ.some((o) => o.surname === c.surname || o.partner === c.id) // family or partner lets you in
}
function enterHouse(h: House) { insideHouse = h; roomX = 0; roomZ = ROOM.D / 2 - 1.2; camYaw3d = -Math.PI / 2 }
function exitHouse() { const h = insideHouse; insideHouse = null; if (h && possessed) { possessed.x = h.x + h.w / 2; possessed.y = h.y + h.h + 24; camYaw3d = Math.PI / 2 } }

function loop() {
  frame++
  if (pendingCatchUp > 0) { // offline progression, processed in small chunks per frame so the load never freezes
    const chunk = Math.min(pendingCatchUp, 60)
    for (let t = 0; t < chunk; t++) for (const c of countries) c.world.step()
    pendingCatchUp -= chunk
  }
  zoom += (targetZoom - zoom) * 0.12 // smooth cinematic zoom toward the target
  // you control your avatar OR the creature you possess, in REAL TIME (smooth) regardless of world speed
  const me = possessed || avatar
  if (me && !chatting && !paused && !possessBusy) { // while working/studying you're frozen on the job
    driveControlled(me)
    // axis-separated collision: houses are SOLID (slide along walls instead of walking through them)
    const nx = me.x + me.vx, ny = me.y + me.vy
    if (!blockedByHouse(nx, me.y, me)) me.x = nx; else me.vx *= 0.2
    if (!blockedByHouse(me.x, ny, me)) me.y = ny; else me.vy *= 0.2
    if (me.vx > 0.05) me.facing = 1; else if (me.vx < -0.05) me.facing = -1
    me.x = clamp(me.x, 60, WORLD_W - 60); me.y = clamp(me.y, 60, WORLD_H - 60)
  }
  if (!paused) {
    const rate = possessed ? POSSESS_SPEEDS[possessSpeedIdx] : SCALES[scaleIndex].rate // 3D = near real-time, capped 5x
    const minPerFrame = rate / 60 // in-world minutes added this frame (~60fps)
    let steps = 0
    for (const cn of countries) {
      const isActive = cn.world === world
      let add = minPerFrame
      if (possessBusy && isActive) add = Math.max(add, 7) // montage: fast-forward the shift (day→night)
      cn.world.clockMinutes += add // in-world time always advances
      // PERF: the active world steps every frame (smooth); off-screen worlds are decimated — they only run
      // their step() every 3rd frame and catch up in a burst, so most frames only simulate the one you watch.
      if (!isActive && frame % 3 !== 0) continue
      const want = Math.floor(cn.world.clockMinutes / 1440) // whole in-world days elapsed
      const cap = isActive ? 40 : 26
      let s = 0
      while (cn.world.clockDays < want && s < cap) { cn.world.step(); s++ }
      steps += s
    }
    if (steps) worldAffairs(countries, steps)
    if (possessBusy && world.clockMinutes >= possessBusy.until) finishBusy()
  }
  // The view is a pure INTERPOLATOR: the sim (world.step) decides WHERE each creature should be (c.targetX/Y,
  // hour-aware + intent-driven, the single source of truth); here we just walk them there smoothly every frame.
  if (!paused) {
    routinePhase += 0.02
    const hour = hourOf()
    const night = hour >= 22 || hour < 6
    for (const c of world.creatures) {
      if (c === possessed || c.isAvatar || c.controlled) continue
      if (c.life?.condition === "locura") { // the mad wander aimlessly, muttering, going nowhere
        const a = routinePhase * 5 + c.id; c.x += Math.cos(a) * 1.1; c.y += Math.sin(a * 1.7) * 1.1; c.vx = Math.cos(a); c.vy = Math.sin(a); continue
      }
      const tx = c.targetX ?? c.x, ty = c.targetY ?? c.y
      const dx = tx - c.x, dy = ty - c.y, d = Math.hypot(dx, dy) || 1
      let mvx = 0, mvy = 0
      const spd = 1.0 + c.genome.speed * 0.7 // each person walks at their OWN pace — some hurry, some amble
      const atHome = Math.abs(tx - (c.home.x + c.home.w / 2)) < 30 && Math.abs(ty - (c.home.y + c.home.h)) < 40
      if (d > 46) { mvx = (dx / d) * spd; mvy = (dy / d) * spd } // commute toward where the sim wants them
      else if (night && atHome) { /* asleep at home → still */ }
      else { const a = routinePhase * 2 + c.id; mvx = Math.cos(a) * 0.7; mvy = Math.sin(a * 1.4) * 0.7 } // mill / amble in place once arrived
      if (possessed) { const px = c.x - possessed.x, py = c.y - possessed.y; if (px * px + py * py < 95 * 95) { mvx *= 0.1; mvy *= 0.1 } } // pause near you so you can talk
      c.x += mvx; c.y += mvy; c.vx = mvx; c.vy = mvy
      if (mvx > 0.05) c.facing = 1; else if (mvx < -0.05) c.facing = -1 // face where they walk, in real time
    }
    // CROWD FLOW: push people apart so they don't stack — a coarse grid keeps it O(n); every other frame is plenty
    if (frame % 2 === 0) {
    const CELL = 42, grid = new Map<number, Creature[]>()
    const key = (x: number, y: number) => (Math.floor(x / CELL) & 4095) | ((Math.floor(y / CELL) & 4095) << 12)
    for (const c of world.creatures) { if (c.isAvatar) continue; const k = key(c.x, c.y); const b = grid.get(k); if (b) b.push(c); else grid.set(k, [c]) }
    for (const c of world.creatures) {
      if (c.isAvatar || c.controlled) continue
      let sx = 0, sy = 0, gx0 = Math.floor(c.x / CELL), gy0 = Math.floor(c.y / CELL), nearX = 0, nearD = 1e9
      for (let gx = -1; gx <= 1; gx++) for (let gy = -1; gy <= 1; gy++) {
        const cell = grid.get(((gx0 + gx) & 4095) | (((gy0 + gy) & 4095) << 12)); if (!cell) continue
        for (const o of cell) {
          const ddx = c.x - o.x, ddy = c.y - o.y, d2 = ddx * ddx + ddy * ddy
          if (d2 > 0.01 && d2 < 26 * 26) { const d = Math.sqrt(d2), f = (26 - d) / 26 * 0.55; sx += (ddx / d) * f; sy += (ddy / d) * f }
          if (d2 > 0.01 && d2 < nearD && d2 < 40 * 40) { nearD = d2; nearX = o.x } // remember the closest companion
        }
      }
      c.x += sx; c.y += sy
      avoidBuildings(c) // the 2D take on a NavMesh: slide gently around buildings instead of clipping through them
      // a small gathering: when someone stands close to another, they TURN to face them (a little conversation)
      if (nearD < 34 * 34 && Math.abs(c.vx) + Math.abs(c.vy) < 0.5) c.facing = nearX >= c.x ? 1 : -1
    }
    } // end crowd-flow throttle
    for (const a of world.animals) { a.x += a.vx * 0.35; a.y += a.vy * 0.35 } // beasts roam smoothly between updates
    for (const r of world.raiders) { const dx = WORLD_W / 2 - r.x, dy = WORLD_H / 2 - r.y, d = Math.hypot(dx, dy) || 1; r.x += (dx / d) * 0.4; r.y += (dy / d) * 0.4 } // invaders close in
  }
  if (avatar && !possessed) avatar.energy = Math.max(60, Math.min(150, avatar.energy)) // immortal observer
  if (possessed) possessed.energy = Math.max(0, possessed.energy) // possessed: real hunger you manage (won't die)
  // advance / start overheard chatter
  if (ambient) { if (frame >= ambient.nextAt) { ambient.idx++; if (ambient.idx >= ambient.lines.length) { ambient = null; ambientCool = frame + 480 } else ambient.nextAt = frame + 165 } }
  else tryAmbient()
  chatTarget = chatting ? chatTarget : nearestTalkable()

  if (possessed) {
    if (insideHouse) renderInterior(world, possessed, insideHouse, roomX, roomZ, camYaw3d, camPitch3d)
    else render3D(world, possessed, camYaw3d, camPitch3d) // immersive 3D while you live a life
    // floating speech bubble for overheard chatter
    let shown = false
    if (ambient && !insideHouse) {
      const line = ambient.lines[ambient.idx]
      if (line && (line.who.x - possessed.x) ** 2 + (line.who.y - possessed.y) ** 2 < OVERHEAR * OVERHEAR) {
        const r = canvas3d.getBoundingClientRect(), p = project3D(line.who.x, line.who.y, r.width, r.height)
        if (p.front) {
          const hd = heard(line.text, countries[active].lang)
          const we = line.who.life && line.who.life.emoInt > 0.25 ? (EMO as Record<string, string>)[line.who.life.emotion] || "" : ""
          speech3d.textContent = `${we} ${line.who.name}: ${hd.text}`.trim(); speech3d.className = hd.understood ? "" : "foreign"
          speech3d.style.left = `${p.x}px`; speech3d.style.top = `${p.y}px`; speech3d.style.display = "block"; shown = true
        }
      }
    }
    if (!shown) speech3d.style.display = "none"
  } else {
    speech3d.style.display = "none"; npccard.classList.add("hidden")
    // 2D camera: follow the avatar, clamped to the world (centre an axis smaller than the view)
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
  }

  if (isAvatarDead()) {
    const old = avatar!.ageDays > avatar!.lifespanDays
    deathReason.textContent = old
      ? `viviste ${Math.round(ageYears(avatar!))} años. la vejez te alcanzó — así es el caldo.`
      : "te quedaste sin energía. el que no come, se apaga."
    deathScreen.classList.remove("hidden")
  }

  if (++saveAt >= 900) { saveAt = 0; saveGame() } // autosave ~every 15s
  if (frame % 45 === 0) updateChatter() // refresh the nearby-gossip feed
  if (frame % 6 === 0) updateHud() // the HUD barely changes per frame — throttle it (was every frame: 280-elem filters + sorts)
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
  gameSeed = (Math.floor(Math.random() * 0xffffffff) >>> 0) || 1 // a fresh seed → reproducible run
  seedRng(gameSeed); resetCreatureIds()
  countries = cfg.countries.map((c, i) => {
    const eth = ethosOf(c.culture) // the culture decides aggression, faith + which techs they chase
    return {
      name: c.name, flag: c.flag, lang: c.lang,
      world: new World(spriteCount, i, {
        startEra: cfg.startEra,
        religions: cultureReligions(c.culture),
        violence: Math.max(0, Math.min(1, eth.aggression * (0.7 + cfg.violence))),
        psychopathy: Math.max(cfg.psychopathy, eth.psycho),
        gov: c.gov, system: c.system,
        culture: { name: c.culture.name, ethos: c.culture.ethos, bias: eth.bias },
      }),
    }
  })
  active = 0; world = countries[0].world; avatar = world.addAvatar(); countries.forEach((cn) => (cn.world.viewControlled = cn.world === world))
  startRunning(); saveGame()
}
const SAVE_VERSION = 2
function continueGame(save: { active: number; savedAt: number; version?: number; rng?: number; seed?: number; countries: { name: string; flag: string; lang: LangCode; state: unknown }[] }) {
  if ((save.version || 1) > SAVE_VERSION) saveWarn("⚠ guardado de una versión más nueva — puede verse raro") // fromState is tolerant, but warn on a future schema
  gameSeed = save.seed || gameSeed
  setRngState(save.rng || gameSeed || 1) // restore the exact RNG stream so the load is deterministic
  countries = save.countries.map((cc) => ({ name: cc.name, flag: cc.flag, lang: cc.lang, world: World.fromState(cc.state, spriteCount) }))
  active = Math.min(save.active || 0, countries.length - 1)
  world = countries[active].world; avatar = world.addAvatar(); countries.forEach((cn) => (cn.world.viewControlled = cn.world === world))
  // offline progression — kept advancing while you were away. Chunked across frames so the load never freezes.
  pendingCatchUp = Math.min(1500, Math.floor(Math.max(0, (Date.now() - (save.savedAt || Date.now())) / 1000)) * 20)
  startRunning()
}
function saveGame() {
  if (!countries.length) return
  const payload = { version: SAVE_VERSION, seed: gameSeed, rng: rngState(), savedAt: Date.now(), active, countries: countries.map((c) => ({ name: c.name, flag: c.flag, lang: c.lang, state: c.world.toState() })) }
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload))
  } catch (e) {
    if (e instanceof DOMException && (e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED")) {
      // too big for localStorage → fall back to saving ONLY the active country, and warn the player
      try { localStorage.setItem(SAVE_KEY, JSON.stringify({ ...payload, countries: [payload.countries[active]], active: 0 })); saveWarn("⚠ guardado reducido (solo el país activo) — civilización muy grande") }
      catch { saveWarn("⚠ no se pudo guardar — civilización demasiado grande") }
    }
  }
}
let saveWarnAt = 0
function saveWarn(msg: string) { if (Date.now() - saveWarnAt < 60000) return; saveWarnAt = Date.now(); const el = document.getElementById("save-warn"); if (el) { el.textContent = msg; el.classList.remove("hidden"); setTimeout(() => el.classList.add("hidden"), 8000) } }
function loadSave(): { active: number; savedAt: number; countries: { name: string; flag: string; lang: LangCode; state: any }[] } | null {
  try { const raw = localStorage.getItem(SAVE_KEY); return raw ? JSON.parse(raw) : null } catch { return null }
}
window.addEventListener("beforeunload", saveGame)

// ── start menu + new-civilisation form ──
const menuEl = document.getElementById("menu")!
const newcivEl = document.getElementById("newciv")!
function showMenu() {
  const cont = document.getElementById("menu-continue") as HTMLButtonElement
  try {
    const save = loadSave()
    if (save?.countries?.length) {
      cont.classList.remove("hidden")
      cont.innerHTML = `▶ Continuar — ${save.countries.length} ${save.countries.length === 1 ? "país" : "países"} · ${esc(eraName(save.countries[0]?.state?.era ?? 0))}`
      cont.onclick = () => { try { const s = loadSave(); if (s) continueGame(s) } catch (e) { console.error("save corrupto", e); localStorage.removeItem(SAVE_KEY); cont.classList.add("hidden") } }
    } else cont.classList.add("hidden")
  } catch (e) { console.error("no se pudo leer el guardado", e); cont.classList.add("hidden") } // a corrupt save must never brick the menu
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
// boot — never let a failure here leave the page "initializing"; always reach the menu
loadAssets().then((a) => { assets = a; spriteCount = a.creatures.length; autoDetect().catch(() => {}); showMenu() }).catch((e) => { console.error("boot", e); try { showMenu() } catch { /* last resort */ } })
