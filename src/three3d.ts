// three3d.ts — a real 3D engine used ONLY while you possess a creature. It mirrors the active 2D
// world (houses, gardens, streets, the people near you) into a Three.js scene and follows the
// possessed character in third person. The simulation stays in the 2D engine; this only renders.

import * as THREE from "three"
import { World, Creature, WORLD_W, WORLD_H, BLOCK } from "./world"

const S = 0.045 // world px → 3D units

let renderer: THREE.WebGLRenderer
let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
let sprites: THREE.Texture[] = []
let pool: THREE.Sprite[] = []
let rings: THREE.Mesh[] = []
let town: THREE.Group | null = null
let builtFor: World | null = null
let ready = false

export function init3D(canvas: HTMLCanvasElement, creatureImgs: HTMLImageElement[]) {
  if (ready) return
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false })
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x0a0e16)
  scene.fog = new THREE.Fog(0x0a0e16, 30, 165)
  camera = new THREE.PerspectiveCamera(60, 1, 0.1, 600)
  scene.add(new THREE.AmbientLight(0x8a9ec0, 0.9))
  const sun = new THREE.DirectionalLight(0xfff0d8, 0.6); sun.position.set(30, 60, 20); scene.add(sun)
  sprites = creatureImgs.map((img) => {
    const t = new THREE.Texture(img); t.needsUpdate = true; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace
    return t
  })
  const ringGeo = new THREE.RingGeometry(0.5, 0.74, 22)
  for (let i = 0; i < 64; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false })); sp.visible = false; scene.add(sp); pool.push(sp)
    const r = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.85, side: THREE.DoubleSide }))
    r.rotation.x = -Math.PI / 2; r.visible = false; scene.add(r); rings.push(r)
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

function boxBuilding(x: number, y: number, w: number, h: number, height: number, color: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w * S, height, h * S), new THREE.MeshLambertMaterial({ color }))
  m.position.set((x + w / 2) * S, height / 2, (y + h / 2) * S); return m
}

function buildTown(world: World) {
  if (town) { scene.remove(town); town.traverse((o) => { (o as THREE.Mesh).geometry?.dispose() }) }
  town = new THREE.Group()
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_W * S, WORLD_H * S), new THREE.MeshLambertMaterial({ color: 0x0e1822 }))
  ground.rotation.x = -Math.PI / 2; ground.position.set(WORLD_W * S / 2, 0, WORLD_H * S / 2); town.add(ground)
  // neon street grid
  const pts: number[] = []
  for (let x = BLOCK; x < WORLD_W; x += BLOCK) pts.push(x * S, 0.03, 0, x * S, 0.03, WORLD_H * S)
  for (let y = BLOCK; y < WORLD_H; y += BLOCK) pts.push(0, 0.03, y * S, WORLD_W * S, 0.03, y * S)
  const gg = new THREE.BufferGeometry(); gg.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3))
  town.add(new THREE.LineSegments(gg, new THREE.LineBasicMaterial({ color: 0x3a78ff, transparent: true, opacity: 0.4 })))
  for (const gd of world.gardens) {
    const disc = new THREE.Mesh(new THREE.CircleGeometry(95 * S, 18), new THREE.MeshBasicMaterial({ color: 0x2c5a38, transparent: true, opacity: 0.5 }))
    disc.rotation.x = -Math.PI / 2; disc.position.set(gd.x * S, 0.04, gd.y * S); town.add(disc)
  }
  // houses — BIG voxel buildings (a person is ~⅓ their height) with a pyramid roof, tinted by lineage
  for (const h of world.houses) {
    const col = new THREE.Color().setHSL((h.hue % 360) / 360, 0.42, 0.5)
    const bh = 3.6
    const body = new THREE.Mesh(new THREE.BoxGeometry(h.w * S * 1.15, bh, h.h * S * 1.15), new THREE.MeshLambertMaterial({ color: col }))
    body.position.set((h.x + h.w / 2) * S, bh / 2, (h.y + h.h / 2) * S); town.add(body)
    const roof = new THREE.Mesh(new THREE.ConeGeometry(h.w * S * 0.98, 2.2, 4), new THREE.MeshLambertMaterial({ color: col.clone().multiplyScalar(0.6) }))
    roof.position.set((h.x + h.w / 2) * S, bh + 1.1, (h.y + h.h / 2) * S); roof.rotation.y = Math.PI / 4; town.add(roof)
  }
  for (const s of world.schools) town.add(boxBuilding(s.x, s.y, s.w, s.h, 5.0, 0x3a5a78))
  for (const u of world.universities) town.add(boxBuilding(u.x, u.y, u.w, u.h, 6.2, 0xb8a060))
  scene.add(town); builtFor = world
}

export function render3D(world: World, me: Creature, yaw: number) {
  if (!ready) return
  if (builtFor !== world) buildTown(world)

  const near = world.creatures
    .filter((c) => c !== me && !c.isAvatar)
    .map((c) => ({ c, d: (c.x - me.x) ** 2 + (c.y - me.y) ** 2 }))
    .sort((a, b) => a.d - b.d)
    .slice(0, pool.length - 1)
  let i = 0
  const place = (c: Creature, scale: number, ringCol: number) => {
    const sp = pool[i]; sp.visible = true
    sp.material.map = sprites[c.genome.sprite % sprites.length]; sp.material.needsUpdate = true
    sp.position.set(c.x * S, scale / 2 + 0.1, c.y * S); sp.scale.set(scale, scale, 1)
    const r = rings[i]; r.visible = true; (r.material as THREE.MeshBasicMaterial).color.setHex(ringCol)
    r.position.set(c.x * S, 0.06, c.y * S); r.scale.setScalar(scale * 0.62)
    i++
  }
  place(me, 1.7, 0x46c8ff) // you — cyan ring
  for (const { c } of near) { if (i >= pool.length) break; place(c, 1.3 + c.genome.size * 0.45, relColor(me, c)) }
  for (; i < pool.length; i++) { pool[i].visible = false; rings[i].visible = false }

  // third-person camera sitting behind your facing (main owns the yaw, driven by A/D)
  const mx = me.x * S, mz = me.y * S
  camera.position.set(mx - Math.cos(yaw) * 11, 7, mz - Math.sin(yaw) * 11)
  camera.lookAt(mx + Math.cos(yaw) * 6, 1.4, mz + Math.sin(yaw) * 6)
  renderer.render(scene, camera)
}
