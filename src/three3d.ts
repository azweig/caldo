// three3d.ts — a real 3D engine used ONLY while you possess a creature. It mirrors the active 2D
// world (houses, gardens, streets, the people near you) into a Three.js scene and follows the
// possessed character in third person. The simulation itself stays in the 2D engine; this only renders.

import * as THREE from "three"
import { World, Creature, WORLD_W, WORLD_H, BLOCK } from "./world"

const S = 0.045 // world px → 3D units

let renderer: THREE.WebGLRenderer
let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
let sprites: THREE.Texture[] = []
let pool: THREE.Sprite[] = []
let marker: THREE.Mesh
let town: THREE.Group | null = null
let builtFor: World | null = null
let camYaw = Math.PI / 2
let ready = false

export function init3D(canvas: HTMLCanvasElement, creatureImgs: HTMLImageElement[]) {
  if (ready) return
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false })
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x0a0e16)
  scene.fog = new THREE.Fog(0x0a0e16, 28, 150)
  camera = new THREE.PerspectiveCamera(62, 1, 0.1, 600)
  scene.add(new THREE.AmbientLight(0x8a9ec0, 0.85))
  const sun = new THREE.DirectionalLight(0xfff0d8, 0.7); sun.position.set(30, 60, 20); scene.add(sun)
  sprites = creatureImgs.map((img) => {
    const t = new THREE.Texture(img); t.needsUpdate = true; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace
    return t
  })
  for (let i = 0; i < 64; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }))
    sp.visible = false; scene.add(sp); pool.push(sp)
  }
  marker = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.15, 24), new THREE.MeshBasicMaterial({ color: 0x7be88a, transparent: true, opacity: 0.7, side: THREE.DoubleSide }))
  marker.rotation.x = -Math.PI / 2; scene.add(marker)
  ready = true
}

export function resize3D(w: number, h: number) {
  if (!ready) return
  renderer.setSize(w, h, false)
  camera.aspect = w / h; camera.updateProjectionMatrix()
}

function buildTown(world: World) {
  if (town) { scene.remove(town); town.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose() }) }
  town = new THREE.Group()
  // ground
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_W * S, WORLD_H * S), new THREE.MeshLambertMaterial({ color: 0x0e1822 }))
  ground.rotation.x = -Math.PI / 2; ground.position.set(WORLD_W * S / 2, 0, WORLD_H * S / 2); town.add(ground)
  // neon street grid
  const pts: number[] = []
  for (let x = BLOCK; x < WORLD_W; x += BLOCK) pts.push(x * S, 0.04, 0, x * S, 0.04, WORLD_H * S)
  for (let y = BLOCK; y < WORLD_H; y += BLOCK) pts.push(0, 0.04, y * S, WORLD_W * S, 0.04, y * S)
  const gg = new THREE.BufferGeometry(); gg.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3))
  town.add(new THREE.LineSegments(gg, new THREE.LineBasicMaterial({ color: 0x3a78ff, transparent: true, opacity: 0.45 })))
  // gardens (flat green discs)
  for (const gd of world.gardens) {
    const disc = new THREE.Mesh(new THREE.CircleGeometry(95 * S, 18), new THREE.MeshBasicMaterial({ color: 0x2c5a38, transparent: true, opacity: 0.5 }))
    disc.rotation.x = -Math.PI / 2; disc.position.set(gd.x * S, 0.05, gd.y * S); town.add(disc)
  }
  // houses (voxel box + pyramid roof, tinted by lineage hue)
  for (const h of world.houses) {
    const col = new THREE.Color().setHSL((h.hue % 360) / 360, 0.42, 0.5)
    const body = new THREE.Mesh(new THREE.BoxGeometry(h.w * S, 2.4, h.h * S), new THREE.MeshLambertMaterial({ color: col }))
    body.position.set((h.x + h.w / 2) * S, 1.2, (h.y + h.h / 2) * S); town.add(body)
    const roof = new THREE.Mesh(new THREE.ConeGeometry(h.w * S * 0.82, 1.7, 4), new THREE.MeshLambertMaterial({ color: col.clone().multiplyScalar(0.6) }))
    roof.position.set((h.x + h.w / 2) * S, 2.4 + 0.85, (h.y + h.h / 2) * S); roof.rotation.y = Math.PI / 4; town.add(roof)
  }
  // schools + universities (taller, distinct)
  for (const s of world.schools) town.add(boxBuilding(s.x, s.y, s.w, s.h, 3.0, 0x3a5a78))
  for (const u of world.universities) town.add(boxBuilding(u.x, u.y, u.w, u.h, 4.0, 0xb8a060))
  scene.add(town); builtFor = world
}
function boxBuilding(x: number, y: number, w: number, h: number, height: number, color: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w * S, height, h * S), new THREE.MeshLambertMaterial({ color }))
  m.position.set((x + w / 2) * S, height / 2, (y + h / 2) * S); return m
}

export function render3D(world: World, me: Creature) {
  if (!ready) return
  if (builtFor !== world) buildTown(world)

  // show the nearest people as billboards
  const near = world.creatures
    .filter((c) => c !== me && !c.isAvatar)
    .map((c) => ({ c, d: (c.x - me.x) ** 2 + (c.y - me.y) ** 2 }))
    .sort((a, b) => a.d - b.d)
    .slice(0, pool.length - 1)
  let i = 0
  const place = (c: Creature, scale: number) => {
    const sp = pool[i++]; sp.visible = true
    sp.material.map = sprites[c.genome.sprite % sprites.length]; sp.material.needsUpdate = true
    sp.position.set(c.x * S, scale / 2 + 0.15, c.y * S); sp.scale.set(scale, scale, 1)
  }
  place(me, 2.4)
  for (const { c } of near) { if (i >= pool.length) break; place(c, 1.7 + c.genome.size * 0.6) }
  for (; i < pool.length; i++) pool[i].visible = false
  marker.position.set(me.x * S, 0.07, me.y * S)

  // third-person camera trailing the heading
  const mx = me.x * S, mz = me.y * S
  if (Math.hypot(me.vx, me.vy) > 0.3) {
    let d = Math.atan2(me.vy, me.vx) - camYaw
    while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI
    camYaw += d * 0.08
  }
  camera.position.set(mx - Math.cos(camYaw) * 13, 8, mz - Math.sin(camYaw) * 13)
  camera.lookAt(mx + Math.cos(camYaw) * 5, 1.8, mz + Math.sin(camYaw) * 5)
  renderer.render(scene, camera)
}
