import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import type { Item } from '../model/item.ts'
import { partCentre, partsOf, shadeColour } from '../model/placement.ts'
import { sampleHome, sampleItems } from '../model/sample.ts'
import { buildHome } from './home.ts'
import { buildItem, type ItemMesh } from './items.ts'

const sofa = (changes: Partial<Item> = {}): Item => ({
  id: 'sofa',
  name: 'Sofa',
  templateId: 'sofa',
  size: { width: 200, depth: 90, height: 80 },
  colour: '#5b7083',
  position: { x: 100, z: 50 },
  elevation: 0,
  rotation: 90,
  mount: 'floor',
  ...changes,
})

const meshes = (group: THREE.Group) => group.children as ItemMesh[]
const hex = (mesh: ItemMesh) => `#${mesh.material.color.getHexString()}`

describe('buildItem', () => {
  it('a 200 × 90 × 80 sofa at (100, 50) rotated 90° covers 90 cm along x and 200 cm along z, centred there', () => {
    const group = buildItem(sofa())
    group.updateMatrixWorld()
    const bounds = new THREE.Box3().setFromObject(group)
    const centre = bounds.getCenter(new THREE.Vector3())
    const size = bounds.getSize(new THREE.Vector3())
    expect(centre.x).toBeCloseTo(100)
    expect(centre.z).toBeCloseTo(50)
    expect(size.x).toBeCloseTo(90)
    expect(size.z).toBeCloseTo(200)
    expect(bounds.min.y).toBeCloseTo(0)
    expect(bounds.max.y).toBeCloseTo(80)
  })

  it('places the group at the position and elevation, turned by the rotation', () => {
    const group = buildItem(sofa({ elevation: 20 }))
    expect(group.position.toArray()).toEqual([100, 20, 50])
    expect(group.rotation.y).toBeCloseTo(Math.PI / 2)
  })

  it('puts each part mesh at the world centre the model gives', () => {
    for (const item of [sofa({ rotation: 33, elevation: 12 }), ...sampleItems()]) {
      const group = buildItem(item)
      group.updateMatrixWorld()
      const parts = partsOf(item)
      expect(meshes(group)).toHaveLength(parts.length)
      meshes(group).forEach((mesh, i) => {
        const world = mesh.getWorldPosition(new THREE.Vector3())
        const expected = partCentre(item, parts[i])
        expect(world.x).toBeCloseTo(expected.x)
        expect(world.y).toBeCloseTo(expected.y)
        expect(world.z).toBeCloseTo(expected.z)
      })
    }
  })

  it('draws cylinders as cylinders, sized to their part', () => {
    const chair = { ...sofa({ templateId: 'chair', size: { width: 45, depth: 50, height: 85 } }) }
    const legs = meshes(buildItem(chair)).filter((m) => m.geometry instanceof THREE.CylinderGeometry)
    expect(legs).toHaveLength(4)
    const leg = partsOf(chair).find((p) => p.shape === 'cylinder')!
    legs[0].geometry.computeBoundingBox()
    const size = legs[0].geometry.boundingBox!.getSize(new THREE.Vector3())
    expect(size.x).toBeCloseTo(leg.size.width)
    expect(size.y).toBeCloseTo(leg.size.height)
    expect(size.z).toBeCloseTo(leg.size.depth)
  })

  it('lays a cylinder with axis z along Z, sized to its part', () => {
    const washer = sofa({ templateId: 'washer', size: { width: 60, depth: 60, height: 85 }, rotation: 0 })
    const parts = partsOf(washer)
    const index = parts.findIndex((p) => p.axis === 'z')
    expect(index).toBeGreaterThanOrEqual(0)
    const door = parts[index]
    const mesh = meshes(buildItem(washer))[index]
    expect(mesh.geometry).toBeInstanceOf(THREE.CylinderGeometry)
    mesh.geometry.computeBoundingBox()
    const size = mesh.geometry.boundingBox!.getSize(new THREE.Vector3())
    expect(size.x).toBeCloseTo(door.size.width)
    expect(size.y).toBeCloseTo(door.size.height)
    expect(size.z).toBeCloseTo(door.size.depth)
  })

  it('draws an unknown template as a box of the item size', () => {
    const group = buildItem(sofa({ templateId: 'unknown', rotation: 0 }))
    expect(meshes(group)).toHaveLength(1)
    const [mesh] = meshes(group)
    expect(mesh.geometry).toBeInstanceOf(THREE.BoxGeometry)
    const { width, height, depth } = (mesh.geometry as THREE.BoxGeometry).parameters
    expect([width, depth, height]).toEqual([200, 90, 80])
  })

  it('colours parts with the item colour and each part shade', () => {
    const item = sofa({ templateId: 'table', colour: '#a0522d' })
    const parts = partsOf(item)
    meshes(buildItem(item)).forEach((mesh, i) => expect(hex(mesh)).toBe(shadeColour('#a0522d', parts[i].shade)))
    expect(hex(meshes(buildItem(item))[0])).toBe('#a0522d') // the top has no shade
  })

  it('changing the colour and rebuilding changes the mesh colours', () => {
    const before = meshes(buildItem(sofa({ colour: '#5b7083' }))).map(hex)
    const after = meshes(buildItem(sofa({ colour: '#ff0000' }))).map(hex)
    expect(after).not.toEqual(before)
    expect(after[0]).toBe('#ff0000')
  })
})

describe('buildHome with items', () => {
  it('adds one group per item to the home', () => {
    const home = buildHome(sampleHome(), sampleItems())
    expect(home.items).toHaveLength(3)
    for (const group of home.items) expect(home.group.children).toContain(group)
  })

  it('still fades the walls facing the camera with items present, and leaves items solid', () => {
    const home = buildHome(sampleHome(), sampleItems())
    home.applyFade(new THREE.Vector3(350, 500, -1000))
    const opacityAt = (z: number) => home.walls.filter((w) => w.wall.a.y === z && w.wall.b.y === z).map((w) => w.mesh.material.opacity)
    expect(opacityAt(0)).toEqual([0.15, 0.15])
    expect(opacityAt(300)).toEqual([1, 1])
    for (const group of home.items) for (const mesh of meshes(group)) expect(mesh.material.opacity).toBe(1)
  })

  it('places the sample items inside their rooms', () => {
    const rooms = { 'sample-sofa': [0, 400], 'sample-table': [0, 400], 'sample-bed': [400, 700] } as Record<string, number[]>
    const home = buildHome(sampleHome(), sampleItems())
    home.group.updateMatrixWorld()
    for (const group of home.items) {
      const b = new THREE.Box3().setFromObject(group)
      const [x0, x1] = rooms[group.name]
      expect(b.min.x).toBeGreaterThanOrEqual(x0 + 5) // clear of the 10 cm walls
      expect(b.max.x).toBeLessThanOrEqual(x1 - 5)
      expect(b.min.z).toBeGreaterThanOrEqual(5)
      expect(b.max.z).toBeLessThanOrEqual(295)
    }
  })
})
