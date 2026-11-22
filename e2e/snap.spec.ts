import { test, expect, type Page } from '@playwright/test'
import type { Home } from '../src/model/home.ts'
import type { Item } from '../src/model/item.ts'

// The sample home: the living room's left wall runs along x = 0, 10 cm thick, so its inner face is at x = 5.
// The table (160 × 90, turned 0°) stands at (200, 100).

const frames = (page: Page) =>
  page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))))

const ready = async (page: Page) => {
  await page.goto('/')
  await page.waitForFunction(() => window.drafthouse !== undefined)
  await frames(page)
}

const screen = (page: Page, x: number, y: number, z: number) => page.evaluate(([x, y, z]) => window.drafthouse.toScreen(x, y, z), [x, y, z])

const table = (page: Page) =>
  page.evaluate(() => {
    const home = JSON.parse(localStorage.getItem('drafthouse.home')!) as Home
    return home.versions.find((v) => v.id === home.currentVersionId)!.items.find((item) => item.id === 'sample-table')!
  }) as Promise<Item>

const topView = async (page: Page) => {
  await page.getByRole('button', { name: 'Top view' }).click()
  await frames(page)
}

/** Drags the table's centre to (x, z), with a screenshot halfway when `shot` is given. */
const dragTable = async (page: Page, x: number, z: number, shot?: string) => {
  const from = await screen(page, 200, 0, 100)
  const to = await screen(page, x, 0, z)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 10 })
  if (shot) {
    await frames(page)
    await page.screenshot({ path: shot })
  }
  await page.mouse.up()
}

test('Snap is off by default, S turns it on, and the choice survives a reload', async ({ page }) => {
  await ready(page)
  const snap = page.getByRole('button', { name: 'Snap' })
  await expect(snap).toHaveAttribute('aria-pressed', 'false')
  await page.keyboard.press('s')
  await expect(snap).toHaveAttribute('aria-pressed', 'true')
  await page.reload()
  await page.waitForFunction(() => window.drafthouse !== undefined)
  await expect(page.getByRole('button', { name: 'Snap' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Snap' }).click()
  await expect(page.getByRole('button', { name: 'Snap' })).toHaveAttribute('aria-pressed', 'false')
})

test('with snap on, a table dragged near the wall ends flush against it, on the 5 cm grid the other way', async ({ page }) => {
  await ready(page)
  await page.getByRole('button', { name: 'Snap' }).click()
  await topView(page)

  // Left edge dragged to about x = 8, 3 cm from the wall face.
  await dragTable(page, 88, 101, 'test-results/snap-drag.png')

  const moved = await table(page)
  expect(moved.position).toEqual({ x: 85, z: 100 })
  await page.screenshot({ path: 'test-results/snap-flush.png' })
})

test('with snap on and Alt held, the drag ends where it was released', async ({ page }) => {
  await ready(page)
  await page.getByRole('button', { name: 'Snap' }).click()
  await topView(page)

  await page.keyboard.down('Alt')
  await dragTable(page, 88, 101)
  await page.keyboard.up('Alt')

  const moved = await table(page)
  expect(moved.position.x).toBeCloseTo(88, 0)
  expect(moved.position.z).toBeCloseTo(101, 0)
  expect(moved.position.x).not.toBe(85)
})

test('with snap on, E turns the selected table by 15°', async ({ page }) => {
  await ready(page)
  await page.getByRole('button', { name: 'Snap' }).click()
  const top = await screen(page, 200, 75, 100)
  await page.mouse.click(top.x, top.y)
  expect(await page.evaluate(() => window.drafthouse.selectedItemId())).toBe('sample-table')

  await page.keyboard.press('e')
  expect((await table(page)).rotation).toBe(15)
  await page.keyboard.press('s') // snap off: back to 5° steps
  await page.keyboard.press('e')
  expect((await table(page)).rotation).toBe(20)
})
