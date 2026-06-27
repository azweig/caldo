// three3d.ts — a real 3D engine used ONLY while you possess a creature. It mirrors the active 2D
// world (houses, gardens, streets, the people near you) into a Three.js scene and follows the
// possessed character in third person. The simulation stays in the 2D engine; this only renders.

import * as THREE from "three"
import { World, Creature, House, WORLD_W, WORLD_H, BLOCK, seasonOf } from "./world"
import { SPECIES } from "./animals"

const S = 0.045 // world px → 3D units

let renderer: THREE.WebGLRenderer
let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
let ambient: THREE.AmbientLight
let sun: THREE.DirectionalLight
let pool: THREE.Sprite[] = []
let rings: THREE.Mesh[] = []
let shadows: THREE.Mesh[] = []
let town: THREE.Group | null = null
let builtFor: World | null = null
let builtEra = -1 // rebuild the town when the era (architecture) changes
let walkT = 0 // real-time clock for the fake walk animation
let ready = false
let gfxHigh = false // high-graphics aesthetic: warmer/softer light + more atmospheric depth (Ghibli vibe)
let _skyMat: THREE.MeshBasicMaterial | null = null, _skyGrad: THREE.Texture | null = null // sky dome (gradient ↔ painted)
export function setGfx3D(high: boolean) {
  gfxHigh = high; builtFor = null // builtFor=null → town rebuilds with the new ground
  if (ready && scene.fog) { const f = scene.fog as THREE.Fog; f.near = high ? 55 : 110; f.far = high ? 240 : 360 } // high: stronger atmospheric haze → depth
  if (_skyMat && _skyGrad) { _skyMat.map = high ? artTexPlain("sky") : _skyGrad; _skyMat.needsUpdate = true } // painted sky in high
}

export function init3D(canvas: HTMLCanvasElement, _creatureImgs: HTMLImageElement[]) {
  if (ready) return
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false })
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
  scene = new THREE.Scene()
  scene.fog = new THREE.Fog(0xaebdd2, 110, 360) // pale-horizon haze
  camera = new THREE.PerspectiveCamera(60, 1, 0.1, 900)
  ambient = new THREE.AmbientLight(0xffffff, 2.0); scene.add(ambient) // very bright ambient so characters never go dark
  scene.add(new THREE.HemisphereLight(0xdfeaff, 0x8a7c5a, 1.2))
  sun = new THREE.DirectionalLight(0xfff4e0, 1.1); sun.position.set(40, 80, 30); scene.add(sun)
  // sky dome — a pleasant daytime gradient
  const sc = document.createElement("canvas"); sc.width = 4; sc.height = 256
  const sg = sc.getContext("2d")!; const grad = sg.createLinearGradient(0, 0, 0, 256)
  grad.addColorStop(0, "#3f6fb5"); grad.addColorStop(0.55, "#8fb0d8"); grad.addColorStop(1, "#cdd9e6")
  sg.fillStyle = grad; sg.fillRect(0, 0, 4, 256)
  const skyTex = new THREE.CanvasTexture(sc); skyTex.colorSpace = THREE.SRGBColorSpace
  _skyGrad = skyTex; _skyMat = new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false })
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(500, 20, 16), _skyMat))
  const ringGeo = new THREE.RingGeometry(0.5, 0.74, 22)
  const shadowGeo = new THREE.CircleGeometry(0.5, 18)
  for (let i = 0; i < 64; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false })); sp.visible = false; scene.add(sp); pool.push(sp)
    const r = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.85, side: THREE.DoubleSide }))
    r.rotation.x = -Math.PI / 2; r.visible = false; scene.add(r); rings.push(r)
    const sh = new THREE.Mesh(shadowGeo, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32 }))
    sh.rotation.x = -Math.PI / 2; sh.visible = false; scene.add(sh); shadows.push(sh) // grounding shadow
    const mg = new THREE.Group(); mg.visible = false; scene.add(mg); modelPool.push(mg) // holds a 3D character model
    const lb = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, depthTest: false })); lb.visible = false; lb.scale.set(2.6, 0.65, 1); scene.add(lb); labelPool.push(lb) // floating name
  }
  ready = true
}

export function resize3D(w: number, h: number) {
  if (!ready) return
  renderer.setSize(w, h, false)
  camera.aspect = w / h; camera.updateProjectionMatrix()
}

// who is this person to you? → ring colour
function relColor(me: Creature, o: Creature): number {
  if (o.id === me.partner) return 0xff7bc0 // pareja — rosa
  if ((me.parents && me.parents.includes(o.id)) || (o.parents && o.parents.includes(me.id)) || (o.surname && o.surname === me.surname)) return 0x6be07a // familia — verde
  if (me.social && me.social.some((s) => s.includes(o.name))) return 0xffd24a // conocido — amarillo
  if (o.powerHungry && o.religion && me.religion && o.religion !== me.religion) return 0xff5a5a // rival — rojo
  return 0x55657a // desconocido — gris
}

// ── textures (generated on the pod with SDXL, served from /tex). Loaded once + cached. ──
const loader = new THREE.TextureLoader()
const texCache = new Map<string, THREE.Texture>()
function tex(name: string, repeat = 1): THREE.Texture {
  const key = `${name}@${repeat}`
  let t = texCache.get(key)
  if (!t) {
    t = loader.load(`/tex/${name}.png`)
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); t.colorSpace = THREE.SRGBColorSpace
    texCache.set(key, t)
  }
  return t
}
// HIGH-GRAPHICS illustrated texture from /art/scene — falls back to the procedural /tex one if the file isn't there
function artTex(artName: string, fallback: string, repeat: number): THREE.Texture {
  const key = `art:${artName}@${repeat}`
  let t = texCache.get(key)
  if (!t) {
    t = loader.load(`/art/scene/${artName}.png`, undefined, undefined, () => { const f = tex(fallback, repeat); t!.image = f.image; t!.needsUpdate = true }) // 404 → use the procedural texture
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); t.colorSpace = THREE.SRGBColorSpace
    texCache.set(key, t)
  }
  return t
}
// plain illustrated texture (no tiling) for backdrops/sprites; tracks aspect ratio for correct sprite proportions
const artAspect = new Map<string, number>()
function artTexPlain(artName: string): THREE.Texture {
  const key = `artp:${artName}`
  let t = texCache.get(key)
  if (!t) { t = loader.load(`/art/scene/${artName}.png`, (tx) => { const im = tx.image as { width: number; height: number } | undefined; if (im?.width) artAspect.set(artName, im.width / im.height) }); t.colorSpace = THREE.SRGBColorSpace; texCache.set(key, t) }
  return t
}

