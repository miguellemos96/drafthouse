// Draws what a dragged item snapped to: a line along the wall face or item edge, just above the floor.
// Always drawn on top, like the selection highlight. The model says where the lines go (src/model/snap.ts).
import * as THREE from 'three'
import type { Guide } from '../model/snap.ts'

const COLOUR = 0xe67e22
const LIFT = 1 // cm above the floor

export type SnapGuidesView = {
  group: THREE.Group
  /** Shows these lines, or hides them all for an empty list. */
  show: (guides: Guide[]) => void
}

export const createSnapGuides = (scene: THREE.Scene): SnapGuidesView => {
  const group = new THREE.Group()
  group.name = 'snap-guides'
  scene.add(group)
  const material = new THREE.LineBasicMaterial({ color: COLOUR, depthTest: false })

  const show = (guides: Guide[]) => {
    for (const line of group.children as THREE.Line[]) line.geometry.dispose()
    group.clear()
    for (const { a, b } of guides) {
      const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(a.x, LIFT, a.z), new THREE.Vector3(b.x, LIFT, b.z)])
      const line = new THREE.Line(geometry, material)
      line.renderOrder = 10
      line.raycast = () => {}
      group.add(line)
    }
  }
  return { group, show }
}
