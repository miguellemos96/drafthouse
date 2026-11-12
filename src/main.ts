// Entry point: the saved home (or the sample home) in 3D, with orbit controls, a top view,
// autosave, and Export and Import.
// Rooms, items and panels are added issue by issue (see docs/spec.md).
import * as THREE from 'three'
import { loadLanguage } from './i18n/index.ts'
import { loadHome, saveHome } from './model/autosave.ts'
import { currentVersion } from './model/home.ts'
import { newSampleHome } from './model/sample.ts'
import { createStore, type Store } from './model/store.ts'
import { createCameraRig } from './scene/camera.ts'
import { buildHome, type HomeView } from './scene/home.ts'
import { mountFileButtons } from './ui/file-buttons.ts'
import { applyLanguage, mountLanguageSwitcher } from './ui/language-switcher.ts'
import { mountViewToggle } from './ui/view-toggle.ts'

loadLanguage(navigator.languages)
applyLanguage()

const store = createStore(loadHome(newSampleHome))
store.subscribe(saveHome)
// For end-to-end tests and the browser console.
declare global {
  interface Window {
    drafthouse: { store: Store }
  }
}
window.drafthouse = { store }

const container = document.getElementById('view')!
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(window.devicePixelRatio)
container.appendChild(renderer.domElement)

const scene = new THREE.Scene()
scene.background = new THREE.Color(0xf4f4f2)
const grid = new THREE.GridHelper(2000, 40) // 20 m, 50 cm squares; 1 unit = 1 cm
grid.position.y = -1 // just under the floors, so they don't flicker against it
scene.add(grid)
scene.add(new THREE.HemisphereLight(0xffffff, 0x888888, 2))
const sun = new THREE.DirectionalLight(0xffffff, 1.2)
sun.position.set(-300, 800, 500)
scene.add(sun)

let home: HomeView = buildHome(store.get().plan, currentVersion(store.get()).items)
scene.add(home.group)

// The scene redraws whenever the home changes.
store.subscribe((next) => {
  scene.remove(home.group)
  home.group.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.geometry.dispose()
      object.material.dispose()
    }
  })
  home = buildHome(next.plan, currentVersion(next).items)
  scene.add(home.group)
})

const rig = createCameraRig(renderer.domElement, home.group)
const { camera, controls } = rig

const toggle = mountViewToggle(document.body, rig.isTopView, rig.setTopView)
const fileButtons = mountFileButtons(document.body, store)
mountLanguageSwitcher(document.body, () => {
  applyLanguage()
  toggle.render()
  fileButtons.render()
})

const resize = () => {
  const { clientWidth: w, clientHeight: h } = container
  renderer.setSize(w, h)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
}
window.addEventListener('resize', resize)
resize()

renderer.setAnimationLoop(() => {
  controls.update()
  // Looking straight down, every room is already open to view: nothing fades.
  home.applyFade(rig.isTopView() ? null : camera.position)
  renderer.render(scene, camera)
})