// the ground texture for the world plane — seasonal illustrated grass in high mode, else the procedural one
function groundMap(world: World): THREE.Texture {
  const E = eraTex(world.era)
  if (gfxHigh && E.ground === "ground_grass") {
    const names = ["ground_grass", "ground_grass_summer", "ground_grass_autum", "ground_grass_winter"]
    return artTex(names[seasonOf(world.clockDays)] || "ground_grass", "ground_grass", 16)
  }
  return tex(E.ground, 42)
}

// era → which wall / roof / ground material the architecture uses (mud huts → glass towers → neon)
function eraTex(era: number) {
  if (era <= 1) return { wall: "wall_mud", roof: "roof_thatch", ground: "ground_grass" }
  if (era <= 4) return { wall: "wall_wood", roof: "roof_thatch", ground: "ground_dirt" }
  if (era <= 6) return { wall: "wall_stone", roof: "roof_clay", ground: "ground_cobble" }
  if (era <= 8) return { wall: "wall_plaster", roof: "roof_slate", ground: "ground_cobble" }
  if (era <= 9) return { wall: "wall_brick", roof: "roof_slate", ground: "ground_cobble" }
  if (era <= 11) return { wall: "wall_concrete", roof: "roof_metal", ground: "ground_cobble" }
  if (era <= 14) return { wall: "wall_glass", roof: "roof_metal", ground: "ground_marble" }
  return { wall: "wall_neon", roof: "roof_metal", ground: "ground_neon" }
}
const hashf = (n: number) => { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x) } // stable per-house pseudo-random

// each house picks from a SET of era-appropriate wall/roof materials → the street stops looking uniform
const matCache = new Map<string, THREE.MeshLambertMaterial>()
// free a mesh's material(s) on town rebuild — but NEVER a cached/shared one (matFor) or its texture (texCache),
// which are reused across rebuilds; disposing those would break the next build.
function disposeMat(mat: THREE.Material | THREE.Material[] | undefined): void {
  const shared = new Set<THREE.Material>(matCache.values())
  const arr = Array.isArray(mat) ? mat : mat ? [mat] : []
  for (const m of arr) if (m && !shared.has(m)) m.dispose()
}
function matFor(name: string): THREE.MeshLambertMaterial {
  let m = matCache.get(name); if (!m) { m = new THREE.MeshLambertMaterial({ map: tex(name, 2) }); matCache.set(name, m) }
  return m
}
function eraWalls(era: number): string[] {
  if (era <= 1) return ["wall_mud", "wall_wood"]
  if (era <= 4) return ["wall_wood", "wall_mud", "wall_plaster"]
  if (era <= 6) return ["wall_stone", "wall_plaster", "wall_wood"]
  if (era <= 8) return ["wall_plaster", "wall_stone", "wall_brick"]
  if (era <= 9) return ["wall_brick", "wall_stone", "wall_concrete"]
  if (era <= 11) return ["wall_concrete", "wall_brick", "wall_glass"]
  if (era <= 14) return ["wall_glass", "wall_concrete", "wall_neon"]
  return ["wall_neon", "wall_glass"]
}
function eraRoofs(era: number): string[] {
  if (era <= 1) return ["roof_thatch"]
  if (era <= 4) return ["roof_thatch", "roof_shingle"]
  if (era <= 7) return ["roof_clay", "roof_shingle", "roof_slate"]
  if (era <= 11) return ["roof_slate", "roof_clay", "roof_metal"]
  return ["roof_metal", "roof_slate"]
}

// the 3D MODEL is shared across both variants (only era×role×sex were converted to GLB)

// ── real 3D character meshes (TripoSR GLBs) with a billboard fallback while a model loads ──
const modelPool: THREE.Group[] = []
const _near: { c: Creature; d: number }[] = [] // reused scratch for the nearest-N selection (no per-frame allocation)
const _sway: { s: THREE.Sprite; amp: number; ph: number }[] = [] // vegetation sprites that sway in the wind (high mode)
const _clouds: { s: THREE.Sprite; v: number }[] = [] // cloud sprites drifting across the sky (high mode)
const WWU = WORLD_W * 0.045 // world width in 3D units (for wrapping the clouds)
// helper: a mesh with its position set — Object3D.position is READ-ONLY in three (must .set, never reassign)
const meshAt = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m }

// pools for the DYNAMIC props (they move/spawn) so 3D shows the same wild animals + harvestable crops as 2D
const animPool: THREE.Group[] = []
const animSpritePool: THREE.Sprite[] = []
const ANIM_ART: Record<string, string> = { ciervo: "animal_deer", conejo: "animal_rabbit" } // species → painted sprite (rest fall back to the low-poly cube)
const foodPool: THREE.Group[] = []
function ensureProps() {
  if (animPool.length) return
  const bodyGeo = new THREE.BoxGeometry(0.72, 0.4, 0.36), headGeo = new THREE.SphereGeometry(0.22, 8, 6), legGeo = new THREE.BoxGeometry(0.1, 0.3, 0.1)
  for (let i = 0; i < 16; i++) { // little quadruped: body + head + 4 legs, recoloured per beast
    const g = new THREE.Group(), mat = new THREE.MeshLambertMaterial({ color: 0xcaa869 })
    const body = new THREE.Mesh(bodyGeo, mat); body.position.y = 0.36
    const head = new THREE.Mesh(headGeo, mat); head.position.set(0.42, 0.46, 0)
    g.add(body, head)
    for (const [lx, lz] of [[0.26, 0.13], [0.26, -0.13], [-0.26, 0.13], [-0.26, -0.13]]) { const lg = new THREE.Mesh(legGeo, mat); lg.position.set(lx, 0.15, lz); g.add(lg) }
    g.visible = false; g.userData.mat = mat; scene.add(g); animPool.push(g)
  }
  for (let i = 0; i < 16; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true })); s.visible = false; scene.add(s); animSpritePool.push(s) } // painted animals
  const stemGeo = new THREE.CylinderGeometry(0.04, 0.05, 0.4, 5), berryGeo = new THREE.SphereGeometry(0.16, 7, 6)
  const stemMat = new THREE.MeshLambertMaterial({ color: 0x4f8a3a }), berryMat = new THREE.MeshLambertMaterial({ color: 0xd8472f })
  for (let i = 0; i < 56; i++) { // a little plant: green stem + a fruit on top (was a bare red ball)
    const g = new THREE.Group()
    const stem = new THREE.Mesh(stemGeo, stemMat); stem.position.y = 0.2
    const berry = new THREE.Mesh(berryGeo, berryMat); berry.position.y = 0.46
    g.add(stem, berry); g.visible = false; scene.add(g); foodPool.push(g)
  }
}

