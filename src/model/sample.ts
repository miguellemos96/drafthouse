// The home the page starts with when nothing is saved: two rooms side by side, with a few items.
import { addItem, newHome, type Home } from './home.ts'
import type { Item } from './item.ts'
import { createRoom, type Plan } from './plan.ts'

export const sampleHome = (): Plan => ({
  rooms: [
    createRoom({ id: 'living', name: 'Living room', height: 250, corners: [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }] }),
    createRoom({ id: 'bedroom', name: 'Bedroom', height: 250, corners: [{ x: 400, y: 0 }, { x: 700, y: 0 }, { x: 700, y: 300 }, { x: 400, y: 300 }] }),
  ],
})

const floorItem = (item: Omit<Item, 'elevation' | 'mount'>): Item => ({ ...item, elevation: 0, mount: 'floor' })

/** A sofa against the back wall and a table in the living room, a bed against the bedroom's front wall. */
export const sampleItems = (): Item[] => [
  floorItem({ id: 'sample-sofa', name: 'Sofa', templateId: 'sofa', size: { width: 210, depth: 95, height: 83 }, colour: '#5b7083', position: { x: 200, z: 240 }, rotation: 180 }),
  floorItem({ id: 'sample-table', name: 'Table', templateId: 'table', size: { width: 160, depth: 90, height: 75 }, colour: '#a0522d', position: { x: 200, z: 100 }, rotation: 0 }),
  floorItem({ id: 'sample-bed', name: 'Bed', templateId: 'bed', size: { width: 160, depth: 210, height: 100 }, colour: '#8a9a7b', position: { x: 550, z: 115 }, rotation: 0 }),
]

/** The sample plan with the sample items in its one version. */
export const newSampleHome = (): Home => sampleItems().reduce(addItem, newHome(sampleHome()))
