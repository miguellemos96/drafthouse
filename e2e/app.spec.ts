import { test, expect, type Page } from '@playwright/test'

test('the app opens with its title and a drawn 3D view', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle('DraftHouse')

  const canvas = page.locator('#view canvas')
  await expect(canvas).toBeVisible()

  // A blank canvas is one flat colour; the floor grid draws lines over the background.
  await expect
    .poll(async () => distinctColours(page, await canvas.screenshot()), { timeout: 10_000 })
    .toBeGreaterThan(1)

  await page.screenshot({ path: 'test-results/app.png' })
})

// Samples a spread of pixels from a PNG and counts their distinct colours.
// The browser decodes the PNG, so the test needs no image library.
function distinctColours(page: Page, png: Buffer): Promise<number> {
  return page.evaluate(async (base64) => {
    const img = new Image()
    img.src = `data:image/png;base64,${base64}`
    await img.decode()
    const c = document.createElement('canvas')
    c.width = img.width
    c.height = img.height
    const ctx = c.getContext('2d')!
    ctx.drawImage(img, 0, 0)
    const { data } = ctx.getImageData(0, 0, c.width, c.height)
    const seen = new Set<number>()
    for (let i = 0; i < data.length; i += 4 * 13) seen.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2])
    return seen.size
  }, png.toString('base64'))
}
