import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { sampleHome } from '../model/sample.ts'
import { buildHome, WALL_THICKNESS } from './home.ts'

const box = (object: THREE.Object3D) => new THREE.Box3().setFromObject(object)

describe('buildHome', () => {
  it('draws one floor per room, lying flat at y = 0 over the room', () => {
    const home = buildHome(sampleHome())
    expect(home.floors).toHaveLength(2)
    const living = box(home.floors[0])
    const actual = [living.min.x, living.max.x, living.min.y, living.max.y, living.min.z, living.max.z]
    ;[0, 400, 0, 0, 0, 300].forEach((v, i) => expect(actual[i]).toBeCloseTo(v))
  })

  it('draws the shared wall once: 7 walls for two rooms side by side', () => {
    const home = buildHome(sampleHome())
    expect(home.walls).toHaveLength(7)
    expect(home.walls.filter((w) => w.wall.rooms.length === 2)).toHaveLength(1)
  })

  it('makes each wall 10 cm thick and as high as its room, standing on its edge', () => {
    const home = buildHome(sampleHome())
    for (const { mesh } of home.walls) expect(mesh.geometry.parameters.depth).toBe(WALL_THICKNESS)

    const shared = home.walls.find((w) => w.wall.rooms.length === 2)!
    shared.mesh.updateMatrixWorld()
    const b = box(shared.mesh)
    expect(b.min.y).toBeCloseTo(0)
    expect(b.max.y).toBeCloseTo(250)
    expect(b.min.x).toBeCloseTo(400 - WALL_THICKNESS / 2) // the x = 400 edge, 10 cm thick
    expect(b.max.x).toBeCloseTo(400 + WALL_THICKNESS / 2)
    expect(b.min.z).toBeCloseTo(-WALL_THICKNESS / 2) // spans the 300 cm edge, plus the corner overlap
    expect(b.max.z).toBeCloseTo(300 + WALL_THICKNESS / 2)
  })

  it('fades the walls facing the camera to about 15% and keeps the others solid', () => {
    const home = buildHome(sampleHome())
    home.applyFade(new THREE.Vector3(350, 500, -1000)) // in front of the z = 0 side
    const opacityAt = (z: number) => home.walls.filter((w) => w.wall.a.y === z && w.wall.b.y === z).map((w) => w.mesh.material.opacity)
    expect(opacityAt(0)).toEqual([0.15, 0.15])
    expect(opacityAt(300)).toEqual([1, 1])
  })

  it('fades nothing without a camera (the top view)', () => {
    const home = buildHome(sampleHome())
    home.applyFade(new THREE.Vector3(350, 500, -1000))
    home.applyFade(null)
    expect(home.walls.every((w) => w.mesh.material.opacity === 1)).toBe(true)
  })
})
