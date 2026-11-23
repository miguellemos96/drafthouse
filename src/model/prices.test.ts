import { describe, expect, it } from 'vitest'
import type { Item } from './item.ts'
import { priceDifference, priceTotals, unpricedCount } from './prices.ts'

let n = 0
const item = (price?: number, currency?: string): Item => ({
  id: `item-${n++}`,
  name: 'Thing',
  templateId: 'box',
  size: { width: 50, depth: 50, height: 50 },
  colour: '#888888',
  position: { x: 0, z: 0 },
  elevation: 0,
  rotation: 0,
  mount: 'floor',
  ...(price === undefined && currency === undefined ? {} : { product: { price, currency } }),
})

describe('priceTotals', () => {
  it('sums in cents, so 499 + 0.10 + 0.20 EUR is exactly 499.30', () => {
    expect(priceTotals([item(499, 'EUR'), item(0.1, 'EUR'), item(0.2, 'EUR')])).toEqual([{ currency: 'EUR', cents: 49930 }])
  })

  it('keeps each currency apart, in the order they first appear, with no conversion', () => {
    expect(priceTotals([item(1249, 'EUR'), item(300, 'GBP'), item(1, 'EUR')])).toEqual([
      { currency: 'EUR', cents: 125000 },
      { currency: 'GBP', cents: 30000 },
    ])
  })

  it('reads currency codes in any case and trims them', () => {
    expect(priceTotals([item(1, 'eur'), item(2, ' EUR ')])).toEqual([{ currency: 'EUR', cents: 300 }])
  })

  it('sums a price with no currency on its own, under an empty code', () => {
    expect(priceTotals([item(5), item(5, '')])).toEqual([{ currency: '', cents: 1000 }])
  })

  it('leaves out items without a price', () => {
    expect(priceTotals([item(), item(undefined, 'EUR'), item(10, 'EUR')])).toEqual([{ currency: 'EUR', cents: 1000 }])
    expect(priceTotals([item(), item()])).toEqual([])
  })

  it('counts a price of 0', () => {
    expect(priceTotals([item(0, 'EUR')])).toEqual([{ currency: 'EUR', cents: 0 }])
  })
})

describe('unpricedCount', () => {
  it('counts the items without a price', () => {
    expect(unpricedCount([item(), item(undefined, 'EUR'), item(0, 'EUR'), item(3, 'GBP')])).toBe(2)
    expect(unpricedCount([])).toBe(0)
  })
})

describe('priceDifference', () => {
  it('gives the difference per currency, a currency missing on one side counting as 0', () => {
    const first = priceTotals([item(500, 'EUR')])
    const second = priceTotals([item(700, 'EUR'), item(100, 'GBP')])
    expect(priceDifference(second, first)).toEqual([
      { currency: 'EUR', cents: 20000 },
      { currency: 'GBP', cents: 10000 },
    ])
  })

  it('goes negative when the version costs less, and lists currencies only the other side has', () => {
    const first = priceTotals([item(500, 'EUR'), item(40, 'USD')])
    const second = priceTotals([item(100, 'EUR')])
    expect(priceDifference(second, first)).toEqual([
      { currency: 'EUR', cents: -40000 },
      { currency: 'USD', cents: -4000 },
    ])
  })

  it('is 0 per currency between equal totals, and empty when neither side has a price', () => {
    const totals = priceTotals([item(9.99, 'EUR')])
    expect(priceDifference(totals, totals)).toEqual([{ currency: 'EUR', cents: 0 }])
    expect(priceDifference([], [])).toEqual([])
  })
})
