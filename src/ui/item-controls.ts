// Select, move and rotate items with the pointer and the keyboard, in the orbit view and the top view.
// The maths is in src/model/move.ts. A drag or a turn shows live in the scene and reaches the
// store once, when it ends, so autosave and undo see one change per move.
// Duplicate (Ctrl+D or ⌘D) and Delete (Delete or Backspace) act on the selected item, each as one change.
import * as THREE from 'three'
import { duplicateItem } from '../model/editItem.ts'
import { addItem, currentVersion, removeItem, updateItem } from '../model/home.ts'
import type { FloorPoint, Item } from '../model/item.ts'
import { dragPosition, pointerAngle, rotateByHandle, stepRotation } from '../model/move.ts'
import { itemPlacement } from '../model/placement.ts'
import { wallsOf, type Room } from '../model/plan.ts'
import { snapPosition, snapRotation, snapStepRotation, type Guide } from '../model/snap.ts'
import type { Store } from '../model/store.ts'
import type { HomeView } from '../scene/home.ts'
import type { SnapGuidesView } from '../scene/snap-guides.ts'
import { tintFloor, tintItem, type SelectionView } from '../scene/selection.ts'
import { isMacPlatform, isTypingTarget, itemShortcut } from './shortcuts.ts'

/** A press that moves less than this many pixels before release is a click. */
const CLICK_SLOP = 5

type Gesture =
  | { kind: 'move'; item: Item; pointerStart: FloorPoint; preview: Item }
  | { kind: 'rotate'; item: Item; pointerStartAngle: number; preview: Item }
  | { kind: 'press'; x: number; y: number }

export type ItemControlsOptions = {
  /** The element that receives pointer events, in front of the canvas or containing it. */
  surface: HTMLElement
  canvas: HTMLElement
  camera: THREE.Camera
  controls: { enabled: boolean }
  store: Store
  view: () => HomeView
  selection: SelectionView
  /** Whether the Snap toggle is on. Holding Alt during a drag turns it off for that drag. */
  snap?: () => boolean
  /** Shows what a dragged item snapped to. */
  guides?: SnapGuidesView
  /** Called with the selected item (or null) whenever the selection or the home changes. */
  onSelect?: (item: Item | null) => void
  /** Called with the selected room (or null) whenever the selection or the home changes. */
  onSelectRoom?: (room: Room | null) => void
  mac?: boolean
}

export type ItemControls = {
  selectedId: () => string | null
  /** The id of the selected room, or `null`. An item and a room are never selected together. */
  selectedRoomId: () => string | null
  /** Clears the selection, item or room. */
  clear: () => void
  /** Call after the home view is rebuilt, so the highlight lands on the new meshes. */
  refresh: () => void
  /** Copies the selected item 20 cm to the right and towards the camera, and selects the copy. */
  duplicateSelected: () => void
  /** Removes the selected item and clears the selection. */
  deleteSelected: () => void
  /** Clears the selection. */
  deselect: () => void
}

const FLOOR = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))

