// Templates turn an item's size into simple 3D parts, in item space (see item.ts).
// Every part lies inside the box from (-width/2, 0, -depth/2) to (width/2, height, depth/2).
// Each fixed measurement (a leg's thickness, a seat's height) is capped by a share of the
// size, so tiny or odd sizes still give positive parts that fit.

import type { Mount, Size } from './item.ts'

export interface Part {
  /** A cylinder stands upright; its width and depth are its diameters along X and Z. */
  shape: 'box' | 'cylinder'
  center: { x: number; y: number; z: number }
  size: Size
  /** Lightness change from the item's colour, from -1 (black) to 1 (white). Negative is darker. */
  shade?: number
}

export interface Template {
  defaultSize: Size
  defaultMount: Mount
  parts: (size: Size) => Part[]
}

const LEG_SHADE = -0.3

function box(x: number, y0: number, z: number, width: number, height: number, depth: number, shade?: number): Part {
  const part: Part = { shape: 'box', center: { x, y: y0 + height / 2, z }, size: { width, depth, height } }
  if (shade !== undefined) part.shade = shade
  return part
}

function fourLegs(size: Size, leg: number, height: number, shape: Part['shape']): Part[] {
  const x = size.width / 2 - leg / 2
  const z = size.depth / 2 - leg / 2
  return [
    [-x, -z],
    [x, -z],
    [x, z],
    [-x, z],
  ].map(([lx, lz]) => ({
    shape,
    center: { x: lx, y: height / 2, z: lz },
    size: { width: leg, depth: leg, height },
    shade: LEG_SHADE,
  }))
}

// Base, back and two arms. Used by the sofa and the armchair.
function upholstered({ width, depth, height }: Size): Part[] {
  const arm = Math.min(20, width * 0.15)
  const seat = Math.min(42, height * 0.5)
  const armHeight = Math.min(62, height * 0.75)
  const back = Math.min(20, depth * 0.25)
  const inner = width - 2 * arm
  const armX = width / 2 - arm / 2
  return [
    box(0, 0, 0, inner, seat, depth),
    box(0, seat, -depth / 2 + back / 2, inner, height - seat, back),
    box(-armX, 0, 0, arm, armHeight, depth),
    box(armX, 0, 0, arm, armHeight, depth),
  ]
}

export const templates = {
  box: {
    defaultSize: { width: 50, depth: 50, height: 50 },
    defaultMount: 'floor',
    parts: ({ width, depth, height }) => [box(0, 0, 0, width, height, depth)],
  },
  sofa: {
    defaultSize: { width: 210, depth: 95, height: 83 },
    defaultMount: 'floor',
    parts: upholstered,
  },
  armchair: {
    defaultSize: { width: 80, depth: 85, height: 80 },
    defaultMount: 'floor',
    parts: upholstered,
  },
  chair: {
    defaultSize: { width: 45, depth: 50, height: 85 },
    defaultMount: 'floor',
    parts: (size) => {
      const { width, depth, height } = size
      const seat = Math.min(45, height * 0.55)
      const thickness = Math.min(4, height * 0.08)
      const back = Math.min(4, depth * 0.1)
      const leg = Math.min(4, width * 0.15, depth * 0.15)
      const legHeight = seat - thickness
      return [
        box(0, legHeight, 0, width, thickness, depth),
        box(0, seat, -depth / 2 + back / 2, width, height - seat, back),
        ...fourLegs(size, leg, legHeight, 'cylinder'),
      ]
    },
  },
  table: {
    defaultSize: { width: 160, depth: 90, height: 75 },
    defaultMount: 'floor',
    parts: (size) => {
      const top = Math.min(4, size.height * 0.1)
      const leg = Math.min(6, size.width * 0.1, size.depth * 0.1)
      const legHeight = size.height - top
      return [box(0, legHeight, 0, size.width, top, size.depth), ...fourLegs(size, leg, legHeight, 'box')]
    },
  },
  desk: {
    defaultSize: { width: 120, depth: 60, height: 75 },
    defaultMount: 'floor',
    parts: ({ width, depth, height }) => {
      const top = Math.min(3, height * 0.1)
      const side = Math.min(3, width * 0.1)
      const sideHeight = height - top
      const sideX = width / 2 - side / 2
      return [
        box(0, sideHeight, 0, width, top, depth),
        box(-sideX, 0, 0, side, sideHeight, depth, LEG_SHADE),
        box(sideX, 0, 0, side, sideHeight, depth, LEG_SHADE),
      ]
    },
  },
  bed: {
    defaultSize: { width: 160, depth: 210, height: 100 },
    defaultMount: 'floor',
    parts: ({ width, depth, height }) => {
      const head = Math.min(8, depth * 0.1)
      const frame = Math.min(30, height * 0.3)
      const mattress = Math.min(20, height * 0.2)
      const inset = Math.min(2, width * 0.02, depth * 0.02)
      const frameDepth = depth - head
      const frameZ = head / 2
      return [
        box(0, 0, frameZ, width, frame, frameDepth, -0.2),
        box(0, frame, frameZ, width - 2 * inset, mattress, frameDepth - 2 * inset, 0.3),
        box(0, 0, -depth / 2 + head / 2, width, height, head, -0.2),
      ]
    },
  },
} satisfies Record<string, Template>

export type TemplateId = keyof typeof templates

export const templateIds = Object.keys(templates) as TemplateId[]
