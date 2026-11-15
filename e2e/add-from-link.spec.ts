import { test, expect, type Page, type Route } from '@playwright/test'
import type { Home } from '../src/model/home.ts'

// /api/read-link is stubbed with page.route, and so is the shop's photo: no real shop is ever called.
const PAGE_URL = 'https://shop.example/kivik-sofa'
const PHOTO_URL = 'https://shop.example/kivik-sofa.png'
// A 1×1 PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')

const frames = (page: Page) =>
  page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))))

/** The app with an empty current version, so a new item at the room centre can be clicked. */
const ready = async (page: Page) => {
  await page.goto('/')
  await page.waitForFunction(() => window.drafthouse?.rig !== undefined)
  await page.evaluate(() => {
    const { store } = window.drafthouse
    const home = store.get()
    store.set({ ...home, versions: home.versions.map((v) => ({ ...v, items: [] })) })
  })
}

const items = async (page: Page) => {
  const home: Home = await page.evaluate(() => window.drafthouse.store.get())
  return home.versions.find((v) => v.id === home.currentVersionId)!.items
}

const stubReadLink = (page: Page, status: number, json: unknown, gate?: Promise<void>) =>
  page.route('**/api/read-link', async (route: Route) => {
    expect(route.request().method()).toBe('POST')
    expect(route.request().postDataJSON()).toEqual({ url: PAGE_URL })
    await gate
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(json) })
  })

const readLink = async (page: Page) => {
  await page.getByLabel('Product link').fill(PAGE_URL)
  await page.getByRole('button', { name: 'Add from link' }).click()
}

/** Clicks the top of the item standing at the room's centre, in the top view. */
const clickItemAt = async (page: Page, x: number, height: number, z: number) => {
  await page.getByRole('button', { name: 'Top view' }).click()
  await frames(page)
  const point = await page.evaluate(([x, y, z]) => window.drafthouse.toScreen(x, y, z), [x, height, z])
  await page.mouse.click(point.x, point.y)
}

test('a product with labelled sizes fills the form, waits for the confirm, and shows its photo and link', async ({ page }, testInfo) => {
  await page.route(PHOTO_URL, (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }))
  let release!: () => void
  const gate = new Promise<void>((done) => (release = done))
  await stubReadLink(
    page,
    200,
    { name: 'Kivik sofa', width: 210, depth: 95, height: 83, price: 499, currency: 'EUR', templateGuess: 'sofa', colour: '#556677', photoUrl: PHOTO_URL },
    gate,
  )
  await ready(page)

  await readLink(page)
  // Loading: the button says so and can't be pressed again.
  const loading = page.getByRole('button', { name: 'Reading the page…' })
  await expect(loading).toBeDisabled()
  release()

  const form = page.locator('#item-form')
  await expect(form).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add from link' })).toBeEnabled()
  await expect(form.getByLabel('Name')).toHaveValue('Kivik sofa')
  await expect(form.getByLabel('Type')).toHaveValue('sofa')
  await expect(form.getByLabel('Width (cm)')).toHaveValue('210')
  await expect(form.getByLabel('Depth (cm)')).toHaveValue('95')
  await expect(form.getByLabel('Height (cm)')).toHaveValue('83')
  await expect(form.getByLabel('Colour')).toHaveValue('#556677')
  await expect(form.getByLabel('Price (optional)')).toHaveValue('499')
  await expect(form.getByLabel('Currency')).toHaveValue('EUR')
  await expect(page.locator('#item-form-chips')).toBeHidden()

  // Everything is filled in, yet Add waits for the confirm.
  const add = form.getByRole('button', { name: 'Add', exact: true })
  await expect(add).toBeDisabled()
  await form.getByLabel('I checked the kind of item and its three sizes').check()
  await expect(add).toBeEnabled()
  await page.screenshot({ path: 'test-results/add-from-link-form.png' })
  await testInfo.attach('add-from-link-form', { path: 'test-results/add-from-link-form.png', contentType: 'image/png' })

  await add.click()
  await expect(form).toBeHidden()
  const [sofa] = await items(page)
  expect(sofa).toMatchObject({
    name: 'Kivik sofa',
    templateId: 'sofa',
    size: { width: 210, depth: 95, height: 83 },
    colour: '#556677',
    product: { url: PAGE_URL, price: 499, currency: 'EUR', photoUrl: PHOTO_URL },
  })

  // Selecting it shows the thumbnail and the link to the page.
  const panel = page.locator('#item-panel')
  await expect(panel).toBeHidden()
  await clickItemAt(page, sofa.position.x, sofa.size.height, sofa.position.z)
  expect(await page.evaluate(() => window.drafthouse.selectedItemId())).toBe(sofa.id)
  await expect(panel).toBeVisible()
  const photo = panel.getByRole('img', { name: 'Product photo' })
  await expect(photo).toHaveAttribute('src', PHOTO_URL)
  await expect(photo).toHaveJSProperty('naturalWidth', 1)
  const link = panel.getByRole('link', { name: 'Open the product page' })
  await expect(link).toHaveAttribute('href', PAGE_URL)
  await expect(link).toHaveAttribute('target', '_blank')
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  await page.screenshot({ path: 'test-results/add-from-link-panel.png' })
  await testInfo.attach('add-from-link-panel', { path: 'test-results/add-from-link-panel.png', contentType: 'image/png' })

  // Escape clears the selection and the panel.
  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()
})

