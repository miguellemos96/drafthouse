import { test, expect, type Page } from '@playwright/test'
import type { Home } from '../src/model/home.ts'

const ready = (page: Page) => page.waitForFunction(() => window.drafthouse !== undefined)
const getHome = (page: Page): Promise<Home> => page.evaluate(() => window.drafthouse.store.get())
const items = async (page: Page) => {
  const home = await getHome(page)
  return home.versions.find((v) => v.id === home.currentVersionId)!.items.map((i) => i.id)
}
const savedHome = (page: Page): Promise<Home> => page.evaluate(() => JSON.parse(localStorage.getItem('drafthouse.home')!))

/** Adds a copy of the first item of the current version, as one change. */
const addItem = (page: Page, id: string) =>
  page.evaluate((newId) => {
    const { store } = window.drafthouse
    const home = store.get()
    const versions = home.versions.map((v) =>
      v.id === home.currentVersionId ? { ...v, items: [...v.items, { ...v.items[0]!, id: newId }] } : v,
    )
    store.set({ ...home, versions })
  }, id)

test('add an item, then undo and redo with the keys and the buttons; an undo is saved', async ({ page }, testInfo) => {
  await page.goto('/')
  await ready(page)
  const undo = page.getByRole('button', { name: 'Undo' })
  const redo = page.getByRole('button', { name: 'Redo' })
  await expect(undo).toBeDisabled()
  await expect(redo).toBeDisabled()
  const before = await items(page)

  await addItem(page, 'extra')
  expect(await items(page)).toEqual([...before, 'extra'])
  await expect(undo).toBeEnabled()
  await expect(redo).toBeDisabled()

  await page.locator('#view canvas').click({ position: { x: 5, y: 300 } })
  await page.keyboard.press('Control+z')
  expect(await items(page)).toEqual(before)
  await expect(undo).toBeDisabled()
  await expect(redo).toBeEnabled()

  await page.keyboard.press('Control+y')
  expect(await items(page)).toEqual([...before, 'extra'])
  await page.keyboard.press('Control+z')
  await page.keyboard.press('Control+Shift+z')
  expect(await items(page)).toEqual([...before, 'extra'])

  await undo.click()
  expect(await items(page)).toEqual(before)
  await page.screenshot({ path: 'test-results/undo-redo.png' })
  await testInfo.attach('undo-redo', { path: 'test-results/undo-redo.png', contentType: 'image/png' })
  await redo.click()
  expect(await items(page)).toEqual([...before, 'extra'])

  // An undo is saved like any other change; a reload starts a fresh history.
  await undo.click()
  expect((await savedHome(page)).versions[0]!.items.map((i) => i.id)).toEqual(before)
  await page.reload()
  await ready(page)
  expect(await items(page)).toEqual(before)
  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Redo' })).toBeDisabled()
})

test('Ctrl+Z while typing in a text field does not undo a home change', async ({ page }) => {
  await page.goto('/')
  await ready(page)
  await addItem(page, 'extra')

  const name = page.locator('#add-room').getByLabel('Name')
  await name.fill('')
  await name.pressSequentially('Kitchen')
  await name.press('Control+z')
  expect(await items(page)).toContain('extra')
  await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled()
})

test('undoing an Import brings back the previous home', async ({ page }) => {
  await page.goto('/')
  await ready(page)
  const previous = await getHome(page)
  const imported = { ...previous, name: 'Imported', plan: { rooms: [] } }

  const choosing = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Import' }).click()
  await (await choosing).setFiles({ name: 'other.drafthouse.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(imported)) })
  await expect.poll(() => getHome(page)).toEqual(imported)

  await page.getByRole('button', { name: 'Undo' }).click()
  expect(await getHome(page)).toEqual(previous)
})

test('the buttons are translated', async ({ page }) => {
  await page.goto('/')
  await ready(page)
  await page.locator('#language').selectOption('es')
  await expect(page.getByRole('button', { name: 'Deshacer' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Rehacer' })).toBeVisible()
  await page.locator('#language').selectOption('pt')
  await expect(page.getByRole('button', { name: 'Anular' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Refazer' })).toBeVisible()
})
