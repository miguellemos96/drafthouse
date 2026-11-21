// Entry point: the saved home (or the sample home) in 3D, with orbit controls, a top view,
// autosave, undo and redo, Export and Import, items you select, move, rotate and edit, and products added from a link.
// On a phone it is view only: look, orbit, switch the view and the language, Export, and tap an item to see it.
// Rooms, items and panels are added issue by issue (see docs/spec.md).
import * as THREE from 'three'
import { loadLanguage, t } from './i18n/index.ts'
import { loadHome, saveHome } from './model/autosave.ts'
import { currentVersion } from './model/home.ts'
import { newSampleHome } from './model/sample.ts'
import { createStore, type Store } from './model/store.ts'
import { createCameraRig, type CameraRig } from './scene/camera.ts'
import { buildHome, type HomeView } from './scene/home.ts'
import { createSelectionView } from './scene/selection.ts'
import { mountAddItem } from './ui/add-item.ts'
import { mountAddRoom } from './ui/add-room.ts'
import { currentDevice, isViewOnly } from './ui/device.ts'
import { mountFileButtons } from './ui/file-buttons.ts'
import { mountItemControls, type ItemControls } from './ui/item-controls.ts'
import { mountItemPanel } from './ui/item-panel.ts'
import { applyLanguage, mountLanguageSwitcher } from './ui/language-switcher.ts'
import { mountUndoRedo } from './ui/undo-redo.ts'
import { mountViewToggle } from './ui/view-toggle.ts'

loadLanguage(navigator.languages)
applyLanguage()

// Phones open the home to look at, with every editing control hidden (see src/ui/device.ts).
// Decided once, when the page opens.
const viewOnly = isViewOnly(currentDevice())

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
      /** True when the app opened in view-only mode (a phone). */
      viewOnly: boolean
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
  itemControls.refresh()
})

const rig = createCameraRig(renderer.domElement, home.group)
const { camera, controls } = rig

const itemPanel = mountItemPanel(document.body, store, {
  duplicate: () => itemControls.duplicateSelected(),
  remove: () => itemControls.deleteSelected(),
}, { viewOnly })
const selection = createSelectionView(scene)
// No rotate handle where nothing can be turned.
selection.handle.visible = !viewOnly
const itemControls: ItemControls = mountItemControls({
  surface: container,
  canvas: renderer.domElement,
  camera,
  controls,
  store,
  view: () => home,
  selection,
  onSelect: itemPanel.show,
  viewOnly,
})

window.drafthouse = {
  store,
  rig,
  selectedItemId: itemControls.selectedId,
  viewOnly,
  toScreen: (x, y, z) => {
    const ndc = new THREE.Vector3(x, y, z).project(camera)
    const rect = renderer.domElement.getBoundingClientRect()
    return { x: rect.left + ((ndc.x + 1) / 2) * rect.width, y: rect.top + ((1 - ndc.y) / 2) * rect.height }
  },
}

const toggle = mountViewToggle(document.body, rig.isTopView, rig.setTopView)
const fileButtons = mountFileButtons(document.body, store, { canImport: !viewOnly })
// Each panel has a `render` that redraws its text in the current language.
const panels: { render: () => void }[] = [toggle, fileButtons, itemPanel]
if (viewOnly) {
  const note = document.createElement('p')
  note.id = 'view-only-note'
  note.setAttribute('role', 'note')
  document.body.appendChild(note)
  panels.push({ render: () => (note.textContent = t('viewOnly.note')) })
} else {
  panels.push(mountAddRoom(document.body, store), mountUndoRedo(document.body, store), mountAddItem(document.body, store, rig.lookPoint))
}
for (const panel of panels) panel.render()
mountLanguageSwitcher(document.body, () => {
  applyLanguage()
  for (const panel of panels) panel.render()
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
