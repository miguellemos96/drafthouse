import { test, expect, type Page } from '@playwright/test'
import type { Home } from '../src/model/home.ts'
import type { Item } from '../src/model/item.ts'

// The sample home: the sofa stands at (200, 240), turned 180°; the table at (200, 100), turned 0°.

const ready = async (page: Page) => {
  await page.goto('/')
  await page.waitForFunction(() => window.drafthouse !== undefined)
  // Counts changes to the Home, so a test can check that one drag is one change.
  await page.evaluate(() => {
    const w = window as unknown as { changes: number }
    w.changes = 0
    window.drafthouse.store.subscribe(() => w.changes++)
  })
  await frames(page)
}

/** Waits for a couple of drawn frames, so the camera matrices match what is on screen. */
const frames = (page: Page) =>
  page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))))

const screen = (page: Page, x: number, y: number, z: number) => page.evaluate(([x, y, z]) => window.drafthouse.toScreen(x, y, z), [x, y, z])
const changes = (page: Page) => page.evaluate(() => (window as unknown as { changes: number }).changes)

/** The items as saved in the browser, so the check covers autosave too. */
const savedItems = (page: Page) =>
  page.evaluate(() => {
    const home = JSON.parse(localStorage.getItem('drafthouse.home')!) as Home
    return home.versions.find((v) => v.id === home.currentVersionId)!.items
  })
const saved = async (page: Page, id: string): Promise<Item> => (await savedItems(page)).find((item) => item.id === id)!

const drag = async (page: Page, from: { x: number; y: number }, to: { x: number; y: number }) => {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 10 })
  await page.mouse.up()
}

test('dragging the sample sofa in the top view moves it on the floor, as one saved change', async ({ page }) => {
  await ready(page)
  await page.getByRole('button', { name: 'Top view' }).click()
  await frames(page)

  await drag(page, await screen(page, 200, 0, 240), await screen(page, 300, 0, 200))

  expect(await page.evaluate(() => window.drafthouse.selectedItemId())).toBe('sample-sofa')
  const sofa = await saved(page, 'sample-sofa')
  expect(sofa.position.x).toBeCloseTo(300, 0)
  expect(sofa.position.z).toBeCloseTo(200, 0)
  expect(sofa.rotation).toBe(180)
  expect(await changes(page)).toBe(1)
  await page.screenshot({ path: 'test-results/move-sofa-top.png' })
})

test('dragging the sofa in the orbit view moves it and leaves the camera still', async ({ page }) => {
  await ready(page)
  const marker = await screen(page, 0, 0, 0)

  await drag(page, await screen(page, 200, 40, 240), await screen(page, 260, 40, 200))
  await frames(page)

  const sofa = await saved(page, 'sample-sofa')
  expect(sofa.position).not.toEqual({ x: 200, z: 240 })
  expect(sofa.position.x).toBeGreaterThan(220)
  expect(sofa.position.z).toBeLessThan(230)
  expect(await screen(page, 0, 0, 0)).toEqual(marker)
  expect(await changes(page)).toBe(1)
  await page.screenshot({ path: 'test-results/move-sofa-orbit.png' })
})

test('dragging on empty floor orbits the camera and moves no item', async ({ page }) => {
  await ready(page)
  const before = await savedItemsOrStore(page)
  const marker = await screen(page, 0, 0, 0)

  await drag(page, await screen(page, 40, 0, 280), await screen(page, 120, 0, 260))
  await frames(page)

  expect(await screen(page, 0, 0, 0)).not.toEqual(marker)
  expect(await savedItemsOrStore(page)).toEqual(before)
  expect(await changes(page)).toBe(0)
})

test('clicking selects an item; Q and E turn it in 5° steps; empty floor and Escape clear the selection', async ({ page }) => {
  await ready(page)
  const selected = () => page.evaluate(() => window.drafthouse.selectedItemId())
  const table = await screen(page, 200, 75, 100)

  await page.mouse.click(table.x, table.y)
  expect(await selected()).toBe('sample-table')
  expect(await changes(page)).toBe(0) // a click selects, it doesn't move
  await page.screenshot({ path: 'test-results/select-table.png' })

  for (let i = 0; i < 18; i++) await page.keyboard.press('e')
  expect((await saved(page, 'sample-table')).rotation).toBe(90)
  await page.keyboard.press('q')
  expect((await saved(page, 'sample-table')).rotation).toBe(85)
  expect(await changes(page)).toBe(19)

  await page.keyboard.press('Escape')
  expect(await selected()).toBeNull()
  await page.keyboard.press('e')
  expect((await saved(page, 'sample-table')).rotation).toBe(85)

  await page.mouse.click(table.x, table.y)
  expect(await selected()).toBe('sample-table')
  const floor = await screen(page, 40, 0, 280)
  await page.mouse.click(floor.x, floor.y)
  expect(await selected()).toBeNull()
})

test('dragging the rotate handle turns the selected item around its centre', async ({ page }) => {
  await ready(page)
  await page.getByRole('button', { name: 'Top view' }).click()
  await frames(page)
  const table = await screen(page, 200, 75, 100)
  await page.mouse.click(table.x, table.y)
  await frames(page)

  // The table is 90 deep, so its handle sits 35 cm in front of its front edge, at (200, 180).
  // Turning the pointer from there (270° around the centre) to (280, 100) (0°) turns the table by 90°.
  await drag(page, await screen(page, 200, 1, 180), await screen(page, 280, 0, 100))

  const turned = await saved(page, 'sample-table')
  expect(turned.rotation).toBeCloseTo(90, 0)
  expect(turned.position).toEqual({ x: 200, z: 100 })
  expect(await changes(page)).toBe(1)
  await page.screenshot({ path: 'test-results/rotate-table.png' })
})

/** The items in the store; nothing is saved until the first change. */
const savedItemsOrStore = (page: Page) =>
  page.evaluate(() => {
    const home = window.drafthouse.store.get()
    return home.versions.find((v) => v.id === home.currentVersionId)!.items
  })