test('unlabeled numbers show as chips; once assigned and confirmed the item takes those sizes', async ({ page }, testInfo) => {
  // This photo fails to load: it hides, and the link still shows.
  await page.route(PHOTO_URL, (route) => route.abort())
  await stubReadLink(page, 200, { name: 'Corner sofa', unlabeled: [241, 151, 58], photoUrl: PHOTO_URL })
  await ready(page)

  await readLink(page)
  const form = page.locator('#item-form')
  await expect(form).toBeVisible()
  const chips = page.locator('#item-form-chips')
  await expect(chips).toBeVisible()
  await expect(chips.locator('label.chip > span')).toHaveText(['241 cm', '151 cm', '58 cm'])

  await chips.getByLabel('241 cm').selectOption('width')
  await chips.getByLabel('151 cm').selectOption('depth')
  await chips.getByLabel('58 cm').selectOption('height')
  await expect(form.getByLabel('Width (cm)')).toHaveValue('241')
  await expect(form.getByLabel('Depth (cm)')).toHaveValue('151')
  await expect(form.getByLabel('Height (cm)')).toHaveValue('58')

  const add = form.getByRole('button', { name: 'Add', exact: true })
  await expect(add).toBeDisabled()
  await form.getByLabel('I checked the kind of item and its three sizes').check()
  await page.screenshot({ path: 'test-results/add-from-link-chips.png' })
  await testInfo.attach('add-from-link-chips', { path: 'test-results/add-from-link-chips.png', contentType: 'image/png' })
  await add.click()

  const [sofa] = await items(page)
  expect(sofa.size).toEqual({ width: 241, depth: 151, height: 58 })
  expect(sofa.product).toEqual({ url: PAGE_URL, photoUrl: PHOTO_URL })

  await clickItemAt(page, sofa.position.x, sofa.size.height, sofa.position.z)
  const panel = page.locator('#item-panel')
  await expect(panel).toBeVisible()
  await expect(panel.locator('#item-photo')).toBeHidden()
  await expect(panel.getByRole('link', { name: 'Open the product page' })).toHaveAttribute('href', PAGE_URL)
})

test('a blocked-address error opens an empty form with the link kept and a translated message', async ({ page }) => {
  await stubReadLink(page, 403, { error: 'blocked-address' })
  await ready(page)

  await readLink(page)
  const form = page.locator('#item-form')
  await expect(form).toBeVisible()
  const message = page.locator('#item-form-link-message')
  await expect(message).toHaveText('That link points to a private or local address, so it was not read.')
  await expect(page.getByLabel('Product link')).toHaveValue(PAGE_URL)
  await expect(form.getByLabel('Name')).toHaveValue('')
  await expect(form.getByLabel('Type')).toHaveValue('box')
  await expect(form.getByLabel('Price (optional)')).toHaveValue('')
  await expect(form.getByRole('button', { name: 'Add', exact: true })).toBeDisabled()

  await page.locator('#language').selectOption('es')
  await expect(message).toHaveText('Ese enlace apunta a una dirección privada o local, así que no se ha leído.')
  await page.locator('#language').selectOption('pt')
  await expect(message).toHaveText('Esse link aponta para um endereço privado ou local, por isso não foi lido.')

  // Filled in by hand and confirmed, the item keeps the link.
  await form.getByLabel('Confirmei a categoria do objeto e as três medidas').check()
  await form.getByRole('button', { name: 'Adicionar', exact: true }).click()
  await expect(form).toBeHidden()
  const [box] = await items(page)
  expect(box.product).toEqual({ url: PAGE_URL })
})

test('Add item without a link still needs no confirm', async ({ page }) => {
  await ready(page)
  await page.getByRole('button', { name: 'Add item' }).click()
  const form = page.locator('#item-form')
  await expect(form.getByLabel('I checked the kind of item and its three sizes')).toBeHidden()
  await form.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(form).toBeHidden()
  expect(await items(page)).toHaveLength(1)
})
