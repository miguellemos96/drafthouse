import { test, expect, type Page } from '@playwright/test'
import type { Home } from '../src/model/home.ts'

// The sample home: the living room spans x 0–400, the bedroom x 400–700, both z 0–300.
// New rooms are drawn on bare floor to the right of it, x 800–1100 and z -200–200.

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

const screen = (page: Page, x: number, z: number) => page.evaluate(([x, z]) => window.drafthouse.toScreen(x, 0, z), [x, z])
const changes = (page: Page) => page.evaluate(() => (window as unknown as { changes: number }).changes)
const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('drafthouse.home')!) as Home)
const roomCount = (page: Page) => page.evaluate(() => window.drafthouse.store.get().plan.rooms.length)

const clickFloor = async (page: Page, x: number, z: number) => {
  const at = await screen(page, x, z)
  await page.mouse.click(at.x, at.y)
}

const drag = async (page: Page, from: [number, number], to: [number, number]) => {
  const a = await screen(page, ...from)
  const b = await screen(page, ...to)
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  await page.mouse.move(b.x, b.y, { steps: 8 })
  await page.mouse.up()
}

const L_SHAPE: [number, number][] = [
  [800, -200],
  [1100, -200],
  [1100, 0],
  [950, 0],
  [950, 200],
  [800, 200],
]

test('draw an L-shaped room with the R key from the 3D view, then drag one corner', async ({ page }) => {
  test.slow() // many rebuilds of the scene, rendered in software
  await ready(page)
  expect(await page.evaluate(() => window.drafthouse.rig.isTopView())).toBe(false)

  // R in the 3D view switches to the top view and starts drawing.
  await page.keyboard.press('r')
  expect(await page.evaluate(() => window.drafthouse.rig.isTopView())).toBe(true)
  await expect(page.getByRole('button', { name: 'Draw room' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('#draw-room-hint')).toBeVisible()
  await frames(page)

  await clickFloor(page, ...L_SHAPE[0])
  // The live line follows the pointer from the last corner, with its length; 2 cm off the 0° line snaps onto it.
  const pointer = await screen(page, 1100, -198)
  await page.mouse.move(pointer.x, pointer.y)
  await expect(page.locator('.measure-label[data-kind="sketch"]')).toHaveText('3 m')

  for (const corner of L_SHAPE.slice(1)) await clickFloor(page, ...corner)
  await frames(page)
  await page.screenshot({ path: 'test-results/draw-room-sketch.png' })
  // Back on the first corner: the room closes, as one change.
  await clickFloor(page, ...L_SHAPE[0])

  const home = await saved(page)
  expect(home.plan.rooms).toHaveLength(3)
  const room = home.plan.rooms[2]
  expect(room.name).toBe('Room 3')
  expect(room.height).toBe(250)
  expect(room.corners).toEqual(L_SHAPE.map(([x, y]) => ({ x, y })))
  expect(await changes(page)).toBe(1)
  await expect(page.getByRole('button', { name: 'Draw room' })).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('.measure-label[data-kind="sketch"]')).toHaveCount(0)

  // Select it, and drag the end of its leg 50 cm further: one change, only that corner moves.
  // A floor point not hidden behind the room's own walls, seen in perspective from above.
  await clickFloor(page, 1050, -150)
  expect(await page.evaluate(() => window.drafthouse.selectedRoomId())).toBe(room.id)
  await frames(page)
  await drag(page, [950, 200], [952, 250])
  const moved = (await saved(page)).plan.rooms[2]
  expect(moved.corners).toEqual(L_SHAPE.map(([x, y]) => (x === 950 && y === 200 ? { x: 950, y: 250 } : { x, y })))
  expect(await changes(page)).toBe(2)
  expect(await page.evaluate(() => window.drafthouse.selectedRoomId())).toBe(room.id)
  await frames(page)
  await page.screenshot({ path: 'test-results/draw-room-dragged.png' })
})

test('dragging a corner shared by two rooms moves it in both', async ({ page }) => {
  await ready(page)
  await page.getByRole('button', { name: 'Top view' }).click()
  await frames(page)
  await clickFloor(page, 650, 270) // bare bedroom floor
  expect(await page.evaluate(() => window.drafthouse.selectedRoomId())).toBe('bedroom')
  await frames(page)
  await drag(page, [400, 300], [430, 302])
  const { rooms } = (await saved(page)).plan
  expect(rooms[0].corners).toContainEqual({ x: 430, y: 300 })
  expect(rooms[1].corners).toContainEqual({ x: 430, y: 300 })
  expect(await changes(page)).toBe(1)
})

test('a bow-tie outline is refused with a message; Backspace and Escape', async ({ page }) => {
  await ready(page)
  await page.getByRole('button', { name: 'Draw room' }).click()
  expect(await page.evaluate(() => window.drafthouse.rig.isTopView())).toBe(true)
  await frames(page)

  for (const corner of [[800, -200], [1100, 100], [1100, -200], [800, 100], [800, -200]] as [number, number][]) await clickFloor(page, ...corner)
  await expect(page.locator('#draw-room-message')).toHaveText('A room’s walls must not cross each other.')
  expect(await roomCount(page)).toBe(2)

  // Backspace removes the last corner; the outline is now (800,-200), (1100,100), (1100,-200).
  await page.keyboard.press('Backspace')
  await expect(page.locator('#draw-room-message')).toBeHidden()
  await clickFloor(page, 800, -200)
  const triangle = (await saved(page)).plan.rooms[2]
  expect(triangle.corners).toEqual([{ x: 800, y: -200 }, { x: 1100, y: 100 }, { x: 1100, y: -200 }])

  // Escape cancels a drawing and adds nothing.
  await page.keyboard.press('r')
  await clickFloor(page, 800, 150)
  await clickFloor(page, 1000, 150)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Draw room' })).toHaveAttribute('aria-pressed', 'false')
  expect(await roomCount(page)).toBe(3)
  expect(await changes(page)).toBe(1)
})
