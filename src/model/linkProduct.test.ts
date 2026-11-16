import { describe, expect, it } from 'vitest'
import { addAllowed, assignChip, chipSizes, linkPrefill, readLinkResult, safeHttpUrl } from './linkProduct.ts'
import { newItem } from './newItem.ts'

const URL = 'https://shop.example/sofa'

describe('readLinkResult', () => {
  it('reads a product response', () => {
    expect(readLinkResult(200, { name: 'Sofa', width: 210 })).toEqual({ product: { name: 'Sofa', width: 210 } })
  })

  it('reads every error code from the spec', () => {
    for (const code of ['invalid-url', 'blocked-address', 'fetch-failed', 'too-large', 'timeout', 'rate-limited', 'nothing-found'] as const) {
      expect(readLinkResult(400, { error: code })).toEqual({ error: code })
    }
  })

  it('treats an unknown error, a failed status without a code, or junk as fetch-failed', () => {
    expect(readLinkResult(500, { error: 'boom' })).toEqual({ error: 'fetch-failed' })
    expect(readLinkResult(502, {})).toEqual({ error: 'fetch-failed' })
    expect(readLinkResult(200, 'not json')).toEqual({ error: 'fetch-failed' })
    expect(readLinkResult(200, null)).toEqual({ error: 'fetch-failed' })
  })

  it('drops fields of the wrong type', () => {
    expect(readLinkResult(200, { name: 7, width: '210', depth: 95, unlabeled: [1, 'x'], price: 499, currency: 'EUR' })).toEqual({
      product: { depth: 95, price: 499, currency: 'EUR' },
    })
  })
})

describe('linkPrefill', () => {
  it('fills name, template, sizes, colour, price and currency from a product with labelled sizes', () => {
    const prefill = linkPrefill(URL, {
      name: 'Kivik sofa',
      templateGuess: 'sofa',
      width: 210,
      depth: 95,
      height: 83,
      colour: '#556677',
      price: 499,
      currency: 'EUR',
      photoUrl: 'https://shop.example/sofa.jpg',
    })
    expect(prefill).toEqual({
      name: 'Kivik sofa',
      templateId: 'sofa',
      size: { width: 210, depth: 95, height: 83 },
      colour: '#556677',
      price: 499,
      currency: 'EUR',
      url: URL,
      photoUrl: 'https://shop.example/sofa.jpg',
      chips: [],
    })
  })

  it('shows unlabeled numbers as chips and fills no sizes', () => {
    expect(linkPrefill(URL, { unlabeled: [241, 151, 58] })).toEqual({ url: URL, size: {}, chips: [241, 151, 58] })
  })

  it('keeps only the link when there is no product (an error)', () => {
    expect(linkPrefill(URL)).toEqual({ url: URL, size: {}, chips: [] })
  })

  it('ignores a colour that is not a hex colour', () => {
    expect(linkPrefill(URL, { colour: 'red' }).colour).toBeUndefined()
  })
})

describe('chips', () => {
  it('turns each assigned chip into that size', () => {
    let assigned = assignChip([undefined, undefined, undefined], 0, 'width')
    assigned = assignChip(assigned, 1, 'depth')
    assigned = assignChip(assigned, 2, 'height')
    expect(chipSizes([241, 151, 58], assigned)).toEqual({ width: 241, depth: 151, height: 58 })
  })

  it('moves a size from one chip to another, so each size has at most one chip', () => {
    const assigned = assignChip(assignChip([undefined, undefined], 0, 'width'), 1, 'width')
    expect(assigned).toEqual([undefined, 'width'])
    expect(chipSizes([241, 151], assigned)).toEqual({ width: 151 })
  })

  it('un-assigns a chip', () => {
    expect(assignChip(['width', 'depth'], 0, undefined)).toEqual([undefined, 'depth'])
  })
})

describe('addAllowed', () => {
  it('needs the confirm for a form opened from a link, even when every value was filled in', () => {
    expect(addAllowed({ fromLink: true, confirmed: false })).toBe(false)
    expect(addAllowed({ fromLink: true, confirmed: true })).toBe(true)
  })

  it('needs no confirm for Add item without a link', () => {
    expect(addAllowed({ fromLink: false, confirmed: false })).toBe(true)
  })
})

describe('safeHttpUrl', () => {
  it('keeps http and https links', () => {
    expect(safeHttpUrl('https://shop.example/a')).toBe('https://shop.example/a')
    expect(safeHttpUrl('http://shop.example/a')).toBe('http://shop.example/a')
  })

  it('refuses other schemes and junk', () => {
    expect(safeHttpUrl('javascript:alert(1)')).toBeUndefined()
    expect(safeHttpUrl('data:image/png;base64,AAAA')).toBeUndefined()
    expect(safeHttpUrl('not a url')).toBeUndefined()
    expect(safeHttpUrl(undefined)).toBeUndefined()
  })
})

describe('newItem from a link', () => {
  it('keeps url, price, currency and photo as the product', () => {
    const item = newItem({ rooms: [] }, null, {
      name: 'Sofa',
      templateId: 'sofa',
      size: { width: 210, depth: 95, height: 83 },
      colour: '#556677',
      price: 499,
      currency: 'EUR',
      url: URL,
      photoUrl: 'https://shop.example/sofa.jpg',
    })
    expect(item.product).toEqual({ url: URL, price: 499, currency: 'EUR', photoUrl: 'https://shop.example/sofa.jpg' })
  })

  it('keeps the link without a price', () => {
    const item = newItem({ rooms: [] }, null, { name: 'Box', templateId: 'box', size: { width: 10, depth: 10, height: 10 }, colour: '#000000', url: URL })
    expect(item.product).toEqual({ url: URL })
  })
})
