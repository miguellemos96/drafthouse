// Where an item's parts end up in the home, and how they are coloured.
// Item space is described in item.ts; the home uses scene coordinates (plan x → x, plan z → z, +Y up).
import type { Item } from './item.ts'
import { templates, type Part, type Template } from './templates.ts'

export interface Point3 {
  x: number
  y: number
  z: number
}

/** The template an item is drawn with. An unknown template id falls back to `box`. */
export const templateFor = (templateId: string): Template =>
  Object.hasOwn(templates, templateId) ? templates[templateId as keyof typeof templates] : templates.box

/** The parts of an item, in item space. */
export const partsOf = (item: Item): Part[] => templateFor(item.templateId).parts(item.size)

/** The item's base origin in the home and its turn about +Y in radians (Three.js `rotation.y`). */
export const itemPlacement = (item: Item): { origin: Point3; angle: number } => ({
  origin: { x: item.position.x, y: item.elevation, z: item.position.z },
  angle: (item.rotation * Math.PI) / 180,
})

/** Turns a point in item space into the home: rotate about +Y by the item's rotation, then move to its position and elevation. */
export const toHome = (item: Item, local: Point3): Point3 => {
  const { origin, angle } = itemPlacement(item)
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return {
    x: origin.x + local.x * cos + local.z * sin,
    y: origin.y + local.y,
    z: origin.z - local.x * sin + local.z * cos,
  }
}

/** The world centre of one of the item's parts. */
export const partCentre = (item: Item, part: Part): Point3 => toHome(item, part.center)

/**
 * The colour of a part: the item's hex colour moved toward black (negative shade) or white
 * (positive shade) by the shade's size. Returns a `#rrggbb` string.
 */
export const shadeColour = (hex: string, shade = 0): string => {
  const value = Number.parseInt(hex.replace('#', ''), 16)
  const s = Math.max(-1, Math.min(1, shade))
  const target = s < 0 ? 0 : 255
  const channel = (c: number) => Math.round(c + (target - c) * Math.abs(s))
  const [r, g, b] = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map(channel)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}
