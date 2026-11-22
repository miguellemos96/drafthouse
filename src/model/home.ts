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

// Versions. See "Versions and prices" in docs/spec.md. A version holds everything that isn't the plan.

/** The home with `id` as its current version. */
export const switchVersion = (home: Home, id: string): Home => {
  if (!home.versions.some((v) => v.id === id)) throw new Error(`No version ${id} in this home.`)
  return { ...home, currentVersionId: id }
}

/**
 * Copies the current version, named "<name> (copy)", with `id` and new ids for its items from
 * `newItemId`, adds it after the last version, and makes it current.
 */
export const duplicateVersion = (home: Home, id: string, newItemId: () => string = () => crypto.randomUUID()): Home => {
  const original = currentVersion(home)
  const copy: Version = {
    ...structuredClone(original),
    id,
    name: t('version.copyName', { name: original.name }),
  }
  copy.items = copy.items.map((item) => ({ ...item, id: newItemId() }))
  return { ...home, versions: [...home.versions, copy], currentVersionId: id }
}

/** The home with version `id` renamed. A name that is blank after trimming leaves the home as it was. */
export const renameVersion = (home: Home, id: string, name: string): Home => {
  const trimmed = name.trim()
  if (trimmed === '') return home
  return { ...home, versions: home.versions.map((v) => (v.id === id ? { ...v, name: trimmed } : v)) }
}

/** Whether a version can be deleted: not when it is the last one. */
export const canDeleteVersion = (home: Home): boolean => home.versions.length > 1

/**
 * The home without version `id`. Deleting the current version switches to the first remaining one.
 * The last version can't be deleted: the home comes back as it was.
 */
export const deleteVersion = (home: Home, id: string): Home => {
  if (!canDeleteVersion(home) || !home.versions.some((v) => v.id === id)) return home
  const versions = home.versions.filter((v) => v.id !== id)
  const currentVersionId = home.currentVersionId === id ? versions[0].id : home.currentVersionId
  return { ...home, versions, currentVersionId }
}
