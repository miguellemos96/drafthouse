import { afterEach, describe, expect, it, vi } from 'vitest'
import { t, useLanguage } from '../i18n/index.ts'
import {
  addItem,
  canDeleteVersion,
  currentVersion,
  deleteVersion,
  duplicateVersion,
  newHome,
  removeItem,
  renameVersion,
  setPlan,
  switchVersion,
  updateItem,
} from './home.ts'
import type { Item } from './item.ts'
import { sampleHome } from './sample.ts'
import { createStore } from './store.ts'

const chair = (id = 'chair'): Item => ({
  id,
  name: 'Chair',
  templateId: 'chair',
  size: { width: 45, depth: 50, height: 90 },
  colour: '#a0522d',
  position: { x: 100, z: 100 },
  elevation: 0,
  rotation: 0,
  mount: 'floor',
})

afterEach(() => useLanguage('en'))

describe('newHome', () => {
  it('has an empty plan and one version named "As it is"', () => {
    const home = newHome()
    expect(home.formatVersion).toBe(1)
    expect(home.plan).toEqual({ rooms: [] })
    expect(home.versions).toHaveLength(1)
    expect(home.versions[0]).toEqual({ id: home.currentVersionId, name: t('version.asItIs'), items: [] })
    expect(home.versions[0].name).toBe('As it is')
  })

  it('names the first version in the current language', () => {
    useLanguage('es')
    expect(newHome().versions[0].name).toBe('Como está')
  })
})

describe('item and plan helpers', () => {
  it('add, update and remove an item in the current version without mutating', () => {
    const empty = newHome()
    const frozen = structuredClone(empty)

    const withChair = addItem(empty, chair())
    expect(currentVersion(withChair).items).toEqual([chair()])
    expect(empty).toEqual(frozen)

    const moved = updateItem(withChair, 'chair', { position: { x: 5, z: 6 }, rotation: 30 })
    expect(currentVersion(moved).items[0]).toEqual({ ...chair(), position: { x: 5, z: 6 }, rotation: 30 })
    expect(currentVersion(withChair).items[0]).toEqual(chair())

    const removed = removeItem(moved, 'chair')
    expect(currentVersion(removed).items).toEqual([])
    expect(currentVersion(moved).items).toHaveLength(1)
  })

  it('only touches the current version', () => {
    const home = newHome()
    const other = { id: 'plan-a', name: 'Plan A', items: [chair('a')] }
    const two = { ...home, versions: [...home.versions, other] }
    const changed = removeItem(addItem(two, chair('b')), 'a')
    expect(changed.versions[1]).toBe(other)
    expect(currentVersion(changed).items.map((i) => i.id)).toEqual(['b'])
  })

  it('replaces the plan', () => {
    const home = newHome()
    const plan = sampleHome()
    const next = setPlan(home, plan)
    expect(next.plan).toBe(plan)
    expect(home.plan).toEqual({ rooms: [] })
    expect(next.versions).toBe(home.versions)
  })
})

describe('store', () => {
  it('returns what was set and tells subscribers', () => {
    const first = newHome()
    const store = createStore(first)
    expect(store.get()).toBe(first)

    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)
    const second = addItem(first, chair())
    store.set(second)
    expect(store.get()).toBe(second)
    expect(listener).toHaveBeenCalledExactlyOnceWith(second)

    unsubscribe()
    store.set(first)
    expect(listener).toHaveBeenCalledTimes(1)
  })
})

