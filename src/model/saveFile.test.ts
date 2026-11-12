import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HOME_KEY, loadHome, saveHome } from './autosave.ts'
import { addItem, newHome, type Home } from './home.ts'
import { sampleHome } from './sample.ts'
import { fileName, fromFile, migrate, MIGRATIONS, toFile, type Migration } from './saveFile.ts'

const furnished = (): Home => {
  const home = { ...newHome(sampleHome()), name: 'Flat' }
  return addItem(home, {
    id: 'sofa',
    name: 'Sofa',
    templateId: 'sofa',
    size: { width: 200, depth: 90, height: 80 },
    colour: '#556677',
    position: { x: 150, z: 120 },
    elevation: 0,
    rotation: 45,
    mount: 'floor',
    product: { url: 'https://example.com/sofa', price: 499, currency: 'EUR' },
  })
}

describe('toFile and fromFile', () => {
  it('export then import gives an equal home', () => {
    const home = furnished()
    expect(fromFile(toFile(home))).toEqual({ ok: true, home })
    const empty = newHome()
    expect(fromFile(toFile(empty))).toEqual({ ok: true, home: empty })
  })

  it.each([
    ['{', 'not-json'],
    ['', 'not-json'],
    ['{"formatVersion": 99}', 'newer-version'],
    ['[]', 'not-a-home'],
    ['null', 'not-a-home'],
    ['"home"', 'not-a-home'],
    ['{}', 'not-a-home'],
    ['{"formatVersion": 0}', 'not-a-home'],
    ['{"formatVersion": "1"}', 'not-a-home'],
    ['{"formatVersion": 1}', 'not-a-home'],
  ] as const)('fromFile(%j) gives %s', (text, error) => {
    expect(fromFile(text)).toEqual({ ok: false, error })
  })

  it('rejects files whose parts are the wrong shape', () => {
    const good = JSON.parse(toFile(furnished()))
    const broken = [
      { ...good, plan: { rooms: 'none' } },
      { ...good, plan: { rooms: [{ ...good.plan.rooms[0], corners: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }] } },
      { ...good, versions: [] },
      { ...good, currentVersionId: 'missing' },
      { ...good, versions: [{ ...good.versions[0], items: [{ id: 'x' }] }] },
      { ...good, versions: [{ ...good.versions[0], items: [{ ...good.versions[0].items[0], mount: 'roof' }] }] },
      { ...good, versions: [good.versions[0], good.versions[0]] },
      { ...good, name: 7 },
    ]
    for (const file of broken) expect(fromFile(JSON.stringify(file))).toEqual({ ok: false, error: 'not-a-home' })
  })

  it('names the file after the home, or "home"', () => {
    expect(fileName(furnished())).toBe('Flat.drafthouse.json')
    expect(fileName(newHome())).toBe('home.drafthouse.json')
    expect(fileName({ ...newHome(), name: '  ' })).toBe('home.drafthouse.json')
  })
})

describe('migrations', () => {
  it('has none yet: format 1 is the current format', () => {
    expect(MIGRATIONS).toEqual({})
  })

  it('shows where version 2 would go: MIGRATIONS[1] turns a version 1 file into version 2', () => {
    // When the format changes, FORMAT_VERSION becomes 2 and this migration moves into MIGRATIONS.
    const toVersion2: Migration = (file) => ({ ...file, finishes: [] })
    const v1 = JSON.parse(toFile(furnished()))
    const result = migrate(v1, { 1: toVersion2 }, 2)
    expect(result).toEqual({ ok: true, file: { ...v1, formatVersion: 2, finishes: [] } })
    expect(migrate({ formatVersion: 3 }, { 1: toVersion2 }, 2)).toEqual({ ok: false, error: 'newer-version' })
  })

  it('leaves a current file as it is', () => {
    const v1 = JSON.parse(toFile(furnished()))
    expect(migrate(v1, MIGRATIONS, 1)).toEqual({ ok: true, file: v1 })
  })
})

function memoryStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  }
}

describe('autosave', () => {
  beforeEach(() => vi.stubGlobal('localStorage', memoryStorage()))
  afterEach(() => vi.unstubAllGlobals())

  const sample = () => newHome(sampleHome())

  it('saves under drafthouse.home and loads it back', () => {
    const home = furnished()
    saveHome(home)
    expect(localStorage.getItem(HOME_KEY)).toBe(toFile(home))
    expect(loadHome(sample)).toEqual(home)
  })

  it('uses the fallback when nothing is saved', () => {
    expect(loadHome(sample).plan).toEqual(sampleHome())
  })

  it.each(['{broken', '[]', '{"formatVersion": 99}'])('falls back to the sample home when the saved home is %j', (text) => {
    localStorage.setItem(HOME_KEY, text)
    expect(loadHome(sample).plan).toEqual(sampleHome())
  })

  it('never throws when storage is blocked or missing', () => {
    const fail = () => {
      throw new Error('SecurityError')
    }
    vi.stubGlobal('localStorage', { length: 0, clear: fail, getItem: fail, key: fail, removeItem: fail, setItem: fail })
    expect(() => saveHome(furnished())).not.toThrow()
    expect(loadHome(sample).plan).toEqual(sampleHome())

    vi.stubGlobal('localStorage', undefined)
    expect(() => saveHome(furnished())).not.toThrow()
    expect(loadHome(sample).plan).toEqual(sampleHome())
  })
})
