// A new item from the Add item form: its checks, and where it goes in the home.
// See "Adding a product from a link" and "Add item without a link" in docs/spec.md.
import type { FloorPoint, Item, Product, Size } from './item.ts'
import type { Plan, Room } from './plan.ts'
import { templateFor } from './placement.ts'

/** Each size, in cm. */
export const ITEM_SIZE_LIMITS = { min: 1, max: 1000 } as const

export type SizeField = keyof Size
export type ItemFormField = SizeField | 'price'

export const SIZE_FIELDS: SizeField[] = ['width', 'depth', 'height']

export type ItemFormValues = {
  name: string
  templateId: string
  size: Size
  colour: string
  /** No price means the item has none. */
  price?: number
  currency?: string
}

const inRange = (n: number) => Number.isFinite(n) && n >= ITEM_SIZE_LIMITS.min && n <= ITEM_SIZE_LIMITS.max

/** The fields that block adding: sizes out of 1–1000 cm (or not numbers), and a negative or non-numeric price. */
export const itemFormErrors = ({ size, price }: Pick<ItemFormValues, 'size' | 'price'>): ItemFormField[] => {
  const errors: ItemFormField[] = SIZE_FIELDS.filter((f) => !inRange(size[f]))
  if (price !== undefined && !(Number.isFinite(price) && price >= 0)) errors.push('price')
  return errors
}

/** Whether the floor point is inside the room's outline (plan y is the floor's z). */
const contains = (room: Room, { x, z }: FloorPoint): boolean => {
  let inside = false
  const c = room.corners
  for (let i = 0, j = c.length - 1; i < c.length; j = i++) {
    const a = c[i]
    const b = c[j]
    if (a.y > z !== b.y > z && x < ((b.x - a.x) * (z - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/** The room whose floor contains the point, if any. */
export const roomAt = (plan: Plan, point: FloorPoint): Room | undefined => plan.rooms.find((room) => contains(room, point))

/**
 * The room a new item goes in: the one whose floor contains the point under the screen centre,
 * else the first room. `point` is null when the screen centre doesn't look at the floor.
 */
export const targetRoom = (plan: Plan, point: FloorPoint | null): Room | undefined =>
  (point && roomAt(plan, point)) || plan.rooms[0]

/** The area centre of a room's floor. */
export const roomCentre = (room: Room): FloorPoint => {
  let area = 0
  let cx = 0
  let cz = 0
  const c = room.corners
  for (let i = 0; i < c.length; i++) {
    const a = c[i]
    const b = c[(i + 1) % c.length]
    const cross = a.x * b.y - b.x * a.y
    area += cross
    cx += (a.x + b.x) * cross
    cz += (a.y + b.y) * cross
  }
  area /= 2
  return { x: cx / (6 * area), z: cz / (6 * area) }
}

/** Where a new item goes: the centre of the target room, or the origin in a home without rooms. */
export const newItemPosition = (plan: Plan, point: FloorPoint | null): FloorPoint => {
  const room = targetRoom(plan, point)
  return room ? roomCentre(room) : { x: 0, z: 0 }
}

/**
 * The item for valid form values: in the room the camera is looking at, with its template's default
 * mount, standing at elevation 0 and unturned. A price (with its currency) is kept without a link.
 */
export const newItem = (plan: Plan, point: FloorPoint | null, values: ItemFormValues & { id?: string }): Item => {
  const item: Item = {
    id: values.id ?? crypto.randomUUID(),
    name: values.name,
    templateId: values.templateId,
    size: { ...values.size },
    colour: values.colour,
    position: newItemPosition(plan, point),
    elevation: 0,
    rotation: 0,
    mount: templateFor(values.templateId).defaultMount,
  }
  if (values.price !== undefined) {
    const product: Product = { price: values.price }
    if (values.currency) product.currency = values.currency
    item.product = product
  }
  return item
}
