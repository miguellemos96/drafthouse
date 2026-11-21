import { test, expect, devices, type Page } from '@playwright/test'

// Phones are view only ("Devices" in docs/spec.md). The sample sofa stands at (200, 240), the table at (200, 100).

// Every Pixel 7 setting except the browser type, which can't change inside a file.
const { viewport, screen: phoneScreen, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices['Pixel 7']

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
const toScreen = (page: Page, x: number, y: number, z: number) => page.evaluate(([x, y, z]) => window.drafthouse.toScreen(x, y, z), [x, y, z])
const changes = (page: Page) => page.evaluate(() => (window as unknown as { changes: number }).changes)

const EDITING = ['#add-room', '#history', '#undo', '#redo', '#add-item', '#add-item-button', '#add-from-link', '#import', '#item-panel input', '#item-duplicate', '#item-delete']

test.describe('on a Pixel 7', () => {
  test.use({ viewport, screen: phoneScreen, userAgent, deviceScaleFactor, isMobile, hasTouch })

  test('the home opens view only: the note shows and no editing control exists', async ({ page }) => {
    await ready(page)
    expect(await page.evaluate(() => window.drafthouse.viewOnly)).toBe(true)
    await expect(page.locator('#view-only-note')).toHaveText('Use a computer to edit this home')
    for (const selector of EDITING) await expect(page.locator(selector)).toHaveCount(0)
    // What stays: the top view, the language switcher and Export.
    await expect(page.getByRole('button', { name: 'Top view' })).toBeVisible()
    await expect(page.locator('#language')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Export' })).toBeVisible()

    await page.locator('#language').selectOption('es')
    await expect(page.locator('#view-only-note')).toHaveText('Usa un ordenador para editar esta casa')
    await page.locator('#language').selectOption('en')
    await page.screenshot({ path: 'test-results/view-only-phone.png' })
  })

  test('dragging the sofa with a finger orbits the camera and leaves the saved home unchanged', async ({ page }) => {
    await ready(page)
    const before = await page.evaluate(() => JSON.stringify(window.drafthouse.store.get()))
    const marker = await toScreen(page, 0, 0, 0)
    const from = await toScreen(page, 200, 40, 240)
    const to = await toScreen(page, 260, 40, 200)

    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y }] })
    for (let i = 1; i <= 10; i++) {
      const x = from.x + ((to.x - from.x) * i) / 10
      const y = from.y + ((to.y - from.y) * i) / 10
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] })
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await frames(page)

    expect(await toScreen(page, 0, 0, 0)).not.toEqual(marker)
    expect(await changes(page)).toBe(0)
    expect(await page.evaluate(() => JSON.stringify(window.drafthouse.store.get()))).toBe(before)
    expect(await page.evaluate(() => localStorage.getItem('drafthouse.home'))).toBeNull()
  })

  test('tapping an item shows its name, photo and link, with nothing to edit', async ({ page }) => {
    await ready(page)
    // Give the table a product, so the panel has a photo and a link to show.
    await page.evaluate(() => {
      const { store } = window.drafthouse
      const home = store.get()
      store.set({
        ...home,
        versions: home.versions.map((v) => ({
          ...v,
          items: v.items.map((item) =>
            item.id === 'sample-table' ? { ...item, product: { url: 'https://shop.example/table', photoUrl: 'https://shop.example/table.jpg' } } : item,
          ),
        })),
      })
    })
    await frames(page)
    const before = await page.evaluate(() => JSON.stringify(window.drafthouse.store.get()))
    const table = await toScreen(page, 200, 75, 100)

    await page.touchscreen.tap(table.x, table.y)
    await frames(page)

    expect(await page.evaluate(() => window.drafthouse.selectedItemId())).toBe('sample-table')
    const panel = page.locator('#item-panel')
    await expect(panel).toBeVisible()
    await expect(panel.locator('#item-panel-title')).toHaveText('Table')
    await expect(panel.locator('#item-link')).toHaveAttribute('href', 'https://shop.example/table')
    await expect(panel.locator('#item-photo')).toHaveAttribute('src', 'https://shop.example/table.jpg')
    await expect(panel.locator('input, button')).toHaveCount(0)

    // Editing keys do nothing.
    await page.keyboard.press('e')
    await page.keyboard.press('Delete')
    expect(await page.evaluate(() => JSON.stringify(window.drafthouse.store.get()))).toBe(before)
    await page.screenshot({ path: 'test-results/view-only-tap.png' })
  })
})

test.describe('on a 1280 px wide touch screen', () => {
  test.use({ viewport: { width: 1280, height: 800 }, isMobile: true, hasTouch: true })

  test('the home stays editable', async ({ page }) => {
    await ready(page)
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true)
    expect(await page.evaluate(() => window.drafthouse.viewOnly)).toBe(false)
    await expect(page.locator('#view-only-note')).toHaveCount(0)
    await expect(page.locator('#add-item-button')).toBeVisible()
    await expect(page.locator('#import')).toBeVisible()
    await expect(page.locator('#undo')).toBeVisible()
  })
})
