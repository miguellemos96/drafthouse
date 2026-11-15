import { describe, expect, it } from 'vitest'
import { addItem, currentVersion, newHome, type Home } from './home.ts'
import { sampleItems } from './sample.ts'
import { createStore, HISTORY_LIMIT } from './store.ts'

const named = (name: string): Home => ({ ...newHome(), name })

describe('store history', () => {
  it('starts with nothing to undo or redo', () => {
    const store = createStore(named('start'))
    expect(store.canUndo()).toBe(false)
    expect(store.canRedo()).toBe(false)
    store.undo()
    store.redo()
    expect(store.get().name).toBe('start')
  })

  it('add an item, then undo: the item is gone; redo: it is back', () => {
    const start = newHome()
    const store = createStore(start)
    const [sofa] = sampleItems()
    store.set(addItem(store.get(), sofa!))
    expect(currentVersion(store.get()).items).toHaveLength(1)

    store.undo()
    expect(store.get()).toBe(start)
    expect(currentVersion(store.get()).items).toEqual([])
    expect(store.canUndo()).toBe(false)
    expect(store.canRedo()).toBe(true)

    store.redo()
    expect(currentVersion(store.get()).items).toEqual([sofa])
    expect(store.canRedo()).toBe(false)
  })

  it('change 1, change 2, undo, change 3: redo does nothing, and two undos give the home before change 1', () => {
    const store = createStore(named('before'))
    store.set(named('change 1'))
    store.set(named('change 2'))
    store.undo()
    store.set(named('change 3'))
    expect(store.canRedo()).toBe(false)
    store.redo()
    expect(store.get().name).toBe('change 3')
    store.undo()
    store.undo()
    expect(store.get().name).toBe('before')
    expect(store.canUndo()).toBe(false)
  })

  it('keeps 200 steps: after 205 changes, 200 undos reach change 5 and a 201st does nothing', () => {
    expect(HISTORY_LIMIT).toBe(200)
    const store = createStore(named('change 0'))
    for (let n = 1; n <= 205; n++) store.set(named(`change ${n}`))
    for (let n = 0; n < 200; n++) store.undo()
    expect(store.get().name).toBe('change 5')
    expect(store.canUndo()).toBe(false)
    store.undo()
    expect(store.get().name).toBe('change 5')
    // Every step can still be redone.
    for (let n = 0; n < 200; n++) store.redo()
    expect(store.get().name).toBe('change 205')
  })

  it('tells listeners about an undo or redo, so it is saved like any other change', () => {
    const store = createStore(named('a'))
    const seen: string[] = []
    store.subscribe((home) => seen.push(home.name ?? ''))
    store.set(named('b'))
    store.undo()
    store.redo()
    store.undo()
    store.undo() // nothing to undo: no call
    expect(seen).toEqual(['b', 'a', 'b', 'a'])
  })

  it('an undo of a whole new home (like an Import) brings back the previous one', () => {
    const previous = named('mine')
    const store = createStore(previous)
    store.set(named('imported'))
    store.undo()
    expect(store.get()).toBe(previous)
  })
})
