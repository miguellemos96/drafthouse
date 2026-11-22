// Corner handles of the selected room: a drag on one moves that corner, with the same snapping as
// drawing (Alt turns it off), in every room that has it, so shared walls stay shared. A drag that
// would make a room cross itself stops at the last outline that didn't. The rules are in
// src/model/drawRoom.ts. A drag shows live through `preview` and reaches the store once, when it ends.
import * as THREE from 'three'
import { dragCorner, snapDraggedCorner } from '../model/drawRoom.ts'
import { setPlan } from '../model/home.ts'
import type { Plan, Point, Room } from '../model/plan.ts'
import type { Store } from '../model/store.ts'
import type { CornerHandlesView } from '../scene/corner-handles.ts'

const FLOOR = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)

export type CornerControlsOptions = {
  /** The element that receives pointer events, in front of the canvas or containing it. */
  surface: HTMLElement
  canvas: HTMLElement
  camera: THREE.Camera
  controls: { enabled: boolean }
  store: Store
  handles: CornerHandlesView
  /** Draws the home with this plan instead of the stored one, or the stored one again for null. */
  preview: (plan: Plan | null) => void
  /** While this returns true, the handles take no presses (another tool has the pointer). */
  paused?: () => boolean
}

export type CornerControls = {
  /** Shows the handles on this room's corners, or hides them for null. */
  show: (room: Room | null) => void
}

type Drag = { room: Room; from: Point; moved: Plan | null }

export const mountCornerControls = ({ surface, canvas, camera, controls, store, handles, preview, paused = () => false }: CornerControlsOptions): CornerControls => {
  let room: Room | null = null
  let drag: Drag | null = null
  const raycaster = new THREE.Raycaster()

  const aim = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect()
    const ndc = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
    raycaster.setFromCamera(ndc, camera)
  }

  const show = (next: Room | null) => {
    room = next
    // While dragging, the handles follow the previewed outline instead.
    if (!drag) handles.show(room?.corners ?? [])
  }

  const onPointerDown = (event: PointerEvent) => {
    if (!room || drag || event.button !== 0 || !event.isPrimary || paused()) return
    aim(event)
    const [hit] = raycaster.intersectObjects(handles.meshes(), false)
    const from = hit && handles.pointOf(hit.object)
    if (!from) return
    // Runs before the other tools and the orbit controls, so none of them sees this press.
    event.preventDefault()
    event.stopImmediatePropagation()
    drag = { room, from, moved: null }
    controls.enabled = false
  }

  const onPointerMove = (event: PointerEvent) => {
    if (!drag) return
    aim(event)
    const hit = raycaster.ray.intersectPlane(FLOOR, new THREE.Vector3())
    if (!hit) return
    const plan = store.get().plan
    const to = snapDraggedCorner(plan, drag.room, drag.from, { x: hit.x, y: hit.z }, event.altKey)
    const moved = dragCorner(plan, drag.from, to)
    if (!moved) return // would cross itself: stay at the last good outline
    drag.moved = moved
    preview(moved)
    handles.show(moved.rooms.find((r) => r.id === drag?.room.id)?.corners ?? [])
  }

  const end = (keep: boolean) => {
    if (!drag) return
    const { moved } = drag
    drag = null
    controls.enabled = true
    if (keep && moved) store.set(setPlan(store.get(), moved))
    else preview(null)
    show(room)
  }

  const onPointerUp = (event: PointerEvent) => {
    if (!drag || !event.isPrimary) return
    const { from, room: dragged, moved } = drag
    const now = moved?.rooms.find((r) => r.id === dragged.id)
    const index = dragged.corners.findIndex((c) => c.x === from.x && c.y === from.y)
    const to = now?.corners[index]
    end(!!to && (to.x !== from.x || to.y !== from.y))
  }

  surface.addEventListener('pointerdown', onPointerDown, { capture: true })
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', () => end(false))

  return { show }
}
