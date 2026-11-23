// Draws a plan and its items: one floor per room, the walls as boxes around their doors and windows,
// a pane per window, a swing arc per door, and one group per item. Plan (x, y) maps to scene (x, z); +Y is up.
// Clashing items are tinted red, and a blocked door's arc is drawn red and shown in every view (see src/model/clashes.ts).
import * as THREE from 'three'
import { wallFades } from '../model/fade.ts'
import type { Item } from '../model/item.ts'
import { openingsOf, spanOn, swingArc, wallOf, wallPieces, type WallPiece } from '../model/openings.ts'
import { WALL_THICKNESS, wallLength, wallsOf, type Plan, type Wall } from '../model/plan.ts'
import { itemVisible, wallVisible, type HiddenRooms } from '../model/visibility.ts'
import { buildItem, tintClash } from './items.ts'

export { WALL_THICKNESS }
const FADED_OPACITY = 0.15
const PANE_THICKNESS = 2 // cm
const ARC_LIFT = 1 // cm above the floor, so the arc doesn't flicker against it
const ARC_STEPS = 16
const ARC_COLOUR = 0x2f80ed
const BLOCKED_ARC_COLOUR = 0xe0242a

export type HomeView = {
  group: THREE.Group
  /** One floor per room, in plan order, each named after its room's id. */
  floors: THREE.Mesh[]
  /** One box per wall piece: a wall without openings is one box; one with openings has a box beside, under and above each. */
  walls: { wall: Wall; mesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>; opening?: string }[]
  /** A thin pane in each window's hole. */
  panes: { opening: string; mesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial> }[]
  /** Each door's swing: a flat quarter circle on the floor, shown in the top view only. */
  arcs: { opening: string; object: THREE.Group }[]
  /** Shows or hides the doors' swing arcs. A blocked door's arc shows either way. */
  showArcs: (on: boolean) => void
  /** Tints the clashing items red and draws the blocked doors' arcs red; everything else goes back to normal. */
  showClashes: (items: ReadonlySet<string>, doors: ReadonlySet<string>) => void
  /** One group per item, in the order given. */
  items: THREE.Group[]
  /** Fades the walls the model says stand between this camera and the rooms; `null` fades none. */
  applyFade: (camera: THREE.Vector3 | null) => void
  /** Hides the hidden rooms' floors, the walls only they border with their doors and windows, and the items inside them. */
  applyHidden: (hidden: HiddenRooms) => void
}

const floorMesh = (corners: { x: number; y: number }[]) => {
  const shape = new THREE.Shape(corners.map((p) => new THREE.Vector2(p.x, p.y)))
  const geometry = new THREE.ShapeGeometry(shape)
  geometry.rotateX(Math.PI / 2) // shape (x, y, 0) → scene (x, 0, y)
  const material = new THREE.MeshStandardMaterial({ color: 0xd9c6a5, side: THREE.DoubleSide })
  return new THREE.Mesh(geometry, material)
}

const wallBox = (wall: Wall, from: number, to: number, bottom: number, top: number, material: THREE.Material, depth = WALL_THICKNESS) => {
  const length = wallLength(wall)
  const dx = (wall.b.x - wall.a.x) / length
  const dz = (wall.b.y - wall.a.y) / length
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(to - from, top - bottom, depth), material)
  const mid = (from + to) / 2
  mesh.position.set(wall.a.x + dx * mid, (bottom + top) / 2, wall.a.y + dz * mid)
  mesh.rotation.y = Math.atan2(-dz, dx) // the box's length runs along the wall
  return mesh
}

const wallMesh = (wall: Wall, piece: WallPiece) => {
  const length = wallLength(wall)
  // The pieces at the wall's ends reach half a thickness further, so neighbouring walls overlap at the
  // corners instead of leaving a notch.
  const from = piece.from === 0 ? -WALL_THICKNESS / 2 : piece.from
  const to = piece.to === length ? length + WALL_THICKNESS / 2 : piece.to
  const material = new THREE.MeshStandardMaterial({ color: 0xf2efe9, transparent: true })
  return wallBox(wall, from, to, piece.bottom, piece.top, material) as THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>
}

