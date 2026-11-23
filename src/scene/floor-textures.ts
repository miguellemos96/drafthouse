// A subtle pattern per floor material, drawn on a canvas in shades of grey: the floor's colour multiplies it.
// Wood has planks, tile a grid, carpet is flat and concrete has a speckle. Each texture is drawn once and shared.
// Floors take UVs from their plan coordinates in cm (see THREE.ShapeGeometry), so `repeat` sets the pattern's size.
import * as THREE from 'three'
import type { FloorMaterial } from '../model/finishes.ts'

const SIZE = 256 // canvas pixels
const LINE = '#c4c4c4'

type Pattern = { cm: number; draw: (g: CanvasRenderingContext2D) => void }

const PATTERNS: Record<FloorMaterial, Pattern | null> = {
  // Five planks 20 cm wide across 100 cm, their end joints staggered.
  wood: {
    cm: 100,
    draw: (g) => {
      const plank = SIZE / 5
      g.strokeStyle = LINE
      g.lineWidth = 2
      for (let i = 0; i < 5; i++) {
        const y = i * plank
        g.beginPath()
        g.moveTo(0, y + 1)
        g.lineTo(SIZE, y + 1)
        const joint = ((i * 3) % 5) * plank + plank / 2
        g.moveTo(joint, y)
        g.lineTo(joint, y + plank)
        g.stroke()
      }
    },
  },
  // One 60 cm tile with its grout.
  tile: {
    cm: 60,
    draw: (g) => {
      g.strokeStyle = '#b0b0b0'
      g.lineWidth = 4
      g.strokeRect(0, 0, SIZE, SIZE)
    },
  },
  carpet: null,
  // Small darker and lighter flecks, the same every time.
  concrete: {
    cm: 80,
    draw: (g) => {
      let seed = 7
      const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
      for (let i = 0; i < 900; i++) {
        const shade = 200 + Math.floor(random() * 55)
        g.fillStyle = `rgb(${shade},${shade},${shade})`
        g.fillRect(random() * SIZE, random() * SIZE, 2, 2)
      }
    },
  },
}

const cache = new Map<FloorMaterial, THREE.Texture | null>()

/** The pattern for a floor material, or `null` for a flat one (or where there's no canvas to draw on, as in unit tests). */
export const floorTexture = (material: FloorMaterial): THREE.Texture | null => {
  if (cache.has(material)) return cache.get(material)!
  const pattern = PATTERNS[material]
  let texture: THREE.Texture | null = null
  if (pattern && typeof document !== 'undefined') {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = SIZE
    const g = canvas.getContext('2d')
    if (g) {
      g.fillStyle = '#ffffff'
      g.fillRect(0, 0, SIZE, SIZE)
      pattern.draw(g)
      texture = new THREE.CanvasTexture(canvas)
      texture.colorSpace = THREE.SRGBColorSpace
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping
      texture.repeat.set(1 / pattern.cm, 1 / pattern.cm)
    }
  }
  cache.set(material, texture)
  return texture
}
