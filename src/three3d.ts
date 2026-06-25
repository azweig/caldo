// three3d.ts — a real 3D engine used ONLY while you possess a creature. It mirrors the active 2D
// world (houses, gardens, streets, the people near you) into a Three.js scene and follows the
// possessed character in third person. The simulation stays in the 2D engine; this only renders.

import * as THREE from "three"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"
import { World, Creature, House, WORLD_W, WORLD_H, BLOCK } from "./world"

const S = 0.045 // world px → 3D units

let renderer: THREE.WebGLRenderer
let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
let pool: THREE.Sprite[] = []
let rings: THREE.Mesh[] = []
let shadows: THREE.Mesh[] = []
let town: THREE.Group | null = null
let builtFor: World | null = null
let builtEra = -1 // rebuild the town when the era (architecture) changes
let walkT = 0 // real-time clock for the fake walk animation
let ready = false

export function init3D(canvas: HTMLCanvasElement, _creatureImgs: HTMLImageElement[]) {
  if (ready) return
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false })
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
  scene = new THREE.Scene()
  scene.fog = new THREE.Fog(0xaebdd2, 110, 360) // pale-horizon haze
  camera = new THREE.PerspectiveCamera(60, 1, 0.1, 900)
  scene.add(new THREE.AmbientLight(0xffffff, 2.0)) // very bright ambient so characters never go dark
  scene.add(new THREE.HemisphereLight(0xdfeaff, 0x8a7c5a, 1.2))
  const sun = new THREE.DirectionalLight(0xfff4e0, 1.1); sun.position.set(40, 80, 30); scene.add(sun)
  // sky dome — a pleasant daytime gradient
  const sc = document.createElement("canvas"); sc.width = 4; sc.height = 256
  const sg = sc.getContext("2d")!; const grad = sg.createLinearGradient(0, 0, 0, 256)
  grad.addColorStop(0, "#3f6fb5"); grad.addColorStop(0.55, "#8fb0d8"); grad.addColorStop(1, "#cdd9e6")
  sg.fillStyle = grad; sg.fillRect(0, 0, 4, 256)
  const skyTex = new THREE.CanvasTexture(sc); skyTex.colorSpace = THREE.SRGBColorSpace
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(500, 20, 16), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false })))
  const ringGeo = new THREE.RingGeometry(0.5, 0.74, 22)
  const shadowGeo = new THREE.CircleGeometry(0.5, 18)
  for (let i = 0; i < 64; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false })); sp.visible = false; scene.add(sp); pool.push(sp)
    const r = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.85, side: THREE.DoubleSide }))
    r.rotation.x = -Math.PI / 2; r.visible = false; scene.add(r); rings.push(r)
    const sh = new THREE.Mesh(shadowGeo, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32 }))
    sh.rotation.x = -Math.PI / 2; sh.visible = false; scene.add(sh); shadows.push(sh) // grounding shadow
    const mg = new THREE.Group(); mg.visible = false; scene.add(mg); modelPool.push(mg) // holds a 3D character model
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

// ── people sprites (SDXL-generated, rembg cut-outs) chosen by era + role + sex + a heritable variant ──
const peopleTex = new Map<string, THREE.Texture>()
const peopleAspect = new Map<string, number>()
function loadPerson(name: string): THREE.Texture {
  let t = peopleTex.get(name)
  if (!t) {
    t = loader.load(`/people/${name}.png`, (tx) => { const im = tx.image; if (im && im.width) peopleAspect.set(name, im.width / im.height) })
    t.colorSpace = THREE.SRGBColorSpace
    peopleTex.set(name, t)
  }
  return t
}
function eraTier(era: number): string {
  if (era <= 1) return "prehist"; if (era <= 4) return "ancient"; if (era <= 7) return "medieval"
  if (era <= 9) return "renais"; if (era <= 11) return "industrial"; if (era <= 14) return "modern"; return "future"
}
function roleOf(c: Creature): string {
  const cat = c.profCat
  if (cat === "comercio" || cat === "liderazgo") return "merchant"
  if (cat === "defensa") return "warrior"
  if (cat === "saber" || cat === "enseñanza" || cat === "ingeniería" || cat === "arte" || cat === "espíritu" || cat === "salud") return "scholar"
  return "commoner"
}
function personName(c: Creature, era: number): string {
  const sex = c.id % 2 ? "m" : "f"
  const v = (c.genome.sprite + c.id) % 2 // heritable (genome) + a touch of individual variation
  return `${eraTier(era)}_${roleOf(c)}_${sex}_${v}`
}
// the 3D MODEL is shared across both variants (only era×role×sex were converted to GLB)
function modelName(c: Creature, _era: number): string {
  // TEST: only 4 anime models exist for now → map every creature to one of them by role
  const role = roleOf(c) // commoner | merchant | scholar | warrior
  const sex = role === "merchant" || role === "scholar" ? "f" : "m"
  return `anime_${role}_${sex}`
}

