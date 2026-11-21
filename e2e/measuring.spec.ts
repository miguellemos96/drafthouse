import { test, expect, type Page } from '@playwright/test'

// The sample home: the living room runs from (0, 0) to (400, 300). The table, 160 × 90, stands at (200, 100), turned 0°.

const ready = async (page: Page) => {
  await page.goto('/')
  await page.waitForFunction(() => window.drafthouse !== undefined)
  await page.getByRole('button', { name: 'Top view' }).click()
  await frames(page)
}

/** Waits for a couple of drawn frames, so the camera matrices match what is on screen. */
const frames = (page: Page) =>
  page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))))

const screen = (page: Page, x: number, y: number, z: number) => page.evaluate(([x, y, z]) => window.drafthouse.toScreen(x, y, z), [x, y, z])

/** A label's length in cm: `70 cm`, or `1.7 m`. */
const labelCm = async (page: Page, kind: string): Promise<number> => {
  const text = (await page.locator(`.measure-label[data-kind="${kind}"]`).textContent())!
  const [, value, unit] = /^(-?[\d.,]+) (cm|m)$/.exec(text)!
  const number = Number(value.replace(',', '.'))
  return unit === 'm' ? number * 100 : number
}

test('dragging the sample table shows its distances to the walls and the sofa, and they go when the drag ends', async ({ page }) => {
  await ready(page)
  const from = await screen(page, 200, 0, 100)
  const to = await screen(page, 150, 0, 100)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 10 })
  await frames(page)

  // At (150, 100) the table spans x 70 to 230 and z 55 to 145.
  expect(Math.abs((await labelCm(page, 'left')) - 70)).toBeLessThanOrEqual(1)
  expect(Math.abs((await labelCm(page, 'right')) - 170)).toBeLessThanOrEqual(1)
  expect(Math.abs((await labelCm(page, 'back')) - 55)).toBeLessThanOrEqual(1)
  expect(Math.abs((await labelCm(page, 'front')) - 155)).toBeLessThanOrEqual(1)
  // The sofa's back edge is at z = 240 - 95 / 2 = 192.5.
  expect(Math.abs((await labelCm(page, 'item')) - 47.5)).toBeLessThanOrEqual(1)
  await expect(page.locator('.measure-label[data-kind="left"]')).toBeVisible()
  await page.screenshot({ path: 'test-results/measure-drag.png' })

  await page.mouse.up()
  await expect(page.locator('.measure-label')).toHaveCount(0)
})

test('the tape measure: clicking (0, 0) and then (300, 400) shows 500 cm; Escape ends it', async ({ page }) => {
  await ready(page)
  const button = page.getByRole('button', { name: 'Measure' })
  await button.click()
  await expect(button).toHaveAttribute('aria-pressed', 'true')

  const a = await screen(page, 0, 0, 0)
  const b = await screen(page, 300, 0, 400)
  await page.mouse.click(a.x, a.y)
  await page.mouse.click(b.x, b.y)
  expect(Math.abs((await labelCm(page, 'tape')) - 500)).toBeLessThanOrEqual(1)
  await page.screenshot({ path: 'test-results/measure-tape.png' })

  await page.keyboard.press('Escape')
  await expect(button).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('.measure-label')).toHaveCount(0)
})

test('M turns the tape on; clicking an item then measures from its surface and neither selects nor moves it', async ({ page }) => {
  await ready(page)
  const before = await page.evaluate(() => JSON.stringify(window.drafthouse.store.get()))
  await page.keyboard.press('m')
  await expect(page.getByRole('button', { name: 'Measure' })).toHaveAttribute('aria-pressed', 'true')

  // From the centre of the table top (75 cm high) to the floor at (300, 0): √(100² + 75² + 100²) ≈ 160.
  const top = await screen(page, 200, 75, 100)
  const floor = await screen(page, 300, 0, 0)
  await page.mouse.click(top.x, top.y)
  await page.mouse.click(floor.x, floor.y)
  expect(Math.abs((await labelCm(page, 'tape')) - Math.hypot(100, 75, 100))).toBeLessThanOrEqual(1)

  expect(await page.evaluate(() => window.drafthouse.selectedItemId())).toBeNull()
  expect(await page.evaluate(() => JSON.stringify(window.drafthouse.store.get()))).toBe(before)

  await page.keyboard.press('m')
  await expect(page.getByRole('button', { name: 'Measure' })).toHaveAttribute('aria-pressed', 'false')
})