describe('versions', () => {
  const ids = (prefix: string) => {
    let n = 0
    return () => `${prefix}-${++n}`
  }
  const asItIs = () => addItem(addItem(newHome(), chair('a')), { ...chair('b'), product: { url: 'https://example.com/b' } })

  it('duplicating "As it is" gives "As it is (copy)" with the same items, all with new ids, and it is now current', () => {
    const home = asItIs()
    const frozen = structuredClone(home)
    const copied = duplicateVersion(home, 'copy', ids('new'))
    expect(home).toEqual(frozen)
    expect(copied.versions.map((v) => v.name)).toEqual(['As it is', 'As it is (copy)'])
    expect(copied.currentVersionId).toBe('copy')
    const copy = currentVersion(copied)
    expect(copy.items.map((i) => i.id)).toEqual(['new-1', 'new-2'])
    const strip = (items: { id: string }[]) => items.map((item) => ({ ...item, id: undefined }))
    expect(strip(copy.items)).toEqual(strip(home.versions[0].items))
    // A deep copy: changing the copy leaves the original alone.
    expect(copy.items[1].product).not.toBe(home.versions[0].items[1].product)
    const moved = updateItem(copied, 'new-1', { position: { x: 1, z: 2 } })
    expect(moved.versions[0].items[0].position).toEqual({ x: 100, z: 100 })
  })

  it('names the copy in the current language', () => {
    useLanguage('es')
    const home = newHome()
    expect(currentVersion(duplicateVersion(home, 'c')).name).toBe('Como está (copia)')
  })

  it('copies everything in the version, not only the items', () => {
    const home = newHome()
    const withExtra = { ...home, versions: [{ ...home.versions[0], finishes: { rooms: { r: { floor: 'tile' as const } } } }] }
    const copy = currentVersion(duplicateVersion(withExtra, 'c')) as unknown as { finishes: unknown }
    expect(copy.finishes).toEqual({ rooms: { r: { floor: 'tile' } } })
    expect(copy.finishes).not.toBe((withExtra.versions[0] as unknown as { finishes: unknown }).finishes)
  })

  it('switches the current version', () => {
    const copied = duplicateVersion(asItIs(), 'copy', ids('n'))
    const first = copied.versions[0].id
    const back = switchVersion(copied, first)
    expect(back.currentVersionId).toBe(first)
    expect(back.versions).toBe(copied.versions)
    expect(currentVersion(back).items.map((i) => i.id)).toEqual(['a', 'b'])
    expect(() => switchVersion(copied, 'nope')).toThrow()
  })

  it('renames a version, ignoring a blank name', () => {
    const home = duplicateVersion(newHome(), 'copy')
    const renamed = renameVersion(home, 'copy', '  New kitchen  ')
    expect(renamed.versions.map((v) => v.name)).toEqual(['As it is', 'New kitchen'])
    expect(renamed.versions[0]).toBe(home.versions[0])
    expect(renameVersion(home, 'copy', '   ')).toBe(home)
  })

  it('refuses to delete the only version', () => {
    const home = newHome()
    expect(canDeleteVersion(home)).toBe(false)
    expect(deleteVersion(home, home.currentVersionId)).toBe(home)
  })

  it('deleting the current version switches to the first remaining one', () => {
    const home = newHome()
    const first = home.currentVersionId
    const three = duplicateVersion(duplicateVersion(home, 'b'), 'c')
    expect(canDeleteVersion(three)).toBe(true)
    const deleted = deleteVersion(three, 'c')
    expect(deleted.versions.map((v) => v.id)).toEqual([first, 'b'])
    expect(deleted.currentVersionId).toBe(first)
    // Deleting a version that isn't current keeps the current one.
    const other = deleteVersion(switchVersion(three, 'c'), 'b')
    expect(other.currentVersionId).toBe('c')
  })

  it('each action is one undo step; undoing a delete brings the version back, as the current one', () => {
    const store = createStore(asItIs())
    const first = store.get().currentVersionId
    store.set(duplicateVersion(store.get(), 'copy'))
    store.set(switchVersion(store.get(), first))
    store.set(switchVersion(store.get(), 'copy'))
    store.set(deleteVersion(store.get(), 'copy'))
    expect(store.get().versions.map((v) => v.id)).toEqual([first])
    expect(store.get().currentVersionId).toBe(first)
    store.undo()
    expect(store.get().versions.map((v) => v.id)).toEqual([first, 'copy'])
    expect(store.get().currentVersionId).toBe('copy')
    store.undo() // the switch to the copy
    expect(store.get().currentVersionId).toBe(first)
  })
})
