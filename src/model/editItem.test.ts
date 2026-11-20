import { describe, expect, it } from 'vitest'
import { duplicateItem, duplicateName, duplicateOffset, isValidSize, resizeItem } from './editItem.ts'
import { addItem, currentVersion, newHome, removeItem, updateItem } from './home.ts'
import { footprint, type Item } from './item.ts'
import { createStore } from './store.ts'

const table: Item = {
  id: 'table',
  name: 'Table',
  templateId: 'table',
  size: { width: 160, depth: 90, height: 75 },
  colour: '#a0522d',
  position: { x: 200, z: 100 },
  elevation: 0,
  rotation: 0,
  mount: 'floor',
}

const centre = (item: Item) => {
  const corners = footprint(item)
  return { x: corners.reduce((s, c) => s + c.x, 0) / 4, z: corners.reduce((s, c) => s + c.z, 0) / 4 }
}

describe('size validation', () => {
  it('accepts 1 to 1000 cm', () => {
    for (const ok of [1, 1.5, 200, 1000]) expect(isValidSize(ok)).toBe(true)
  })
  it('rejects anything else', () => {
    for (const bad of [0, 0.5, -10, 1000.1, 5000, NaN, Infinity]) expect(isValidSize(bad)).toBe(false)
  })
})

describe('resizeItem', () => {
  it('keeps a 160 × 90 table centred at (200, 100) when resized to 200 wide', () => {
    const resized = resizeItem(table, { width: 200 })
    expect(resized.size).toEqual({ width: 200, depth: 90, height: 75 })
    expect(resized.position).toEqual({ x: 200, z: 100 })
    const c = centre(resized)
    expect(c.x).toBeCloseTo(200)
    expect(c.z).toBeCloseTo(100)
  })
  it('keeps the centre of a turned item too', () => {
    const turned = { ...table, rotation: 37 }
    const c = centre(resizeItem(turned, { width: 300, depth: 40 }))
    expect(c.x).toBeCloseTo(200)
    expect(c.z).toBeCloseTo(100)
  })
  it('leaves the original untouched', () => {
    resizeItem(table, { height: 10 })
    expect(table.size.height).toBe(75)
  })
})

describe('duplicate', () => {
  it('names the copy with " (2)"', () => {
    expect(duplicateName('Sofa')).toBe('Sofa (2)')
  })
  it('puts the copy 20 cm right and 20 cm towards the camera', () => {
    // The default orbit view: right is +X, the camera is on the +Z side.
    expect(duplicateOffset({ x: 1, z: 0 })).toEqual({ x: 20, z: 20 })
    // A camera looking along +X has its right towards +Z and stands on the -X side.
    const along = duplicateOffset({ x: 0, z: 1 })
    expect(along.x).toBeCloseTo(-20)
    expect(along.z).toBeCloseTo(20)
    // The right direction doesn't need to be of length 1.
    expect(duplicateOffset({ x: 0.001, z: 0 })).toEqual({ x: 20, z: 20 })
  })
  it('copies the item with a new id, 20 cm away, leaving the original as it was', () => {
    const sofa: Item = { ...table, id: 'sofa', name: 'Sofa', product: { url: 'https://example.com/sofa', price: 499 } }
    const copy = duplicateItem(sofa, 'copy', { x: 1, z: 0 })
    expect(copy).toEqual({ ...sofa, id: 'copy', name: 'Sofa (2)', position: { x: 220, z: 120 } })
    expect(copy.size).not.toBe(sofa.size)
    expect(copy.product).not.toBe(sofa.product)
    expect(sofa.position).toEqual({ x: 200, z: 100 })
  })
})

describe('editing through the store', () => {
  const items = (home: ReturnType<typeof newHome>) => currentVersion(home).items
  it('renames in one undo step', () => {
    const store = createStore(addItem(newHome(), table))
    store.set(updateItem(store.get(), 'table', { name: 'Dining table' }))
    expect(items(store.get())[0].name).toBe('Dining table')
    store.undo()
    expect(items(store.get())[0].name).toBe('Table')
  })
  it('deletes in one undo step', () => {
    const store = createStore(addItem(newHome(), table))
    store.set(removeItem(store.get(), 'table'))
    expect(items(store.get())).toEqual([])
    store.undo()
    expect(items(store.get())).toEqual([table])
  })
})