// drifting cherry-blossom petals — procedural particles (no asset) that fall + sway around you (high mode)
const petalPool: THREE.Sprite[] = []
function ensurePetals() {
  if (petalPool.length) return
  const cv = document.createElement("canvas"); cv.width = cv.height = 32
  const c = cv.getContext("2d")!; c.fillStyle = "rgba(255,191,212,0.95)"
  c.beginPath(); c.ellipse(16, 16, 6, 11, 0.5, 0, Math.PI * 2); c.fill()
  const t = new THREE.CanvasTexture(cv)
  for (let i = 0; i < 80; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, fog: false, opacity: 0.9 }))
    s.scale.set(0.45, 0.45, 1); s.userData = { x: 0, y: -1, z: 0, vy: 0.03, ph: Math.random() * 6 }; s.visible = false; scene.add(s); petalPool.push(s)
  }
}

// floating NAME labels above villagers (so you know who's who, like the 2D view)
const labelPool: THREE.Sprite[] = []
function makeLabel(text: string): THREE.CanvasTexture {
  const cv = document.createElement("canvas"); cv.width = 256; cv.height = 64
  const c = cv.getContext("2d")!
  c.font = "bold 28px ui-monospace, monospace"; c.textAlign = "center"; c.textBaseline = "middle"
  const w = Math.min(244, c.measureText(text).width + 26)
  c.fillStyle = "rgba(10,15,22,0.72)"; c.fillRect(128 - w / 2, 14, w, 36)
  c.fillStyle = "#ffe6a3"; c.fillText(text, 128, 33)
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t
}

// procedural low-poly villagers that MATCH the 2D look (same skin/hair palettes + hue-based cloth + age scale),
// so 2D and 3D show the same person. Built once per pool slot, recoloured + animated per creature each frame.
const SKIN3D = [0xf8d5b4, 0xf4cba6, 0xeebf96, 0xe0ac82, 0xd79e6f, 0xc68a52, 0xb07a48, 0x9c6b43, 0x84572f, 0x6b4524]
const HAIR3D = [0x15110c, 0x2a1d12, 0x3d2a18, 0x4a3220, 0x6b4a2e, 0x8a6a3a, 0xb89048, 0xd8b25a, 0xb0461f, 0x7a3a1a]
function appear3D(c: Creature) {
  const g = c.genome as { hue: number; sprite?: number; size: number }
  const seed = Math.abs(g.hue * 7.13 + (g.sprite || 0) * 31.7) + 1
  const r = (n: number) => { const x = Math.sin(seed * 12.9898 + n * 78.233) * 43758.5; return x - Math.floor(x) }
  const ay = c.ageDays / 360
  const greyT = Math.max(0, Math.min(1, (ay - 46) / 32))
  const hair = greyT > 0.62 ? 0xd6cfc4 : greyT > 0.28 ? 0x9a948a : HAIR3D[Math.floor(r(2) * HAIR3D.length)]
  return { skin: SKIN3D[Math.floor(r(1) * SKIN3D.length)], hair, clothH: ((g.hue % 360) + 360) % 360 / 360, ay }
}
function buildRig(grp: THREE.Group) {
  const legMat = new THREE.MeshLambertMaterial({ color: 0x473828 })
  const clothMat = new THREE.MeshLambertMaterial({ color: 0x5a7da0 })
  const skinMat = new THREE.MeshLambertMaterial({ color: 0xe0ac82 })
  const hairMat = new THREE.MeshLambertMaterial({ color: 0x2a1d12 })
  // LEGS pivot at the HIP (geometry hangs below the origin) so the walk swing bends from the joint, not the middle
  const legGeo = new THREE.BoxGeometry(0.15, 0.4, 0.15); legGeo.translate(0, -0.2, 0)
  const footGeo = new THREE.BoxGeometry(0.16, 0.1, 0.26)
  const ll = new THREE.Mesh(legGeo, legMat); ll.position.set(-0.1, 0.44, 0); ll.add(meshAt(footGeo, legMat, 0, -0.4, 0.05))
  const rl = new THREE.Mesh(legGeo, legMat); rl.position.set(0.1, 0.44, 0); rl.add(meshAt(footGeo, legMat, 0, -0.4, 0.05))
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.54, 0.27), clothMat); torso.position.set(0, 0.72, 0)
  // ARMS pivot at the SHOULDER, with a little skin hand at the end
  const armGeo = new THREE.BoxGeometry(0.11, 0.44, 0.13); armGeo.translate(0, -0.22, 0)
  const handGeo = new THREE.SphereGeometry(0.075, 8, 6)
  const la = new THREE.Mesh(armGeo, clothMat); la.position.set(-0.31, 0.9, 0); la.add(meshAt(handGeo, skinMat, 0, -0.44, 0))
  const ra = new THREE.Mesh(armGeo, clothMat); ra.position.set(0.31, 0.9, 0); ra.add(meshAt(handGeo, skinMat, 0, -0.44, 0))
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.12, 8), skinMat); neck.position.set(0, 1.04, 0)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 14, 12), skinMat); head.position.set(0, 1.24, 0); head.scale.set(1, 1.08, 0.96)
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.225, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.6), hairMat); hair.position.set(0, 1.27, 0)
  grp.add(ll, rl, torso, la, ra, neck, head, hair)
  grp.userData.rig = { legMat, clothMat, skinMat, hairMat, ll, rl, la, ra }
}

function boxBuilding(x: number, y: number, w: number, h: number, height: number, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w * S, height, h * S), mat)
  m.position.set((x + w / 2) * S, height / 2, (y + h / 2) * S); return m
}

