import { test, expect, type Page } from '@playwright/test'
import type { Home } from '../src/model/home.ts'
import type { Item } from '../src/model/item.ts'

// The sample home's living room runs from (0, 0) to (400, 300) and is 250 cm high.
// A 60 × 4 × 80 wall panel starts near its left wall (x = 0), on the floor, as a new wall item does.

const PANEL: Item = {
  id: 'panel',
  name: 'Wall panel',
  templateId: 'wall-panel',
  size: { width: 60, depth: 4, height: 80 },
  colour: '#c0504d',
  position: { x: 40, z: 150 },
  elevation: 0,
  rotation: 0,
  mount: 'wall',
}

const ready = async (page: Page) => {
  await page.goto('/')
  await page.waitForFunction(() => window.drafthouse !== undefined)
  await page.evaluate((panel) => {
    const { store } = window.drafthouse
    const home = store.get()
    store.set({ ...home, versions: home.versions.map((v) => (v.id === home.currentVersionId ? { ...v, items: [...v.items, panel] } : v)) })
    // Counts changes from here on, so the test can check that one drag is one change.
    const w = window as unknown as { changes: number }
    w.changes = 0
    store.subscribe(() => w.changes++)
  }, PANEL)
  await frames(page)
}

const frames = (page: Page) =>
  page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))))

const screen = (page: Page, x: number, y: number, z: number) => page.evaluate(([x, y, z]) => window.drafthouse.toScreen(x, y, z), [x, y, z])
const changes = (page: Page) => page.evaluate(() => (window as unknown as { changes: number }).changes)

/** The panel as saved in the browser, so the checks cover autosave too. */
const savedPanel = (page: Page): Promise<Item> =>
  page.evaluate(() => {
    const home = JSON.parse(localStorage.getItem('drafthouse.home')!) as Home
    return home.versions.find((v) => v.id === home.currentVersionId)!.items.find((i) => i.id === 'panel')!
  })

/** In the top view, drags the panel by its top (80 cm up) from one point to another, so it moves by about the difference. */
const drag = async (page: Page, from: { x: number; z: number }, to: { x: number; z: number }) => {
  await frames(page)
  const start = await screen(page, from.x, 80, from.z)
  const end = await screen(page, to.x, 80, to.z)
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(end.x, end.y, { steps: 10 })
  await page.mouse.up()
}

test('a wall panel is dragged onto a wall, along it, and onto the next wall; its height is kept on the wall', async ({ page }) => {
  test.slow()
  await ready(page)
  // In the orbit view the sofa hides the panel, so the drags are done looking straight down.
  await page.getByRole('button', { name: 'Top view' }).click()

  // Dragged near the wall at x = 0: back at x = 0, centre x = 2, facing +x.
  await drag(page, { x: 40, z: 150 }, { x: 10, z: 150 })
  let panel = await savedPanel(page)
  expect(panel.position.x).toBe(2)
  expect(panel.position.z).toBeCloseTo(150, -1)
  expect(panel.rotation).toBe(90)
  expect(await changes(page)).toBe(1)
  await page.screenshot({ path: 'test-results/wall-panel-first-wall.png' })

  // Along the wall to z = 250: it stays flush, at x = 2.
  await drag(page, { x: 2, z: panel.position.z }, { x: 2, z: panel.position.z + 100 })
  panel = await savedPanel(page)
  expect(panel.position.x).toBe(2)
  expect(panel.position.z).toBeCloseTo(250, -1)
  expect(panel.rotation).toBe(90)
  expect(await changes(page)).toBe(2)

  // Near the wall at z = 300: flush to that wall, facing -z.
  await drag(page, { x: 2, z: panel.position.z }, { x: 100, z: 290 })
  panel = await savedPanel(page)
  expect(panel.position.z).toBe(298)
  expect(panel.position.x).toBeGreaterThan(60)
  expect(panel.rotation).toBe(180)
  expect(await changes(page)).toBe(3)

  // Its height on the wall: 300 is clamped to 250 - 80 = 170.
  const itemPanel = page.locator('#item-panel')
  await expect(itemPanel.getByLabel('Mount')).toHaveValue('wall')
  const elevation = itemPanel.getByLabel('Height on the wall (cm)')
  await elevation.fill('300')
  await elevation.press('Enter')
  await expect(elevation).toHaveValue('170')
  expect((await savedPanel(page)).elevation).toBe(170)
  expect(await changes(page)).toBe(4)
  await page.getByRole('button', { name: 'Top view' }).click() // back to the orbit view for the screenshot
  await frames(page)
  await page.screenshot({ path: 'test-results/wall-panel-next-wall.png' })

  // Wall to floor: elevation 0, and no height on the wall to edit.
  await itemPanel.getByLabel('Mount').selectOption('floor')
  expect((await savedPanel(page)).elevation).toBe(0)
  expect((await savedPanel(page)).mount).toBe('floor')
  await expect(elevation).toBeHidden()
  expect(await changes(page)).toBe(5)
})
