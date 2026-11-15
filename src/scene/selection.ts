// Draws the selected item's highlight: an outline of its footprint, a rotate handle in front of it,
// and a tint on its parts. Always drawn on top, so walls and the item itself never hide it.
import * as THREE from 'three'
import type { Item } from '../model/item.ts'
import { itemPlacement } from '../model/placement.ts'

const COLOUR = 0x2f80ed
const TINT = 0x1d3f66
const HANDLE_RADIUS = 9 // cm
const HANDLE_GAP = 35 // cm from the item's front edge to the handle
const LIFT = 1 // cm above the item's base, so the outline doesn't flicker against the floor

export type SelectionView = {
  /** The rotate handle; pointer input tests hits against it. */
  handle: THREE.Mesh
  /** Shows the highlight around `item`, or hides it for `null`. */
  show: (item: Item | null) => void
}

const onTop = (object: THREE.Object3D) => {
  object.renderOrder = 10
  return object
}

export const createSelectionView = (scene: THREE.Scene): SelectionView => {
  const group = new THREE.Group()
  group.visible = false
  scene.add(group)

  const lineMaterial = new THREE.LineBasicMaterial({ color: COLOUR, depthTest: false })
  const outline = onTop(new THREE.LineLoop(new THREE.BufferGeometry(), lineMaterial)) as THREE.LineLoop
  const stem = onTop(new THREE.Line(new THREE.BufferGeometry(), lineMaterial)) as THREE.Line
  const handle = onTop(
    new THREE.Mesh(new THREE.SphereGeometry(HANDLE_RADIUS, 16, 12), new THREE.MeshBasicMaterial({ color: COLOUR, depthTest: false })),
  ) as THREE.Mesh
  // Only the handle takes pointer hits.
  outline.raycast = () => {}
  stem.raycast = () => {}
  group.add(outline, stem, handle)

  let shownSize = ''
  const show = (item: Item | null) => {
    group.visible = item !== null
    if (!item) return
    const { origin, angle } = itemPlacement(item)
    group.position.set(origin.x, origin.y, origin.z)
    group.rotation.y = angle
    group.updateMatrixWorld()
    const size = `${item.size.width}x${item.size.depth}`
    if (size === shownSize) return
    shownSize = size
    const hw = item.size.width / 2
    const hd = item.size.depth / 2
    outline.geometry.setFromPoints([
      new THREE.Vector3(-hw, LIFT, -hd),
      new THREE.Vector3(hw, LIFT, -hd),
      new THREE.Vector3(hw, LIFT, hd),
      new THREE.Vector3(-hw, LIFT, hd),
    ])
    const front = hd + HANDLE_GAP
    stem.geometry.setFromPoints([new THREE.Vector3(0, LIFT, hd), new THREE.Vector3(0, LIFT, front - HANDLE_RADIUS)])
    handle.position.set(0, LIFT, front)
  }
  return { handle, show }
}

/** Tints an item's parts to mark it selected, or clears the tint. */
export const tintItem = (group: THREE.Object3D, on: boolean) => {
  group.traverse((object) => {
    if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshStandardMaterial) {
      object.material.emissive.setHex(on ? TINT : 0x000000)
    }
  })
}
