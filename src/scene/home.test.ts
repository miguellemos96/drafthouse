import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { addOpening, newOpening } from '../model/openings.ts'
import { wallsOf, type Plan } from '../model/plan.ts'
import { currentVersion } from '../model/home.ts'
import { newSampleHome, sampleHome } from '../model/sample.ts'
import { buildHome, WALL_THICKNESS } from './home.ts'
import { DEFAULT_FLOOR_COLOUR, DEFAULT_WALL_COLOUR, setFloor, setWallColour } from '../model/finishes.ts'

const box = (object: THREE.Object3D) => new THREE.Box3().setFromObject(object)

describe('buildHome', () => {
  it('draws one floor per room, lying flat at y = 0 over the room', () => {
    const home = buildHome(sampleHome())
    expect(home.floors).toHaveLength(2)
    const living = box(home.floors[0])
    const actual = [living.min.x, living.max.x, living.min.y, living.max.y, living.min.z, living.max.z]
    ;[0, 400, 0, 0, 0, 300].forEach((v, i) => expect(actual[i]).toBeCloseTo(v))
  })

  it('names each floor after its room, so a click on it finds the room', () => {
    expect(buildHome(sampleHome()).floors.map((f) => f.name)).toEqual(['living', 'bedroom'])
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

  describe('doors and windows', () => {
    const withOpenings = (): Plan => {
      let plan = sampleHome()
      const shared = wallsOf(plan).find((w) => w.rooms.length === 2)!
      plan = addOpening(plan, newOpening(plan, 'door', shared, 150, 'door')!)!
      const front = wallsOf(plan).find((w) => w.a.y === 0 && w.b.y === 0 && w.rooms.includes('living'))!
      return addOpening(plan, newOpening(plan, 'window', front, 200, 'window')!)!
    }
    const hits = (home: ReturnType<typeof buildHome>, from: THREE.Vector3, direction: THREE.Vector3) => {
      home.group.updateMatrixWorld(true)
      const ray = new THREE.Raycaster(from, direction.normalize())
      return ray.intersectObjects(home.walls.map((w) => w.mesh))
    }

    it('makes one hole for a door on a wall shared by two rooms, seen from both rooms', () => {
      const home = buildHome(withOpenings())
      const shared = home.walls.filter((w) => w.wall.rooms.length === 2)
      expect(shared).toHaveLength(3) // beside, above, beside
      expect(shared.filter((w) => w.opening === 'door')).toHaveLength(1)
      // Through the middle of the door, 100 cm up: nothing in the way, from either room.
      expect(hits(home, new THREE.Vector3(200, 100, 150), new THREE.Vector3(1, 0, 0)).filter((h) => h.point.x < 410)).toHaveLength(0)
      expect(hits(home, new THREE.Vector3(600, 100, 150), new THREE.Vector3(-1, 0, 0)).filter((h) => h.point.x > 390)).toHaveLength(0)
      // Above the door, at 230 cm, the lintel is there.
      expect(hits(home, new THREE.Vector3(200, 230, 150), new THREE.Vector3(1, 0, 0))[0].point.x).toBeCloseTo(400 - WALL_THICKNESS / 2)
    })

    it('gives a window a hole with a thin pane, and walls under and over it', () => {
      const home = buildHome(withOpenings())
      expect(home.panes).toHaveLength(1)
      home.group.updateMatrixWorld(true)
      const pane = box(home.panes[0].mesh)
      expect([pane.min.x, pane.max.x, pane.min.y, pane.max.y].map(Math.round)).toEqual([140, 260, 90, 210])
      expect(pane.max.z - pane.min.z).toBeLessThan(WALL_THICKNESS)
      expect(home.walls.filter((w) => w.opening === 'window')).toHaveLength(2)
      expect(hits(home, new THREE.Vector3(200, 150, 100), new THREE.Vector3(0, 0, -1))).toHaveLength(0)
      expect(hits(home, new THREE.Vector3(200, 50, 100), new THREE.Vector3(0, 0, -1))).toHaveLength(1)
    })

    it('draws a door swing arc on the floor, shown only when asked (the top view)', () => {
      const home = buildHome(withOpenings())
      expect(home.arcs).toHaveLength(1)
      const arc = home.arcs[0].object
      expect(arc.visible).toBe(false)
      home.showArcs(true)
      expect(arc.visible).toBe(true)
      const b = box(arc)
      expect(b.max.y - b.min.y).toBeLessThan(2) // flat
      expect(b.max.x - b.min.x).toBeCloseTo(80) // a quarter circle as wide as the door
      expect(b.max.z - b.min.z).toBeCloseTo(80)
    })
  })
})

describe('hiding rooms', () => {
  // Room 1 ("living") holds the sofa and the table; the bed is in Room 2. A window on Room 1's front
  // wall and a door on the shared wall.
  const withOpenings = (): Plan => {
    let plan = sampleHome()
    const walls = wallsOf(plan)
    const shared = walls.find((w) => w.rooms.length === 2)!
    const front = walls.find((w) => w.rooms[0] === 'living' && w.a.y === 0 && w.b.y === 0)!
    plan = addOpening(plan, newOpening(plan, 'door', shared, 150, 'door')!)!
    return addOpening(plan, newOpening(plan, 'window', front, 200, 'window')!)!
  }

  it('hides the floor, the walls only it borders with their windows, and its items; the shared wall and its door stay', () => {
    const home = buildHome(withOpenings(), currentVersion(newSampleHome()).items)
    home.showArcs(true)
    home.applyHidden(new Set(['living']))
    expect(home.floors.map((f) => f.visible)).toEqual([false, true])
    expect(home.items.filter((g) => g.visible).map((g) => g.name)).toEqual(['sample-bed'])
    for (const { wall, mesh } of home.walls) expect(mesh.visible).toBe(wall.rooms.includes('bedroom'))
    expect(home.panes.find((p) => p.opening === 'window')!.mesh.visible).toBe(false)
    expect(home.arcs.find((a) => a.opening === 'door')!.object.visible).toBe(true)
  })

  it('hides the shared wall and its door when both rooms are hidden, and shows everything again', () => {
    const home = buildHome(withOpenings(), currentVersion(newSampleHome()).items)
    home.showArcs(true)
    home.applyHidden(new Set(['living', 'bedroom']))
    expect(home.walls.some(({ mesh }) => mesh.visible)).toBe(false)
    expect(home.arcs.find((a) => a.opening === 'door')!.object.visible).toBe(false)
    home.applyHidden(new Set())
    expect(home.walls.every(({ mesh }) => mesh.visible)).toBe(true)
    expect(home.items.every((g) => g.visible)).toBe(true)
    expect(home.arcs.find((a) => a.opening === 'door')!.object.visible).toBe(true)
  })
})

describe('clash warnings', () => {
  const withDoor = (): Plan => {
    const plan = sampleHome()
    const shared = wallsOf(plan).find((w) => w.rooms.length === 2)!
    return addOpening(plan, newOpening(plan, 'door', shared, 150, 'door')!)!
  }
  const colours = (group: THREE.Object3D) => {
    const found: number[] = []
    group.traverse((o) => {
      if (o instanceof THREE.Mesh) found.push((o.material as THREE.MeshStandardMaterial).color.getHex())
    })
    return found
  }
  const arcColour = (home: ReturnType<typeof buildHome>) => {
    let colour = 0
    home.arcs[0].object.traverse((o) => {
      if (o instanceof THREE.Mesh) colour = (o.material as THREE.MeshBasicMaterial).color.getHex()
    })
    return colour
  }

  it('tints clashing items red, keeping some of their own colour, and clears the tint again', () => {
    const items = currentVersion(newSampleHome()).items
    const home = buildHome(withDoor(), items)
    const sofa = home.items.find((g) => g.name === 'sample-sofa')!
    const before = colours(sofa)
    home.showClashes(new Set(['sample-sofa']), new Set())
    const tinted = colours(sofa)
    tinted.forEach((hex, i) => {
      expect(hex).not.toBe(before[i])
      expect(hex).not.toBe(0xe0242a) // mixed, not plain red
      expect(new THREE.Color(hex).r).toBeGreaterThan(new THREE.Color(before[i]).r)
    })
    expect(colours(home.items.find((g) => g.name === 'sample-table')!)).toEqual(colours(buildHome(withDoor(), items).items[1]))
    home.showClashes(new Set(), new Set())
    expect(colours(sofa)).toEqual(before)
  })

  it("draws a blocked door's arc red and shows it outside the top view too", () => {
    const home = buildHome(withDoor())
    const normal = arcColour(home)
    home.showClashes(new Set(), new Set(['door']))
    expect(arcColour(home)).toBe(0xe0242a)
    expect(home.arcs[0].object.visible).toBe(true)
    home.showArcs(false)
    expect(home.arcs[0].object.visible).toBe(true)
    home.showClashes(new Set(), new Set())
    expect(arcColour(home)).toBe(normal)
    expect(home.arcs[0].object.visible).toBe(false)
  })
})

describe('buildHome finishes', () => {
  const faceColour = (mesh: THREE.Mesh, face: number) => {
    const colours = mesh.geometry.attributes.color
    return new THREE.Color(colours.getX(face * 4), colours.getY(face * 4), colours.getZ(face * 4)).getHexString()
  }
  /** The colour of the face of `mesh` that looks towards the plan point (x, y). */
  const colourFacing = (mesh: THREE.Mesh, x: number, y: number) => {
    const plusZ = new THREE.Vector3(0, 0, 1).applyQuaternion(mesh.quaternion)
    const towards = new THREE.Vector3(x - mesh.position.x, 0, y - mesh.position.z)
    return faceColour(mesh, plusZ.dot(towards) > 0 ? 4 : 5)
  }

  it('draws a new room with a wood floor in light oak and off-white walls', () => {
    const home = buildHome(sampleHome(), [], undefined)
    expect((home.floors[0].material as THREE.MeshStandardMaterial).color.getHexString()).toBe(new THREE.Color(DEFAULT_FLOOR_COLOUR).getHexString())
    expect(home.walls.every(({ mesh }) => colourFacing(mesh, 200, 150) === new THREE.Color(DEFAULT_WALL_COLOUR).getHexString())).toBe(true)
  })

  it('paints each face of a shared wall in its own room’s colour, and colours the floor', () => {
    let h = setWallColour(newSampleHome(), 'living', { x: 400, y: 0 }, { x: 400, y: 300 }, '#3366cc')
    h = setFloor(h, 'bedroom', { material: 'tile', colour: '#888888' })
    const home = buildHome(h.plan, [], currentVersion(h).finishes)
    const shared = home.walls.find((w) => w.wall.rooms.length === 2)!.mesh
    expect(colourFacing(shared, 200, 150)).toBe(new THREE.Color('#3366cc').getHexString())
    expect(colourFacing(shared, 550, 150)).toBe(new THREE.Color(DEFAULT_WALL_COLOUR).getHexString())
    expect((home.floors[1].material as THREE.MeshStandardMaterial).color.getHexString()).toBe(new THREE.Color('#888888').getHexString())
  })

  it('highlights every piece of one wall, and clears it', () => {
    const home = buildHome(sampleHome())
    home.highlightWall({ a: { x: 400, y: 300 }, b: { x: 400, y: 0 } })
    const lit = home.walls.filter(({ mesh }) => mesh.material.emissive.getHex() !== 0)
    expect(lit.map((w) => w.wall.rooms.length)).toEqual([2])
    home.highlightWall(null)
    expect(home.walls.every(({ mesh }) => mesh.material.emissive.getHex() === 0)).toBe(true)
  })
})
