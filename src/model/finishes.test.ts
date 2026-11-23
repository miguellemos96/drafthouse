import { describe, expect, it } from 'vitest'
import {
  DEFAULT_FLOOR_COLOUR,
  DEFAULT_FLOOR_MATERIAL,
  DEFAULT_WALL_COLOUR,
  floorOf,
  roomWalls,
  setFloor,
  setWallColour,
  wallColourOf,
  wallFaceColours,
  wallKey,
} from './finishes.ts'
import { currentVersion, duplicateVersion, newHome, switchVersion } from './home.ts'
import { wallsOf } from './plan.ts'
import { sampleHome } from './sample.ts'
import { fromFile, toFile } from './saveFile.ts'

const BLUE = '#3366cc'
// The sample home: "living" (0..400) and "bedroom" (400..700) share the wall x = 400.
const shared = { a: { x: 400, y: 0 }, b: { x: 400, y: 300 } }

describe('finishes', () => {
  it('a new room has a wood floor in light oak and off-white walls', () => {
    const home = newHome(sampleHome())
    const { finishes } = currentVersion(home)
    expect(DEFAULT_FLOOR_MATERIAL).toBe('wood')
    expect(floorOf(finishes, 'living')).toEqual({ material: 'wood', colour: DEFAULT_FLOOR_COLOUR })
    expect(wallColourOf(finishes, 'living', shared.a, shared.b)).toBe(DEFAULT_WALL_COLOUR)
  })

  it('keys a wall the same whichever way round its corners are given', () => {
    expect(wallKey(shared.a, shared.b)).toBe(wallKey(shared.b, shared.a))
  })

  it('sets a floor material and colour in the current version only, leaving the home it was given untouched', () => {
    const home = newHome(sampleHome())
    const tiled = setFloor(home, 'living', { material: 'tile' })
    expect(floorOf(currentVersion(tiled).finishes, 'living')).toEqual({ material: 'tile', colour: DEFAULT_FLOOR_COLOUR })
    const coloured = setFloor(tiled, 'living', { colour: '#888888' })
    expect(floorOf(currentVersion(coloured).finishes, 'living')).toEqual({ material: 'tile', colour: '#888888' })
    expect(floorOf(currentVersion(coloured).finishes, 'bedroom').material).toBe('wood')
    expect(currentVersion(home).finishes).toBeUndefined()
  })

  it('painting Room 1’s shared wall blue leaves Room 2’s side of it off-white', () => {
    const home = setWallColour(newHome(sampleHome()), 'living', shared.a, shared.b, BLUE)
    const { finishes } = currentVersion(home)
    expect(wallColourOf(finishes, 'living', shared.b, shared.a)).toBe(BLUE)
    expect(wallColourOf(finishes, 'bedroom', shared.a, shared.b)).toBe(DEFAULT_WALL_COLOUR)
    // In the scene: the shared wall runs (400,0) → (400,300); its left face (normal (-1, 0)) faces the living room.
    const wall = wallsOf(home.plan).find((w) => w.rooms.length === 2)!
    const faces = wallFaceColours(home.plan, finishes, wall)
    const livingSide = wall.a.y < wall.b.y ? 'left' : 'right'
    expect(faces[livingSide]).toBe(BLUE)
    expect(faces[livingSide === 'left' ? 'right' : 'left']).toBe(DEFAULT_WALL_COLOUR)
  })

  it('gives an outside wall face the default colour, and the inside face the room’s colour', () => {
    const plan = sampleHome()
    const back = { a: { x: 0, y: 0 }, b: { x: 400, y: 0 } }
    const home = setWallColour(newHome(plan), 'living', back.a, back.b, BLUE)
    const wall = wallsOf(plan).find((w) => wallKey(w.a, w.b) === wallKey(back.a, back.b))!
    // Going (0,0) → (400,0), the left normal is (0, 1): into the room.
    expect(wallFaceColours(plan, currentVersion(home).finishes, wall)).toEqual({ left: BLUE, right: DEFAULT_WALL_COLOUR })
  })

  it('duplicating a version copies its finishes; changing the copy’s floor doesn’t change the original', () => {
    const original = setFloor(newHome(sampleHome()), 'living', { material: 'tile' })
    const originalId = original.currentVersionId
    const copied = duplicateVersion(original, 'plan-a')
    expect(floorOf(currentVersion(copied).finishes, 'living').material).toBe('tile')
    const changed = setFloor(copied, 'living', { material: 'carpet' })
    expect(floorOf(currentVersion(changed).finishes, 'living').material).toBe('carpet')
    expect(floorOf(currentVersion(switchVersion(changed, originalId)).finishes, 'living').material).toBe('tile')
  })

  it('a home saved before finishes loads with default finishes', () => {
    const old = newHome(sampleHome())
    const read = fromFile(toFile(old))
    expect(read.ok).toBe(true)
    if (!read.ok) return
    expect(floorOf(currentVersion(read.home).finishes, 'living')).toEqual({ material: 'wood', colour: DEFAULT_FLOOR_COLOUR })
  })

  it('saves and loads finishes, and refuses a file with an unknown floor material', () => {
    const home = setWallColour(setFloor(newHome(sampleHome()), 'living', { material: 'concrete' }), 'living', shared.a, shared.b, BLUE)
    const read = fromFile(toFile(home))
    expect(read.ok && currentVersion(read.home).finishes).toEqual(currentVersion(home).finishes)
    const bad = JSON.parse(toFile(home))
    bad.versions[0].finishes.rooms.living.floor = 'marble'
    expect(fromFile(JSON.stringify(bad))).toEqual({ ok: false, error: 'not-a-home' })
  })

  it('lists a room’s walls in outline order with their lengths', () => {
    const [living] = sampleHome().rooms
    expect(roomWalls(living).map((w) => w.length)).toEqual([400, 300, 400, 300])
    expect(roomWalls(living)[3]).toEqual({ a: { x: 0, y: 300 }, b: { x: 0, y: 0 }, length: 300 })
  })
})
