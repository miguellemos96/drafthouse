// The save file: a Home as JSON text, with a `formatVersion` so older files can be migrated.
// See "Saving" in docs/spec.md.
import { FORMAT_VERSION, type Home } from './home.ts'
import type { Mount } from './item.ts'
import { createRoom } from './plan.ts'

export type FileError = 'not-json' | 'not-a-home' | 'newer-version'

export type ReadResult = { ok: true; home: Home } | { ok: false; error: FileError }

type Data = Record<string, unknown>

/** Turns a file of format `n` into a file of format `n + 1`. */
export type Migration = (file: Data) => Data

/**
 * Keyed by the format a migration starts from: `MIGRATIONS[1]` would turn a version 1 file into
 * version 2. When FORMAT_VERSION goes up, add the migration from the previous version here.
 */
export const MIGRATIONS: Record<number, Migration> = {}

export const toFile = (home: Home): string => JSON.stringify(home, null, 2)

export const fileName = (home: Home): string => `${home.name?.trim() || 'home'}.drafthouse.json`

export function fromFile(text: string): ReadResult {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { ok: false, error: 'not-json' }
  }
  const migrated = migrate(data, MIGRATIONS, FORMAT_VERSION)
  if (!migrated.ok) return migrated
  return isHome(migrated.file) ? { ok: true, home: migrated.file } : { ok: false, error: 'not-a-home' }
}

/** Runs the migrations from the file's format up to `target`. */
export function migrate(
  data: unknown,
  migrations: Record<number, Migration>,
  target: number,
): { ok: true; file: Data } | { ok: false; error: FileError } {
  if (!isObject(data)) return { ok: false, error: 'not-a-home' }
  const from = data.formatVersion
  if (typeof from !== 'number' || !Number.isInteger(from) || from < 1) return { ok: false, error: 'not-a-home' }
  if (from > target) return { ok: false, error: 'newer-version' }
  let file = data
  for (let version = from; version < target; version++) {
    const step = migrations[version]
    if (!step) throw new Error(`No migration from save format ${version}.`)
    file = { ...step(file), formatVersion: version + 1 }
  }
  return { ok: true, file }
}

// ── shape checks ────────────────────────────────────────────────────

const isObject = (value: unknown): value is Data => typeof value === 'object' && value !== null && !Array.isArray(value)
const isString = (value: unknown): value is string => typeof value === 'string'
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const optional = <T>(value: unknown, check: (v: unknown) => v is T) => value === undefined || check(value)
const hasNumbers = (value: unknown, keys: string[]) => isObject(value) && keys.every((k) => isNumber(value[k]))

const MOUNTS: readonly Mount[] = ['floor', 'wall', 'ceiling', 'on-item']

const isRoom = (room: unknown) => {
  if (!isObject(room) || !isString(room.id) || !isString(room.name) || !isNumber(room.height) || room.height <= 0) return false
  if (!Array.isArray(room.corners) || !room.corners.every((p) => hasNumbers(p, ['x', 'y']))) return false
  try {
    createRoom({ id: room.id, name: room.name, height: room.height, corners: room.corners })
    return true
  } catch {
    return false
  }
}

const isProduct = (product: unknown) =>
  isObject(product) &&
  isString(product.url) &&
  optional(product.price, isNumber) &&
  optional(product.currency, isString) &&
  optional(product.photoUrl, isString)

const isItem = (item: unknown) =>
  isObject(item) &&
  isString(item.id) &&
  isString(item.name) &&
  isString(item.templateId) &&
  hasNumbers(item.size, ['width', 'depth', 'height']) &&
  isString(item.colour) &&
  hasNumbers(item.position, ['x', 'z']) &&
  isNumber(item.elevation) &&
  isNumber(item.rotation) &&
  MOUNTS.includes(item.mount as Mount) &&
  (item.product === undefined || isProduct(item.product))

const isVersion = (version: unknown) =>
  isObject(version) && isString(version.id) && isString(version.name) && Array.isArray(version.items) && version.items.every(isItem)

function isHome(data: Data): data is Home {
  if (data.formatVersion !== FORMAT_VERSION || !optional(data.name, isString)) return false
  if (!isObject(data.plan) || !Array.isArray(data.plan.rooms) || !data.plan.rooms.every(isRoom)) return false
  const { versions } = data
  if (!Array.isArray(versions) || versions.length === 0 || !versions.every(isVersion)) return false
  const ids = versions.map((v: Data) => v.id)
  return new Set(ids).size === ids.length && ids.includes(data.currentVersionId)
}
