// The tape measure: a Measure button (or the M key) turns it on; then each pair of clicks on the floor
// or on an item's surface shows the distance between the two points. Escape or the button ends it.
// Measuring never changes the home, so nothing reaches the store. The rules are in src/model/distances.ts.
import * as THREE from 'three'
import { t } from '../i18n/index.ts'
import { emptyTape, tapeClick, tapeLength, type Tape } from '../model/distances.ts'
import type { Point3 } from '../model/placement.ts'
import type { HomeView } from '../scene/home.ts'
import type { MeasureView } from '../scene/measures.ts'
import { isTypingTarget } from './shortcuts.ts'

/** A press that moves less than this many pixels before release is a click; more is the camera orbiting. */
const CLICK_SLOP = 5

const FLOOR = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)

export type TapeMeasureOptions = {
  parent: HTMLElement
  /** The element that receives pointer events, in front of the canvas or containing it. */
  surface: HTMLElement
  canvas: HTMLElement
  camera: THREE.Camera
  view: () => HomeView
  measures: MeasureView
}

export type TapeMeasure = {
  /** True while the tool is on. */
  active: () => boolean
  render: () => void
}

export const mountTapeMeasure = ({ parent, surface, canvas, camera, view, measures }: TapeMeasureOptions): TapeMeasure => {
  const box = document.createElement('div')
  box.id = 'tape-measure'
  const button = document.createElement('button')
  button.type = 'button'
  const hint = document.createElement('p')
  hint.id = 'tape-measure-hint'
  box.append(button, hint)
  parent.appendChild(box)

  let on = false
  let tape: Tape = emptyTape()
  let press: { x: number; y: number } | null = null
  const raycaster = new THREE.Raycaster()

  const render = () => {
    button.textContent = t('measure.tool')
    button.title = t('measure.tool.title')
    button.setAttribute('aria-pressed', String(on))
    hint.textContent = t('measure.hint')
    hint.hidden = !on
  }

  const draw = () => measures.showTape(tape.start, tape.end, tapeLength(tape))

  const setOn = (value: boolean) => {
    on = value
    tape = emptyTape()
    press = null
    draw()
    render()
  }

  /** The point under the pointer: on an item's surface if one is there, else on the floor. */
  const pick = (event: PointerEvent): Point3 | null => {
    const rect = canvas.getBoundingClientRect()
    const ndc = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
    raycaster.setFromCamera(ndc, camera)
    const [hit] = raycaster.intersectObjects(view().items.filter((group) => group.visible), true)
    const point = hit?.point ?? raycaster.ray.intersectPlane(FLOOR, new THREE.Vector3())
    return point ? { x: point.x, y: point.y, z: point.z } : null
  }

  // Capture on the surface, like the item controls: the tool sees the press before anything else.
  surface.addEventListener(
    'pointerdown',
    (event) => {
      if (on && event.button === 0 && event.isPrimary) press = { x: event.clientX, y: event.clientY }
    },
    { capture: true },
  )
  window.addEventListener('pointerup', (event) => {
    if (!on || !press || !event.isPrimary) return
    const moved = Math.hypot(event.clientX - press.x, event.clientY - press.y)
    press = null
    if (moved >= CLICK_SLOP) return // the camera orbited
    const point = pick(event)
    if (!point) return
    tape = tapeClick(tape, point)
    draw()
  })
  window.addEventListener('keydown', (event) => {
    if (isTypingTarget(event.target) || event.target instanceof HTMLSelectElement || event.ctrlKey || event.metaKey || event.altKey) return
    if (event.key.toLowerCase() === 'm') {
      event.preventDefault()
      setOn(!on)
    } else if (event.key === 'Escape' && on) {
      setOn(false)
    }
  })
  button.addEventListener('click', () => setOn(!on))

  render()
  return { active: () => on, render }
}
