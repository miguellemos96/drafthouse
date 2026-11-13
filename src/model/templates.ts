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
  /** The parts for this size. Only the lamp looks at the mount: a ceiling lamp hangs down. */
  parts: (size: Size, mount?: Mount) => Part[]
}

const LEG_SHADE = -0.3

function cylinder(y0: number, diameterX: number, diameterZ: number, height: number, shade?: number): Part {
  const part: Part = { shape: 'cylinder', center: { x: 0, y: y0 + height / 2, z: 0 }, size: { width: diameterX, depth: diameterZ, height } }
  if (shade !== undefined) part.shade = shade
  return part
}

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

/** Height per shelf: one shelf per ~35 cm of height, and at least one. */
const SHELF_SPACING = 35

export const shelfCount = (height: number): number => Math.max(1, Math.round(height / SHELF_SPACING))

// Two sides and shelves from the bottom to the top, evenly spaced.
function shelfParts({ width, depth, height }: Size): Part[] {
  const side = Math.min(2, width * 0.1)
  const count = shelfCount(height)
  const board = Math.min(2, (height * 0.5) / count)
  const step = count > 1 ? (height - board) / (count - 1) : 0
  const sideX = width / 2 - side / 2
  const shelves = Array.from({ length: count }, (_, i) => box(0, i * step, 0, width - 2 * side, board, depth))
  return [box(-sideX, 0, 0, side, height, depth, LEG_SHADE), box(sideX, 0, 0, side, height, depth, LEG_SHADE), ...shelves]
}

// Base, pole and shade. A ceiling lamp is a pendant: a canopy at the top, a cord, and the shade at the bottom.
function lampParts({ width, depth, height }: Size, mount: Mount = 'floor'): Part[] {
  const shadeHeight = Math.min(30, height * 0.3)
  const end = Math.min(3, height * 0.05)
  const pole = Math.min(3, width * 0.1, depth * 0.1)
  const stem = height - shadeHeight - end
  if (mount === 'ceiling') {
    const canopy = Math.min(12, width * 0.4, depth * 0.4)
    return [
      cylinder(0, width, depth, shadeHeight, 0.3),
      cylinder(shadeHeight, pole, pole, stem, LEG_SHADE),
      cylinder(height - end, canopy, canopy, end, LEG_SHADE),
    ]
  }
  const base = Math.min(30, width * 0.6, depth * 0.6)
  return [
    cylinder(0, base, base, end, LEG_SHADE),
    cylinder(end, pole, pole, stem, LEG_SHADE),
    cylinder(height - shadeHeight, width, depth, shadeHeight, 0.3),
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
  wardrobe: {
    defaultSize: { width: 100, depth: 60, height: 200 },
    defaultMount: 'floor',
    parts: ({ width, depth, height }) => {
      const door = Math.min(2, depth * 0.05)
      const gap = Math.min(0.5, width * 0.01)
      const doorWidth = (width - gap) / 2
      const doorX = gap / 2 + doorWidth / 2
      const doorZ = depth / 2 - door / 2
      return [
        box(0, 0, -door / 2, width, height, depth - door),
        box(-doorX, 0, doorZ, doorWidth, height, door, 0.1),
        box(doorX, 0, doorZ, doorWidth, height, door, 0.1),
      ]
    },
  },
  shelf: {
    defaultSize: { width: 80, depth: 30, height: 140 },
    defaultMount: 'floor',
    parts: shelfParts,
  },
  'tv-unit': {
    defaultSize: { width: 160, depth: 40, height: 50 },
    defaultMount: 'floor',
    parts: ({ width, depth, height }) => [box(0, 0, 0, width, height, depth)],
  },
  rug: {
    defaultSize: { width: 200, depth: 140, height: 1 },
    defaultMount: 'floor',
    parts: ({ width, depth, height }) => [box(0, 0, 0, width, Math.min(1, height), depth)],
  },
  lamp: {
    defaultSize: { width: 40, depth: 40, height: 160 },
    defaultMount: 'floor',
    parts: lampParts,
  },
  'wall-panel': {
    defaultSize: { width: 60, depth: 3, height: 80 },
    defaultMount: 'wall',
    parts: ({ width, depth, height }) => [box(0, 0, 0, width, height, depth)],
  },
} satisfies Record<string, Template>

export type TemplateId = keyof typeof templates

export const templateIds = Object.keys(templates) as TemplateId[]
