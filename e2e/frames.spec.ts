import { test, expect, type Page } from '@playwright/test'

const count = (page: Page) => page.evaluate(() => window.drafthouse.frames)

/** Waits until no frame has been drawn for a while: the camera has settled. */
const settled = async (page: Page) => {
  let last = -1
  await expect
    .poll(
      async () => {
        const now = await count(page)
        const same = now === last
        last = now
        return same
      },
      { intervals: [300], timeout: 15_000 },
    )
    .toBe(true)
}

test('the idle view draws no frames, and orbiting draws them again', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => window.drafthouse?.frames > 0)
  await settled(page)

  // Left alone, the view draws nothing.
  const idle = await count(page)
  await page.waitForTimeout(1000)
  expect(await count(page)).toBe(idle)

  // Dragging orbits the camera: frames are drawn again, while dragging and while the damping runs out.
  const box = (await page.locator('#view canvas').boundingBox())!
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  const before = await page.evaluate(() => window.drafthouse.rig.camera.position.toArray())
  await page.mouse.move(x, y)
  await page.mouse.down()
  for (let i = 1; i <= 10; i++) await page.mouse.move(x + i * 15, y)
  await page.mouse.up()
  await settled(page)
  const after = await count(page)
  expect(after).toBeGreaterThan(idle)
  expect(await page.evaluate(() => window.drafthouse.rig.camera.position.toArray())).not.toEqual(before)

  // And then it stops again.
  await page.waitForTimeout(1000)
  expect(await count(page)).toBe(after)
})
