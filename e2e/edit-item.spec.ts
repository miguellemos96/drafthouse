import { test, expect, type Page } from '@playwright/test'
import type { Home } from '../src/model/home.ts'
import type { Item } from '../src/model/item.ts'

// The sample home: the table is 160 × 90 × 75, at (200, 100); the sofa at (200, 240).

const ready = async (page: Page) => {
  await page.goto('/')
  await page.waitForFunction(() => window.drafthouse !== undefined)
  await page.evaluate(() => {
    const w = window as unknown as { changes: number }
    w.changes = 0
    window.drafthouse.store.subscribe(() => w.changes++)
  })
  await frames(page)
}

const frames = (page: Page) =>
  page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))))

const screen = (page: Page, x: number, y: number, z: number) => page.evaluate(([x, y, z]) => window.drafthouse.toScreen(x, y, z), [x, y, z])
const changes = (page: Page) => page.evaluate(() => (window as unknown as { changes: number }).changes)
const selected = (page: Page) => page.evaluate(() => window.drafthouse.selectedItemId())

/** The items as saved in the browser, so the checks cover autosave too. */
const savedItems = (page: Page): Promise<Item[]> =>
  page.evaluate(() => {
    const home = JSON.parse(localStorage.getItem('drafthouse.home')!) as Home
    return home.versions.find((v) => v.id === home.currentVersionId)!.items
  })

const clickTable = async (page: Page) => {
  // The walls in front fade on the next drawn frame after the home changes; until then they block clicks.
  await frames(page)
  const table = await screen(page, 200, 75, 100)
  await page.mouse.click(table.x, table.y)
  expect(await selected(page)).toBe('sample-table')
}

test('the sample table is renamed, resized, duplicated and the copy deleted, each as one saved change', async ({ page }, testInfo) => {
  test.slow() // many steps, each drawn in software WebGL: slow while other specs run alongside
  await ready(page)
  const panel = page.locator('#item-panel')
  await expect(panel).toBeHidden()
  await clickTable(page)
  await expect(panel).toBeVisible()
  // The table has no product: no photo and no link.
  await expect(panel.locator('#item-photo')).toBeHidden()
  await expect(panel.locator('#item-link')).toBeHidden()

  const name = panel.getByLabel('Name')
  await expect(name).toHaveValue('Table')
  await expect(panel.getByLabel('Width (cm)')).toHaveValue('160')
  await expect(panel.getByLabel('Depth (cm)')).toHaveValue('90')
  await expect(panel.getByLabel('Height (cm)')).toHaveValue('75')
  await expect(panel.getByLabel('Colour')).toHaveValue('#a0522d')

  // Rename: typing changes nothing until Enter, then it's one change.
  await name.fill('Dining table')
  expect(await changes(page)).toBe(0)
  // Typing "Delete" and Backspace in the field doesn't delete the item.
  await name.press('Backspace')
  await name.press('Delete')
  await name.fill('Dining table')
  await name.press('Enter')
  expect(await changes(page)).toBe(1)
  let table = (await savedItems(page)).find((i) => i.id === 'sample-table')!
  expect(table.name).toBe('Dining table')

  // One undo brings back "Table".
  await page.locator('#undo').click()
  await expect(name).toHaveValue('Table')
  table = (await savedItems(page)).find((i) => i.id === 'sample-table')!
  expect(table.name).toBe('Table')
  await page.locator('#redo').click()
  await expect(name).toHaveValue('Dining table')
  const afterRename = await changes(page)

  // An invalid size shows a message and isn't saved.
  const width = panel.getByLabel('Width (cm)')
  await width.fill('5000')
  await width.press('Enter')
  await expect(page.locator('#item-panel-message')).toHaveText('Each size must be from 1 to 1000 cm.')
  await expect(width).toHaveAttribute('aria-invalid', 'true')
  expect(await changes(page)).toBe(afterRename)

  // Resize to 200 wide: one change, still centred at (200, 100).
  await width.fill('200')
  await width.press('Enter')
  await expect(page.locator('#item-panel-message')).toBeHidden()
  expect(await changes(page)).toBe(afterRename + 1)
  table = (await savedItems(page)).find((i) => i.id === 'sample-table')!
  expect(table.size).toEqual({ width: 200, depth: 90, height: 75 })
  expect(table.position).toEqual({ x: 200, z: 100 })
  await page.screenshot({ path: 'test-results/edit-item-panel.png' })
  await testInfo.attach('edit-item-panel', { path: 'test-results/edit-item-panel.png', contentType: 'image/png' })

  // Duplicate with the button: a copy, 20 cm right and 20 cm towards the camera, selected.
  await panel.getByRole('button', { name: 'Duplicate' }).click()
  let items = await savedItems(page)
  expect(items).toHaveLength(4)
  const copy = items.find((i) => i.name === 'Dining table (2)')!
  expect(copy.id).not.toBe('sample-table')
  expect(copy.size).toEqual(table.size)
  expect(Math.hypot(copy.position.x - 200, copy.position.z - 100)).toBeCloseTo(20 * Math.SQRT2, 0)
  expect(await selected(page)).toBe(copy.id)
  await expect(name).toHaveValue('Dining table (2)')
  await frames(page)
  await page.screenshot({ path: 'test-results/edit-item-duplicate.png' })
  await testInfo.attach('edit-item-duplicate', { path: 'test-results/edit-item-duplicate.png', contentType: 'image/png' })

  // Delete the copy with the button: gone, nothing selected.
  await panel.getByRole('button', { name: 'Delete' }).click()
  items = await savedItems(page)
  expect(items.map((i) => i.id)).toEqual(['sample-sofa', 'sample-table', 'sample-bed'])
  expect(await selected(page)).toBeNull()
  await expect(panel).toBeHidden()
})

test('Ctrl+D duplicates the selected sofa; Delete removes an item and Ctrl+Z brings it back', async ({ page }) => {
  await ready(page)
  const sofaAt = await screen(page, 200, 60, 240)
  await page.mouse.click(sofaAt.x, sofaAt.y)
  expect(await selected(page)).toBe('sample-sofa')

  await page.keyboard.press('Control+d')
  let items = await savedItems(page)
  const copy = items.find((i) => i.name === 'Sofa (2)')!
  expect(copy).toBeDefined()
  expect(await selected(page)).toBe(copy.id)
  expect(await changes(page)).toBe(1)

  await clickTable(page)
  await page.keyboard.press('Delete')
  items = await savedItems(page)
  expect(items.find((i) => i.id === 'sample-table')).toBeUndefined()
  expect(await selected(page)).toBeNull()

  await page.keyboard.press('Control+z')
  items = await savedItems(page)
  expect(items.find((i) => i.id === 'sample-table')?.name).toBe('Table')
  expect(await changes(page)).toBe(3)

  // Backspace deletes too.
  await clickTable(page)
  await page.keyboard.press('Backspace')
  expect((await savedItems(page)).find((i) => i.id === 'sample-table')).toBeUndefined()
})

test('the panel shows in Spanish', async ({ page }) => {
  await ready(page)
  await clickTable(page)
  await page.getByLabel('Language').selectOption('es')
  const panel = page.locator('#item-panel')
  await expect(panel.getByRole('button', { name: 'Duplicar' })).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Eliminar' })).toBeVisible()
})
