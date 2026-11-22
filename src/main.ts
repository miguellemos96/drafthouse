// Entry point: the saved home (or the sample home) in 3D, with orbit controls, a top view,
// autosave, undo and redo, Export and Import, versions you switch, duplicate, rename and delete, items you select, move (free or snapped),
// rotate and edit, products added from a link, rooms you select to rename, change the height of or delete, and doors and windows
// placed, dragged and edited in the top view. Rooms of any shape are drawn corner by corner in the top view, and a selected
// room's corners are dragged to change its outline. While an item is dragged, the distances to the walls and the nearest item show;
// the Measure tool measures between two points. Double-click a room, or press Focus in its panel, to focus the camera on it;
// the rooms list shows or hides each room, as a view setting that isn't saved.
// On a phone it is view only: look, orbit, measure, switch the view, the version and the language, Export, and tap an item to see it.
// Rooms, items and panels are added issue by issue (see docs/spec.md).
import * as THREE from 'three'
import { loadLanguage, t } from './i18n/index.ts'
import { loadHome, saveHome } from './model/autosave.ts'
import { dragDistances } from './model/distances.ts'
import { frameRoom } from './model/focus.ts'
import { currentVersion } from './model/home.ts'
import { wallsOf, type Plan, type Room } from './model/plan.ts'
import { newSampleHome } from './model/sample.ts'
import { createStore, type Store } from './model/store.ts'
import type { HiddenRooms } from './model/visibility.ts'
import { createCameraRig, type CameraRig } from './scene/camera.ts'
import { buildHome, type HomeView } from './scene/home.ts'
import { createCornerHandles } from './scene/corner-handles.ts'
import { createMeasureView, floorLine } from './scene/measures.ts'
import { createSelectionView } from './scene/selection.ts'
import { createSnapGuides } from './scene/snap-guides.ts'
import { mountAddItem } from './ui/add-item.ts'
import { mountAddRoom } from './ui/add-room.ts'
import { mountCornerControls } from './ui/corner-controls.ts'
import { mountDrawRoom } from './ui/draw-room.ts'
import { currentDevice, isViewOnly } from './ui/device.ts'
import { mountFileButtons } from './ui/file-buttons.ts'
import { mountItemControls, type ItemControls } from './ui/item-controls.ts'
import { mountItemPanel } from './ui/item-panel.ts'
import { mountSnapToggle } from './ui/snap-toggle.ts'
import { applyLanguage, mountLanguageSwitcher } from './ui/language-switcher.ts'
import { mountOpeningControls, type OpeningControls } from './ui/opening-controls.ts'
import { mountOpeningPanel } from './ui/opening-panel.ts'
import { mountRoomPanel } from './ui/room-panel.ts'
import { mountRoomsList } from './ui/rooms-list.ts'
import { mountTapeMeasure } from './ui/tape-measure.ts'
import { mountUndoRedo } from './ui/undo-redo.ts'
import { mountVersionBar } from './ui/version-bar.ts'
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
      /** The id of the selected door or window, or `null`. */
      selectedOpeningId: () => string | null
      /** The id of the selected room, or `null`. */
      selectedRoomId: () => string | null
      /** The ids of the hidden rooms (a view setting, not part of the home). */
      hiddenRoomIds: () => string[]
      /** The ids of the items drawn and not hidden. */
      shownItemIds: () => string[]
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
/** The rooms hidden from the rooms list: a view setting, never in the store. */
let hiddenRooms: HiddenRooms = new Set()

const draw = (plan: Plan) => {
  scene.remove(home.group)
  home.group.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
      object.geometry.dispose()
      object.material.dispose()
    }
  })
  home = buildHome(plan, currentVersion(store.get()).items)
  home.applyHidden(hiddenRooms)
  scene.add(home.group)
  // Make the new home match the screen now, not at the next frame: a click before that frame
  // would otherwise hit solid, unfaded walls, or items whose world positions aren't computed yet.
  home.applyFade(rig.isTopView() ? null : camera.position)
  home.group.updateMatrixWorld(true)
  itemControls.refresh()
  openingControls.refresh()
}

// The scene redraws whenever the home changes.
store.subscribe((next) => draw(next.plan))

const rig = createCameraRig(renderer.domElement, home.group)
const { camera, controls } = rig
/** Moves the camera smoothly to frame a room. */
const focusRoom = (room: Room) => rig.focus(frameRoom(room, camera.fov, camera.aspect))

const itemPanel = mountItemPanel(document.body, store, {
  duplicate: () => itemControls.duplicateSelected(),
  remove: () => itemControls.deleteSelected(),
}, { viewOnly })
const selection = createSelectionView(scene)
// No rotate handle where nothing can be turned.
selection.handle.visible = !viewOnly
const measures = createMeasureView(scene, container, camera, renderer.domElement)
const tapeMeasure = mountTapeMeasure({ parent: document.body, surface: container, canvas: renderer.domElement, camera, view: () => home, measures })
/** Switches between the orbit view and the top view, and tells the tools that care. */
const setTopView = (on: boolean) => {
  rig.setTopView(on)
  // Doors and windows are placed and dragged in the top view only, and rooms drawn there.
  if (!on) openingControls.deselect()
  openingControls.render()
  drawRoom?.render()
  toggle.render()
}
// View only (phones): like Add room and Add item, these editing controls aren't created at all.
// Mounted first, so while a room is being drawn its clicks reach no other tool.
const drawRoom = viewOnly
  ? null
  : mountDrawRoom({
      parent: document.body,
      surface: container,
      canvas: renderer.domElement,
      camera,
      store,
      isTopView: rig.isTopView,
      enterTopView: () => setTopView(true),
      measures,
      dots: createCornerHandles(scene, 0x2f80ed),
      onStart: () => {
        itemControls.clear()
        openingControls.deselect()
      },
      paused: tapeMeasure.active,
    })