// ── real 3D character meshes (TripoSR GLBs) with a billboard fallback while a model loads ──
const gltf = new GLTFLoader()
const modelCache = new Map<string, THREE.Object3D>()
const modelLoading = new Set<string>()
const modelPool: THREE.Group[] = []
function loadBase(name: string) {
  if (modelCache.has(name) || modelLoading.has(name)) return
  modelLoading.add(name)
  gltf.load(`/glb_anime/${name}.glb`, (g) => {
    const root = g.scene
    root.updateMatrixWorld(true) // TRELLIS meshes already come upright (Y-up)
    const box = new THREE.Box3().setFromObject(root)
    const size = new THREE.Vector3(); box.getSize(size)
    const s = 1 / (size.y || 1) // normalise to unit height (now that it's upright)
    const c = box.getCenter(new THREE.Vector3())
    root.scale.setScalar(s)
    root.position.set(-c.x * s, -box.min.y * s, -c.z * s) // feet at y=0, centred on x/z
    root.traverse((o) => { // unlit + vertex colours → the characters are always clearly visible, never dark
      if (o instanceof THREE.Mesh) { const old = o.material as THREE.MeshStandardMaterial; o.material = new THREE.MeshBasicMaterial({ vertexColors: true, map: old.map ?? null }) }
    })
    const wrap = new THREE.Group(); wrap.add(root)
    modelCache.set(name, wrap)
  }, undefined, () => modelLoading.delete(name))
}

function boxBuilding(x: number, y: number, w: number, h: number, height: number, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w * S, height, h * S), mat)
  m.position.set((x + w / 2) * S, height / 2, (y + h / 2) * S); return m
}

function buildTown(world: World) {
  if (town) { scene.remove(town); town.traverse((o) => { (o as THREE.Mesh).geometry?.dispose() }) }
  town = new THREE.Group()
  const E = eraTex(world.era)
  // textured ground (tiled)
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_W * S, WORLD_H * S), new THREE.MeshLambertMaterial({ map: tex(E.ground, 42) }))
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
  for (const gd of world.gardens) {
    const disc = new THREE.Mesh(new THREE.CircleGeometry(95 * S, 18), new THREE.MeshBasicMaterial({ color: 0x2c5a38, transparent: true, opacity: 0.4 }))
    disc.rotation.x = -Math.PI / 2; disc.position.set(gd.x * S, 0.05, gd.y * S); town.add(disc)
  }
  // textured houses with per-house VARIETY in height + roof style (deterministic by position → stable)
  const walls = eraWalls(world.era), roofs = eraRoofs(world.era)
  for (const h of world.houses) {
    const r = hashf(h.x + h.y * 0.7)
    const wallMat = matFor(walls[Math.floor(hashf(h.x * 1.7 + 3) * 997) % walls.length])
    const roofMat = matFor(roofs[Math.floor(hashf(h.y * 2.3 + 7) * 997) % roofs.length])
    const bh = 3.0 + r * 3.6 // some squat, some tall
    const w = h.w * S * (1.0 + hashf(h.x) * 0.45), d = h.h * S * (1.0 + hashf(h.y) * 0.45)
    const cx = (h.x + h.w / 2) * S, cz = (h.y + h.h / 2) * S
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, bh, d), wallMat)
    body.position.set(cx, bh / 2, cz); town.add(body)
    if (world.era < 12 || r < 0.5) { // pitched roof (old eras + some moderns)
      const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.78, 1.6 + r, 4), roofMat)
      roof.position.set(cx, bh + (0.8 + r * 0.5), cz); roof.rotation.y = Math.PI / 4; town.add(roof)
    } else { // flat slab roof for tall modern buildings
      const slab = new THREE.Mesh(new THREE.BoxGeometry(w * 1.02, 0.3, d * 1.02), roofMat)
      slab.position.set(cx, bh + 0.15, cz); town.add(slab)
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
  scene.add(town); builtFor = world; builtEra = world.era
}

