// Entry point. For now: an empty floor grid you can orbit around.
// Rooms, items and panels are added issue by issue (see docs/spec.md).
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

const container = document.getElementById('view')!
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(window.devicePixelRatio)
container.appendChild(renderer.domElement)

const scene = new THREE.Scene()
scene.background = new THREE.Color(0xf4f4f2)
scene.add(new THREE.GridHelper(1000, 20)) // 10 m, 50 cm squares; 1 unit = 1 cm
scene.add(new THREE.HemisphereLight(0xffffff, 0x888888, 2))

const camera = new THREE.PerspectiveCamera(50, 1, 1, 10000)
camera.position.set(600, 500, 600)
const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true

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
  renderer.render(scene, camera)
})
