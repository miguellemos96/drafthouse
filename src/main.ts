// Entry point: the saved home (or the sample home) in 3D, with orbit controls, a top view,
// autosave, undo and redo, Export and Import, items you select, move (free or snapped), rotate and edit, products added from a link,
// and rooms you select to rename, change the height of or delete.
// Rooms, items and panels are added issue by issue (see docs/spec.md).
import * as THREE from 'three'
import { loadLanguage } from './i18n/index.ts'
import { loadHome, saveHome } from './model/autosave.ts'
import { currentVersion } from './model/home.ts'
import { newSampleHome } from './model/sample.ts'
import { createStore, type Store } from './model/store.ts'
import { createCameraRig, type CameraRig } from './scene/camera.ts'
import { buildHome, type HomeView } from './scene/home.ts'
import { createSelectionView } from './scene/selection.ts'
import { createSnapGuides } from './scene/snap-guides.ts'
import { mountAddItem } from './ui/add-item.ts'
import { mountAddRoom } from './ui/add-room.ts'
import { mountFileButtons } from './ui/file-buttons.ts'
import { mountItemControls, type ItemControls } from './ui/item-controls.ts'
import { mountItemPanel } from './ui/item-panel.ts'
import { mountSnapToggle } from './ui/snap-toggle.ts'
import { applyLanguage, mountLanguageSwitcher } from './ui/language-switcher.ts'
import { mountRoomPanel } from './ui/room-panel.ts'
import { mountUndoRedo } from './ui/undo-redo.ts'
import { mountViewToggle } from './ui/view-toggle.ts'

loadLanguage(navigator.languages)
applyLanguage()

const store = createStore(loadHome(newSampleHome))
store.subscribe(saveHome)
// For end-to-end tests and the browser console.
declare global {
  interface Window {
    drafthouse: {
      store: Store
      rig: CameraRig
      /** The id of the selected item, or `null`. */
      selectedItemId: () => string | null
      /** The id of the selected room, or `null`. */
      selectedRoomId: () => string | null
      /** Where a point in the home shows on the page, in client pixels. */
      toScreen: (x: number, y: number, z: number) => { x: number; y: number }
    }
  }
}

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
  // Make the new home match the screen now, not at the next frame: a click before that frame
  // would otherwise hit solid, unfaded walls, or items whose world positions aren't computed yet.
  home.applyFade(rig.isTopView() ? null : camera.position)
  home.group.updateMatrixWorld(true)
  itemControls.refresh()
})

const rig = createCameraRig(renderer.domElement, home.group)
const { camera, controls } = rig

const itemPanel = mountItemPanel(document.body, store, {
  duplicate: () => itemControls.duplicateSelected(),
  remove: () => itemControls.deleteSelected(),
})
const snapToggle = mountSnapToggle(document.body)
const roomPanel = mountRoomPanel(document.body, store)
const itemControls: ItemControls = mountItemControls({
  surface: container,
  canvas: renderer.domElement,
  camera,
  controls,
  store,
  view: () => home,
  selection: createSelectionView(scene),
  snap: snapToggle.isOn,
  guides: createSnapGuides(scene),
  onSelect: itemPanel.show,
  onSelectRoom: roomPanel.show,
})

window.drafthouse = {
  store,
  rig,
  selectedItemId: itemControls.selectedId,
  selectedRoomId: itemControls.selectedRoomId,
  toScreen: (x, y, z) => {
    const ndc = new THREE.Vector3(x, y, z).project(camera)
    const rect = renderer.domElement.getBoundingClientRect()
    return { x: rect.left + ((ndc.x + 1) / 2) * rect.width, y: rect.top + ((1 - ndc.y) / 2) * rect.height }
  },
}

const toggle = mountViewToggle(document.body, rig.isTopView, rig.setTopView)
const fileButtons = mountFileButtons(document.body, store)
const addRoom = mountAddRoom(document.body, store)
const undoRedo = mountUndoRedo(document.body, store)
const addItem = mountAddItem(document.body, store, rig.lookPoint)
mountLanguageSwitcher(document.body, () => {
  applyLanguage()
  toggle.render()
  fileButtons.render()
  addRoom.render()
  undoRedo.render()
  addItem.render()
  itemPanel.render()
  snapToggle.render()
  roomPanel.render()
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