export const mountItemControls = ({ surface, canvas, camera, controls, store, view, selection, snap = () => false, guides, onSelect, onSelectRoom, mac = isMacPlatform(navigator.platform) }: ItemControlsOptions): ItemControls => {
  let selected: string | null = null
  let selectedRoom: string | null = null
  let gesture: Gesture | null = null
  const raycaster = new THREE.Raycaster()

  const items = () => currentVersion(store.get()).items
  const findItem = (id: string | null) => items().find((item) => item.id === id) ?? null
  const groupOf = (id: string) => view().items.find((group) => group.name === id)

  const aim = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect()
    const ndc = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
    raycaster.setFromCamera(ndc, camera)
  }

  const floorPoint = (): FloorPoint | null => {
    const hit = raycaster.ray.intersectPlane(FLOOR, new THREE.Vector3())
    return hit ? { x: hit.x, z: hit.z } : null
  }

  /** The item under the pointer, unless a solid wall stands in front of it. Faded walls let clicks through. */
  const pickItem = (): string | null => {
    const home = view()
    const solidWalls = home.walls.filter(({ mesh }) => mesh.material.opacity === 1).map(({ mesh }) => mesh)
    const [hit] = raycaster.intersectObjects([...home.items, ...solidWalls], true)
    for (let object: THREE.Object3D | null = hit?.object ?? null; object; object = object.parent) {
      if (home.items.includes(object as THREE.Group)) return object.name
    }
    return null
  }

  /** The room whose floor is under the pointer, unless a solid wall stands in front of it. */
  const pickRoom = (): string | null => {
    const home = view()
    const solidWalls = home.walls.filter(({ mesh }) => mesh.material.opacity === 1).map(({ mesh }) => mesh)
    const [hit] = raycaster.intersectObjects([...home.floors, ...solidWalls], false)
    return hit && home.floors.includes(hit.object as THREE.Mesh) ? hit.object.name : null
  }

  const findRoom = (id: string | null) => store.get().plan.rooms.find((room) => room.id === id) ?? null

  const show = (item: Item | null) => {
    for (const group of view().items) tintItem(group, group.name === item?.id)
    for (const floor of view().floors) tintFloor(floor, floor.name === selectedRoom)
    selection.show(item)
    onSelect?.(item)
    onSelectRoom?.(findRoom(selectedRoom))
  }

  /** Selects an item, which clears any selected room. */
  const select = (id: string | null) => {
    selected = id
    selectedRoom = null
    show(findItem(id))
  }

  /** Selects a room, which clears any selected item. */
  const selectRoom = (id: string | null) => {
    selected = null
    selectedRoom = id
    show(null)
  }

  /** Shows an item where it would be after the gesture, without touching the store. */
  const preview = (item: Item) => {
    const group = groupOf(item.id)
    if (group) {
      const { origin, angle } = itemPlacement(item)
      group.position.set(origin.x, origin.y, origin.z)
      group.rotation.y = angle
    }
    selection.show(item)
  }

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || !event.isPrimary || gesture) return
    aim(event)
    const point = floorPoint()
    const current = findItem(selected)
    if (current && point && raycaster.intersectObject(selection.handle).length > 0) {
      gesture = { kind: 'rotate', item: current, pointerStartAngle: pointerAngle(current.position, point), preview: current }
    } else {
      const id = pickItem()
      const item = findItem(id)
      if (item && point) {
        select(item.id)
        gesture = { kind: 'move', item, pointerStart: point, preview: item }
      } else {
        gesture = { kind: 'press', x: event.clientX, y: event.clientY }
        return // empty floor: the camera orbits as before
      }
    }
    // Runs before the orbit controls see the press, so the camera stays still during the drag.
    controls.enabled = false
    event.preventDefault()
  }

  const onPointerMove = (event: PointerEvent) => {
    if (!gesture || gesture.kind === 'press') return
    aim(event)
    const point = floorPoint()
    if (!point) return
    const { item } = gesture
    const snapping = snap() && !event.altKey
    let shown: Guide[] = []
    if (gesture.kind === 'move') {
      const raw = dragPosition(item.position, gesture.pointerStart, point)
      if (snapping) {
        const snapped = snapPosition(item, raw, items(), wallsOf(store.get().plan))
        gesture.preview = { ...item, position: snapped.position }
        shown = [snapped.x, snapped.z].flatMap((target) => (target.kind === 'grid' ? [] : [target.guide]))
      } else {
        gesture.preview = { ...item, position: raw }
      }
    } else {
      const angle = rotateByHandle(item.rotation, gesture.pointerStartAngle, pointerAngle(item.position, point))
      gesture.preview = { ...item, rotation: snapping ? snapRotation(angle) : angle }
    }
    guides?.show(shown)
    preview(gesture.preview)
  }

  const onPointerUp = (event: PointerEvent) => {
    if (!gesture || !event.isPrimary) return
    const ended = gesture
    gesture = null
    controls.enabled = true
    guides?.show([])
    if (ended.kind === 'press') {
      // A click on a room's floor selects the room; anywhere else clears the selection.
      if (Math.hypot(event.clientX - ended.x, event.clientY - ended.y) < CLICK_SLOP) {
        aim(event)
        selectRoom(pickRoom())
      }
      return
    }
    const { item, preview: moved } = ended
    if (moved.position.x === item.position.x && moved.position.z === item.position.z && moved.rotation === item.rotation) return
    store.set(updateItem(store.get(), item.id, { position: moved.position, rotation: moved.rotation }))
  }

  /** A cancelled drag puts the item back where it was and changes nothing. */
  const onPointerCancel = () => {
    if (!gesture) return
    const ended = gesture
    gesture = null
    controls.enabled = true
    guides?.show([])
    if (ended.kind !== 'press') preview(ended.item)
  }

  const duplicateSelected = () => {
    const item = findItem(selected)
    if (!item || gesture) return
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0)
    const copy = duplicateItem(item, crypto.randomUUID(), { x: right.x, z: right.z })
    selected = copy.id // set first, so the refresh after the change shows the copy as selected
    store.set(addItem(store.get(), copy))
  }

  const deleteSelected = () => {
    const item = findItem(selected)
    if (!item || gesture) return
    selected = null
    store.set(removeItem(store.get(), item.id))
  }

  const onKeyDown = (event: KeyboardEvent) => {
    // Like the other shortcuts, these are ignored while typing in a field.
    const action = isTypingTarget(event.target) || isTyping(event.target) ? null : itemShortcut(event, mac)
    if (action) {
      if (!findItem(selected)) return
      event.preventDefault() // Ctrl+D would otherwise bookmark the page
      if (action === 'duplicate') duplicateSelected()
      else deleteSelected()
      return
    }
    if (isTyping(event.target) || event.ctrlKey || event.metaKey || event.altKey) return
    if (event.key === 'Escape') {
      select(null)
      return
    }
    const steps = { q: -1, e: 1 }[event.key.toLowerCase()]
    const item = findItem(selected)
    if (!steps || !item || gesture) return
    event.preventDefault()
    store.set(updateItem(store.get(), item.id, { rotation: snap() ? snapStepRotation(item.rotation, steps) : stepRotation(item.rotation, steps) }))
  }

  // Capture on the surface: these run before the orbit controls' own listeners on the canvas.
  surface.addEventListener('pointerdown', onPointerDown, { capture: true })
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerCancel)
  window.addEventListener('keydown', onKeyDown)

  const refresh = () => {
    // A home that no longer has the selected item (an import, say) clears the selection.
    if (selected !== null && !findItem(selected)) selected = null
    if (selectedRoom !== null && !findRoom(selectedRoom)) selectedRoom = null
    show(findItem(selected))
  }

  /** Clears the item or room selection, if there is one. Used when a door or window is selected. */
  const deselect = () => {
    if (selected !== null || selectedRoom !== null) select(null)
  }

  return { selectedId: () => selected, selectedRoomId: () => selectedRoom, clear: () => select(null), refresh, duplicateSelected, deleteSelected, deselect }
}
