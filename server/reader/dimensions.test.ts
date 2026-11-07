import { describe, expect, it } from 'vitest'
import { parseDimensions } from './dimensions.ts'

describe('parseDimensions', () => {
  it('reads a labelled W x D x H line', () => {
    expect(parseDimensions('W 210 x D 95 x H 83 cm')).toEqual({ width: 210, depth: 95, height: 83 })
  })

  it('reads labels on separate lines', () => {
    expect(parseDimensions('Width: 210 cm\nDepth: 95 cm\nHeight: 83 cm')).toEqual({ width: 210, depth: 95, height: 83 })
  })

  it('reads Portuguese labels', () => {
    const expected = { width: 80, depth: 40, height: 75 }
    expect(parseDimensions('Largura: 80 cm, Profundidade: 40 cm, Altura: 75 cm')).toEqual(expected)
    expect(parseDimensions('L 80 x P 40 x A 75 cm')).toEqual(expected)
  })

  it('reads Spanish labels', () => {
    const expected = { width: 80, depth: 40, height: 75 }
    expect(parseDimensions('Ancho: 80 cm, Fondo: 40 cm, Alto: 75 cm')).toEqual(expected)
    expect(parseDimensions('An 80 x F 40 x Al 75 cm')).toEqual(expected)
  })

  it('converts mm, m and inches to cm', () => {
    expect(parseDimensions('Width: 2100 mm')).toEqual({ width: 210 })
    expect(parseDimensions('Width: 2,1 m')).toEqual({ width: 210 })
    expect(parseDimensions('Width: 2.1 m')).toEqual({ width: 210 })
    expect(parseDimensions('Width: 82.7"')).toEqual({ width: 210.1 })
    expect(parseDimensions('Width: 82.7 in')).toEqual({ width: 210.1 })
  })

  it('reads decimal commas', () => {
    expect(parseDimensions('Height: 83,5 cm')).toEqual({ height: 83.5 })
  })

  it('returns unlabelled numbers when the order is unclear', () => {
    expect(parseDimensions('210x95x83 cm')).toEqual({ unlabeled: [210, 95, 83] })
    expect(parseDimensions('Size: 210 × 95 × 83 cm')).toEqual({ unlabeled: [210, 95, 83] })
  })

  it('returns nothing for text without dimensions', () => {
    expect(parseDimensions('A comfortable three-seat sofa in grey.')).toEqual({})
    expect(parseDimensions('')).toEqual({})
  })

  it('prefers the plain label over a qualified one', () => {
    expect(parseDimensions('Seat height: 45 cm\nHeight: 83 cm')).toEqual({ height: 83 })
    expect(parseDimensions('Height: 83 cm\nSeat height: 45 cm')).toEqual({ height: 83 })
  })

  it('ignores qualified labels on their own', () => {
    expect(parseDimensions('Seat height: 45 cm')).toEqual({})
  })

  it('accepts overall and total as qualifiers', () => {
    expect(parseDimensions('Overall width: 210 cm')).toEqual({ width: 210 })
    expect(parseDimensions('Altura total: 83 cm')).toEqual({ height: 83 })
  })

  it('reads several labels on one line', () => {
    expect(parseDimensions('Width: 210 cm Depth: 95 cm Height: 83 cm')).toEqual({ width: 210, depth: 95, height: 83 })
  })

  it('ignores labelled values without a unit', () => {
    expect(parseDimensions('Width: 3 seats')).toEqual({})
  })

  it('reads a unit on every part, two-part sizes and non-breaking spaces', () => {
    expect(parseDimensions('W 210 cm x D 95 cm x H 83 cm')).toEqual({ width: 210, depth: 95, height: 83 })
    expect(parseDimensions('2,1 x 0,95 m')).toEqual({ unlabeled: [210, 95] })
    expect(parseDimensions(`Ancho: 80${String.fromCharCode(0xa0)}cm`)).toEqual({ width: 80 })
  })

  it('ignores number sequences without a unit', () => {
    expect(parseDimensions('Available in 3 colours, 2 x 4 packs')).toEqual({})
  })
})
