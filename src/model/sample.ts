// The home the page starts with until saving exists: two rooms side by side.
import { createRoom, type Plan } from './plan.ts'

export const sampleHome = (): Plan => ({
  rooms: [
    createRoom({ id: 'living', name: 'Living room', height: 250, corners: [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }] }),
    createRoom({ id: 'bedroom', name: 'Bedroom', height: 250, corners: [{ x: 400, y: 0 }, { x: 700, y: 0 }, { x: 700, y: 300 }, { x: 400, y: 300 }] }),
  ],
})