const drawing = () => drawRoom?.active() ?? false
// Then the selected room's corner handles, before the doors and windows that sit on the same walls.
const cornerControls = viewOnly
  ? null
  : mountCornerControls({
      surface: container,
      canvas: renderer.domElement,
      camera,
      controls,
      store,
      handles: createCornerHandles(scene, 0x1d3f66),
      preview: (plan) => draw(plan ?? store.get().plan),
      paused: () => tapeMeasure.active() || drawing(),
    })
const openingPanel = viewOnly ? null : mountOpeningPanel(document.body, store, () => openingControls.deselect())
// Mounted before the item controls, so a press on a door or window in the top view reaches it first.
const openingControls: OpeningControls = viewOnly
  ? { selectedId: () => null, deselect: () => {}, refresh: () => {}, render: () => {} }
  : mountOpeningControls({
      parent: document.body,
      surface: container,
      canvas: renderer.domElement,
      camera,
      controls,
      store,
      view: () => home,
      isTopView: rig.isTopView,
      paused: () => tapeMeasure.active() || drawing(),
      preview: (plan) => draw(plan ?? store.get().plan),
      onSelect: (opening) => {
        if (opening) itemControls.deselect()
        openingPanel?.show(opening)
      },
    })
const snapToggle = viewOnly ? null : mountSnapToggle(document.body)
const roomPanel = viewOnly ? null : mountRoomPanel(document.body, store, focusRoom)
const itemControls: ItemControls = mountItemControls({
  surface: container,
  canvas: renderer.domElement,
  camera,
  controls,
  store,
  view: () => home,
  selection,
  snap: () => snapToggle?.isOn() ?? false,
  guides: createSnapGuides(scene),
  // Items, rooms, and doors and windows: selecting one clears the others.
  onSelect: (item) => {
    if (item) openingControls.deselect()
    itemPanel.show(item)
  },
  onSelectRoom: (room) => {
    if (room) openingControls.deselect()
    roomPanel?.show(room)
    cornerControls?.show(room)
  },
  onFocusRoom: focusRoom,
  paused: () => tapeMeasure.active() || drawing(),
  onDrag: (item) => {
    if (!item) return measures.showDrag([])
    const home = store.get()
    const found = dragDistances(item, wallsOf(home.plan), currentVersion(home).items)
    measures.showDrag([...found.walls.map((line) => floorLine(line, line.side)), ...(found.item ? [floorLine(found.item, 'item')] : [])])
  },
  viewOnly,
})

window.drafthouse = {
  store,
  rig,
  selectedItemId: itemControls.selectedId,
  viewOnly,
  selectedOpeningId: openingControls.selectedId,
  selectedRoomId: itemControls.selectedRoomId,
  hiddenRoomIds: () => [...hiddenRooms],
  shownItemIds: () => home.items.filter((group) => group.visible).map((group) => group.name),
  toScreen: (x, y, z) => {
    const ndc = new THREE.Vector3(x, y, z).project(camera)
    const rect = renderer.domElement.getBoundingClientRect()
    return { x: rect.left + ((ndc.x + 1) / 2) * rect.width, y: rect.top + ((1 - ndc.y) / 2) * rect.height }
  },
}

const toggle = mountViewToggle(document.body, rig.isTopView, setTopView)
const fileButtons = mountFileButtons(document.body, store, { canImport: !viewOnly })
// On a phone, versions can be switched but not duplicated, renamed or deleted.
const versionBar = mountVersionBar(document.body, store, { canEdit: !viewOnly })
// Each panel has a `render` that redraws its text in the current language.
const panels: { render: () => void }[] = [toggle, fileButtons, versionBar, itemPanel, tapeMeasure, openingControls]
for (const panel of [openingPanel, snapToggle, roomPanel, drawRoom]) if (panel) panels.push(panel)
if (viewOnly) {
  const note = document.createElement('p')
  note.id = 'view-only-note'
  note.setAttribute('role', 'note')
  document.body.appendChild(note)
  panels.push({ render: () => (note.textContent = t('viewOnly.note')) })
} else {
  panels.push(mountAddRoom(document.body, store), mountUndoRedo(document.body, store), mountAddItem(document.body, store, rig.lookPoint))
}
// After the view-only note, so on a phone the list sits above it.
const roomsList = mountRoomsList({
  parent: document.body,
  store,
  onChange: (hidden) => {
    hiddenRooms = hidden
    home.applyHidden(hidden)
    // What can't be seen can't stay selected.
    const item = itemControls.selectedId()
    if (item !== null && home.items.find((group) => group.name === item)?.visible === false) itemControls.clear()
    const opening = openingControls.selectedId()
    if (opening !== null && [...home.walls, ...home.panes].some((piece) => piece.opening === opening && !piece.mesh.visible)) openingControls.deselect()
  },
  // On a phone nothing is selected to edit: the name focuses the room instead.
  onSelect: (id) => {
    const room = store.get().plan.rooms.find((r) => r.id === id)
    if (!room) return
    if (viewOnly) focusRoom(room)
    else itemControls.selectRoom(id)
  },
})
panels.push(roomsList)
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
  rig.update()
  controls.update()
  // Looking straight down, every room is already open to view: nothing fades.
  home.applyFade(rig.isTopView() ? null : camera.position)
  home.showArcs(rig.isTopView())
  renderer.render(scene, camera)
  measures.update()
})
