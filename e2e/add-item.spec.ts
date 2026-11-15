import { test, expect, type Page } from '@playwright/test'
import type { Home } from '../src/model/home.ts'

const ready = (page: Page) => page.waitForFunction(() => window.drafthouse?.rig !== undefined)
const getHome = (page: Page): Promise<Home> => page.evaluate(() => window.drafthouse.store.get())
const items = async (page: Page) => {
  const home = await getHome(page)
  return home.versions.find((v) => v.id === home.currentVersionId)!.items
}

// The sample home: the living room from x 0 to 400 and the bedroom (room 2) from x 400 to 700, both 300 deep.
const lookAtBedroom = (page: Page) =>
  page.evaluate(() => {
    const { camera, controls } = window.drafthouse.rig!
    controls.target.set(600, 0, 100)
    camera.position.set(600, 500, 400)
    controls.update()
  })

test('Add item adds a table through the form, at the centre of the room in view', async ({ page }, testInfo) => {
  await page.goto('/')
  await ready(page)
  const before = (await items(page)).length

  await page.getByRole('button', { name: 'Add item' }).click()
  const form = page.locator('#item-form')
  await expect(form).toBeVisible()
  await expect(form.getByLabel('Currency')).toHaveValue('EUR')

  // Choosing sofa fills in the sofa's default size, then table fills in the table's.
  await form.getByLabel('Type').selectOption('sofa')
  await expect(form.getByLabel('Width (cm)')).toHaveValue('210')
  await expect(form.getByLabel('Depth (cm)')).toHaveValue('95')
  await expect(form.getByLabel('Height (cm)')).toHaveValue('83')
  await form.getByLabel('Type').selectOption('table')
  await expect(form.getByLabel('Width (cm)')).toHaveValue('160')
  await expect(form.getByLabel('Depth (cm)')).toHaveValue('90')
  await expect(form.getByLabel('Height (cm)')).toHaveValue('75')

  // A typed size stays when the template changes.
  await form.getByLabel('Width (cm)').fill('140')
  await form.getByLabel('Type').selectOption('desk')
  await form.getByLabel('Type').selectOption('table')
  await expect(form.getByLabel('Width (cm)')).toHaveValue('140')

  await form.getByLabel('Name').fill('Dining table')
  await form.getByLabel('Colour').fill('#336699')
  await form.getByLabel('Price (optional)').fill('249')
  await page.screenshot({ path: 'test-results/add-item-form.png' })
  await testInfo.attach('add-item-form', { path: 'test-results/add-item-form.png', contentType: 'image/png' })

  await lookAtBedroom(page)
  await form.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(form).toBeHidden()

  const after = await items(page)
  expect(after).toHaveLength(before + 1)
  const table = after.at(-1)!
  expect(table).toMatchObject({
    name: 'Dining table',
    templateId: 'table',
    size: { width: 140, depth: 90, height: 75 },
    colour: '#336699',
    mount: 'floor',
    product: { price: 249, currency: 'EUR' },
  })
  // With the camera over room 2 (the bedroom), the new item is inside it.
  expect(table.position.x).toBeGreaterThan(400)
  expect(table.position.x).toBeLessThan(700)
  expect(table.position.z).toBeGreaterThan(0)
  expect(table.position.z).toBeLessThan(300)

  await page.screenshot({ path: 'test-results/add-item.png' })
  await testInfo.attach('add-item', { path: 'test-results/add-item.png', contentType: 'image/png' })
})

test('a depth of 0 blocks Add and shows the size message, in every language', async ({ page }) => {
  await page.goto('/')
  await ready(page)
  const before = (await items(page)).length

  await page.getByRole('button', { name: 'Add item' }).click()
  const form = page.locator('#item-form')
  await form.getByLabel('Depth (cm)').fill('0')
  await form.getByRole('button', { name: 'Add', exact: true }).click()

  const message = page.locator('#item-form-message')
  await expect(message).toHaveText('Each size must be from 1 to 1000 cm.')
  await expect(form).toBeVisible()
  expect(await items(page)).toHaveLength(before)

  await page.locator('#language').selectOption('es')
  await expect(message).toHaveText('Cada medida debe estar entre 1 y 1000 cm.')
  await expect(form.getByLabel('Tipo')).toBeVisible()
  await page.locator('#language').selectOption('pt')
  await expect(message).toHaveText('Cada medida tem de estar entre 1 e 1000 cm.')

  // Fixing the depth adds the item.
  await form.getByLabel('Profundidade (cm)').fill('40')
  await form.getByRole('button', { name: 'Adicionar', exact: true }).click()
  await expect(form).toBeHidden()
  expect(await items(page)).toHaveLength(before + 1)
})
