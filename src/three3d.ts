// three3d.ts — a real 3D engine used ONLY while you possess a creature. It mirrors the active 2D
// world (houses, gardens, streets, the people near you) into a Three.js scene and follows the
// possessed character in third person. The simulation stays in the 2D engine; this only renders.

import * as THREE from "three"
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
let ready = false

export function init3D(canvas: HTMLCanvasElement, _creatureImgs: HTMLImageElement[]) {
  if (ready) return
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false })
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x0a0e16)
  scene.fog = new THREE.Fog(0x0a0e16, 55, 240) // see down the street, fade the far horizon
  camera = new THREE.PerspectiveCamera(60, 1, 0.1, 600)
  scene.add(new THREE.AmbientLight(0x8a9ec0, 0.95))
  const sun = new THREE.DirectionalLight(0xfff0d8, 0.6); sun.position.set(30, 60, 20); scene.add(sun)
  const ringGeo = new THREE.RingGeometry(0.5, 0.74, 22)
  const shadowGeo = new THREE.CircleGeometry(0.5, 18)
  for (let i = 0; i < 64; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false })); sp.visible = false; scene.add(sp); pool.push(sp)
    const r = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.85, side: THREE.DoubleSide }))
    r.rotation.x = -Math.PI / 2; r.visible = false; scene.add(r); rings.push(r)
    const sh = new THREE.Mesh(shadowGeo, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32 }))
    sh.rotation.x = -Math.PI / 2; sh.visible = false; scene.add(sh); shadows.push(sh) // grounding shadow
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
  const wallMat = new THREE.MeshLambertMaterial({ map: tex(E.wall, 2) })
  const roofMat = new THREE.MeshLambertMaterial({ map: tex(E.roof, 2) })
  for (const h of world.houses) {
    const r = hashf(h.x + h.y * 0.7)
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
  scene.add(intGroup); intFor = h
}
export function renderInterior(world: World, me: Creature, h: House, rx: number, rz: number, yaw: number, pitch: number) {
  if (!ready) return
  if (builtFor !== world || builtEra !== world.era) buildTown(world)
  if (intFor !== h || !intGroup) buildInterior(world, h)
  if (town) town.visible = false; intGroup!.visible = true
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

export function render3D(world: World, me: Creature, yaw: number, pitch = 0) {
  if (!ready) return
  if (builtFor !== world || builtEra !== world.era) buildTown(world)
  if (town) town.visible = true; if (intGroup) intGroup.visible = false

  const near = world.creatures
    .filter((c) => c !== me && !c.isAvatar)
    .map((c) => ({ c, d: (c.x - me.x) ** 2 + (c.y - me.y) ** 2 }))
    .sort((a, b) => a.d - b.d)
    .slice(0, pool.length - 1)
  let i = 0
  const place = (c: Creature, scale: number, ringCol: number) => {
    const sp = pool[i]; sp.visible = true
    const name = personName(c, world.era)
    sp.material.map = loadPerson(name); sp.material.needsUpdate = true
    const asp = peopleAspect.get(name) ?? 0.5
    sp.position.set(c.x * S, scale / 2 + 0.05, c.y * S); sp.scale.set(scale * asp, scale, 1) // keep aspect
    const r = rings[i]; r.visible = true; (r.material as THREE.MeshBasicMaterial).color.setHex(ringCol)
    r.position.set(c.x * S, 0.06, c.y * S); r.scale.setScalar(scale * asp * 0.95)
    const sh = shadows[i]; sh.visible = true; sh.position.set(c.x * S, 0.04, c.y * S); sh.scale.setScalar(scale * asp * 0.8) // grounding
    i++
  }
  place(me, 2.0, 0x46c8ff) // you — cyan ring
  for (const { c } of near) { if (i >= pool.length) break; place(c, 1.3 + c.genome.size * 0.45, relColor(me, c)) }
  for (; i < pool.length; i++) { pool[i].visible = false; rings[i].visible = false; shadows[i].visible = false }

  // GROUND-LEVEL over-the-shoulder camera — yaw from A/D + mouse, pitch from dragging the mouse up/down
  const mx = me.x * S, mz = me.y * S
  const cx = mx - Math.cos(yaw) * 3.4, cy = 2.0, cz = mz - Math.sin(yaw) * 3.4
  camera.position.set(cx, cy, cz)
  const cp = Math.cos(pitch)
  camera.lookAt(cx + Math.cos(yaw) * 10 * cp, cy + Math.sin(pitch) * 10, cz + Math.sin(yaw) * 10 * cp)
  renderer.render(scene, camera)
}
