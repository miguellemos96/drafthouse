// Draws a plan: one floor per room and one box per wall. Plan (x, y) maps to scene (x, z); +Y is up.
import * as THREE from 'three'
import { wallFades } from '../model/fade.ts'
import { wallHeight, wallLength, wallsOf, type Plan, type Wall } from '../model/plan.ts'

export const WALL_THICKNESS = 10 // cm
const FADED_OPACITY = 0.15

export type HomeView = {
  group: THREE.Group
  floors: THREE.Mesh[]
  walls: { wall: Wall; mesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial> }[]
  /** Fades the walls the model says stand between this camera and the rooms; `null` fades none. */
  applyFade: (camera: THREE.Vector3 | null) => void
}

const floorMesh = (corners: { x: number; y: number }[]) => {
  const shape = new THREE.Shape(corners.map((p) => new THREE.Vector2(p.x, p.y)))
  const geometry = new THREE.ShapeGeometry(shape)
  geometry.rotateX(Math.PI / 2) // shape (x, y, 0) → scene (x, 0, y)
  const material = new THREE.MeshStandardMaterial({ color: 0xd9c6a5, side: THREE.DoubleSide })
  return new THREE.Mesh(geometry, material)
}

const wallMesh = (wall: Wall, height: number) => {
  const length = wallLength(wall)
  // One thickness longer, so neighbouring walls overlap at the corners instead of leaving a notch.
  const geometry = new THREE.BoxGeometry(length + WALL_THICKNESS, height, WALL_THICKNESS)
  const material = new THREE.MeshStandardMaterial({ color: 0xf2efe9, transparent: true })
  const mesh = new THREE.Mesh(geometry, material)
  const dx = wall.b.x - wall.a.x
  const dz = wall.b.y - wall.a.y
  mesh.position.set((wall.a.x + wall.b.x) / 2, height / 2, (wall.a.y + wall.b.y) / 2)
  mesh.rotation.y = Math.atan2(-dz, dx) // the box's length runs along the wall
  return mesh
}

export const buildHome = (plan: Plan): HomeView => {
  const group = new THREE.Group()
  const floors = plan.rooms.map((room) => floorMesh(room.corners))
  const walls = wallsOf(plan).map((wall) => ({ wall, mesh: wallMesh(wall, wallHeight(plan, wall)) }))
  group.add(...floors, ...walls.map((w) => w.mesh))

  const applyFade = (camera: THREE.Vector3 | null) => {
    for (const { wall, mesh } of walls) {
      const faded = camera !== null && wallFades(plan, wall, { x: camera.x, y: camera.z })
      mesh.material.opacity = faded ? FADED_OPACITY : 1
      mesh.material.depthWrite = !faded
    }
  }
  return { group, floors, walls, applyFade }
}
