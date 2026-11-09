// Real shop pages, trimmed to the product data (issue #10). One test per fixture.
// Expected values follow the page's own labels: "Comprimento"/"L" (length) is depth, as IKEA's JSON-LD has it.
// `it.fails` marks a known gap: the test states the right answer, which the extractor doesn't give yet.
// When a fix makes one pass, Vitest reports it as a failure: switch it to `it` in that PR.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { extractProduct } from './extract.ts'

const read = (name: string) => {
  const html = readFileSync(new URL(`./fixtures/real/${name}.html`, import.meta.url), 'utf8')
  const url = /Trimmed from (\S+),/.exec(html)?.[1]
  if (!url) throw new Error(`${name}.html has no "Trimmed from <url>," comment`)
  return extractProduct(html, url)
}

describe('IKEA', () => {
  it('reads the SKÅLSTA table from JSON-LD', () => {
    expect(read('ikea-skalsta-table')).toEqual({
      name: 'SKÅLSTA Mesa - efeito nogueira/Em forma de U preto-cinzento 140x80 cm',
      width: 80,
      depth: 140,
      height: 75,
      price: 119,
      currency: 'EUR',
      photoUrl: 'https://www.ikea.com/pt/pt/images/products/skalsta-mesa-efeito-nogueira-em-forma-de-u-preto-cinzento__1486623_pe1002480_s5.jpg',
      templateGuess: 'table',
    })
  })

  it('reads the VILSTA hob from JSON-LD', () => {
    expect(read('ikea-vilsta-hob')).toEqual({
      name: 'VILSTA Placa de indução - IKEA 300+ preto 59 cm',
      width: 59,
      depth: 52,
      height: 5.3,
      price: 229,
      currency: 'EUR',
      photoUrl: 'https://www.ikea.com/pt/pt/images/products/vilsta-placa-de-inducao-ikea-300-preto__1263504_pe927337_s5.jpg',
      templateGuess: 'hob',
    })
  })

  // Gap: the only sizes on the page are under "Peso e medidas da embalagem" (package), and they win.
  it.fails('ignores package sizes on the VIMLE sofa cover, which has no product size', () => {
    expect(read('ikea-vimle-sofa-cover')).toEqual({
      name: 'VIMLE Capa p/sofá-cama 3 lugares',
      price: 340,
      currency: 'EUR',
      photoUrl: 'https://www.ikea.com/pt/pt/images/products/vimle-capa-p-sofa-cama-3-lugares__0781591_pe760896_s5.jpg',
      templateGuess: 'sofa',
    })
  })
})

// Gap: sizes come in table rows, "Largura (em cm)" then "241", with the unit in the label.
describe('Leroy Merlin', () => {
  it.fails('reads the corner sofa from its characteristics table', () => {
    expect(read('leroy-merlin-corner-sofa')).toEqual({
      name: 'Sofá de canto 4 lugares 241 cm, estilo minimalista, tecido canelado verde, assento profundo, sem montagem, 241 × 151 × 58 cm',
      width: 241,
      depth: 151,
      height: 58,
      price: 437.99,
      currency: 'EUR',
      photoUrl: 'https://media.adeo.com/mkp/baffa09d28de81d29c6b79d2d1fbdd5a/media.jpg',
      templateGuess: 'sofa',
    })
  })

  // The page labels only width and height; "180×90×75" in the name has no unit, so it is skipped.
  // "Produto embalado: …" rows are package sizes and must be ignored.
  it.fails('reads the extending table from its characteristics table', () => {
    expect(read('leroy-merlin-extending-table')).toEqual({
      name: 'Mesa extensível, adequada para 6–8 pessoas, 180×90×75, nogueira',
      width: 90,
      height: 75,
      price: 247.18,
      currency: 'EUR',
      photoUrl: 'https://media.adeo.com/mkp/72baba04a8fe62eb0e767680c602b9a2/media.png',
      templateGuess: 'table',
    })
  })

  it.fails('reads the toilet from its characteristics table', () => {
    expect(read('leroy-merlin-toilet')).toEqual({
      name: 'Pack sanita ao chão rimless branco saída universal 3/4.5 l Sensea Remix',
      width: 36.5,
      depth: 64.3,
      height: 82.2,
      price: 139,
      currency: 'EUR',
      photoUrl: 'https://media.adeo.com/media/3717276/media.png',
      templateGuess: 'toilet',
    })
  })
})

// Gap: Amazon has no JSON-LD and no Open Graph tags. The name is in <meta name="title"> and <title>,
// with " : Amazon.es: …" after it. The price is only in the visible text (#corePrice_feature_div).
describe('Amazon.es', () => {
  // Also: "Overall dimensions: 60 x 50 x 40 cm (L x W x H)" puts the labels after the numbers.
  it.fails('reads the vidaXL coffee table', () => {
    expect(read('amazon-es-coffee-table')).toEqual({
      name: 'vidaXL Coffee Table Artisan Oak 60 x 50 x 40 cm Engineered Wood',
      width: 50,
      depth: 60,
      height: 40,
      price: 55.9,
      currency: 'EUR',
      templateGuess: 'table',
    })
  })

  // Also: "273D x 175W x 66H centimetres", with a letter after each number and the unit spelled out.
  it.fails('reads the LIOVOYO corner sofa', () => {
    expect(read('amazon-es-corner-sofa')).toEqual({
      name: 'LIOVOYO L-Shaped 4 Seater Chaise Longue Sofa, Living Room Sofa with Removable Ottoman, Corduroy Upholstery, Deep Seat, Black',
      width: 175,
      depth: 273,
      height: 66,
      price: 299.99,
      currency: 'EUR',
      templateGuess: 'sofa',
    })
  })

  // Also: "56.8D x 59.5W x 59.5H centimetres". Today the cut-out size wins:
  // "Oven size | Integration cavity size (…): 59.5 x 59.5 x 56.8 cm | 59 x 56 x 56 cm" gives [59, 56, 56].
  // The saved page shows no price, so none is expected.
  it.fails('reads the Candy oven', () => {
    expect(read('amazon-es-oven')).toEqual({
      name: 'Candy FIDCP X625 L, Multifunction Oven, 70L, Tray and Grate, Aquactive Cleaning, Convection + Radial Fan, 8 Functions, Display Timer Touch, Push & Pull Controls, 2 Glass Door, Stainless Steel and Black',
      width: 59.5,
      depth: 56.8,
      height: 59.5,
      templateGuess: 'oven',
    })
  })
})
