import { test, expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'

// Focus on a room, and show or hide rooms ("Looking around" in docs/spec.md).
// The sample home: Room 1, the living room, spans x 0–400 and z 0–300 with the sofa and the table;
// the bedroom spans x 400–700 with the bed. Both are 250 high and share the wall at x = 400.

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
const target = (page: Page) => page.evaluate(() => window.drafthouse.rig.controls.target.toArray())
const shownItems = (page: Page) => page.evaluate(() => window.drafthouse.shownItemIds())

const exportFile = async (page: Page) => {
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export' }).click()
  return readFile((await (await downloading).path())!, 'utf8')
}

/** Waits out the focus move (about 400 ms). */
const settle = async (page: Page) => {
  await page.waitForTimeout(700)
  await frames(page)
}

/** True when every corner of the box from (x0, 0, z0) to (x1, height, z1) shows inside the window. */
const allInView = async (page: Page, x0: number, x1: number, z0: number, z1: number, height: number) => {
  const size = page.viewportSize()!
  for (const x of [x0, x1]) for (const z of [z0, z1]) for (const y of [0, height]) {
    const p = await screen(page, x, y, z)
    if (p.x < 0 || p.x > size.width || p.y < 0 || p.y > size.height) return false
  }
  return true
}

test('hiding Room 1 hides the sofa and table, is not saved or undone, and Show all brings them back', async ({ page }, testInfo) => {
  await ready(page)
  const before = await exportFile(page)
  expect(await shownItems(page)).toEqual(['sample-sofa', 'sample-table', 'sample-bed'])

  const list = page.locator('#rooms-list')
  await list.locator('summary').click()
  await expect(list.getByRole('button', { name: 'Living room', exact: true })).toBeVisible()
  await expect(list.getByRole('button', { name: 'Bedroom', exact: true })).toBeVisible()
  await list.getByRole('button', { name: 'Hide Living room' }).click()

  expect(await page.evaluate(() => window.drafthouse.hiddenRoomIds())).toEqual(['living'])
  expect(await shownItems(page)).toEqual(['sample-bed'])
  await expect(list.getByRole('button', { name: 'Show Living room' })).toHaveAttribute('aria-pressed', 'false')
  // A click where the sofa was finds nothing: it is hidden, and so is the floor under it.
  const sofa = await screen(page, 200, 40, 240)
  await page.mouse.click(sofa.x, sofa.y)
  expect(await page.evaluate(() => window.drafthouse.selectedItemId())).toBeNull()
  await frames(page)
  await page.screenshot({ path: 'test-results/room-hidden.png' })
  await testInfo.attach('room 1 hidden', { path: 'test-results/room-hidden.png', contentType: 'image/png' })

  // A view setting: no change to the home, nothing to undo, and the same exported file.
  expect(await changes(page)).toBe(0)
  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled()
  expect(await exportFile(page)).toBe(before)

  // Hiding both rooms hides everything; Show all shows everything again.
  await list.getByRole('button', { name: 'Hide Bedroom' }).click()
  expect(await shownItems(page)).toEqual([])
  await list.getByRole('button', { name: 'Show all' }).click()
  expect(await page.evaluate(() => window.drafthouse.hiddenRoomIds())).toEqual([])
  expect(await shownItems(page)).toEqual(['sample-sofa', 'sample-table', 'sample-bed'])
  expect(await changes(page)).toBe(0)
})

test('clicking a name in the rooms list selects the room', async ({ page }) => {
  await ready(page)
  const list = page.locator('#rooms-list')
  await list.locator('summary').click()
  await list.getByRole('button', { name: 'Bedroom', exact: true }).click()
  expect(await page.evaluate(() => window.drafthouse.selectedRoomId())).toBe('bedroom')
  await expect(page.locator('#room-panel')).toBeVisible()
})

test('Focus frames the room and the camera orbits around its centre, in the 3D view and the top view', async ({ page }) => {
  await ready(page)
  const living = await screen(page, 50, 0, 270)
  await page.mouse.click(living.x, living.y)
  expect(await page.evaluate(() => window.drafthouse.selectedRoomId())).toBe('living')
  const direction = await page.evaluate(() => {
    const { camera, controls } = window.drafthouse.rig
    return camera.position.clone().sub(controls.target).normalize().toArray()
  })

  await page.getByRole('button', { name: 'Focus' }).click()
  await settle(page)
  const [tx, , tz] = await target(page)
  expect(tx).toBeCloseTo(200)
  expect(tz).toBeCloseTo(150)
  expect(await allInView(page, 0, 400, 0, 300, 250)).toBe(true)
  // The camera kept its angle.
  const after = await page.evaluate(() => {
    const { camera, controls } = window.drafthouse.rig
    return camera.position.clone().sub(controls.target).normalize().toArray()
  })
  after.forEach((v, i) => expect(v).toBeCloseTo(direction[i], 3))
  await page.screenshot({ path: 'test-results/room-focus-3d.png' })

  // In the top view, double-clicking the bedroom looks straight down on it.
  await page.getByRole('button', { name: 'Top view' }).click()
  await frames(page)
  const bedroom = await screen(page, 650, 0, 270)
  await page.mouse.dblclick(bedroom.x, bedroom.y)
  await settle(page)
  const [bx, , bz] = await target(page)
  expect(bx).toBeCloseTo(550)
  expect(bz).toBeCloseTo(150)
  const camera = await page.evaluate(() => window.drafthouse.rig.camera.position.toArray())
  expect(camera[0]).toBeCloseTo(550)
  expect(camera[2]).toBeCloseTo(150, 0)
  expect(await allInView(page, 400, 700, 0, 300, 250)).toBe(true)
  expect(await changes(page)).toBe(0)
  await page.screenshot({ path: 'test-results/room-focus-top.png' })
})