// ── house interiors: a simple room you enter through the door ──
let intGroup: THREE.Group | null = null
let intFor: House | null = null
const RW = 15, RD = 11, RH = 4 // room dimensions (units)
function buildInterior(world: World, h: House) {
  if (intGroup) { scene.remove(intGroup); intGroup.traverse((o) => (o as THREE.Mesh).geometry?.dispose()) }
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
  for (const mg of modelPool) mg.visible = false // interior uses billboards
  let i = 0
  const put = (c: Creature, x: number, z: number, scale: number, ringCol: number) => {
    const sp = pool[i]; sp.visible = true; const name = personName(c, world.era)
    sp.material.map = loadPerson(name); sp.material.needsUpdate = true
    const asp = peopleAspect.get(name) ?? 0.5
    sp.position.set(x, scale / 2 + 0.05, z); sp.scale.set(scale * asp, scale, 1)
    const r = rings[i]; r.visible = true; (r.material as THREE.MeshBasicMaterial).color.setHex(ringCol); r.position.set(x, 0.05, z); r.scale.setScalar(scale * asp * 0.95)
    const sh = shadows[i]; sh.visible = true; sh.position.set(x, 0.03, z); sh.scale.setScalar(scale * asp * 0.8)
    i++
  }
  put(me, rx, rz, 2.0, 0x46c8ff)
  const occ = world.creatures.filter((c) => c.home === h && c !== me && !c.isAvatar).slice(0, 6)
  occ.forEach((c, k) => put(c, -RW / 2 + 2 + (k % 3) * 2.5, -RD / 2 + 2 + Math.floor(k / 3) * 2.5, 1.5, relColor(me, c)))
  for (; i < pool.length; i++) { pool[i].visible = false; rings[i].visible = false; shadows[i].visible = false }
  const cp = Math.cos(pitch)
  const cx = rx - Math.cos(yaw) * 3.0, cy = 2.0, cz = rz - Math.sin(yaw) * 3.0
  camera.position.set(cx, cy, cz); camera.lookAt(cx + Math.cos(yaw) * 9 * cp, cy + Math.sin(pitch) * 9, cz + Math.sin(yaw) * 9 * cp)
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

export function render3D(world: World, me: Creature, yaw: number, pitch = 0) {
  if (!ready) return
  walkT += 0.016
  if (builtFor !== world || builtEra !== world.era) buildTown(world)
  if (town) town.visible = true; if (intGroup) intGroup.visible = false

  const near = world.creatures
    .filter((c) => c !== me && !c.isAvatar)
    .map((c) => ({ c, d: (c.x - me.x) ** 2 + (c.y - me.y) ** 2 }))
    .sort((a, b) => a.d - b.d)
    .slice(0, pool.length - 1)
  let i = 0
  const place = (c: Creature, scale: number, ringCol: number) => {
    const r = rings[i]; r.visible = true; (r.material as THREE.MeshBasicMaterial).color.setHex(ringCol)
    r.position.set(c.x * S, 0.06, c.y * S); r.scale.setScalar(scale * 0.5)
    const sh = shadows[i]; sh.visible = true; sh.position.set(c.x * S, 0.04, c.y * S); sh.scale.setScalar(scale * 0.42)
    const mn = modelName(c, world.era); loadBase(mn)
    const base = modelCache.get(mn); const slot = modelPool[i]
    if (base) { // real 3D mesh
      pool[i].visible = false; slot.visible = true
      if (slot.userData.name !== mn) { slot.clear(); slot.add(base.clone()); slot.userData.name = mn }
      const moving = Math.abs(c.vx) + Math.abs(c.vy) > 0.12
      const bob = moving ? Math.abs(Math.sin(walkT * 9 + c.id)) * 0.13 : 0 // fake walk bounce (no rig)
      slot.position.set(c.x * S, bob, c.y * S); slot.scale.setScalar(scale)
      if (moving) { slot.rotation.y = -Math.atan2(c.vy, c.vx) - Math.PI / 2; slot.rotation.z = Math.sin(walkT * 9 + c.id) * 0.07 }
      else slot.rotation.z = 0
    } else { // billboard fallback while the model loads
      slot.visible = false
      const sp = pool[i]; sp.visible = true; const pn = personName(c, world.era)
      sp.material.map = loadPerson(pn); sp.material.needsUpdate = true
      const asp = peopleAspect.get(pn) ?? 0.5
      sp.position.set(c.x * S, scale / 2 + 0.05, c.y * S); sp.scale.set(scale * asp, scale, 1)
    }
    i++
  }
  place(me, 2.0, 0x46c8ff) // you — cyan ring
  for (const { c } of near) { if (i >= pool.length) break; place(c, 1.3 + c.genome.size * 0.45, relColor(me, c)) }
  for (; i < pool.length; i++) { pool[i].visible = false; rings[i].visible = false; shadows[i].visible = false; modelPool[i].visible = false }

  // GROUND-LEVEL over-the-shoulder camera — yaw from A/D + mouse, pitch from dragging the mouse up/down
  const mx = me.x * S, mz = me.y * S
  const cx = mx - Math.cos(yaw) * 3.4, cy = 2.0, cz = mz - Math.sin(yaw) * 3.4
  camera.position.set(cx, cy, cz)
  const cp = Math.cos(pitch)
  camera.lookAt(cx + Math.cos(yaw) * 10 * cp, cy + Math.sin(pitch) * 10, cz + Math.sin(yaw) * 10 * cp)
  renderer.render(scene, camera)
}
