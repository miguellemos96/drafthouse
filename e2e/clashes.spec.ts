import { test, expect, type Page } from '@playwright/test'
import type { Home } from '../src/model/home.ts'
import { addOpening, newOpening } from '../src/model/openings.ts'
import { wallsOf } from '../src/model/plan.ts'

// The sample home: the sofa stands at (200, 240), 210 × 95, turned 180°; the table at (200, 100), 160 × 90.

const ready = async (page: Page) => {
  await page.goto('/')
  await page.waitForFunction(() => window.drafthouse !== undefined)
  await frames(page)
}

/** Waits for a couple of drawn frames, so the camera matrices match what is on screen. */
const frames = (page: Page) =>
  page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))))

const screen = (page: Page, x: number, y: number, z: number) => page.evaluate(([x, y, z]) => window.drafthouse.toScreen(x, y, z), [x, y, z])
const clashing = (page: Page) => page.evaluate(() => window.drafthouse.clashing())
const clashList = (page: Page) => page.locator('#item-clashes')

test('dragging the table into the sofa flags both, live and after the drop, without blocking the move', async ({ page }, testInfo) => {
  await ready(page)
  expect(await clashing(page)).toEqual({ items: [], doors: [] })
  await page.getByRole('button', { name: 'Top view' }).click()
  await frames(page)

  // Drag the table 80 cm towards the sofa, so they overlap by 32.5 cm.
  const from = await screen(page, 200, 0, 100)
  const to = await screen(page, 200, 0, 180)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 10 })
  // Live, before the drop.
  await expect(clashList(page)).toHaveText('Overlaps Sofa')
  expect((await clashing(page)).items.sort()).toEqual(['sample-sofa', 'sample-table'])
  await page.mouse.up()

  const home = await page.evaluate(() => JSON.parse(localStorage.getItem('drafthouse.home')!) as Home)
  const table = home.versions[0].items.find((item) => item.id === 'sample-table')!
  expect(table.position.z).toBeCloseTo(180, 0) // the move went through
  expect(JSON.stringify(home)).not.toContain('clash') // never saved

  await expect(clashList(page)).toBeVisible()
  await expect(clashList(page)).toHaveText('Overlaps Sofa')
  expect((await clashing(page)).items.sort()).toEqual(['sample-sofa', 'sample-table'])

  // The sofa's panel names the table.
  const sofa = await screen(page, 200, 0, 270)
  await page.mouse.click(sofa.x, sofa.y)
  expect(await page.evaluate(() => window.drafthouse.selectedItemId())).toBe('sample-sofa')
  await expect(clashList(page)).toHaveText('Overlaps Table')

  // In Spanish and Portuguese too.
  await page.locator('#language').selectOption('es')
  await expect(clashList(page)).toHaveText('Se superpone con Table')
  await page.locator('#language').selectOption('pt')
  await expect(clashList(page)).toHaveText('Sobrepõe-se a Table')
  await page.locator('#language').selectOption('en')

  await page.getByRole('button', { name: '3D view' }).click()
  await frames(page)
  const shot = await page.screenshot({ path: 'test-results/clash-table-sofa.png' })
  await testInfo.attach('table dragged into the sofa', { body: shot, contentType: 'image/png' })
})

test('moving the table back out clears the warning', async ({ page }) => {
  await ready(page)
  await page.evaluate(() => {
    const { store } = window.drafthouse
    const home = store.get()
    const items = home.versions[0].items.map((item) => (item.id === 'sample-table' ? { ...item, position: { x: 200, z: 180 } } : item))
    store.set({ ...home, versions: [{ ...home.versions[0], items }] })
  })
  expect((await clashing(page)).items.sort()).toEqual(['sample-sofa', 'sample-table'])
  await page.evaluate(() => {
    const { store } = window.drafthouse
    const home = store.get()
    const items = home.versions[0].items.map((item) => (item.id === 'sample-table' ? { ...item, position: { x: 200, z: 100 } } : item))
    store.set({ ...home, versions: [{ ...home.versions[0], items }] })
  })
  expect(await clashing(page)).toEqual({ items: [], doors: [] })
})

test('a chair inside a door swing makes the door and the chair red', async ({ page }, testInfo) => {
  await ready(page)
  await page.evaluate(
    ([plan]) => {
      const { store } = window.drafthouse
      const home = store.get()
      const chair = { id: 'chair', name: 'Chair', templateId: 'chair', size: { width: 45, depth: 45, height: 90 }, colour: '#c08040', position: { x: 360, z: 150 }, elevation: 0, rotation: 0, mount: 'floor' as const }
      store.set({ ...home, plan, versions: [{ ...home.versions[0], items: [...home.versions[0].items, chair] }] })
    },
    [doorPlan()],
  )
  expect(await clashing(page)).toEqual({ items: ['chair'], doors: ['door'] })
  await page.getByRole('button', { name: 'Top view' }).click()
  await frames(page)
  const chair = await screen(page, 360, 0, 150)
  await page.mouse.click(chair.x, chair.y)
  await expect(clashList(page)).toHaveText('Blocks the door')
  const shot = await page.screenshot({ path: 'test-results/clash-door.png' })
  await testInfo.attach('chair in the door swing', { body: shot, contentType: 'image/png' })
})

/** The sample plan with an 80 cm door in the shared wall at x = 400, swinging into the living room. */
function doorPlan() {
  // Built in Node and passed in: the shared wall runs from (400, 0) to (400, 300); the door is centred 150 cm along it.
  const plan = {
    rooms: [
      { id: 'living', name: 'Living room', height: 250, corners: [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }] },
      { id: 'bedroom', name: 'Bedroom', height: 250, corners: [{ x: 400, y: 0 }, { x: 700, y: 0 }, { x: 700, y: 300 }, { x: 400, y: 300 }] },
    ],
  }
  const shared = wallsOf(plan).find((w) => w.rooms.length === 2)!
  const door = newOpening(plan, 'door', shared, 150, 'door', { x: 390, y: 150 })!
  return addOpening(plan, door)!
}
