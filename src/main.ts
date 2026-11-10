// Entry point: the sample home in 3D, with orbit controls and a top view.
// Rooms, items and panels are added issue by issue (see docs/spec.md).
import * as THREE from 'three'
import { loadLanguage } from './i18n/index.ts'
import { sampleHome } from './model/sample.ts'
import { createCameraRig } from './scene/camera.ts'
import { buildHome } from './scene/home.ts'
import { applyLanguage, mountLanguageSwitcher } from './ui/language-switcher.ts'
import { mountViewToggle } from './ui/view-toggle.ts'

loadLanguage(navigator.languages)
applyLanguage()

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

const home = buildHome(sampleHome())
scene.add(home.group)

const rig = createCameraRig(renderer.domElement, home.group)
const { camera, controls } = rig

const toggle = mountViewToggle(document.body, rig.isTopView, rig.setTopView)
mountLanguageSwitcher(document.body, () => {
  applyLanguage()
  toggle.render()
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
