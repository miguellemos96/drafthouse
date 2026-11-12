import { test, expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import type { Home } from '../src/model/home.ts'

const ready = (page: Page) => page.waitForFunction(() => window.drafthouse !== undefined)
const getHome = (page: Page) => page.evaluate(() => window.drafthouse.store.get())
const setHome = (page: Page, home: Home) => page.evaluate((h) => window.drafthouse.store.set(h), home)

const studio = {
  rooms: [{ id: 'studio', name: 'Studio', height: 260, corners: [{ x: 0, y: 0 }, { x: 500, y: 0 }, { x: 500, y: 400 }, { x: 0, y: 400 }] }],
}

test('reloading the page shows the same home', async ({ page }) => {
  await page.goto('/')
  await ready(page)
  const changed = { ...(await getHome(page)), name: 'Reload test', plan: studio }
  await setHome(page, changed)

  await page.reload()
  await ready(page)
  expect(await getHome(page)).toEqual(changed)
})

test('a broken saved home falls back to the sample home with no error on screen', async ({ page }) => {
  const errors: Error[] = []
  page.on('pageerror', (e) => errors.push(e))
  await page.addInitScript(() => localStorage.setItem('drafthouse.home', '{broken'))
  await page.goto('/')
  await ready(page)

  const home = await getHome(page)
  expect(home.plan.rooms.map((r) => r.id)).toEqual(['living', 'bedroom'])
  expect(home.versions.map((v) => v.name)).toEqual(['As it is'])
  await expect(page.locator('#file-message')).toBeHidden()
  await expect(page.locator('#view canvas')).toBeVisible()
  expect(errors).toEqual([])
})

test('Export then Import of the same file gives an equal home', async ({ page }) => {
  await page.goto('/')
  await ready(page)
  const original = await getHome(page)

  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export' }).click()
  const download = await downloading
  expect(download.suggestedFilename()).toBe('home.drafthouse.json')
  const path = await download.path()

  await setHome(page, { ...original, plan: studio })
  expect((await getHome(page)).plan).toEqual(studio)

  const choosing = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Import' }).click()
  await (await choosing).setFiles(path)
  await expect.poll(() => getHome(page)).toEqual(original)
  await expect(page.locator('#file-message')).toBeHidden()

  // The export is named after the home when it has a name.
  await setHome(page, { ...original, name: 'Flat' })
  const named = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export' }).click()
  expect((await named).suggestedFilename()).toBe('Flat.drafthouse.json')
  expect(JSON.parse(await readFile(path, 'utf8'))).toEqual(original)
})

test('a file that is not a home shows a translated message and keeps the current home', async ({ page }) => {
  await page.goto('/')
  await ready(page)
  const before = await getHome(page)

  const choosing = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Import' }).click()
  await (await choosing).setFiles({ name: 'notes.drafthouse.json', mimeType: 'application/json', buffer: Buffer.from('{') })

  const message = page.getByRole('alert')
  await expect(message).toHaveText('That file could not be read: it is not a DraftHouse file.')
  expect(await getHome(page)).toEqual(before)
  await page.screenshot({ path: 'test-results/import-error.png' })

  await page.locator('#language').selectOption('es')
  await expect(message).toHaveText('No se pudo leer ese archivo: no es un archivo de DraftHouse.')
  await expect(page.getByRole('button', { name: 'Importar' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Exportar' })).toBeVisible()

  const again = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Importar' }).click()
  await (await again).setFiles({ name: 'future.drafthouse.json', mimeType: 'application/json', buffer: Buffer.from('{"formatVersion": 99}') })
  await expect(message).toHaveText('Ese archivo se guardó con una versión más reciente de DraftHouse.')
  expect(await getHome(page)).toEqual(before)
})
