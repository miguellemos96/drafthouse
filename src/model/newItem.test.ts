import { describe, expect, it } from 'vitest'
import { createRectRoom, createRoom, type Plan } from './plan.ts'
import { ITEM_SIZE_LIMITS, itemFormErrors, newItem, newItemPosition, roomAt, roomCentre, targetRoom } from './newItem.ts'
import { templates } from './templates.ts'

// Two rooms side by side, like the sample home: room 1 from x 0 to 400, room 2 from x 400 to 700.
const twoRooms = (): Plan => ({
  rooms: [
    createRectRoom({ id: 'r1', name: 'Room 1', width: 400, length: 300, height: 250 }),
    createRoom({ id: 'r2', name: 'Room 2', height: 250, corners: [{ x: 400, y: 0 }, { x: 700, y: 0 }, { x: 700, y: 300 }, { x: 400, y: 300 }] }),
  ],
})

const inside = (plan: Plan, roomId: string, p: { x: number; z: number }) => roomAt({ rooms: plan.rooms.filter((r) => r.id === roomId) }, p) !== undefined

describe('roomAt', () => {
  it('finds the room whose floor contains the point', () => {
    expect(roomAt(twoRooms(), { x: 550, z: 150 })?.id).toBe('r2')
    expect(roomAt(twoRooms(), { x: 100, z: 50 })?.id).toBe('r1')
  })

  it('finds nothing outside every room', () => {
    expect(roomAt(twoRooms(), { x: 900, z: 150 })).toBeUndefined()
    expect(roomAt(twoRooms(), { x: 200, z: -10 })).toBeUndefined()
  })

  it('works for an L-shaped room, including its notch', () => {
    const plan: Plan = {
      rooms: [createRoom({ id: 'l', name: 'L', height: 250, corners: [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 200 }, { x: 200, y: 200 }, { x: 200, y: 400 }, { x: 0, y: 400 }] })],
    }
    expect(roomAt(plan, { x: 100, z: 300 })?.id).toBe('l')
    expect(roomAt(plan, { x: 300, z: 300 })).toBeUndefined()
  })
})

describe('targetRoom', () => {
  it('is the room under the screen centre', () => {
    expect(targetRoom(twoRooms(), { x: 600, z: 250 })?.id).toBe('r2')
  })

  it('is the first room when the screen centre is outside every room, or unknown', () => {
    expect(targetRoom(twoRooms(), { x: 2000, z: 2000 })?.id).toBe('r1')
    expect(targetRoom(twoRooms(), null)?.id).toBe('r1')
  })

  it('is nothing in a home without rooms', () => {
    expect(targetRoom({ rooms: [] }, { x: 10, z: 10 })).toBeUndefined()
  })
})

describe('roomCentre', () => {
  it('is the middle of a rectangular room', () => {
    expect(roomCentre(twoRooms().rooms[1])).toEqual({ x: 550, z: 150 })
  })

  it('is the area centre of an L-shaped room', () => {
    const room = createRoom({ name: 'L', height: 250, corners: [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 200 }, { x: 200, y: 200 }, { x: 200, y: 400 }, { x: 0, y: 400 }] })
    const c = roomCentre(room)
    expect(c.x).toBeCloseTo(166.67, 1)
    expect(c.z).toBeCloseTo(166.67, 1)
  })
})

describe('newItemPosition', () => {
  it('with the camera over room 2, the position is inside room 2', () => {
    const plan = twoRooms()
    const position = newItemPosition(plan, { x: 650, z: 40 })
    expect(position).toEqual({ x: 550, z: 150 })
    expect(inside(plan, 'r2', position)).toBe(true)
  })

  it('outside every room, goes to the centre of the first room', () => {
    expect(newItemPosition(twoRooms(), { x: -500, z: 0 })).toEqual({ x: 200, z: 150 })
  })

  it('with no rooms, goes to the origin', () => {
    expect(newItemPosition({ rooms: [] }, { x: 300, z: 300 })).toEqual({ x: 0, z: 0 })
    expect(newItemPosition({ rooms: [] }, null)).toEqual({ x: 0, z: 0 })
  })
})

describe('itemFormErrors', () => {
  const valid = { size: { width: 160, depth: 90, height: 75 } }

  it('accepts sizes from 1 to 1000 cm', () => {
    expect(ITEM_SIZE_LIMITS).toEqual({ min: 1, max: 1000 })
    expect(itemFormErrors(valid)).toEqual([])
    expect(itemFormErrors({ size: { width: 1, depth: 1000, height: 1 } })).toEqual([])
  })

  it('a depth of 0 is an error', () => {
    expect(itemFormErrors({ size: { ...valid.size, depth: 0 } })).toEqual(['depth'])
  })

  it('flags each size that is out of range or not a number', () => {
    expect(itemFormErrors({ size: { width: 1001, depth: Number.NaN, height: -5 } })).toEqual(['width', 'depth', 'height'])
  })

  it('accepts no price, and a price of 0 or more; flags a negative or non-numeric price', () => {
    expect(itemFormErrors({ ...valid, price: undefined })).toEqual([])
    expect(itemFormErrors({ ...valid, price: 0 })).toEqual([])
    expect(itemFormErrors({ ...valid, price: 499.99 })).toEqual([])
    expect(itemFormErrors({ ...valid, price: -1 })).toEqual(['price'])
    expect(itemFormErrors({ ...valid, price: Number.NaN })).toEqual(['price'])
  })
})

describe('newItem', () => {
  const values = { name: 'Dining table', templateId: 'table', size: { width: 160, depth: 90, height: 75 }, colour: '#a0522d' } as const

  it('places the item at the centre of the room in view, with the template’s default mount, unturned', () => {
    const item = newItem(twoRooms(), { x: 600, z: 200 }, { ...values, id: 'i1' })
    expect(item).toEqual({
      id: 'i1',
      name: 'Dining table',
      templateId: 'table',
      size: { width: 160, depth: 90, height: 75 },
      colour: '#a0522d',
      position: { x: 550, z: 150 },
      elevation: 0,
      rotation: 0,
      mount: 'floor',
    })
  })

  it('uses the template’s default mount', () => {
    expect(newItem(twoRooms(), null, { ...values, templateId: 'wall-panel' }).mount).toBe(templates['wall-panel'].defaultMount)
    expect(newItem(twoRooms(), null, { ...values, templateId: 'hob' }).mount).toBe('on-item')
  })

  it('keeps a price and its currency, without a link', () => {
    const item = newItem(twoRooms(), null, { ...values, price: 249, currency: 'EUR' })
    expect(item.product).toEqual({ price: 249, currency: 'EUR' })
  })

  it('has no product when there is no price', () => {
    expect(newItem(twoRooms(), null, { ...values, currency: 'EUR' }).product).toBeUndefined()
  })

  it('gives each item a new id', () => {
    expect(newItem(twoRooms(), null, values).id).not.toBe(newItem(twoRooms(), null, values).id)
  })
})
