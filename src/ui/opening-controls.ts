// Doors and windows in the top view: the Add door and Add window buttons, then a click on a wall to
// place one there; a press on a door or window selects it, and a drag slides it along its wall.
// The rules are in src/model/openings.ts. A drag shows live through `preview` and reaches the store
// once, when it ends, so autosave and undo see one change per move.
import * as THREE from 'three'
import { t } from '../i18n/index.ts'
import { setPlan } from '../model/home.ts'
import { addOpening, alongWall, moveOpening, newOpening, openingAt, openingsOf, type Opening, type OpeningKind } from '../model/openings.ts'
import type { Plan, Wall } from '../model/plan.ts'
import type { Store } from '../model/store.ts'
import type { HomeView } from '../scene/home.ts'

const TINT = 0x1d3f66

export type OpeningControlsOptions = {
  parent: HTMLElement
  /** The element that receives pointer events, in front of the canvas or containing it. */
  surface: HTMLElement
  canvas: HTMLElement
  camera: THREE.Camera
  controls: { enabled: boolean }
  store: Store
  view: () => HomeView
  isTopView: () => boolean
  /** While this returns true, the pointer neither selects nor drags doors and windows (another tool has it). */
  paused?: () => boolean
  /** Draws the home with this plan instead of the stored one, or the stored one again for null. */
  preview: (plan: Plan | null) => void
  /** Called with the selected opening (or null) whenever the selection or the home changes. */
  onSelect?: (opening: Opening | null) => void
}

export type OpeningControls = {
  selectedId: () => string | null
  /** Clears the selection and stops placing. */
  deselect: () => void
  /** Call after the home view is rebuilt, so the highlight lands on the new meshes. */
  refresh: () => void
  /** Call when the view switches: the buttons only show in the top view. */
  render: () => void
}

type Drag = { opening: Opening; grab: number; plane: THREE.Plane; moved: Plan | null }

export const mountOpeningControls = (options: OpeningControlsOptions): OpeningControls => {
  const { parent, surface, canvas, camera, controls, store, view, isTopView, preview, onSelect, paused = () => false } = options
  let placing: OpeningKind | null = null
  let selected: string | null = null
  let drag: Drag | null = null
  let refused = false
  const raycaster = new THREE.Raycaster()

  const tools = document.createElement('div')
  tools.id = 'opening-tools'
  const button = (id: string, kind: OpeningKind) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.id = id
    b.addEventListener('click', () => {
      placing = placing === kind ? null : kind
      refused = false
      render()
    })
    return b
  }
  const addDoor = button('add-door', 'door')
  const addWindow = button('add-window', 'window')
  const hint = document.createElement('p')
  hint.id = 'opening-hint'
  hint.setAttribute('role', 'status')
  tools.append(addDoor, addWindow, hint)
  parent.appendChild(tools)

  const render = () => {
    const top = isTopView()
    if (!top) placing = null
    tools.hidden = !top
    addDoor.textContent = t('opening.addDoor')
    addWindow.textContent = t('opening.addWindow')
    addDoor.setAttribute('aria-pressed', String(placing === 'door'))
    addWindow.setAttribute('aria-pressed', String(placing === 'window'))
    hint.hidden = placing === null && !refused
    hint.textContent = refused ? t('opening.error.noRoom') : t('opening.placeHint')
  }

  const findOpening = (id: string | null) => openingsOf(store.get().plan).find((o) => o.id === id) ?? null

  const show = () => {
    const home = view()
    for (const { mesh, opening } of [...home.walls, ...home.panes]) mesh.material.emissive.setHex(selected !== null && opening === selected ? TINT : 0x000000)
    onSelect?.(findOpening(selected))
  }

  const select = (id: string | null) => {
    selected = id
    show()
  }

  const aim = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect()
    const ndc = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
    raycaster.setFromCamera(ndc, camera)
  }

  /** The wall under the pointer (through its pieces or a window's pane), and where on it. */
  const pickWall = (): { wall: Wall; point: THREE.Vector3 } | null => {
    const home = view()
    const [hit] = raycaster.intersectObjects([...home.walls.map((w) => w.mesh), ...home.panes.map((p) => p.mesh)])
    if (!hit) return null
    const piece = home.walls.find((w) => w.mesh === hit.object)
    if (piece) return { wall: piece.wall, point: hit.point }
    const pane = home.panes.find((p) => p.mesh === hit.object)
    const opening = findOpening(pane?.opening ?? null)
    const wall = opening && home.walls.find((w) => w.opening === opening.id)?.wall
    return wall ? { wall, point: hit.point } : null
  }

  const take = (event: PointerEvent) => {
    // Runs before the item controls and the orbit controls, so neither sees this press.
    event.preventDefault()
    event.stopImmediatePropagation()
  }

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || !event.isPrimary || drag || !isTopView() || paused()) return
    aim(event)
    const hit = pickWall()
    const plan = store.get().plan
    if (placing) {
      if (!hit) return // off the walls: the view pans as usual
      take(event)
      const point = { x: hit.point.x, y: hit.point.z }
      const opening = newOpening(plan, placing, hit.wall, Math.round(alongWall(hit.wall, point)), crypto.randomUUID(), point)
      const next = opening && addOpening(plan, opening)
      refused = !next
      if (opening && next) {
        placing = null
        selected = opening.id // set first, so the refresh after the change shows it selected
        store.set(setPlan(store.get(), next))
      }
      render()
      return
    }
    const opening = hit && openingAt(plan, hit.wall, alongWall(hit.wall, { x: hit.point.x, y: hit.point.z }))
    if (!hit || !opening) {
      if (selected !== null) select(null)
      return
    }
    take(event)
    select(opening.id)
    const grab = alongWall(opening.wall, { x: hit.point.x, y: hit.point.z }) - opening.offset
    // Drag on the level of the wall's top, where the pointer pressed.
    drag = { opening, grab, plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), -hit.point.y), moved: null }
    controls.enabled = false
  }

  const onPointerMove = (event: PointerEvent) => {
    if (!drag) return
    aim(event)
    const point = raycaster.ray.intersectPlane(drag.plane, new THREE.Vector3())
    if (!point) return
    // Whole centimetres, like the sizes.
    const offset = Math.round(alongWall(drag.opening.wall, { x: point.x, y: point.z }) - drag.grab)
    const moved = moveOpening(store.get().plan, drag.opening.id, offset)
    if (!moved) return
    drag.moved = moved
    preview(moved)
  }

  const onPointerUp = (event: PointerEvent) => {
    if (!drag || !event.isPrimary) return
    const { opening, moved } = drag
    drag = null
    controls.enabled = true
    const now = moved && openingsOf(moved).find((o) => o.id === opening.id)
    if (!moved || !now || now.offset === opening.offset) {
      preview(null)
      return
    }
    store.set(setPlan(store.get(), moved))
  }

  /** A cancelled drag puts the opening back where it was and changes nothing. */
  const onPointerCancel = () => {
    if (!drag) return
    drag = null
    controls.enabled = true
    preview(null)
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || (placing === null && !refused)) return
    placing = null
    refused = false
    render()
  }

  surface.addEventListener('pointerdown', onPointerDown, { capture: true })
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerCancel)
  window.addEventListener('keydown', onKeyDown)

  const refresh = () => {
    // A home that no longer has the selected opening (undo, import) clears the selection.
    if (selected !== null && !findOpening(selected)) selected = null
    show()
  }

  const deselect = () => {
    placing = null
    refused = false
    if (selected !== null) select(null)
    render()
  }

  render()
  return { selectedId: () => selected, deselect, refresh, render }
}
