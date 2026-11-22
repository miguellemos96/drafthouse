import { describe, expect, it } from 'vitest'
import { currentVersion } from './home.ts'
import type { Item } from './item.ts'
import { wallsOf } from './plan.ts'
import { newSampleHome, sampleHome } from './sample.ts'
import { toFile } from './saveFile.ts'
import { itemVisible, pruneHidden, wallVisible } from './visibility.ts'

// The sample home: Room 1 ("living", x 0–400) with the sofa and the table, Room 2 ("bedroom", x 400–700)
// with the bed. They share the wall at x = 400.
const plan = sampleHome()
const items = currentVersion(newSampleHome()).items
const isShared = (wall: { rooms: string[] }) => wall.rooms.length > 1

const visibleItems = (hidden: Set<string>) => items.filter((item) => itemVisible(plan, item, hidden)).map((item) => item.id)
const visibleWalls = (hidden: Set<string>) => wallsOf(plan).filter((wall) => wallVisible(wall, hidden))

describe('hiding rooms', () => {
  it('shows everything when nothing is hidden', () => {
    expect(visibleWalls(new Set())).toHaveLength(7)
    expect(visibleItems(new Set())).toEqual(['sample-sofa', 'sample-table', 'sample-bed'])
  })

  it('hiding Room 1 hides its 3 walls that are not shared and the sofa and table; the shared wall stays', () => {
    const hidden = new Set(['living'])
    const livingWalls = wallsOf(plan).filter((wall) => wall.rooms.includes('living'))
    const gone = livingWalls.filter((wall) => !wallVisible(wall, hidden))
    expect(gone).toHaveLength(3)
    expect(gone.some(isShared)).toBe(false)
    expect(wallVisible(livingWalls.find(isShared)!, hidden)).toBe(true)
    expect(visibleWalls(hidden)).toHaveLength(4)
    expect(visibleItems(hidden)).toEqual(['sample-bed'])
  })

  it('hiding both rooms hides the shared wall too', () => {
    const hidden = new Set(['living', 'bedroom'])
    expect(visibleWalls(hidden)).toEqual([])
    expect(visibleItems(hidden)).toEqual([])
  })

  it('keeps an item outside every room shown', () => {
    const outside: Item = { ...items[0], id: 'outside', position: { x: 900, z: 900 } }
    expect(itemVisible(plan, outside, new Set(['living', 'bedroom']))).toBe(true)
  })

  it('keeps an item on the shared wall shown while either room is', () => {
    const onWall: Item = { ...items[0], id: 'on-wall', position: { x: 400, z: 150 } }
    expect(itemVisible(plan, onWall, new Set(['living']))).toBe(true)
    expect(itemVisible(plan, onWall, new Set(['living', 'bedroom']))).toBe(false)
  })

  it('forgets hidden rooms that no longer exist', () => {
    expect([...pruneHidden(plan, new Set(['living', 'gone']))]).toEqual(['living'])
  })

  it('is not part of the home: the exported file is the same', () => {
    const home = newSampleHome()
    const before = toFile(home)
    // Hiding is worked out from the home and a set of ids; it never changes the home.
    visibleItems(new Set(['living']))
    pruneHidden(home.plan, new Set(['living']))
    expect(toFile(home)).toBe(before)
  })
})
