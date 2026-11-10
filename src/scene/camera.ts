// The camera rig: orbit around the home, or look straight down on it (top view).
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

export type CameraRig = {
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  isTopView: () => boolean
  setTopView: (on: boolean) => void
}

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
  let saved = { position: camera.position.clone(), target: controls.target.clone() }

  const setTopView = (on: boolean) => {
    if (on === top) return
    top = on
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

  return { camera, controls, isTopView: () => top, setTopView }
}
