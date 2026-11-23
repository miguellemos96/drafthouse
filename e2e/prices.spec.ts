import { test, expect, type Page } from '@playwright/test'

// The sample home has one version, "As it is", with three items and no prices.

const ready = async (page: Page) => {
  await page.goto('/')
  await page.waitForFunction(() => window.drafthouse !== undefined)
}

const addPricedItem = async (page: Page, name: string, price: string, currency: string) => {
  await page.getByRole('button', { name: 'Add item' }).click()
  const form = page.locator('#item-form')
  await form.getByLabel('Name').fill(name)
  await form.getByLabel('Price (optional)').fill(price)
  await form.getByLabel('Currency').fill(currency)
  await form.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(form).toBeHidden()
}

// Intl puts a no-break space between number and symbol in some languages.
const text = async (page: Page, selector: string) => ((await page.locator(selector).textContent()) ?? '').replace(/\xa0|\u202f/g, ' ')

test('a priced item added in a duplicated version shows in its total and its difference from the first version', async ({ page }, testInfo) => {
  test.slow()
  await ready(page)
  const bar = page.locator('#versions')
  const total = bar.locator('#version-total')
  const difference = bar.locator('#version-difference')
  const unpriced = bar.locator('#version-unpriced')

  // No prices yet: no total, only the count. The first version has no difference.
  await expect(total).toBeHidden()
  await expect(difference).toBeHidden()
  await expect(unpriced).toHaveText('3 items without a price')

  await bar.getByRole('button', { name: 'Duplicate' }).click()
  await expect(total).toBeHidden()
  await expect(difference).toBeHidden()

  // Live: each priced item updates the total and the difference.
  await addPricedItem(page, 'New sofa', '640', 'EUR')
  await expect(total).toHaveText('Total: €640.00')
  await expect(difference).toHaveText('+€640.00 vs As it is')
  await expect(unpriced).toHaveText('3 items without a price')

  await addPricedItem(page, 'Lamp', '0.1', 'EUR')
  await addPricedItem(page, 'Rug', '100', 'GBP')
  await expect(total).toHaveText('Total: €640.10 + £100.00')
  await expect(difference).toHaveText('+€640.10, +£100.00 vs As it is')
  await page.screenshot({ path: 'test-results/prices.png' })
  await testInfo.attach('prices', { path: 'test-results/prices.png', contentType: 'image/png' })

  // "As it is" is untouched.
  await bar.getByLabel('Version', { exact: true }).selectOption({ label: 'As it is' })
  await expect(total).toBeHidden()
  await expect(difference).toBeHidden()
  await expect(unpriced).toHaveText('3 items without a price')

  // In Spanish, with Spanish number formatting.
  await bar.getByLabel('Version', { exact: true }).selectOption({ label: 'As it is (copy)' })
  await page.getByLabel('Language').selectOption('es')
  // Spanish shows the pound by its code.
  expect(await text(page, '#version-total')).toBe('Total: 640,10 € + 100,00 GBP')
  expect(await text(page, '#version-difference')).toBe('+640,10 €, +100,00 GBP respecto a As it is')
  await expect(unpriced).toHaveText('3 objetos sin precio')
})
