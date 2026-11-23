// Price totals for a version. See "Versions and prices" in docs/spec.md.
// Prices in different currencies are summed separately, with no conversion. Sums are in whole
// cents, so 499 + 0.10 + 0.20 is exactly 499.30.
import type { Item } from './item.ts'

/** A sum in one currency. `currency` is an upper-case code such as `EUR`, or `''` for a price with no currency. */
export type Amount = { currency: string; cents: number }

const priceOf = (item: Item): number | undefined => {
  const price = item.product?.price
  return price !== undefined && Number.isFinite(price) ? price : undefined
}

const toCents = (price: number): number => Math.round(price * 100)

/** The total of the items that have a price, per currency, in the order each currency first appears. */
export function priceTotals(items: readonly Item[]): Amount[] {
  const totals = new Map<string, number>()
  for (const item of items) {
    const price = priceOf(item)
    if (price === undefined) continue
    const currency = (item.product?.currency ?? '').trim().toUpperCase()
    totals.set(currency, (totals.get(currency) ?? 0) + toCents(price))
  }
  return [...totals].map(([currency, cents]) => ({ currency, cents }))
}

/** How many items have no price. */
export const unpricedCount = (items: readonly Item[]): number => items.filter((item) => priceOf(item) === undefined).length

/**
 * `totals` minus `base`, per currency: the currencies of `totals` first, then those only `base` has.
 * A currency missing on one side counts as 0 there.
 */
export function priceDifference(totals: readonly Amount[], base: readonly Amount[]): Amount[] {
  const cents = (list: readonly Amount[], currency: string) => list.find((a) => a.currency === currency)?.cents ?? 0
  const currencies = [...new Set([...totals, ...base].map((a) => a.currency))]
  return currencies.map((currency) => ({ currency, cents: cents(totals, currency) - cents(base, currency) }))
}
