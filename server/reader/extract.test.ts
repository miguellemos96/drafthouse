import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { extractProduct, guessTemplate } from './extract.ts'

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')
const PAGE = 'https://shop.example/p/1'
const jsonLd = (data: unknown) => `<script type="application/ld+json">${JSON.stringify(data)}</script>`

describe('extractProduct', () => {
  describe('acceptance scenarios', () => {
    it('prefers the JSON-LD price over the meta price', () => {
      const html = jsonLd({ '@type': 'Product', offers: { price: 499, priceCurrency: 'EUR' } }) +
        '<meta property="product:price:amount" content="450">'
      expect(extractProduct(html, PAGE).price).toBe(499)
    })

    it('reads a page with only og:title and og:image', () => {
      const html = '<meta property="og:title" content="Sofá de 3 plazas"><meta property="og:image" content="/img/s.jpg">'
      expect(extractProduct(html, PAGE)).toEqual({
        name: 'Sofá de 3 plazas',
        photoUrl: 'https://shop.example/img/s.jpg',
        templateGuess: 'sofa',
      })
    })

    it('returns {} for a page with no product data', () => {
      expect(extractProduct(fixture('nothing.html'), PAGE)).toEqual({})
    })
  })

  describe('fixtures', () => {
    it('reads a JSON-LD page, where JSON-LD wins over meta tags and text', () => {
      expect(extractProduct(fixture('json-ld.html'), PAGE)).toEqual({
        name: 'Harbour 3-seat sofa',
        width: 210,
        depth: 95,
        height: 83,
        price: 499,
        currency: 'EUR',
        photoUrl: 'https://shop.example/images/harbour.jpg',
        templateGuess: 'sofa',
      })
    })

    it('reads a meta-tags-only page', () => {
      expect(extractProduct(fixture('meta-only.html'), PAGE)).toEqual({
        name: 'Sofá de 3 plazas',
        price: 349.99,
        currency: 'EUR',
        photoUrl: 'https://shop.example/img/s.jpg',
        templateGuess: 'sofa',
      })
    })

    it('reads sizes from visible text only, ignoring scripts and styles', () => {
      expect(extractProduct(fixture('text-only.html'), PAGE)).toEqual({ width: 160, depth: 90, height: 75 })
    })
  })

  describe('JSON-LD', () => {
    it('finds a Product inside a top-level array', () => {
      const html = jsonLd([{ '@type': 'WebSite', name: 'Shop' }, { '@type': 'Product', name: 'Oak bed' }])
      expect(extractProduct(html, PAGE)).toEqual({ name: 'Oak bed', templateGuess: 'bed' })
    })

    it('accepts a @type array that includes Product', () => {
      const html = jsonLd({ '@type': ['Product', 'IndividualProduct'], name: 'Lamp' })
      expect(extractProduct(html, PAGE).name).toBe('Lamp')
    })

    it('skips broken JSON-LD blocks and reads the next one', () => {
      const html = '<script type="application/ld+json">{ not json</script>' + jsonLd({ '@type': 'Product', name: 'Desk' })
      expect(extractProduct(html, PAGE).name).toBe('Desk')
    })

    it('converts QuantitativeValue unit codes to cm', () => {
      const html = jsonLd({
        '@type': 'Product',
        width: { value: 2, unitCode: 'MTR' },
        depth: { value: '40', unitCode: 'INH' },
        height: { value: 750, unitCode: 'MMT' },
      })
      expect(extractProduct(html, PAGE)).toMatchObject({ width: 200, depth: 101.6, height: 75 })
    })

    it('reads sizes given as plain text', () => {
      const html = jsonLd({ '@type': 'Product', width: '80 cm', depth: '400 mm', height: '0.75 m' })
      expect(extractProduct(html, PAGE)).toMatchObject({ width: 80, depth: 40, height: 75 })
    })

    it('ignores a size with no unit', () => {
      const html = jsonLd({ '@type': 'Product', width: { value: 80 }, depth: '40' })
      expect(extractProduct(html, PAGE)).toEqual({})
    })

    it('reads AggregateOffer.lowPrice', () => {
      const html = jsonLd({ '@type': 'Product', offers: { '@type': 'AggregateOffer', lowPrice: '129.5', priceCurrency: 'USD' } })
      expect(extractProduct(html, PAGE)).toEqual({ price: 129.5, currency: 'USD' })
    })

    it('reads the first of several offers', () => {
      const html = jsonLd({ '@type': 'Product', offers: [{ price: 10, priceCurrency: 'EUR' }, { price: 20 }] })
      expect(extractProduct(html, PAGE)).toEqual({ price: 10, currency: 'EUR' })
    })

    it('reads image as a string, an array or an ImageObject', () => {
      const image = (img: unknown) => extractProduct(jsonLd({ '@type': 'Product', image: img }), PAGE).photoUrl
      expect(image('https://cdn.example/a.jpg')).toBe('https://cdn.example/a.jpg')
      expect(image(['b.jpg', 'c.jpg'])).toBe('https://shop.example/p/b.jpg')
      expect(image({ '@type': 'ImageObject', contentUrl: '//cdn.example/d.jpg' })).toBe('https://cdn.example/d.jpg')
      expect(image([{ '@type': 'ImageObject', url: '/e.jpg' }])).toBe('https://shop.example/e.jpg')
    })

    it('drops a photo URL that is not http or https', () => {
      const html = jsonLd({ '@type': 'Product', image: 'javascript:alert(1)' })
      expect(extractProduct(html, PAGE)).toEqual({})
    })
  })

  describe('merging sources', () => {
    it('fills fields JSON-LD lacks from meta tags', () => {
      const html = jsonLd({ '@type': 'Product', name: 'Chair' }) +
        '<meta property="product:price:amount" content="45.00"><meta property="product:price:currency" content="EUR">'
      expect(extractProduct(html, PAGE)).toEqual({ name: 'Chair', price: 45, currency: 'EUR', templateGuess: 'chair' })
    })

    it('reads meta prices with either decimal separator', () => {
      const price = (amount: string) => extractProduct(`<meta property="product:price:amount" content="${amount}">`, PAGE).price
      expect(price('1.299,00')).toBe(1299)
      expect(price('1,299.00')).toBe(1299)
      expect(price('free')).toBeUndefined()
    })

    it('fills sizes JSON-LD lacks from the page text', () => {
      const html = jsonLd({ '@type': 'Product', width: '80 cm' }) + '<p>Ancho: 99 cm, Fondo: 40 cm, Alto: 75 cm</p>'
      expect(extractProduct(html, PAGE)).toEqual({ width: 80, depth: 40, height: 75 })
    })

    it('returns unlabeled numbers from the text when sizes are missing', () => {
      expect(extractProduct('<p>Medidas: 210x95x83 cm</p>', PAGE)).toEqual({ unlabeled: [210, 95, 83] })
    })

    it('leaves out unlabeled numbers once all three sizes are known', () => {
      const html = jsonLd({ '@type': 'Product', width: '80 cm', depth: '40 cm', height: '75 cm' }) + '<p>210x95x83 cm</p>'
      expect(extractProduct(html, PAGE)).toEqual({ width: 80, depth: 40, height: 75 })
    })

    it('keeps text in separate elements apart', () => {
      expect(extractProduct('<div>Seat height</div><div>Width: 60 cm</div>', PAGE)).toEqual({ width: 60 })
    })
  })
})

