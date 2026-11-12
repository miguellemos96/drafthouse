// Draws items: one group per item, one mesh per template part (see src/model/placement.ts).
import * as THREE from 'three'
import type { Item } from '../model/item.ts'
import { itemPlacement, partsOf, shadeColour } from '../model/placement.ts'
import type { Part } from '../model/templates.ts'

const CYLINDER_SEGMENTS = 24

export type ItemMesh = THREE.Mesh<THREE.BoxGeometry | THREE.CylinderGeometry, THREE.MeshStandardMaterial>

const partGeometry = ({ shape, size }: Part) => {
  if (shape === 'box') return new THREE.BoxGeometry(size.width, size.height, size.depth)
  // A unit-radius cylinder scaled to the part's diameters, so an oval leg keeps its width and depth.
  const geometry = new THREE.CylinderGeometry(0.5, 0.5, size.height, CYLINDER_SEGMENTS)
  geometry.scale(size.width, 1, size.depth)
  return geometry
}

const partMesh = (item: Item, part: Part): ItemMesh => {
  const material = new THREE.MeshStandardMaterial({ color: shadeColour(item.colour, part.shade) })
  const mesh = new THREE.Mesh(partGeometry(part), material)
  mesh.position.set(part.center.x, part.center.y, part.center.z)
  return mesh
}

/** One item as a group placed at its position and elevation, turned by its rotation. */
export const buildItem = (item: Item): THREE.Group => {
  const group = new THREE.Group()
  group.name = item.id
  const { origin, angle } = itemPlacement(item)
  group.position.set(origin.x, origin.y, origin.z)
  group.rotation.y = angle
  group.add(...partsOf(item).map((part) => partMesh(item, part)))
  return group
}
