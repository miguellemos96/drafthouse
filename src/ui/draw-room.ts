// The Draw room tool: the Draw room button (or the R key) turns it on, in the top view; each click on
// the floor adds a corner, and a click on the first corner closes the room. A live line follows the
// pointer from the last corner, with its length. Backspace removes the last corner, Escape cancels,
// and Alt turns snapping off. The rules are in src/model/drawRoom.ts. The new room reaches the store
// as one change.
import * as THREE from 'three'
import { t, type StringKey } from '../i18n/index.ts'
import { closeRoom, planCorners, sketchClick, snapCorner, type DrawError } from '../model/drawRoom.ts'
import { setPlan } from '../model/home.ts'
import type { Point } from '../model/plan.ts'
import type { Store } from '../model/store.ts'
import type { CornerHandlesView } from '../scene/corner-handles.ts'
import { floorLine, type MeasureView } from '../scene/measures.ts'
import { isTypingTarget } from './shortcuts.ts'

const FLOOR = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)

export type DrawRoomOptions = {
  parent: HTMLElement
  /** The element that receives pointer events, in front of the canvas or containing it. */
  surface: HTMLElement
  canvas: HTMLElement
  camera: THREE.Camera
  store: Store
  isTopView: () => boolean
  /** Switches to the top view; drawing happens there. */
  enterTopView: () => void
  measures: MeasureView
  /** Marks the corners drawn so far. */
  dots: CornerHandlesView
  /** Called when drawing starts, so other selections and tools can step aside. */
  onStart?: () => void
  /** While this returns true, the tool can't start and clicks pass by (another tool has the pointer). */
  paused?: () => boolean
}

export type DrawRoom = {
  /** True while a room is being drawn. */
  active: () => boolean
  /** Redraws the text; also ends drawing if the view left the top view. */
  render: () => void
}

export const mountDrawRoom = (options: DrawRoomOptions): DrawRoom => {
  const { parent, surface, canvas, camera, store, isTopView, enterTopView, measures, dots, onStart, paused = () => false } = options
  const box = document.createElement('div')
  box.id = 'draw-room'
  const button = document.createElement('button')
  button.type = 'button'
  button.id = 'draw-room-tool'
  const hint = document.createElement('p')
  hint.id = 'draw-room-hint'
  const message = document.createElement('p')
  message.id = 'draw-room-message'
  message.setAttribute('role', 'alert')
  box.append(button, hint, message)
  parent.appendChild(box)

  let on = false
  let corners: Point[] = []
  let pointer: Point | null = null
  let error: DrawError | null = null
  const raycaster = new THREE.Raycaster()

  const draw = () => {
    const last = corners.at(-1)
    const live = pointer && last && (pointer.x !== last.x || pointer.y !== last.y)
    const outline = live && pointer ? [...corners, pointer] : corners
    const lift = (p: Point) => ({ x: p.x, z: p.y })
    const lines = outline.slice(1).map((to, i) => {
      const from = outline[i]
      return floorLine({ from: lift(from), to: lift(to), distance: Math.hypot(to.x - from.x, to.y - from.y) }, 'sketch')
    })
    measures.showSketch(lines)
    dots.show(corners)
  }

  const render = () => {
    if (on && !isTopView()) stop()
    button.textContent = t('room.draw.tool')
    button.title = t('room.draw.tool.title')
    button.setAttribute('aria-pressed', String(on))
    hint.textContent = t('room.draw.hint')
    hint.hidden = !on
    message.textContent = error ? t(`room.draw.error.${error}` satisfies StringKey) : ''
    message.hidden = error === null
  }

  const reset = () => {
    corners = []
    pointer = null
    error = null
    draw()
  }

  const start = () => {
    if (paused()) return
    if (!isTopView()) enterTopView()
    onStart?.()
    on = true
    reset()
    render()
  }

  function stop() {
    on = false
    reset()
    render()
  }

  /** The snapped corner under the pointer, or null off the floor. */
  const snapped = (event: PointerEvent | MouseEvent): Point | null => {
    const rect = canvas.getBoundingClientRect()
    const ndc = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
    raycaster.setFromCamera(ndc, camera)
    const hit = raycaster.ray.intersectPlane(FLOOR, new THREE.Vector3())
    if (!hit) return null
    const targets = [...planCorners(store.get().plan), ...corners]
    return snapCorner({ x: hit.x, y: hit.z }, { targets, previous: corners.at(-1) ?? null, free: event.altKey })
  }

  surface.addEventListener(
    'pointerdown',
    (event) => {
      if (!on || event.button !== 0 || !event.isPrimary || paused()) return
      // Runs before the other tools and the orbit controls, so none of them sees this press.
      event.preventDefault()
      event.stopImmediatePropagation()
      const point = snapped(event)
      if (!point) return
      const click = sketchClick(corners, point)
      error = null
      if (click.close) {
        const home = store.get()
        const result = closeRoom(home.plan, click.corners, { name: t('room.defaultName', { n: home.plan.rooms.length + 1 }) })
        if ('error' in result) {
          error = result.error
          render()
          return
        }
        stop()
        store.set(setPlan(home, result.plan))
        return
      }
      corners = click.corners
      pointer = point
      draw()
      render()
    },
    { capture: true },
  )

  window.addEventListener('pointermove', (event) => {
    if (!on) return
    pointer = snapped(event)
    draw()
  })

  window.addEventListener('keydown', (event) => {
    if (isTypingTarget(event.target) || event.target instanceof HTMLSelectElement || event.ctrlKey || event.metaKey || event.altKey) return
    if (event.key.toLowerCase() === 'r' && !event.shiftKey) {
      event.preventDefault()
      if (on) stop()
      else start()
      return
    }
    if (!on) return
    if (event.key === 'Escape') {
      // Ours alone: Escape here cancels the drawing and nothing else.
      event.stopImmediatePropagation()
      stop()
    } else if (event.key === 'Backspace' || event.key === 'Delete') {
      // Never deletes a selected item while drawing.
      event.preventDefault()
      event.stopImmediatePropagation()
      corners = corners.slice(0, -1)
      error = null
      draw()
      render()
    }
  })

  button.addEventListener('click', () => (on ? stop() : start()))

  render()
  return { active: () => on, render }
}
