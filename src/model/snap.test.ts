import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Item } from './item.ts'
import { createRoom, wallsOf, WALL_THICKNESS, type Plan } from './plan.ts'
import { loadSnap, saveSnap, SNAP_KEY, snapPosition, snapRotation, snapStepRotation } from './snap.ts'

const box = (over: Partial<Item> = {}): Item => ({
  id: 'box',
  name: 'Box',
  templateId: 'box',
  size: { width: 100, depth: 50, height: 40 },
  colour: '#888888',
  position: { x: 0, z: 0 },
  elevation: 0,
  rotation: 0,
  mount: 'floor',
  ...over,
})

// A 400 × 300 room whose inner wall faces are at x = 0, x = 400, z = 0 and z = 300:
// the plan edges run along the middle of the walls, half a thickness further out.
const half = WALL_THICKNESS / 2
const room = (): Plan => ({
  rooms: [
    createRoom({
      id: 'r',
      name: 'Room',
      height: 250,
      corners: [
        { x: -half, y: -half },
        { x: 400 + half, y: -half },
        { x: 400 + half, y: 300 + half },
        { x: -half, y: 300 + half },
      ],
    }),
  ],
})
const walls = () => wallsOf(room())

describe('snapPosition', () => {
  it('snaps a box whose left edge is 7 cm from the wall flush against the wall face', () => {
    // A 100 × 50 box whose left edge was dragged to x = 7: its centre is at 57.
    const result = snapPosition(box(), { x: 57, z: 152 }, [], walls())
    expect(result.position.x).toBe(50)
    expect(result.x.kind).toBe('wall')
    expect(result.x.kind === 'wall' && result.x.guide.a.x).toBe(0)
  })

  it('snaps to the 5 cm grid when no wall or item is within 10 cm', () => {
    const result = snapPosition(box(), { x: 123.4, z: 152 }, [], walls())
    expect(result.position).toEqual({ x: 125, z: 150 })
    expect(result.x).toEqual({ kind: 'grid' })
    expect(result.z).toEqual({ kind: 'grid' })
  })

  it('leaves a wall more than 10 cm away alone', () => {
    // Left edge at 11: too far from the wall, so the grid wins.
    expect(snapPosition(box(), { x: 61, z: 152 }, [], walls()).position.x).toBe(60)
  })

  it('snaps an edge that pushes into the wall back out to the face', () => {
    expect(snapPosition(box(), { x: 46, z: 152 }, [], walls()).position.x).toBe(50)
  })

  it('snaps each axis on its own, to the far walls too', () => {
    // Right edge at 395 (5 from x = 400), back edge at 293 (7 from z = 300).
    const result = snapPosition(box(), { x: 345, z: 268 }, [], walls())
    expect(result.position).toEqual({ x: 350, z: 275 })
    expect(result.x.kind).toBe('wall')
    expect(result.z.kind).toBe('wall')
  })

  it("uses the item's rotated footprint", () => {
    // Turned 90°, the 100 × 50 box is 50 wide along x: its left edge is at 30 - 25 = 5.
    const result = snapPosition(box({ rotation: 90 }), { x: 30, z: 152 }, [], walls())
    expect(result.position.x).toBe(25)
  })

  it('ignores a wall whose ends are far from the item', () => {
    // A short wall at x = 0 running from z = 0 to z = 100; the item sits at z = 250.
    const plan: Plan = { rooms: [createRoom({ name: 'Nook', height: 250, corners: [{ x: -5, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: -5, y: 100 }] })] }
    expect(snapPosition(box(), { x: 57, z: 250 }, [], wallsOf(plan)).position.x).toBe(55)
  })

  it("snaps flush to another item's edge within 10 cm", () => {
    // The other box spans x 100..200. Our left edge at 206 snaps to its right edge.
    const other = box({ id: 'other', position: { x: 150, z: 150 } })
    const result = snapPosition(box(), { x: 256, z: 152 }, [other], walls())
    expect(result.position.x).toBe(250)
    expect(result.x).toMatchObject({ kind: 'item', itemId: 'other' })
  })

  it("aligns with another item's edge within 10 cm", () => {
    // Side by side along x, our front edge 4 cm short of theirs: it lines up with it.
    const other = box({ id: 'other', position: { x: 150, z: 150 } })
    const result = snapPosition(box(), { x: 252, z: 146 }, [other], walls())
    expect(result.position.z).toBe(150)
    expect(result.z).toMatchObject({ kind: 'item', itemId: 'other' })
  })

  it('prefers a wall over an item edge', () => {
    // The other box's left edge is at x = 3; the wall face at 0 is also within reach.
    const other = box({ id: 'other', position: { x: 53, z: 100 } })
    expect(snapPosition(box(), { x: 56, z: 152 }, [other], walls()).position.x).toBe(50)
  })

  it('ignores items far away along the other axis, and the moving item itself', () => {
    const far = box({ id: 'far', position: { x: 150, z: 20 } })
    const self = box({ position: { x: 151, z: 150 } })
    expect(snapPosition(self, { x: 256, z: 152 }, [far, self], walls()).position.x).toBe(255)
  })
})

describe('snap rotation', () => {
  it('steps by 15° and lands on multiples of 15°', () => {
    expect(snapStepRotation(0, 1)).toBe(15)
    expect(snapStepRotation(0, -1)).toBe(345)
    expect(snapStepRotation(7, 1)).toBe(15)
    expect(snapStepRotation(7, -1)).toBe(0)
    expect(snapStepRotation(345, 1)).toBe(0)
  })

  it('rounds a handle angle to the nearest 15°', () => {
    expect(snapRotation(37)).toBe(30)
    expect(snapRotation(38)).toBe(45)
    expect(snapRotation(358)).toBe(0)
  })
})

describe('the remembered snap setting', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('is off by default and remembers on and off', () => {
    vi.stubGlobal('localStorage', memoryStorage())
    expect(loadSnap()).toBe(false)
    saveSnap(true)
    expect(localStorage.getItem(SNAP_KEY)).toBe('on')
    expect(loadSnap()).toBe(true)
    saveSnap(false)
    expect(loadSnap()).toBe(false)
  })

  it('never throws when storage is blocked or missing', () => {
    const fail = () => {
      throw new Error('blocked')
    }
    vi.stubGlobal('localStorage', { length: 0, clear: fail, getItem: fail, key: fail, removeItem: fail, setItem: fail })
    expect(loadSnap()).toBe(false)
    expect(() => saveSnap(true)).not.toThrow()
    vi.stubGlobal('localStorage', undefined)
    expect(loadSnap()).toBe(false)
    expect(() => saveSnap(true)).not.toThrow()
  })
})

function memoryStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  }
}