describe('guessTemplate', () => {
  it.each([
    ['Sofá de 3 plazas', 'sofa'],
    ['Corner couch', 'sofa'],
    ['Cama de matrimonio', 'bed'],
    ['Double bed', 'bed'],
    ['Sanita suspendida', 'toilet'],
    ['Inodoro compacto', 'toilet'],
    ['Close-coupled toilet', 'toilet'],
    ['Frigorífico combi', 'fridge'],
    ['Nevera americana', 'fridge'],
    ['Fridge freezer', 'fridge'],
    ['Geladeira frost free', 'fridge'],
    ['Sillón reclinable', 'armchair'],
    ['Cadeira de escritório', 'chair'],
    ['Mesa de centro', 'table'],
    ['Table lamp', 'lamp'],
    ['Candeeiro de pé', 'lamp'],
    ['Bedside table', 'table'],
    ['Sofá cama', 'sofa'],
    ['Plato de ducha', 'shower-tray'],
    ['Banheira de hidromassagem', 'bathtub'],
    ['Placa de inducción', 'hob'],
    ['Campana extractora', 'cooker-hood'],
    ['Máquina de lavar roupa', 'washer'],
    ['Secadora de condensación', 'washer'],
    ['Mueble TV', 'tv-unit'],
    ['Alfombra de lana', 'rug'],
    ['Espejo redondo', 'wall-panel'],
    ['Estantería de madera', 'shelf'],
    ['Armario ropero', 'wardrobe'],
    ['Lavabo sobre encimera', 'sink'],
    ['Horno multifunción', 'oven'],
    ['Bidé suspendido', 'bidet'],
    ['Escritorio blanco', 'desk'],
  ])('%s → %s', (name, template) => {
    expect(guessTemplate(name)).toBe(template)
  })

  it('matches whole words only', () => {
    expect(guessTemplate('Armchair')).toBe('armchair')
    expect(guessTemplate('Bedside table')).not.toBe('bed')
    expect(guessTemplate('Camping stove')).toBeUndefined()
  })

  it('returns undefined when nothing matches', () => {
    expect(guessTemplate('Storage box')).toBeUndefined()
  })
})
