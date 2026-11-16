import { test, expect, type Page } from '@playwright/test'
import type { Home } from '../src/model/home.ts'

// The sample home: the living room spans x 0–400, the bedroom x 400–700, both z 0–300 and 250 high.
// The bed stands in the bedroom at (550, 115), 160 wide and 210 deep, so (650, 270) is bare bedroom floor.

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
const selectedRoom = (page: Page) => page.evaluate(() => window.drafthouse.selectedRoomId())
const selectedItem = (page: Page) => page.evaluate(() => window.drafthouse.selectedItemId())
const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('drafthouse.home')!) as Home)

const click = async (page: Page, x: number, y: number, z: number) => {
  const at = await screen(page, x, y, z)
  await page.mouse.click(at.x, at.y)
}

test('select the second sample room, rename it, change its height and delete it', async ({ page }) => {
  await ready(page)
  await page.getByRole('button', { name: 'Top view' }).click()
  await frames(page)
  // A second version, so the delete can be checked in every version.
  await page.evaluate(() => {
    const { store } = window.drafthouse
    const home = store.get()
    const items = home.versions[0].items.map((i) => ({ ...i }))
    store.set({ ...home, versions: [...home.versions, { id: 'plan-a', name: 'Plan A', items }] })
  })
  const before = await changes(page)

  await click(page, 650, 0, 270)
  expect(await selectedRoom(page)).toBe('bedroom')
  const panel = page.locator('#room-panel')
  await expect(panel).toBeVisible()
  await expect(panel.getByLabel('Name')).toHaveValue('Bedroom')
  await expect(page.locator('#room-panel-area')).toHaveText('9 m²')
  await frames(page)
  await page.screenshot({ path: 'test-results/room-selected.png' })

  // Clicking an item selects it and clears the room; clicking the floor again swaps back.
  await click(page, 550, 100, 115)
  expect(await selectedItem(page)).toBe('sample-bed')
  expect(await selectedRoom(page)).toBeNull()
  await expect(panel).toBeHidden()
  await click(page, 650, 0, 270)
  expect(await selectedRoom(page)).toBe('bedroom')
  expect(await selectedItem(page)).toBeNull()

  await panel.getByLabel('Name').fill('Room 2')
  await panel.getByLabel('Name').press('Enter')
  expect((await saved(page)).plan.rooms[1].name).toBe('Room 2')
  expect(await changes(page)).toBe(before + 1)

  const heightBox = panel.getByLabel('Wall height (cm)')
  await heightBox.fill('120')
  await heightBox.press('Enter')
  await expect(page.locator('#room-panel-message')).toHaveText('The height must be from 180 to 500 cm.')
  expect((await saved(page)).plan.rooms[1].height).toBe(250)
  expect(await changes(page)).toBe(before + 1)

  await heightBox.fill('270')
  await heightBox.press('Enter')
  await expect(page.locator('#room-panel-message')).toBeHidden()
  expect((await saved(page)).plan.rooms[1].height).toBe(270)
  expect(await changes(page)).toBe(before + 2)
  // The walls drawn from that height are checked in the model tests; this shows them in the orbit view.
  await page.getByRole('button', { name: '3D view' }).click()
  await frames(page)
  await page.screenshot({ path: 'test-results/room-height-270.png' })
  await page.getByRole('button', { name: 'Top view' }).click()
  await frames(page)

  await page.getByRole('button', { name: 'Delete room' }).click()
  await expect(page.getByRole('alertdialog')).toContainText('Delete “Room 2”? 2 items inside it go with it, in every version.')
  await page.screenshot({ path: 'test-results/room-delete-confirm.png' })
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('alertdialog')).toBeHidden()
  expect((await saved(page)).plan.rooms).toHaveLength(2)

  await page.getByRole('button', { name: 'Delete room' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click()
  const afterDelete = await saved(page)
  expect(afterDelete.plan.rooms.map((r) => r.id)).toEqual(['living'])
  for (const version of afterDelete.versions) expect(version.items.map((i) => i.id)).not.toContain('sample-bed')
  expect(await changes(page)).toBe(before + 3)
  expect(await selectedRoom(page)).toBeNull()
  await expect(panel).toBeHidden()

  // One undo brings back the room and the bed.
  await page.getByRole('button', { name: 'Undo' }).click()
  const undone = await saved(page)
  expect(undone.plan.rooms.map((r) => r.name)).toEqual(['Living room', 'Room 2'])
  for (const version of undone.versions) expect(version.items.map((i) => i.id)).toContain('sample-bed')
})

test('Escape and a click outside every room clear the room selection', async ({ page }) => {
  await ready(page)
  await click(page, 50, 0, 270)
  expect(await selectedRoom(page)).toBe('living')
  await page.keyboard.press('Escape')
  expect(await selectedRoom(page)).toBeNull()
  await expect(page.locator('#room-panel')).toBeHidden()

  await click(page, 50, 0, 270)
  expect(await selectedRoom(page)).toBe('living')
  await click(page, 200, 0, 600)
  expect(await selectedRoom(page)).toBeNull()
  expect(await changes(page)).toBe(0)
})
