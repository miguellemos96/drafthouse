import { test, expect, type Page } from '@playwright/test'
import type { Home } from '../src/model/home.ts'

// The sample home: the living room spans x 0–400, the bedroom x 400–700, both z 0–300 and 250 high.
// They share the wall x = 400, which is the living room's Wall 2: its corners run (0,0), (400,0), (400,300), (0,300).
// (60, 270) is bare living-room floor.

const frames = (page: Page) =>
  page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))))

const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('drafthouse.home')!) as Home)

const click = async (page: Page, x: number, y: number, z: number) => {
  const at = await page.evaluate(([x, y, z]) => window.drafthouse.toScreen(x, y, z), [x, y, z])
  await page.mouse.click(at.x, at.y)
}

test('set a tile floor and paint a shared wall blue', async ({ page }, testInfo) => {
  test.slow() // several rebuilds of the scene, rendered in software
  await page.goto('/')
  await page.waitForFunction(() => window.drafthouse !== undefined)
  await page.getByRole('button', { name: 'Top view' }).click()
  await frames(page)
  await click(page, 60, 0, 270)
  expect(await page.evaluate(() => window.drafthouse.selectedRoomId())).toBe('living')

  const panel = page.locator('#room-panel')
  // A new room has a wood floor and off-white walls.
  await expect(page.locator('#room-panel-floor')).toHaveValue('wood')
  await expect(panel.getByLabel('Floor colour')).toHaveValue('#d9c6a5')
  // The walls fold away until opened.
  await expect(panel.getByLabel('Wall 1 (400 cm)')).toBeHidden()
  await panel.getByText('Walls', { exact: true }).click()
  const walls = panel.locator('#room-panel-walls li')
  await expect(walls).toHaveText(['Wall 1 (400 cm)', 'Wall 2 (300 cm)', 'Wall 3 (400 cm)', 'Wall 4 (300 cm)'])
  await expect(panel.getByLabel('Wall 2 (300 cm)')).toHaveValue('#f2efe9')

  const undoSteps = () => page.evaluate(() => window.drafthouse.store.canUndo())
  await page.locator('#room-panel-floor').selectOption('tile')
  await panel.getByLabel('Wall 2 (300 cm)').fill('#3366cc')
  await frames(page)

  const home = await saved(page)
  const finishes = home.versions[0].finishes!
  expect(finishes.rooms!.living.floor).toBe('tile')
  expect(Object.values(finishes.rooms!.living.walls!)).toEqual(['#3366cc'])
  // The bedroom's side of the shared wall stays off-white.
  expect(finishes.rooms!.bedroom).toBeUndefined()
  await expect(page.locator('#room-panel-floor')).toHaveValue('tile')
  await expect(panel.getByLabel('Wall 2 (300 cm)')).toHaveValue('#3366cc')

  // Each edit is one undo step: undoing the wall colour keeps the tile floor.
  expect(await undoSteps()).toBe(true)
  await page.evaluate(() => window.drafthouse.store.undo())
  await expect(panel.getByLabel('Wall 2 (300 cm)')).toHaveValue('#f2efe9')
  await expect(page.locator('#room-panel-floor')).toHaveValue('tile')
  await page.evaluate(() => window.drafthouse.store.redo())
  await expect(panel.getByLabel('Wall 2 (300 cm)')).toHaveValue('#3366cc')

  // The bedroom's panel shows its own, unpainted side of the shared wall.
  await click(page, 650, 0, 270)
  await expect(panel.getByLabel('Wall 4 (300 cm)')).toHaveValue('#f2efe9')
  await click(page, 60, 0, 270)

  // A shared wall always fades in the 3D view (it stands between the camera and one of its rooms), so for the
  // screenshot the living room's back wall, Wall 1 (z = 0), is painted too: it stays solid, facing the camera.
  await panel.getByLabel('Wall 1 (400 cm)').fill('#3366cc')
  await expect(panel.getByLabel('Wall 1 (400 cm)')).toHaveValue('#3366cc')
  // First with nothing selected, so the tile floor shows without the selection tint.
  await page.getByRole('button', { name: '3D view' }).click()
  await page.evaluate(() => {
    const { camera, controls } = window.drafthouse.rig
    camera.position.set(-380, 420, 520)
    controls.target.set(330, 0, 150)
    controls.update()
  })
  await page.keyboard.press('Escape')
  await frames(page)
  await frames(page)
  await page.screenshot({ path: 'test-results/finishes.png' })
  await testInfo.attach('finishes', { path: 'test-results/finishes.png', contentType: 'image/png' })

  // Hovering a wall's row in the panel highlights that wall in the view.
  await click(page, 60, 0, 270)
  await expect(panel).toBeVisible()
  await walls.nth(1).hover()
  await frames(page)
  await page.screenshot({ path: 'test-results/finishes-hover.png' })
  await testInfo.attach('finishes-hover', { path: 'test-results/finishes-hover.png', contentType: 'image/png' })
})