function buildTown(world: World) {
  if (town) { scene.remove(town); town.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose(); disposeMat(m.material) }) } // free geometry AND materials on rebuild (materials leaked before)
  town = new THREE.Group()
  _sway.length = 0 // reset the wind-sway list for this rebuild
  // textured ground (tiled) — seasonal illustrated grass in high mode, procedural otherwise

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_W * S, WORLD_H * S), new THREE.MeshLambertMaterial({ map: groundMap(world) }))
  ground.rotation.x = -Math.PI / 2; ground.position.set(WORLD_W * S / 2, 0, WORLD_H * S / 2); town.add(ground)
  // streets: actual road strips along the block grid (so they READ at ground level)
  const roadMat = new THREE.MeshBasicMaterial({ color: world.era >= 15 ? 0x18324e : 0x33291d })
  const roadW = 66 * S
  for (let x = BLOCK; x < WORLD_W; x += BLOCK) { const q = new THREE.Mesh(new THREE.PlaneGeometry(roadW, WORLD_H * S), roadMat); q.rotation.x = -Math.PI / 2; q.position.set(x * S, 0.02, WORLD_H * S / 2); town.add(q) }
  for (let y = BLOCK; y < WORLD_H; y += BLOCK) { const q = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_W * S, roadW), roadMat); q.rotation.x = -Math.PI / 2; q.position.set(WORLD_W * S / 2, 0.02, y * S); town.add(q) }
  if (world.era >= 15) { // glowing centre lines only in the neon future
    const pts: number[] = []
    for (let x = BLOCK; x < WORLD_W; x += BLOCK) pts.push(x * S, 0.04, 0, x * S, 0.04, WORLD_H * S)
    for (let y = BLOCK; y < WORLD_H; y += BLOCK) pts.push(0, 0.04, y * S, WORLD_W * S, 0.04, y * S)
    const gg = new THREE.BufferGeometry(); gg.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3))
    town.add(new THREE.LineSegments(gg, new THREE.LineBasicMaterial({ color: 0x3a9bff, transparent: true, opacity: 0.5 })))
  }
  // GARDENS: tilled soil with orderly ROWS of crop tufts you can actually see growing
  const soilMat = new THREE.MeshLambertMaterial({ color: 0x6a4a2f })
  const cropMat = new THREE.MeshLambertMaterial({ color: world.era >= 15 ? 0x4ab0a0 : 0x569a3c })
  const cropGeo = new THREE.ConeGeometry(0.34, 0.8, 5)
  for (const gd of world.gardens) {
    const disc = new THREE.Mesh(new THREE.CircleGeometry(95 * S, 20), soilMat)
    disc.rotation.x = -Math.PI / 2; disc.position.set(gd.x * S, 0.04, gd.y * S); town.add(disc)
    for (let rr = -4; rr <= 4; rr++) for (let cc = -4; cc <= 4; cc++) { // round patch of rows
      if (rr * rr + cc * cc > 17) continue
      const t = new THREE.Mesh(cropGeo, cropMat); t.position.set(gd.x * S + cc * 1.5, 0.4, gd.y * S + rr * 1.5); town.add(t)
    }
  }
  // HOUSES: legible huts — taller than a person (was barely person-height), with a DOOR on the south face
  // (where houseAtDoor expects you to stand) + flanking windows, and clear per-house variety.
  const walls = eraWalls(world.era), roofs = eraRoofs(world.era)
  const winMat = new THREE.MeshBasicMaterial({ color: 0x9fc0e0 })
  const doorMat = new THREE.MeshLambertMaterial({ color: 0x3a2716 })
  const frameMat = new THREE.MeshLambertMaterial({ color: 0x2a1c10 })
  for (const h of world.houses) {
    const r = hashf(h.x + h.y * 0.7), tier = h.tier || 0
    const wallMat = matFor(walls[Math.floor(hashf(h.x * 1.7 + 3) * 997) % walls.length])
    const roofMat = matFor(roofs[Math.floor(hashf(h.y * 2.3 + 7) * 997) % roofs.length])
    // TYPE shows in scale: choza modest, casa/casona/mansión bigger, edificio towers — all clearly above head height
    const bh = tier === 4 ? 12 + r * 5 : 4.2 + tier * 1.7 + r * 1.6
    const w = h.w * S * (1.2 + hashf(h.x) * 0.4), d = h.h * S * (1.2 + hashf(h.y) * 0.4)
    const cx = (h.x + h.w / 2) * S, cz = (h.y + h.h / 2) * S, fz = cz + d / 2 // south face = the front (door side)
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, bh, d), wallMat)
    body.position.set(cx, bh / 2, cz); town.add(body)
    // DOOR — a framed dark opening on the front, so it's obvious where to walk in
    const dw = Math.min(w * 0.34, 2.6), dh = Math.min(bh * 0.6, tier === 4 ? 3.4 : bh - 1)
    const frame = new THREE.Mesh(new THREE.BoxGeometry(dw + 0.5, dh + 0.5, 0.18), frameMat); frame.position.set(cx, dh / 2, fz + 0.05); town.add(frame)
    const door = new THREE.Mesh(new THREE.BoxGeometry(dw, dh, 0.22), doorMat); door.position.set(cx, dh / 2, fz + 0.09); town.add(door)
    if (tier === 4) { // APARTMENT — flat roof + rows of lit windows up the facade
      const slab = new THREE.Mesh(new THREE.BoxGeometry(w * 1.04, 0.3, d * 1.04), roofMat); slab.position.set(cx, bh + 0.15, cz); town.add(slab)
      const floors = Math.floor(bh / 2.3)
      for (let fl = 1; fl < floors; fl++) for (const wx of [-0.3, 0, 0.3]) { const win = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.18, 1.0), winMat); win.position.set(cx + wx * w, 1.6 + fl * 2.3, fz + 0.02); town.add(win) }
    } else {
      for (const wx of [-0.34, 0.34]) { // a window either side of the door
        const win = new THREE.Mesh(new THREE.BoxGeometry(w * 0.18, Math.min(bh * 0.22, 1.2), 0.14), winMat); win.position.set(cx + wx * w, bh * 0.55, fz + 0.05); town.add(win)
      }
      if (world.era < 12 || r < 0.5) { // pitched roof
        const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.82, 2.0 + tier * 0.5 + r * 1.2, 4), roofMat)
        roof.position.set(cx, bh + (1.0 + r * 0.6), cz); roof.rotation.y = Math.PI / 4; town.add(roof)
      } else { const slab = new THREE.Mesh(new THREE.BoxGeometry(w * 1.02, 0.3, d * 1.02), roofMat); slab.position.set(cx, bh + 0.15, cz); town.add(slab) }
    }
  }
  // civic buildings (distinct material, taller)
  const civicMat = new THREE.MeshLambertMaterial({ map: tex(world.era >= 12 ? "wall_glass" : "wall_stone", 2) })
  for (const s of world.schools) town.add(boxBuilding(s.x, s.y, s.w, s.h, 5.0, civicMat))
  for (const u of world.universities) town.add(boxBuilding(u.x, u.y, u.w, u.h, 6.5, civicMat))
  // ── the world has EDGES now: grass beyond, a perimeter wall, and a forest ──
  const WW = WORLD_W * S, WH = WORLD_H * S
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(WW * 3, WH * 3), new THREE.MeshLambertMaterial({ map: tex("ground_grass", 60) }))
  outer.rotation.x = -Math.PI / 2; outer.position.set(WW / 2, -0.06, WH / 2); town.add(outer)
  if (gfxHigh) {
    // HIGH: painted hills backdrop at the horizon (the depth) + a forest of illustrated tree SPRITES
    const R = Math.max(WW, WH) * 0.98
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 64, 56, 1, true), new THREE.MeshBasicMaterial({ map: artTexPlain("backdrop_hills"), side: THREE.BackSide, fog: false }))
    ring.position.set(WW / 2, 22, WH / 2); town.add(ring)
    const treeNames = ["tree_pine", "tree_blossom", "tree_broadleaf"]
    for (let i = 0; i < 90; i++) { // a ring of painted trees framing the town
      const a = hashf(i * 3.1) * Math.PI * 2, rad = WW * 0.5 + hashf(i * 7.7) * WW * 0.55
      const x = WW / 2 + Math.cos(a) * rad, z = WH / 2 + Math.sin(a) * rad * (WH / WW)
      const name = treeNames[i % 3], sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: artTexPlain(name), transparent: true }))
      const sc = 7 + hashf(i) * 5, asp = artAspect.get(name) ?? 1
      sp.scale.set(sc * asp, sc, 1); sp.position.set(x, sc / 2, z); town.add(sp)
      _sway.push({ s: sp, amp: 0.035, ph: x }) // trees sway gently
    }
  } else {
    const wmat = matFor(walls[0]); const wallH = 7, wallT = 1.5
    const boundary = (w: number, x: number, z: number, ry: number) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, wallT), wmat); m.position.set(x, wallH / 2, z); m.rotation.y = ry; town!.add(m) }
    boundary(WW + wallT, WW / 2, 0, 0); boundary(WW + wallT, WW / 2, WH, 0)
    boundary(WH + wallT, 0, WH / 2, Math.PI / 2); boundary(WH + wallT, WW, WH / 2, Math.PI / 2)
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5a4028 }), leafMat = new THREE.MeshLambertMaterial({ color: world.era >= 15 ? 0x335a6a : 0x2f6a32 })
    const trunkGeo = new THREE.CylinderGeometry(0.3, 0.45, 2, 6), leafGeo = new THREE.ConeGeometry(1.7, 3.6, 7)
    for (let i = 0; i < 90; i++) { // a forest ringing the town, outside the wall
      const a = hashf(i * 3.1) * Math.PI * 2, rad = (WW * 0.6) + hashf(i * 7.7) * WW * 0.7
      const x = WW / 2 + Math.cos(a) * rad, z = WH / 2 + Math.sin(a) * rad * (WH / WW)
      const tree = new THREE.Group()
      const trunk = new THREE.Mesh(trunkGeo, trunkMat); trunk.position.y = 1
      const leaf = new THREE.Mesh(leafGeo, leafMat); leaf.position.y = 3.6
      tree.add(trunk, leaf); tree.position.set(x, 0, z); tree.scale.setScalar(1 + hashf(i) * 0.8); town.add(tree)
    }
  }
  // INNER greenery so the town isn't bare grass — scattered trees, bushes + rocks between the houses
  // INNER scatter between houses — illustrated sprites in high mode, procedural shapes in low
  for (let i = 0; i < 46; i++) {
    const px = hashf(i * 5.7 + 1) * WW, pz = hashf(i * 9.3 + 4) * WH
    const onRoad = Math.abs((px / S % BLOCK) - BLOCK / 2) > BLOCK / 2 - 40 || Math.abs((pz / S % BLOCK) - BLOCK / 2) > BLOCK / 2 - 40
    if (onRoad) continue // keep streets clear
    const k = hashf(i * 2.1)
    if (gfxHigh) {
      const isTree = k < 0.32
      const name = isTree ? ["tree_broadleaf", "tree_blossom", "tree_pine"][i % 3] : k < 0.58 ? "bush" : k < 0.8 ? "grass_tuft" : "flowers"
      const sc = isTree ? 6 + hashf(i * 3) * 4 : 1.5 + hashf(i * 3) * 1.1, asp = artAspect.get(name) ?? 1
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: artTexPlain(name), transparent: true }))
      sp.scale.set(sc * asp, sc, 1); sp.position.set(px, sc / 2, pz); town.add(sp)
      _sway.push({ s: sp, amp: isTree ? 0.035 : 0.09, ph: px }) // grass/flowers bend more than trees
    } else {
      const tMat = new THREE.MeshLambertMaterial({ color: 0x5a4028 }), lMat = new THREE.MeshLambertMaterial({ color: 0x2f6a32 })
      if (k < 0.5) { const t = new THREE.Group(); t.add(meshAt(new THREE.CylinderGeometry(0.3, 0.45, 2, 6), tMat, 0, 1, 0), meshAt(new THREE.ConeGeometry(1.7, 3.6, 7), lMat, 0, 2.6, 0)); t.position.set(px, 0, pz); t.scale.setScalar(0.8 + hashf(i * 3) * 0.5); town.add(t) }
      else if (k < 0.8) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.9, 7, 6), new THREE.MeshLambertMaterial({ color: 0x3f7a3a })); b.position.set(px, 0.6, pz); b.scale.set(1, 0.8, 1); town.add(b) }
      else { const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.6), new THREE.MeshLambertMaterial({ color: 0x8a857c })); r.position.set(px, 0.4, pz); r.scale.setScalar(0.7 + hashf(i * 4) * 0.8); town.add(r) }
    }
  }
  _clouds.length = 0
  if (gfxHigh) {
    // painted CLOUD sprites drifting high above + a warm SUN with soft light rays
    const cnames = ["cloud_1", "cloud_2", "cloud_3"]
    for (let i = 0; i < 14; i++) {
      const name = cnames[i % 3], asp = artAspect.get(name) ?? 2
      const cl = new THREE.Sprite(new THREE.SpriteMaterial({ map: artTexPlain(name), transparent: true, fog: false, opacity: 0.95 }))
      const sc = 28 + hashf(i * 5) * 22; cl.scale.set(sc * asp, sc, 1)
      cl.position.set(hashf(i * 3.3) * WW * 2 - WW * 0.5, 70 + hashf(i * 5) * 38, hashf(i * 8.1) * WH * 2 - WH * 0.5)
      town.add(cl); _clouds.push({ s: cl, v: 0.04 + hashf(i) * 0.05 })
    }
    const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: artTexPlain("sun_glow"), transparent: true, fog: false, opacity: 0.9, blending: THREE.AdditiveBlending }))
    sun.scale.set(70, 70, 1); sun.position.set(WW * 0.2, 120, -WH * 0.3); town.add(sun)
    const rays = new THREE.Sprite(new THREE.SpriteMaterial({ map: artTexPlain("light_rays"), transparent: true, fog: false, opacity: 0.35, blending: THREE.AdditiveBlending }))
    rays.scale.set(150, 150, 1); rays.position.set(WW * 0.3, 80, WH * 0.1); town.add(rays)
  } else {
    const cloudMat = new THREE.MeshBasicMaterial({ color: 0xf2f4f8, transparent: true, opacity: 0.82, fog: false })
    for (let i = 0; i < 12; i++) {
      const c = new THREE.Group()
      for (let p = 0; p < 4; p++) { const puff = new THREE.Mesh(new THREE.SphereGeometry(6 + hashf(i * 7 + p) * 5, 7, 6), cloudMat); puff.position.set((p - 1.5) * 7, hashf(i + p) * 3, hashf(i * 2 + p) * 5); c.add(puff) }
      c.position.set(hashf(i * 3.3) * WW * 1.5 - WW * 0.25, 75 + hashf(i * 5) * 30, hashf(i * 8.1) * WH * 1.5 - WH * 0.25); c.scale.y = 0.5; town.add(c)
    }
  }
  // ── plaza props: a fountain at the heart of town, market stalls + lamp posts (it feels inhabited) ──
  const cX = WORLD_W * S / 2, cZ = WORLD_H * S / 2
  const stone = new THREE.MeshLambertMaterial({ color: 0x9a958c })
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.9, 0.6, 16), stone); basin.position.set(cX, 0.3, cZ); town.add(basin)
  const water = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 0.2, 16), new THREE.MeshBasicMaterial({ color: 0x4a86c0 })); water.position.set(cX, 0.55, cZ); town.add(water)
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 1.4, 8), stone); spout.position.set(cX, 1.1, cZ); town.add(spout)
  const clothMat = [0xb04848, 0x4878b0, 0x4aa060, 0xc0a040].map((c) => new THREE.MeshLambertMaterial({ color: c }))
  const woodMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2c })
  for (let i = 0; i < 6; i++) { // a ring of market stalls around the plaza
    const a = (i / 6) * Math.PI * 2, sx = cX + Math.cos(a) * 9, sz = cZ + Math.sin(a) * 9
    const post = new THREE.Mesh(new THREE.BoxGeometry(3, 2.2, 2.4), woodMat); post.position.set(sx, 1.1, sz); town.add(post)
    const awn = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.2, 2.8), clothMat[i % 4]); awn.position.set(sx, 2.3, sz); town.add(awn)
  }
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffd27a })
  for (let i = 0; i < 8; i++) { // lamp posts down the main streets
    const a = (i / 8) * Math.PI * 2, lx = cX + Math.cos(a) * 18, lz = cZ + Math.sin(a) * 18
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 3.2, 6), woodMat); pole.position.set(lx, 1.6, lz); town.add(pole)
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 8), lampMat); bulb.position.set(lx, 3.3, lz); town.add(bulb)
  }
  scene.add(town); builtFor = world; builtEra = world.era
}