const arcObject = ({ centre, radius, startAngle, endAngle }: NonNullable<ReturnType<typeof swingArc>>) => {
  const points = Array.from({ length: ARC_STEPS + 1 }, (_, i) => {
    const angle = startAngle + ((endAngle - startAngle) * i) / ARC_STEPS
    return new THREE.Vector2(centre.x + radius * Math.cos(angle), centre.y + radius * Math.sin(angle))
  })
  const outline = [new THREE.Vector2(centre.x, centre.y), ...points]
  const fill = new THREE.ShapeGeometry(new THREE.Shape(outline))
  fill.rotateX(Math.PI / 2) // shape (x, y, 0) → scene (x, 0, y)
  const sector = new THREE.Mesh(fill, new THREE.MeshBasicMaterial({ color: ARC_COLOUR, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }))
  const line = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(outline.map((p) => new THREE.Vector3(p.x, 0, p.y))),
    new THREE.LineBasicMaterial({ color: ARC_COLOUR }),
  )
  const group = new THREE.Group()
  group.add(sector, line)
  group.position.y = ARC_LIFT
  group.visible = false
  // The arc is a drawing on the floor: pointer input goes through it.
  sector.raycast = () => {}
  line.raycast = () => {}
  return group
}

export const buildHome = (plan: Plan, items: Item[] = []): HomeView => {
  const group = new THREE.Group()
  const floors = plan.rooms.map((room) => {
    const mesh = floorMesh(room.corners)
    mesh.name = room.id
    return mesh
  })
  // wallPieces gives each piece its wall's height: the taller of the rooms it borders.
  const walls = wallsOf(plan).flatMap((wall) => wallPieces(plan, wall).map((piece) => ({ wall, mesh: wallMesh(wall, piece), opening: piece.opening })))
  const panes: HomeView['panes'] = []
  const arcs: HomeView['arcs'] = []
  const wallOfOpening = new Map<string, Wall>()
  for (const opening of openingsOf(plan)) {
    const wall = wallOf(plan, opening.wall)
    if (!wall) continue // a wall that no longer exists: nothing to draw
    wallOfOpening.set(opening.id, wall)
    if (opening.kind === 'window') {
      const { start, end } = spanOn(opening, wall)
      const material = new THREE.MeshStandardMaterial({ color: 0xa9cce3, transparent: true, opacity: 0.35, depthWrite: false })
      const mesh = wallBox(wall, start, end, opening.sillHeight, opening.sillHeight + opening.height, material, PANE_THICKNESS)
      panes.push({ opening: opening.id, mesh: mesh as THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial> })
    } else {
      const arc = swingArc(plan, opening)
      if (arc) arcs.push({ opening: opening.id, object: arcObject(arc) })
    }
  }
  const itemGroups = items.map(buildItem)
  group.add(...floors, ...walls.map((w) => w.mesh), ...panes.map((p) => p.mesh), ...arcs.map((a) => a.object), ...itemGroups)

  const applyFade = (camera: THREE.Vector3 | null) => {
    for (const { wall, mesh } of walls) {
      const faded = camera !== null && wallFades(plan, wall, { x: camera.x, y: camera.z })
      mesh.material.opacity = faded ? FADED_OPACITY : 1
      mesh.material.depthWrite = !faded
    }
  }
  let arcsOn = false
  let blockedDoors: ReadonlySet<string> = new Set()
  let hiddenRooms: HiddenRooms = new Set()
  const openingShown = (id: string) => {
    const wall = wallOfOpening.get(id)
    return !wall || wallVisible(wall, hiddenRooms)
  }
  const showArcs = (on: boolean) => {
    arcsOn = on
    for (const { opening, object } of arcs) object.visible = (on || blockedDoors.has(opening)) && openingShown(opening)
  }
  const showClashes = (clashing: ReadonlySet<string>, doors: ReadonlySet<string>) => {
    for (const group of itemGroups) tintClash(group, clashing.has(group.name))
    blockedDoors = doors
    for (const { opening, object } of arcs) {
      const colour = doors.has(opening) ? BLOCKED_ARC_COLOUR : ARC_COLOUR
      object.traverse((part) => {
        if (part instanceof THREE.Mesh || part instanceof THREE.Line) (part.material as THREE.MeshBasicMaterial).color.setHex(colour)
      })
    }
    showArcs(arcsOn)
  }
  const applyHidden = (hidden: HiddenRooms) => {
    hiddenRooms = hidden
    for (const floor of floors) floor.visible = !hidden.has(floor.name)
    for (const { wall, mesh } of walls) mesh.visible = wallVisible(wall, hidden)
    for (const { opening, mesh } of panes) mesh.visible = openingShown(opening)
    items.forEach((item, i) => (itemGroups[i].visible = itemVisible(plan, item, hidden)))
    showArcs(arcsOn)
  }
  return { group, floors, walls, panes, arcs, showArcs, showClashes, items: itemGroups, applyFade, applyHidden }
}
