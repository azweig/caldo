// three3d.ts — a real 3D engine used ONLY while you possess a creature. It mirrors the active 2D
// world (houses, gardens, streets, the people near you) into a Three.js scene and follows the
// possessed character in third person. The simulation stays in the 2D engine; this only renders.

import * as THREE from "three"
import { World, Creature, House, WORLD_W, WORLD_H, BLOCK } from "./world"

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

// ── real 3D character meshes (TripoSR GLBs) with a billboard fallback while a model loads ──
const modelPool: THREE.Group[] = []

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
  const legGeo = new THREE.BoxGeometry(0.14, 0.34, 0.14)
  const ll = new THREE.Mesh(legGeo, legMat); ll.position.set(-0.1, 0.17, 0)
  const rl = new THREE.Mesh(legGeo, legMat); rl.position.set(0.1, 0.17, 0)
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.26), clothMat); torso.position.set(0, 0.62, 0)
  const armGeo = new THREE.BoxGeometry(0.1, 0.42, 0.12)
  const la = new THREE.Mesh(armGeo, clothMat); la.position.set(-0.28, 0.62, 0)
  const ra = new THREE.Mesh(armGeo, clothMat); ra.position.set(0.28, 0.62, 0)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), skinMat); head.position.set(0, 1.02, 0)
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.235, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), hairMat); hair.position.set(0, 1.05, 0)
  grp.add(ll, rl, torso, la, ra, head, hair)
  grp.userData.rig = { legMat, clothMat, skinMat, hairMat, ll, rl, la, ra }
}

function boxBuilding(x: number, y: number, w: number, h: number, height: number, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w * S, height, h * S), mat)
  m.position.set((x + w / 2) * S, height / 2, (y + h / 2) * S); return m
}

function buildTown(world: World) {
  if (town) { scene.remove(town); town.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose(); disposeMat(m.material) }) } // free geometry AND materials on rebuild (materials leaked before)
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
  const winMat = new THREE.MeshBasicMaterial({ color: 0x9fc0e0 })
  for (const h of world.houses) {
    const r = hashf(h.x + h.y * 0.7), tier = h.tier || 0
    const wallMat = matFor(walls[Math.floor(hashf(h.x * 1.7 + 3) * 997) % walls.length])
    const roofMat = matFor(roofs[Math.floor(hashf(h.y * 2.3 + 7) * 997) % roofs.length])
    // the HOUSE TYPE shows in its scale: choza low, casa/casona/mansión bigger + taller, edificio towers
    const bh = tier === 4 ? 9 + r * 4 : 2.0 + tier * 1.1 + r * 1.2
    const w = h.w * S * (1.0 + hashf(h.x) * 0.3), d = h.h * S * (1.0 + hashf(h.y) * 0.3)
    const cx = (h.x + h.w / 2) * S, cz = (h.y + h.h / 2) * S
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, bh, d), wallMat)
    body.position.set(cx, bh / 2, cz); town.add(body)
    if (tier === 4) { // APARTMENT BUILDING — flat roof + rows of lit windows up the facade
      const slab = new THREE.Mesh(new THREE.BoxGeometry(w * 1.04, 0.3, d * 1.04), roofMat); slab.position.set(cx, bh + 0.15, cz); town.add(slab)
      const floors = Math.floor(bh / 2.3)
      for (let fl = 0; fl < floors; fl++) for (const wx of [-0.3, 0, 0.3]) { const win = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.18, 1.0), winMat); win.position.set(cx + wx * w, 1.6 + fl * 2.3, cz + d / 2 + 0.02); town.add(win) }
    } else if (world.era < 12 || r < 0.5) { // pitched roof (old eras + some moderns)
      const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.78, 1.4 + tier * 0.4 + r, 4), roofMat)
      roof.position.set(cx, bh + (0.7 + r * 0.5), cz); roof.rotation.y = Math.PI / 4; town.add(roof)
    } else { const slab = new THREE.Mesh(new THREE.BoxGeometry(w * 1.02, 0.3, d * 1.02), roofMat); slab.position.set(cx, bh + 0.15, cz); town.add(slab) }
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
  // DAY/NIGHT: light + haze follow the in-world hour so dusk darkens + night cools the whole 3D scene
  const hr = (world.clockMinutes % 1440) / 60
  const bright = hr < 5 || hr >= 21 ? 0.32 : hr < 7 ? 0.6 : hr < 18 ? 1 : hr < 20 ? 0.6 : 0.42
  if (ambient) ambient.intensity = 0.9 + bright * 1.3
  if (sun) sun.intensity = 0.15 + bright * 1.0
  if (scene.fog) (scene.fog as THREE.Fog).color.setHex(hr < 5 || hr >= 21 ? 0x141d3a : hr < 7 ? 0xc99060 : hr < 18 ? 0xaebdd2 : hr < 20 ? 0xb88a5a : 0x5a4d72)
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
