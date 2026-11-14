// Templates turn an item's size into simple 3D parts, in item space (see item.ts).
// Every part lies inside the box from (-width/2, 0, -depth/2) to (width/2, height, depth/2).
// Each fixed measurement (a leg's thickness, a seat's height) is capped by a share of the
// size, so tiny or odd sizes still give positive parts that fit.

import type { Mount, Size } from './item.ts'

export interface Part {
  /**
   * A cylinder stands upright; its width and depth are its diameters along X and Z.
   * With `axis: 'z'` it lies along Z instead, facing the front: its width and height are its
   * diameters along X and Y, and its depth is its length.
   */
  shape: 'box' | 'cylinder'
  axis?: 'z'
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

function cylinderAt(x: number, y0: number, z: number, width: number, height: number, depth: number, shade?: number): Part {
  const part: Part = { shape: 'cylinder', center: { x, y: y0 + height / 2, z }, size: { width, depth, height } }
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
  toilet: {
    defaultSize: { width: 38, depth: 68, height: 78 },
    defaultMount: 'floor',
    // Bowl and seat at the front, tank at the back (-Z), against the wall.
    parts: ({ width, depth, height }) => {
      const tank = Math.min(18, depth * 0.3)
      const bowlDepth = depth - tank
      const seatTop = Math.min(42, height * 0.55)
      const seat = Math.min(3, seatTop * 0.1)
      const bowlHeight = seatTop - seat
      const bowlWidth = width * 0.85
      const bowlZ = -depth / 2 + tank + bowlDepth / 2
      return [
        cylinderAt(0, 0, bowlZ, bowlWidth, bowlHeight, bowlDepth),
        cylinderAt(0, bowlHeight, bowlZ, bowlWidth, seat, bowlDepth, 0.2),
        box(0, bowlHeight / 2, -depth / 2 + tank / 2, width, height - bowlHeight / 2, tank),
      ]
    },
  },
  bidet: {
    defaultSize: { width: 37, depth: 54, height: 40 },
    defaultMount: 'floor',
    parts: ({ width, depth, height }) => {
      const rim = Math.min(15, height * 0.4)
      return [
        box(0, 0, 0, width * 0.6, height - rim, depth * 0.7, -0.1),
        cylinderAt(0, height - rim, 0, width, rim, depth),
      ]
    },
  },
  sink: {
    defaultSize: { width: 60, depth: 45, height: 85 },
    defaultMount: 'floor',
    // A basin on a pedestal.
    parts: ({ width, depth, height }) => {
      const basin = Math.min(18, height * 0.3)
      const pedestal = Math.min(20, width * 0.4, depth * 0.6)
      return [
        cylinderAt(0, 0, 0, pedestal, height - basin, pedestal, -0.1),
        box(0, height - basin, 0, width, basin, depth),
      ]
    },
  },
  'shower-tray': {
    defaultSize: { width: 90, depth: 90, height: 4 },
    defaultMount: 'floor',
    parts: ({ width, depth, height }) => [box(0, 0, 0, width, Math.min(4, height), depth)],
  },
  bathtub: {
    defaultSize: { width: 170, depth: 75, height: 55 },
    defaultMount: 'floor',
    // A low bottom between four full-height sides, so the hollow inside shows.
    parts: ({ width, depth, height }) => {
      const side = Math.min(8, width * 0.15, depth * 0.15)
      const bottom = Math.min(5, height * 0.2)
      const innerWidth = width - 2 * side
      const sideX = width / 2 - side / 2
      const sideZ = depth / 2 - side / 2
      return [
        box(0, 0, 0, innerWidth, bottom, depth - 2 * side, 0.2),
        box(-sideX, 0, 0, side, height, depth),
        box(sideX, 0, 0, side, height, depth),
        box(0, 0, -sideZ, innerWidth, height, side),
        box(0, 0, sideZ, innerWidth, height, side),
      ]
    },
  },
  hob: {
    defaultSize: { width: 60, depth: 52, height: 5 },
    defaultMount: 'on-item',
    // A thin slab with 4 burner discs on top.
    parts: ({ width, depth, height }) => {
      const burner = Math.min(0.5, height * 0.2)
      const slab = height - burner
      const diameter = Math.min(20, width * 0.3, depth * 0.3)
      const burners = [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ].map(([sx, sz]) => cylinderAt((sx * width) / 4, slab, (sz * depth) / 4, diameter, burner, diameter, -0.4))
      return [box(0, 0, 0, width, slab, depth), ...burners]
    },
  },
  oven: {
    defaultSize: { width: 60, depth: 57, height: 60 },
    defaultMount: 'floor',
    // A body with a dark door panel on the front, below a strip for the controls.
    parts: ({ width, depth, height }) => {
      const door = Math.min(3, depth * 0.1)
      return [
        box(0, 0, -door / 2, width, height, depth - door),
        box(0, 0, depth / 2 - door / 2, width, height * 0.8, door, -0.4),
      ]
    },
  },
  'cooker-hood': {
    defaultSize: { width: 60, depth: 50, height: 90 },
    defaultMount: 'wall',
    // A canopy at the bottom and a narrower chimney above it, against the wall (-Z).
    parts: ({ width, depth, height }) => {
      const canopy = Math.min(15, height * 0.3)
      const chimneyWidth = Math.min(30, width * 0.5)
      const chimneyDepth = Math.min(25, depth * 0.5)
      return [
        box(0, 0, 0, width, canopy, depth),
        box(0, canopy, -depth / 2 + chimneyDepth / 2, chimneyWidth, height - canopy, chimneyDepth),
      ]
    },
  },
  fridge: {
    defaultSize: { width: 60, depth: 65, height: 185 },
    defaultMount: 'floor',
    // A body with a lower and an upper door on the front.
    parts: ({ width, depth, height }) => {
      const door = Math.min(4, depth * 0.1)
      const gap = Math.min(1, height * 0.01)
      const lower = (height - gap) * 0.35
      const doorZ = depth / 2 - door / 2
      return [
        box(0, 0, -door / 2, width, height, depth - door),
        box(0, 0, doorZ, width, lower, door, 0.1),
        box(0, lower + gap, doorZ, width, height - lower - gap, door, 0.1),
      ]
    },
  },
  washer: {
    // Also used for dryers: they are the same shape, and the name tells them apart.
    defaultSize: { width: 60, depth: 60, height: 85 },
    defaultMount: 'floor',
    // A body with a round door on the front.
    parts: ({ width, depth, height }) => {
      const door = Math.min(3, depth * 0.1)
      const diameter = Math.min(35, width * 0.6, height * 0.6)
      const doorPart: Part = {
        shape: 'cylinder',
        axis: 'z',
        center: { x: 0, y: height * 0.45, z: depth / 2 - door / 2 },
        size: { width: diameter, depth: door, height: diameter },
        shade: -0.4,
      }
      return [box(0, 0, -door / 2, width, height, depth - door), doorPart]
    },
  },
} satisfies Record<string, Template>

export type TemplateId = keyof typeof templates

export const templateIds = Object.keys(templates) as TemplateId[]
