// The camera rig: orbit around the home, or look straight down on it (top view).
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { RoomFrame } from '../model/focus.ts'

export type CameraRig = {
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  isTopView: () => boolean
  setTopView: (on: boolean) => void
  /** The floor point under the screen centre, or null when the camera doesn't look down at the floor. */
  lookPoint: () => { x: number; z: number } | null
  /**
   * Moves the camera smoothly to orbit around `frame.target`, `frame.distance` away: at its current angle
   * in the orbit view, straight down in the top view. Grabbing the view stops the move where it is.
   */
  focus: (frame: RoomFrame) => void
  /** Steps a focus move; call once per frame, before `controls.update()`. True while the move goes on. */
  update: (now?: number) => boolean
}

/** How long a focus move takes, in ms. */
export const FOCUS_MS = 400

export const createCameraRig = (dom: HTMLElement, home: THREE.Object3D): CameraRig => {
  const bounds = new THREE.Box3().setFromObject(home)
  const centre = bounds.getCenter(new THREE.Vector3()).setY(0)
  const size = bounds.getSize(new THREE.Vector3())
  const reach = Math.max(size.x, size.z, 300)

  const camera = new THREE.PerspectiveCamera(50, 1, 1, 20000)
  camera.position.set(centre.x + reach * 0.6, reach * 0.9, centre.z + reach * 1.1)
  const controls = new OrbitControls(camera, dom)
  controls.target.copy(centre)
  controls.enableDamping = true
  controls.update()

  let top = false
  type Move = { start: number; from: { position: THREE.Vector3; target: THREE.Vector3 }; to: { position: THREE.Vector3; target: THREE.Vector3 } }
  let move: Move | null = null
  let saved = { position: camera.position.clone(), target: controls.target.clone() }

  const setTopView = (on: boolean) => {
    if (on === top) return
    top = on
    move = null // switching views ends a focus move
    if (on) {
      saved = { position: camera.position.clone(), target: controls.target.clone() }
      controls.target.copy(centre)
      // A hair off vertical, so "up" stays defined; rotation is locked so it stays looking down.
      camera.position.set(centre.x, reach * 1.6, centre.z + 0.01)
      controls.enableRotate = false
    } else {
      camera.position.copy(saved.position)
      controls.target.copy(saved.target)
      controls.enableRotate = true
    }
    controls.update()
  }

  const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  const lookPoint = () => {
    const direction = camera.getWorldDirection(new THREE.Vector3())
    const hit = new THREE.Ray(camera.position.clone(), direction).intersectPlane(floor, new THREE.Vector3())
    return hit ? { x: hit.x, z: hit.z } : null
  }

  const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)

  const focus = ({ target, distance }: RoomFrame) => {
    const to = new THREE.Vector3(target.x, target.y, target.z)
    // The same angle as now; the top view looks straight down (a hair off vertical, as above).
    const direction = top ? new THREE.Vector3(0, 1, 0.01 / distance).normalize() : camera.position.clone().sub(controls.target).normalize()
    move = {
      start: performance.now(),
      from: { position: camera.position.clone(), target: controls.target.clone() },
      to: { position: to.clone().addScaledVector(direction, distance), target: to },
    }
  }

  const update = (now = performance.now()) => {
    if (!move) return false
    const t = Math.min(1, (now - move.start) / FOCUS_MS)
    const k = ease(t)
    camera.position.lerpVectors(move.from.position, move.to.position, k)
    controls.target.lerpVectors(move.from.target, move.to.target, k)
    if (t === 1) move = null
    return move !== null
  }
  // The user takes over: stop where the camera is.
  controls.addEventListener('start', () => (move = null))

  return { camera, controls, isTopView: () => top, setTopView, lookPoint, focus, update }
}
