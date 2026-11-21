import { test, expect, type Page } from '@playwright/test'
import type { Home } from '../src/model/home.ts'

// The sample home has one version, "As it is"; its sofa stands at (200, 240).

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

/** The home as saved in the browser, so the checks cover autosave too. */
const saved = (page: Page): Promise<Home> => page.evaluate(() => JSON.parse(localStorage.getItem('drafthouse.home')!) as Home)
const savedVersion = async (page: Page, name: string) => (await saved(page)).versions.find((v) => v.name === name)!
const currentName = async (page: Page) => {
  const home = await saved(page)
  return home.versions.find((v) => v.id === home.currentVersionId)!.name
}

test('duplicating "As it is", moving the sofa in the copy and switching back leaves the sofa where it was', async ({ page }, testInfo) => {
  test.slow()
  await ready(page)
  const bar = page.locator('#versions')
  const select = bar.getByLabel('Version', { exact: true })
  await expect(select).toHaveValue(await page.evaluate(() => window.drafthouse.store.get().currentVersionId))
  await expect(select.locator('option')).toHaveText(['As it is'])
  // The only version can't be deleted.
  await expect(bar.getByRole('button', { name: 'Delete', exact: true })).toBeDisabled()

  await bar.getByRole('button', { name: 'Duplicate' }).click()
  expect(await changes(page)).toBe(1)
  await expect(select.locator('option')).toHaveText(['As it is', 'As it is (copy)'])
  expect(await currentName(page)).toBe('As it is (copy)')
  const original = await savedVersion(page, 'As it is')
  let copy = await savedVersion(page, 'As it is (copy)')
  expect(copy.items.map((i) => i.name)).toEqual(original.items.map((i) => i.name))
  expect(copy.items.some((i) => original.items.some((o) => o.id === i.id))).toBe(false)
  await expect(bar.getByRole('button', { name: 'Delete', exact: true })).toBeEnabled()

  // Move the sofa in the copy: select it first, then drag it in the top view.
  await page.getByRole('button', { name: 'Top view' }).click()
  await frames(page)
  const from = await screen(page, 200, 0, 240)
  const to = await screen(page, 300, 0, 200)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 10 })
  await page.mouse.up()
  copy = await savedVersion(page, 'As it is (copy)')
  const sofa = copy.items.find((i) => i.name === 'Sofa')!
  expect(sofa.position.x).toBeCloseTo(300, 0)
  expect(await page.evaluate(() => window.drafthouse.selectedItemId())).toBe(sofa.id)
  await frames(page)
  await page.screenshot({ path: 'test-results/versions-copy.png' })
  await testInfo.attach('versions-copy', { path: 'test-results/versions-copy.png', contentType: 'image/png' })

  // Switch back: one change, the selection is cleared, and the sofa in "As it is" never moved.
  const beforeSwitch = await changes(page)
  await select.selectOption({ label: 'As it is' })
  expect(await changes(page)).toBe(beforeSwitch + 1)
  expect(await currentName(page)).toBe('As it is')
  expect(await page.evaluate(() => window.drafthouse.selectedItemId())).toBeNull()
  const asItIs = await savedVersion(page, 'As it is')
  expect(asItIs.items.find((i) => i.name === 'Sofa')!.position).toEqual({ x: 200, z: 240 })
  const drawn = await page.evaluate(() => window.drafthouse.store.get())
  expect(drawn.currentVersionId).toBe(asItIs.id)

  // Undoing the switch switches back to the copy.
  await page.locator('#undo').click()
  expect(await currentName(page)).toBe('As it is (copy)')
  await expect(select).toHaveValue(copy.id)
})

test('rename, and delete with confirmation; undo brings the deleted version back as the current one', async ({ page }, testInfo) => {
  await ready(page)
  const bar = page.locator('#versions')
  const select = bar.getByLabel('Version', { exact: true })
  await bar.getByRole('button', { name: 'Duplicate' }).click()

  // Rename: Escape cancels, Enter saves as one change.
  await bar.getByRole('button', { name: 'Rename' }).click()
  const name = bar.getByLabel('Version name')
  await expect(name).toHaveValue('As it is (copy)')
  await name.fill('New kitchen')
  await expect(bar.getByRole('button', { name: 'Duplicate' })).toBeHidden()
  await name.press('Escape')
  await expect(name).toBeHidden()
  expect(await currentName(page)).toBe('As it is (copy)')
  await bar.getByRole('button', { name: 'Rename' }).click()
  await name.fill('New kitchen')
  await name.press('Enter')
  expect(await changes(page)).toBe(2)
  expect(await currentName(page)).toBe('New kitchen')
  await expect(select.locator('option')).toHaveText(['As it is', 'New kitchen'])

  // Delete asks first; Cancel keeps the version.
  await bar.getByRole('button', { name: 'Delete', exact: true }).click()
  const confirm = page.locator('#version-confirm')
  await expect(confirm).toBeVisible()
  await expect(confirm).toContainText('Delete the version "New kitchen"')
  // While it asks, the other actions are out of the way.
  await expect(bar.getByRole('button', { name: 'Duplicate' })).toBeHidden()
  await page.screenshot({ path: 'test-results/versions-confirm.png' })
  await testInfo.attach('versions-confirm', { path: 'test-results/versions-confirm.png', contentType: 'image/png' })
  await confirm.getByRole('button', { name: 'Cancel' }).click()
  await expect(confirm).toBeHidden()
  expect(await changes(page)).toBe(2)

  // Deleting the current version switches to the first remaining one.
  await bar.getByRole('button', { name: 'Delete', exact: true }).click()
  await confirm.getByRole('button', { name: 'Delete version' }).click()
  expect(await changes(page)).toBe(3)
  expect((await saved(page)).versions.map((v) => v.name)).toEqual(['As it is'])
  expect(await currentName(page)).toBe('As it is')
  await expect(bar.getByRole('button', { name: 'Delete', exact: true })).toBeDisabled()

  await page.locator('#undo').click()
  expect((await saved(page)).versions.map((v) => v.name)).toEqual(['As it is', 'New kitchen'])
  expect(await currentName(page)).toBe('New kitchen')
  await expect(select.locator('option:checked')).toHaveText('New kitchen')
})

test('the version bar shows in Spanish and Portuguese', async ({ page }) => {
  await ready(page)
  const bar = page.locator('#versions')
  await page.getByLabel('Language').selectOption('es')
  await expect(bar.getByLabel('Versión', { exact: true })).toBeVisible()
  await expect(bar.getByRole('button', { name: 'Duplicar' })).toBeVisible()
  await expect(bar.getByRole('button', { name: 'Renombrar' })).toBeVisible()
  await page.getByLabel('Idioma').selectOption('pt')
  await expect(bar.getByLabel('Versão', { exact: true })).toBeVisible()
  await bar.getByRole('button', { name: 'Duplicar' }).click()
  await expect(bar.locator('option:checked')).toHaveText('As it is (cópia)')
})