// ── house interiors: a simple room you enter through the door ──
let intGroup: THREE.Group | null = null
let intFor: House | null = null
const RW = 15, RD = 11, RH = 4 // room dimensions (units)
function buildInterior(world: World, h: House) {
  if (intGroup) { scene.remove(intGroup); intGroup.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose(); disposeMat(m.material) }) }
  intGroup = new THREE.Group()
  const E = eraTex(world.era)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(RW, RD), new THREE.MeshLambertMaterial({ map: tex(E.ground === "ground_grass" ? "ground_dirt" : E.ground, 3) }))
  floor.rotation.x = -Math.PI / 2; intGroup.add(floor)
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(RW, RD), new THREE.MeshLambertMaterial({ color: 0x17130d }))
  ceil.rotation.x = Math.PI / 2; ceil.position.y = RH; intGroup.add(ceil)
  const wm = new THREE.MeshLambertMaterial({ map: tex(E.wall, 2), side: THREE.DoubleSide })
  const wall = (w: number, x: number, z: number, ry: number) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, RH), wm); m.position.set(x, RH / 2, z); m.rotation.y = ry; intGroup!.add(m) }
  wall(RW, 0, -RD / 2, 0)             // back
  wall(RD, -RW / 2, 0, Math.PI / 2)   // left
  wall(RD, RW / 2, 0, Math.PI / 2)    // right
  wall(RW / 2 - 1.2, -(RW / 4 + 0.6), RD / 2, 0)  // front (split for a door gap)
  wall(RW / 2 - 1.2, RW / 4 + 0.6, RD / 2, 0)
  // furniture so the home actually feels lived-in
  const future = world.era >= 12
  const wood = new THREE.MeshLambertMaterial({ color: future ? 0x556070 : 0x6b4a2c })
  const cloth = new THREE.MeshLambertMaterial({ color: future ? 0x2f6f86 : 0x7a3838 })
  const box = (w: number, hh: number, d: number, x: number, y: number, z: number, m: THREE.Material) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), m); b.position.set(x, y, z); intGroup!.add(b) }
  box(2.2, 0.45, 3.2, -RW / 2 + 1.6, 0.22, -RD / 2 + 2.2, wood)        // bed frame
  box(2.0, 0.3, 3.0, -RW / 2 + 1.6, 0.6, -RD / 2 + 2.2, cloth)         // mattress
  box(2.8, 0.22, 1.7, 1.5, 1.0, -0.5, wood)                            // table top
  for (const [sx, sz] of [[0.4, -1.2], [2.6, -1.2], [0.4, 0.2], [2.6, 0.2]]) box(0.2, 1.0, 0.2, sx, 0.5, sz, wood) // table legs
  box(1.0, 0.5, 1.0, 1.5, 0.85, 1.4, wood)                             // stool
  box(2.2, 1.5, 0.6, RW / 2 - 1.4, 0.75, -RD / 2 + 0.4, new THREE.MeshLambertMaterial({ color: 0x3b3b3f })) // hearth
  const fire = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 8), new THREE.MeshBasicMaterial({ color: future ? 0x4ad0ff : 0xff7a2a }))
  fire.position.set(RW / 2 - 1.4, 0.55, -RD / 2 + 0.55); intGroup.add(fire)
  const fl = new THREE.PointLight(future ? 0x6ad0ff : 0xff8030, 1.4, 14); fl.position.set(RW / 2 - 1.4, 1.3, -RD / 2 + 1.2); intGroup.add(fl)
  box(1.8, 1.1, 0.8, RW / 2 - 1.2, 0.55, RD / 2 - 2, wood)             // chest / shelf
  scene.add(intGroup); intFor = h
}
export function renderInterior(world: World, me: Creature, h: House, rx: number, rz: number, yaw: number, pitch: number) {
  if (!ready) return
  if (builtFor !== world || builtEra !== world.era) buildTown(world)
  if (intFor !== h || !intGroup) buildInterior(world, h)
  if (town) town.visible = false; intGroup!.visible = true
  for (const lb of labelPool) lb.visible = false // no floating names indoors
  let i = 0
  const put = (c: Creature, x: number, z: number, scale: number, ringCol: number) => {
    const slot = modelPool[i] // interior uses the SAME procedural villagers as outside (no more billboards)
    if (!slot.userData.rig) buildRig(slot)
    const rig = slot.userData.rig as { skinMat: THREE.MeshLambertMaterial; hairMat: THREE.MeshLambertMaterial; clothMat: THREE.MeshLambertMaterial; ll: THREE.Mesh; rl: THREE.Mesh; la: THREE.Mesh; ra: THREE.Mesh }
    const ap = appear3D(c)
    rig.skinMat.color.setHex(ap.skin); rig.hairMat.color.setHex(ap.hair); rig.clothMat.color.setHSL(ap.clothH, 0.42, 0.54)
    rig.ll.rotation.x = 0; rig.rl.rotation.x = 0; rig.la.rotation.x = 0; rig.ra.rotation.x = 0 // standing indoors
    pool[i].visible = false; slot.visible = true
    const ageScale = ap.ay < 2 ? 0.42 : ap.ay < 13 ? 0.62 : ap.ay < 19 ? 0.84 : 1
    slot.position.set(x, 0, z); slot.scale.setScalar(scale * ageScale); slot.rotation.y = yaw + Math.PI
    const r = rings[i]; r.visible = true; (r.material as THREE.MeshBasicMaterial).color.setHex(ringCol); r.position.set(x, 0.05, z); r.scale.setScalar(scale * 0.5)
    const sh = shadows[i]; sh.visible = true; sh.position.set(x, 0.03, z); sh.scale.setScalar(scale * 0.42)
    i++
  }
  put(me, rx, rz, 2.0, 0x46c8ff)
  const occ = world.creatures.filter((c) => c.home === h && c !== me && !c.isAvatar).slice(0, 6)
  occ.forEach((c, k) => put(c, -RW / 2 + 2 + (k % 3) * 2.5, -RD / 2 + 2 + Math.floor(k / 3) * 2.5, 1.5, relColor(me, c)))
  for (; i < pool.length; i++) { pool[i].visible = false; rings[i].visible = false; shadows[i].visible = false; modelPool[i].visible = false; labelPool[i].visible = false }
  const cp = Math.cos(pitch)
  const cx = rx - Math.cos(yaw) * 4.2, cy = 3.0, cz = rz - Math.sin(yaw) * 4.2 // a touch further back so you see the room
  camera.position.set(cx, cy, cz); camera.lookAt(rx + Math.cos(yaw) * 2 * cp, 1.4 + Math.sin(pitch) * 8, rz + Math.sin(yaw) * 2 * cp)
  renderer.render(scene, camera)
}
export const ROOM = { W: RW, D: RD }

