import { test, expect, type Page } from '@playwright/test'
import type { Home } from '../src/model/home.ts'
import type { Opening } from '../src/model/openings.ts'

// The sample home: the living room is 0–400 × 0–300 and the bedroom 400–700 × 0–300, both 250 cm high.
// They share the wall at x = 400, which runs from (400, 0) to (400, 300).

const frames = (page: Page) =>
  page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))))

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

const screen = (page: Page, x: number, y: number, z: number) => page.evaluate(([x, y, z]) => window.drafthouse.toScreen(x, y, z), [x, y, z])
const changes = (page: Page) => page.evaluate(() => (window as unknown as { changes: number }).changes)

/** The openings as saved in the browser, so the checks cover autosave too. */
const savedOpenings = (page: Page): Promise<Opening[]> =>
  page.evaluate(() => (JSON.parse(localStorage.getItem('drafthouse.home')!) as Home).plan.openings ?? [])

/** Clicks the top of a wall, which is what the top view shows of it. */
const clickWallTop = async (page: Page, x: number, z: number) => {
  await frames(page)
  const at = await screen(page, x, 250, z)
  await page.mouse.click(at.x, at.y)
}

test('a door and a window are added in the top view, dragged, edited and undone, each as one saved change', async ({ page }, testInfo) => {
  test.slow() // many steps, each drawn in software WebGL
  await ready(page)

  // The buttons only show in the top view.
  await expect(page.getByRole('button', { name: 'Add door' })).toBeHidden()
  await page.getByRole('button', { name: 'Top view' }).click()
  const addDoor = page.getByRole('button', { name: 'Add door' })
  const addWindow = page.getByRole('button', { name: 'Add window' })
  await expect(addDoor).toBeVisible()

  // A door on the shared wall, clicked 150 cm along it: 80 × 210, sill 0, centred there.
  await addDoor.click()
  await expect(addDoor).toHaveAttribute('aria-pressed', 'true')
  await clickWallTop(page, 400, 150)
  await expect.poll(() => savedOpenings(page)).toHaveLength(1)
  const [door] = await savedOpenings(page)
  expect(door).toMatchObject({ kind: 'door', offset: 110, width: 80, height: 210, sillHeight: 0, hinge: 'start', swing: 'in' })
  expect(await changes(page)).toBe(1)
  await expect(addDoor).toHaveAttribute('aria-pressed', 'false')

  // It's selected: its panel shows the sizes.
  const panel = page.locator('#opening-panel')
  await expect(panel).toBeVisible()
  await expect(panel.getByLabel('Width (cm)')).toHaveValue('80')
  await expect(panel.getByLabel('Height (cm)', { exact: true })).toHaveValue('210')
  await expect(panel.getByLabel('Sill height (cm)')).toBeDisabled()

  // A window on the living room's front wall: 120 × 120, sill 90.
  await addWindow.click()
  await clickWallTop(page, 200, 0)
  await expect.poll(() => savedOpenings(page)).toHaveLength(2)
  const window_ = (await savedOpenings(page)).find((o) => o.kind === 'window')!
  expect(window_).toMatchObject({ width: 120, height: 120, sillHeight: 90 })
  expect(await changes(page)).toBe(2)
  await expect(panel.locator('h2')).toHaveText('Window')
  await expect(panel.getByRole('button', { name: 'Flip hinge' })).toBeHidden()

  // Sill 90 + height 200 is more than the 250 cm wall: refused with a message, nothing saved.
  await panel.getByLabel('Height (cm)', { exact: true }).fill('200')
  await panel.getByLabel('Height (cm)', { exact: true }).press('Enter')
  await expect(panel.locator('#opening-panel-message')).toContainText('250 cm')
  expect(await changes(page)).toBe(2)
  await panel.getByLabel('Height (cm)', { exact: true }).fill('140')
  await panel.getByLabel('Height (cm)', { exact: true }).press('Enter')
  await expect.poll(async () => (await savedOpenings(page)).find((o) => o.kind === 'window')!.height).toBe(140)
  expect(await changes(page)).toBe(3)

  // Drag the door past the wall's far end: it stops with its edge at the end, as one change.
  await frames(page)
  const from = await screen(page, 400, 250, 150)
  const past = await screen(page, 400, 250, 450)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move((from.x + past.x) / 2, (from.y + past.y) / 2, { steps: 4 })
  await page.mouse.move(past.x, past.y, { steps: 4 })
  expect(await changes(page)).toBe(3) // nothing saved mid-drag
  await page.mouse.up()
  await expect.poll(async () => (await savedOpenings(page)).find((o) => o.kind === 'door')!.offset).toBe(220)
  expect(await changes(page)).toBe(4)
  expect(await page.evaluate(() => window.drafthouse.selectedOpeningId())).toBe(door.id)

  // Flip the swing: the door now opens into the other room.
  await panel.getByRole('button', { name: 'Flip swing' }).click()
  await expect.poll(async () => (await savedOpenings(page)).find((o) => o.kind === 'door')).toMatchObject({ swing: 'out' })
  expect(await changes(page)).toBe(5)

  await frames(page)
  await testInfo.attach('top view', { body: await page.screenshot({ path: 'test-results/doors-windows-top.png' }), contentType: 'image/png' })

  // In the 3D view the buttons hide, and both holes show.
  await page.getByRole('button', { name: '3D view' }).click()
  await expect(addDoor).toBeHidden()
  await frames(page)
  await testInfo.attach('3D view', { body: await page.screenshot({ path: 'test-results/doors-windows-3d.png' }), contentType: 'image/png' })

  // Undo steps back through each change: swing, drag, window height, window, door.
  await page.keyboard.press('Control+z')
  await expect.poll(async () => (await savedOpenings(page)).find((o) => o.kind === 'door')).toMatchObject({ swing: 'in', offset: 220 })
  await page.keyboard.press('Control+z')
  await expect.poll(async () => (await savedOpenings(page)).find((o) => o.kind === 'door')!.offset).toBe(110)
  await page.keyboard.press('Control+z')
  await page.keyboard.press('Control+z')
  await expect.poll(() => savedOpenings(page)).toHaveLength(1)
  await page.keyboard.press('Control+z')
  await expect.poll(() => savedOpenings(page)).toHaveLength(0)
})

test('the selected door is deleted from its panel', async ({ page }) => {
  await ready(page)
  await page.getByRole('button', { name: 'Top view' }).click()
  await page.getByRole('button', { name: 'Add door' }).click()
  await clickWallTop(page, 200, 300)
  await expect.poll(() => savedOpenings(page)).toHaveLength(1)
  await page.locator('#opening-panel').getByRole('button', { name: 'Delete' }).click()
  await expect.poll(() => savedOpenings(page)).toHaveLength(0)
  await expect(page.locator('#opening-panel')).toBeHidden()
  expect(await changes(page)).toBe(2)
})
