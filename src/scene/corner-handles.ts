// Round markers on room corners: the handles of the selected room's corners, and the corners of a
// room being drawn. Always drawn on top, so walls never hide them. Plan (x, y) is floor (x, z).
import * as THREE from 'three'
import type { Point } from '../model/plan.ts'

const RADIUS = 10 // cm
const LIFT = 3 // cm above the floor

export type CornerHandlesView = {
  /** One mesh per shown corner; pointer input tests hits against them. */
  meshes: () => THREE.Mesh[]
  /** The corner a mesh stands on. */
  pointOf: (mesh: THREE.Object3D) => Point | null
  /** Shows a marker on each point; an empty list hides them all. */
  show: (points: Point[]) => void
}

export const createCornerHandles = (scene: THREE.Scene, colour: number): CornerHandlesView => {
  const group = new THREE.Group()
  scene.add(group)
  const geometry = new THREE.SphereGeometry(RADIUS, 16, 12)
  const material = new THREE.MeshBasicMaterial({ color: colour, depthTest: false })
  let shown: { mesh: THREE.Mesh; point: Point }[] = []

  const show = (points: Point[]) => {
    for (const { mesh } of shown) group.remove(mesh)
    shown = points.map((point) => {
      const mesh = new THREE.Mesh(geometry, material)
      mesh.renderOrder = 12
      mesh.position.set(point.x, LIFT, point.y)
      group.add(mesh)
      mesh.updateMatrixWorld() // hit-testable before the next frame
      return { mesh, point: { ...point } }
    })
  }

  return {
    meshes: () => shown.map(({ mesh }) => mesh),
    pointOf: (mesh) => shown.find((s) => s.mesh === mesh)?.point ?? null,
    show,
  }
}
