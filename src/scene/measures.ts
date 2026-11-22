// Draws measurements: the lines shown while an item is dragged and the tape measure's line.
// Each line gets a label with its length, an HTML element kept over the line's middle.
// The distances themselves come from src/model/distances.ts.
import * as THREE from 'three'
import { formatLength } from '../i18n/index.ts'
import type { FloorMeasure, Side } from '../model/distances.ts'
import type { Point3 } from '../model/placement.ts'

const DRAG_COLOUR = 0x2f80ed
const ITEM_COLOUR = 0xd9822b
const TAPE_COLOUR = 0xc0392b
const LIFT = 2 // cm above the floor, so floor lines don't flicker against it
const POINT_RADIUS = 4 // cm

/** One line to draw: its ends in the home, its length, and what it measures (for the label's `data-kind`). */
export type MeasureLine = { from: Point3; to: Point3; distance: number; kind: Side | 'item' | 'tape' }

export type MeasureView = {
  /** Shows the lines while an item is dragged; an empty list hides them. */
  showDrag: (lines: MeasureLine[]) => void
  /** Shows the tape: its start point alone, or both points and the line between them; `null` hides it. */
  showTape: (start: Point3 | null, end: Point3 | null, distance: number | null) => void
  /** Keeps the labels over their lines. Call once per frame, after the camera moves. */
  update: () => void
}

/** A line on the floor, lifted a little above it. */
export const floorLine = ({ from, to, distance }: FloorMeasure, kind: MeasureLine['kind']): MeasureLine => ({
  from: { x: from.x, y: LIFT, z: from.z },
  to: { x: to.x, y: LIFT, z: to.z },
  distance,
  kind,
})

const onTop = <T extends THREE.Object3D>(object: T): T => {
  object.renderOrder = 11
  object.raycast = () => {} // measurements never take pointer hits
  return object
}

export const createMeasureView = (scene: THREE.Scene, overlay: HTMLElement, camera: THREE.Camera, canvas: HTMLElement): MeasureView => {
  const layer = document.createElement('div')
  layer.id = 'measures'
  overlay.appendChild(layer)

  const group = new THREE.Group()
  scene.add(group)
  const material = (colour: number) => new THREE.LineBasicMaterial({ color: colour, depthTest: false })
  const materials = { drag: material(DRAG_COLOUR), item: material(ITEM_COLOUR), tape: material(TAPE_COLOUR) }
  const pointMaterial = new THREE.MeshBasicMaterial({ color: TAPE_COLOUR, depthTest: false })
  const pointGeometry = new THREE.SphereGeometry(POINT_RADIUS, 12, 8)

  type Drawn = { objects: THREE.Object3D[]; labels: { element: HTMLElement; at: THREE.Vector3 }[] }
  const drag: Drawn = { objects: [], labels: [] }
  const tape: Drawn = { objects: [], labels: [] }

  const clear = (drawn: Drawn) => {
    for (const object of drawn.objects) {
      group.remove(object)
      if (object instanceof THREE.Line || object instanceof THREE.Mesh) {
        if (object.geometry !== pointGeometry) object.geometry.dispose()
      }
    }
    for (const { element } of drawn.labels) element.remove()
    drawn.objects = []
    drawn.labels = []
  }

  const addLine = (drawn: Drawn, line: MeasureLine) => {
    const from = new THREE.Vector3(line.from.x, line.from.y, line.from.z)
    const to = new THREE.Vector3(line.to.x, line.to.y, line.to.z)
    const mat = line.kind === 'tape' ? materials.tape : line.kind === 'item' ? materials.item : materials.drag
    const object = onTop(new THREE.Line(new THREE.BufferGeometry().setFromPoints([from, to]), mat))
    group.add(object)
    drawn.objects.push(object)
    const element = document.createElement('span')
    element.className = 'measure-label'
    element.dataset.kind = line.kind
    element.textContent = formatLength(line.distance)
    layer.appendChild(element)
    drawn.labels.push({ element, at: from.clone().add(to).multiplyScalar(0.5) })
  }

  const addPoint = (drawn: Drawn, point: Point3) => {
    const mesh = onTop(new THREE.Mesh(pointGeometry, pointMaterial))
    mesh.position.set(point.x, point.y, point.z)
    group.add(mesh)
    drawn.objects.push(mesh)
  }

  const showDrag = (lines: MeasureLine[]) => {
    clear(drag)
    for (const line of lines) addLine(drag, line)
    update()
  }

  const showTape = (start: Point3 | null, end: Point3 | null, distance: number | null) => {
    clear(tape)
    if (start) addPoint(tape, start)
    if (end) addPoint(tape, end)
    if (start && end && distance !== null) addLine(tape, { from: start, to: end, distance, kind: 'tape' })
    update()
  }

  const projected = new THREE.Vector3()
  const update = () => {
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    for (const { element, at } of [...drag.labels, ...tape.labels]) {
      projected.copy(at).project(camera)
      const visible = projected.z < 1
      element.hidden = !visible
      if (!visible) continue
      element.style.left = `${((projected.x + 1) / 2) * width}px`
      element.style.top = `${((1 - projected.y) / 2) * height}px`
    }
  }

  return { showDrag, showTape, update }
}
