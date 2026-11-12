// The Home: the plan plus the versions of its items. See "Home" and "Version" in docs/spec.md.
// Every helper returns a new Home and leaves the one it was given untouched.
import { t } from '../i18n/index.ts'
import type { Item } from './item.ts'
import type { Plan } from './plan.ts'

export const FORMAT_VERSION = 1

export type Version = { id: string; name: string; items: Item[] }

export type Home = {
  formatVersion: typeof FORMAT_VERSION
  /** Optional; names the exported file. */
  name?: string
  plan: Plan
  versions: Version[]
  currentVersionId: string
}

/** A home with the given plan (empty by default) and one version, "As it is". */
export const newHome = (plan: Plan = { rooms: [] }): Home => {
  const version: Version = { id: crypto.randomUUID(), name: t('version.asItIs'), items: [] }
  return { formatVersion: FORMAT_VERSION, plan, versions: [version], currentVersionId: version.id }
}

export const currentVersion = (home: Home): Version => {
  const version = home.versions.find((v) => v.id === home.currentVersionId)
  if (!version) throw new Error(`No version ${home.currentVersionId} in this home.`)
  return version
}

const withItems = (home: Home, change: (items: Item[]) => Item[]): Home => {
  const current = currentVersion(home)
  return {
    ...home,
    versions: home.versions.map((v) => (v === current ? { ...v, items: change(v.items) } : v)),
  }
}

export const addItem = (home: Home, item: Item): Home => withItems(home, (items) => [...items, item])

export const updateItem = (home: Home, id: string, changes: Partial<Omit<Item, 'id'>>): Home =>
  withItems(home, (items) => items.map((item) => (item.id === id ? { ...item, ...changes } : item)))

export const removeItem = (home: Home, id: string): Home => withItems(home, (items) => items.filter((item) => item.id !== id))

export const setPlan = (home: Home, plan: Plan): Home => ({ ...home, plan })
