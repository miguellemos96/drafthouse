import { test, expect, type Page } from '@playwright/test'
import type { Home } from '../src/model/home.ts'

const ready = (page: Page) => page.waitForFunction(() => window.drafthouse !== undefined)
const getHome = (page: Page): Promise<Home> => page.evaluate(() => window.drafthouse.store.get())

const emptyHome = async (page: Page) => {
  await page.evaluate(() => {
    const { store } = window.drafthouse
    store.set({ ...store.get(), plan: { rooms: [] } })
  })
}

test('the Add room panel adds a room at the origin, then one beside it that shares the wall', async ({ page }, testInfo) => {
  await page.goto('/')
  await ready(page)
  await emptyHome(page)

  const panel = page.locator('#add-room')
  await expect(panel.getByLabel('Name')).toHaveValue('Room 1')
  await expect(panel.getByLabel('Width (cm)')).toHaveValue('400')
  await expect(panel.getByLabel('Length (cm)')).toHaveValue('300')
  await expect(panel.getByLabel('Height (cm)')).toHaveValue('250')

  await panel.getByRole('button', { name: 'Add room' }).click()
  let rooms = (await getHome(page)).plan.rooms
  expect(rooms).toHaveLength(1)
  expect(rooms[0]).toMatchObject({ name: 'Room 1', height: 250, corners: [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }] })

  await expect(panel.getByLabel('Name')).toHaveValue('Room 2')
  await panel.getByLabel('Width (cm)').fill('300')
  await panel.getByRole('button', { name: 'Add room' }).click()
  rooms = (await getHome(page)).plan.rooms
  expect(rooms).toHaveLength(2)
  expect(rooms[1]).toMatchObject({ name: 'Room 2', corners: [{ x: 400, y: 0 }, { x: 700, y: 0 }, { x: 700, y: 300 }, { x: 400, y: 300 }] })

  // Autosaved: a reload shows the same rooms.
  await page.reload()
  await ready(page)
  expect((await getHome(page)).plan.rooms).toEqual(rooms)

  await page.screenshot({ path: 'test-results/add-room.png' })
  await testInfo.attach('add-room', { path: 'test-results/add-room.png', contentType: 'image/png' })
})

test('a width of 20 shows the range message and adds nothing, in every language', async ({ page }) => {
  await page.goto('/')
  await ready(page)
  const before = (await getHome(page)).plan.rooms.length

  const panel = page.locator('#add-room')
  await panel.getByLabel('Width (cm)').fill('20')
  await panel.getByRole('button', { name: 'Add room' }).click()
  const message = page.locator('#add-room-message')
  await expect(message).toHaveText('The width must be from 50 to 2000 cm.')
  expect((await getHome(page)).plan.rooms).toHaveLength(before)

  await page.locator('#language').selectOption('es')
  await expect(message).toHaveText('El ancho debe estar entre 50 y 2000 cm.')
  await expect(panel.getByRole('button', { name: 'Añadir habitación' })).toBeVisible()
  await page.locator('#language').selectOption('pt')
  await expect(message).toHaveText('A largura tem de estar entre 50 e 2000 cm.')

  // Fixing the value adds the room and clears the message.
  await panel.getByLabel('Largura (cm)').fill('500')
  await panel.getByRole('button', { name: 'Adicionar divisão' }).click()
  await expect(message).toBeHidden()
  expect((await getHome(page)).plan.rooms).toHaveLength(before + 1)
})
