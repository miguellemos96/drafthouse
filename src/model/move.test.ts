import { describe, expect, it } from 'vitest'
import { dragPosition, normaliseAngle, pointerAngle, rotateByHandle, stepRotation, ROTATION_STEP } from './move.ts'

describe('dragPosition', () => {
  it('moves the item by how far the pointer moved on the floor', () => {
    // Acceptance: a drag from floor point (0,0) to (50,-20) moves the item from (100,100) to (150,80).
    expect(dragPosition({ x: 100, z: 100 }, { x: 0, z: 0 }, { x: 50, z: -20 })).toEqual({ x: 150, z: 80 })
  })

  it('leaves the item where it is when the pointer has not moved', () => {
    expect(dragPosition({ x: 30, z: -40 }, { x: 7, z: 9 }, { x: 7, z: 9 })).toEqual({ x: 30, z: -40 })
  })

  it('does not depend on where on the item the drag started', () => {
    expect(dragPosition({ x: 0, z: 0 }, { x: 80, z: 10 }, { x: 70, z: 30 })).toEqual({ x: -10, z: 20 })
  })
})

describe('normaliseAngle', () => {
  it('keeps angles in [0, 360)', () => {
    expect(normaliseAngle(0)).toBe(0)
    expect(normaliseAngle(360)).toBe(0)
    expect(normaliseAngle(-5)).toBe(355)
    expect(normaliseAngle(725)).toBe(5)
    expect(normaliseAngle(-0)).toBe(0)
  })
})

describe('stepRotation', () => {
  it('turns by 5° per step', () => {
    expect(ROTATION_STEP).toBe(5)
    expect(stepRotation(0, 1)).toBe(5)
    expect(stepRotation(0, -1)).toBe(355)
  })

  it('pressing E 18 times turns an item from 0° to 90°', () => {
    let angle = 0
    for (let i = 0; i < 18; i++) angle = stepRotation(angle, 1)
    expect(angle).toBe(90)
  })

  it('keeps any angle that is not on a step, and wraps past 360°', () => {
    expect(stepRotation(12.5, 1)).toBe(17.5)
    expect(stepRotation(358, 1)).toBe(3)
  })
})

describe('pointerAngle', () => {
  // Same sense as the item's rotation: a turn of θ takes item +X to (cos θ, -sin θ) on the floor.
  it('is 0° along +X and 90° along -Z from the centre', () => {
    const centre = { x: 100, z: 100 }
    expect(pointerAngle(centre, { x: 150, z: 100 })).toBeCloseTo(0)
    expect(pointerAngle(centre, { x: 100, z: 50 })).toBeCloseTo(90)
    expect(pointerAngle(centre, { x: 50, z: 100 })).toBeCloseTo(180)
    expect(pointerAngle(centre, { x: 100, z: 150 })).toBeCloseTo(270)
  })
})

describe('rotateByHandle', () => {
  it('turns the item by as much as the pointer turned around its centre', () => {
    expect(rotateByHandle(0, 90, 120)).toBeCloseTo(30)
    expect(rotateByHandle(45, 270, 180)).toBeCloseTo(315)
  })

  it('crosses 0° cleanly in either direction', () => {
    expect(rotateByHandle(350, 10, 30)).toBeCloseTo(10)
    expect(rotateByHandle(10, 350, 330)).toBeCloseTo(350)
  })

  it('turns by any angle, not only whole steps', () => {
    expect(rotateByHandle(0, 0, 12.3)).toBeCloseTo(12.3)
  })
})
