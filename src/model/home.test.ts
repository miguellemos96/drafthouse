import { afterEach, describe, expect, it, vi } from 'vitest'
import { t, useLanguage } from '../i18n/index.ts'
import { addItem, currentVersion, newHome, removeItem, setPlan, updateItem } from './home.ts'
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