// world (x,y) → screen pixels, for floating DOM speech bubbles over the 3D view
export function project3D(wx: number, wy: number, w: number, h: number): { x: number; y: number; front: boolean } {
  const v = new THREE.Vector3(wx * S, 2.2, wy * S).project(camera)
  return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, front: v.z < 1 }
}

// which creature did you click? — project the nearby people to the screen + take the closest to the cursor
export function pick3D(world: World, me: Creature, sx: number, sy: number, w: number, h: number): Creature | null {
  if (!ready) return null
  const v = new THREE.Vector3()
  let best: Creature | null = null, bestD = 75 * 75
  for (const c of world.creatures) {
    if (c === me || c.isAvatar) continue
    const dx = c.x - me.x, dy = c.y - me.y
    if (dx * dx + dy * dy > 600 * 600) continue
    v.set(c.x * S, 1.0, c.y * S).project(camera)
    if (v.z > 1) continue // behind the camera
    const px = (v.x * 0.5 + 0.5) * w, py = (-v.y * 0.5 + 0.5) * h
    const d = (px - sx) ** 2 + (py - sy) ** 2
    if (d < bestD) { bestD = d; best = c }
  }
  return best
}

export function render3D(world: World, me: Creature, yaw: number, pitch = 0, dist = 8.5) {
  if (!ready) return
  walkT += 0.016
  for (const w of _sway) w.s.material.rotation = Math.sin(walkT * 1.25 + w.ph * 6) * w.amp // wind: gentle sway of the vegetation
  if (gfxHigh) { // falling cherry-blossom petals drifting around you
    ensurePetals(); const cx = me.x * S, cz = me.y * S
    for (const p of petalPool) {
      const u = p.userData as { x: number; y: number; z: number; vy: number; ph: number }
      u.y -= u.vy; u.ph += 0.04
      if (u.y < 0.2) { u.y = 11 + Math.random() * 9; u.x = cx + (Math.random() * 2 - 1) * 42; u.z = cz + (Math.random() * 2 - 1) * 42; u.vy = 0.022 + Math.random() * 0.03 }
      p.visible = true; p.material.rotation = u.ph; p.position.set(u.x + Math.sin(u.ph) * 1.3, u.y, u.z + Math.cos(u.ph * 0.7) * 0.9)
    }
  } else for (const p of petalPool) p.visible = false
  for (const c of _clouds) { c.s.position.x += c.v; if (c.s.position.x > WWU * 1.5) c.s.position.x = -WWU * 0.5 } // clouds drift
  // DAY/NIGHT: light + haze follow the in-world hour so dusk darkens + night cools the whole 3D scene
  const hr = (world.clockMinutes % 1440) / 60
  const bright = hr < 5 || hr >= 21 ? 0.32 : hr < 7 ? 0.6 : hr < 18 ? 1 : hr < 20 ? 0.6 : 0.42
  const warm = gfxHigh ? 1.12 : 1 // high graphics: softer, warmer fill light (Ghibli daylight)
  if (ambient) { ambient.intensity = (0.9 + bright * 1.3) * warm; ambient.color.setHex(gfxHigh ? 0xfff3e2 : 0xffffff) }
  if (sun) sun.intensity = (0.15 + bright * 1.0) * warm
  if (scene.fog) (scene.fog as THREE.Fog).color.setHex(hr < 5 || hr >= 21 ? 0x141d3a : hr < 7 ? 0xc99060 : hr < 18 ? 0xaebdd2 : hr < 20 ? 0xb88a5a : 0x5a4d72)
  if (builtFor !== world || builtEra !== world.era) buildTown(world)
  if (town) town.visible = true; if (intGroup) intGroup.visible = false

  // PERF: pick the nearest N by radius-filter (no full filter→map→sort→slice over ~280 creatures every frame).
  // A coarse 600px gate then a partial insertion keeps only what's visible, with no per-frame intermediate arrays.
  const cap = pool.length - 1
  _near.length = 0
  for (const c of world.creatures) {
    if (c === me || c.isAvatar) continue
    const d = (c.x - me.x) ** 2 + (c.y - me.y) ** 2
    if (d > 600 * 600) continue
    if (_near.length < cap) { _near.push({ c, d }) } // fill, then replace the farthest when full
    else { let mx = 0; for (let k = 1; k < _near.length; k++) if (_near[k].d > _near[mx].d) mx = k; if (d < _near[mx].d) _near[mx] = { c, d } }
  }
  const near = _near
  let i = 0
  const place = (c: Creature, scale: number, ringCol: number) => {
    const r = rings[i]; r.visible = true; (r.material as THREE.MeshBasicMaterial).color.setHex(ringCol)
    r.position.set(c.x * S, 0.06, c.y * S); r.scale.setScalar(scale * 0.5)
    const sh = shadows[i]; sh.visible = true; sh.position.set(c.x * S, 0.04, c.y * S); sh.scale.setScalar(scale * 0.42)
    const slot = modelPool[i]
    if (!slot.userData.rig) buildRig(slot)
    const rig = slot.userData.rig as { legMat: THREE.MeshLambertMaterial; clothMat: THREE.MeshLambertMaterial; skinMat: THREE.MeshLambertMaterial; hairMat: THREE.MeshLambertMaterial; ll: THREE.Mesh; rl: THREE.Mesh; la: THREE.Mesh; ra: THREE.Mesh }
    const ap = appear3D(c)
    rig.skinMat.color.setHex(ap.skin); rig.hairMat.color.setHex(ap.hair); rig.clothMat.color.setHSL(ap.clothH, 0.42, 0.54)
    pool[i].visible = false; slot.visible = true
    const moving = Math.abs(c.vx) + Math.abs(c.vy) > 0.12
    const ph = walkT * 9 + c.id
    const bob = moving ? Math.abs(Math.sin(ph)) * 0.06 : Math.sin(walkT * 1.6 + c.id) * 0.015
    const ageScale = ap.ay < 2 ? 0.42 : ap.ay < 13 ? 0.62 : ap.ay < 19 ? 0.84 : ap.ay > 60 ? 0.94 : 1
    slot.position.set(c.x * S, bob, c.y * S); slot.scale.setScalar(scale * ageScale)
    if (moving) slot.rotation.y = -Math.atan2(c.vy, c.vx) - Math.PI / 2
    const swing = moving ? Math.sin(ph) * 0.35 : 0 // legs + arms swing in opposition, a real walk
    rig.ll.rotation.x = swing; rig.rl.rotation.x = -swing; rig.la.rotation.x = -swing * 0.7; rig.ra.rotation.x = swing * 0.7
    const lb = labelPool[i] // floating name (nearest dozen only — labels regenerate only when the name changes)
    if (i < 14) {
      const nm = c.isAvatar ? "vos" : c.name
      if (lb.userData.name !== nm) { lb.material.map?.dispose(); lb.material.map = makeLabel(nm); lb.material.needsUpdate = true; lb.userData.name = nm }
      lb.visible = true; lb.position.set(c.x * S, scale * ageScale * 1.6 + 0.5, c.y * S)
    } else lb.visible = false
    i++
  }
  place(me, 2.0, 0x46c8ff) // you — cyan ring
  for (const { c } of near) { if (i >= pool.length) break; place(c, 1.3 + c.genome.size * 0.45, relColor(me, c)) }
  for (; i < pool.length; i++) { pool[i].visible = false; rings[i].visible = false; shadows[i].visible = false; modelPool[i].visible = false; labelPool[i].visible = false }

  // DYNAMIC PROPS — the same wild animals + harvestable crops you see in 2D, now in 3D (nearby only, no per-frame sort)
  ensureProps()
  let ai = 0
  for (const a of world.animals) {
    if (ai >= animPool.length) break
    const dx = a.x - me.x, dy = a.y - me.y; if (dx * dx + dy * dy > 620 * 620) continue
    const sp = SPECIES[a.kind], art = gfxHigh ? ANIM_ART[a.kind] : undefined
    if (art) { // painted animal sprite (faces left/right via x-flip)
      animPool[ai].visible = false
      const m = animSpritePool[ai]; m.visible = true; m.material.map = artTexPlain(art)
      const asp = artAspect.get(art) ?? 1, sc = 2 + (sp?.danger || 0) * 0.6
      m.scale.set((a.vx > 0.04 ? -1 : 1) * sc * asp, sc, 1); m.position.set(a.x * S, sc / 2 - 0.2, a.y * S)
    } else {
      animSpritePool[ai].visible = false
      const m = animPool[ai]; m.visible = true
      ;(m.userData.mat as THREE.MeshLambertMaterial).color.setHex(a.tame ? 0xbfe3a0 : sp?.hostile ? 0xcc5533 : 0xcaa869)
      const sc = 0.7 + (sp?.danger || 0) * 0.5; m.scale.setScalar(sc); m.position.set(a.x * S, 0, a.y * S)
      if (Math.abs(a.vx) + Math.abs(a.vy) > 0.04) m.rotation.y = -Math.atan2(a.vy, a.vx)
    }
    ai++
  }
  for (; ai < animPool.length; ai++) { animPool[ai].visible = false; animSpritePool[ai].visible = false }
  let fi = 0
  for (const f of world.food) {
    if (fi >= foodPool.length) break
    const dx = f.x - me.x, dy = f.y - me.y; if (dx * dx + dy * dy > 520 * 520) continue
    const m = foodPool[fi++]; m.visible = true; m.position.set(f.x * S, 0, f.y * S)
  }
  for (; fi < foodPool.length; fi++) foodPool[fi].visible = false

  // THIRD-PERSON camera — pulled back + raised so you see your character + the world around (not glued behind the head)
  const mx = me.x * S, mz = me.y * S
  const cy = 1.4 + dist * 0.45 // height scales with the wheel-controlled distance, so zooming out also lifts the view
  const cx = mx - Math.cos(yaw) * dist, cz = mz - Math.sin(yaw) * dist
  camera.position.set(cx, cy, cz)
  const cp = Math.cos(pitch)
  camera.lookAt(mx + Math.cos(yaw) * 3 * cp, 1.8 + Math.sin(pitch) * 8, mz + Math.sin(yaw) * 3 * cp) // look at the character + a bit ahead
  renderer.render(scene, camera)
}
