import * as THREE from 'three'
import continentsData from '../data/continents-simplified.json'

const OUTLINE_COLOR = 0x40a0c0 // Cyan-ish color that complements the ocean blue
const OUTLINE_OPACITY = 0.6

interface GeoJSONFeature {
  type: string
  properties: { CONTINENT: string }
  geometry: {
    type: string
    coordinates: number[][][][] // MultiPolygon: [polygon][ring][point][lng,lat]
  }
}

interface GeoJSONFeatureCollection {
  type: string
  features: GeoJSONFeature[]
}

export interface ContinentOutlinesOptions {
  earthRadius?: number
  color?: number
  opacity?: number
}

export function useContinentOutlines(options: ContinentOutlinesOptions = {}) {
  const {
    earthRadius = 1,
    color = OUTLINE_COLOR,
    opacity = OUTLINE_OPACITY
  } = options

  // Group to hold all continent outline lines
  const outlineGroup = new THREE.Group()
  outlineGroup.name = 'continentOutlines'

  // Convert lat/lng to 3D position on globe surface
  function latLngToVector3(lat: number, lng: number): THREE.Vector3 {
    const phi = (90 - lat) * (Math.PI / 180)
    const theta = (lng + 180) * (Math.PI / 180)
    // Slight offset above surface to prevent z-fighting
    const radius = earthRadius * 1.002

    const x = -radius * Math.sin(phi) * Math.cos(theta)
    const y = radius * Math.cos(phi)
    const z = radius * Math.sin(phi) * Math.sin(theta)

    return new THREE.Vector3(x, y, z)
  }

  // Create line geometry from a ring of coordinates [lng, lat][]
  function createLineFromRing(ring: number[][]): THREE.Line {
    const points: THREE.Vector3[] = []

    for (const coord of ring) {
      const [lng, lat] = coord
      points.push(latLngToVector3(lat, lng))
    }

    const geometry = new THREE.BufferGeometry().setFromPoints(points)
    const material = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthTest: true,
      depthWrite: false
    })

    return new THREE.Line(geometry, material)
  }

  // Build all continent outlines from GeoJSON
  function buildOutlines(): THREE.Group {
    // Clear any existing children
    while (outlineGroup.children.length > 0) {
      const child = outlineGroup.children[0]
      if (child instanceof THREE.Line) {
        child.geometry.dispose()
        if (child.material instanceof THREE.Material) {
          child.material.dispose()
        }
      }
      outlineGroup.remove(child)
    }

    const data = continentsData as GeoJSONFeatureCollection

    // Process each continent feature
    for (const feature of data.features) {
      const continentName = feature.properties.CONTINENT
      const geometry = feature.geometry

      if (geometry.type === 'MultiPolygon') {
        // MultiPolygon: array of polygons, each polygon is array of rings
        for (const polygon of geometry.coordinates) {
          for (const ring of polygon) {
            if (ring.length >= 4) {
              const line = createLineFromRing(ring)
              line.name = continentName
              outlineGroup.add(line)
            }
          }
        }
      } else if (geometry.type === 'Polygon') {
        // Polygon: array of rings
        const coords = geometry.coordinates as unknown as number[][][]
        for (const ring of coords) {
          if (ring.length >= 4) {
            const line = createLineFromRing(ring)
            line.name = continentName
            outlineGroup.add(line)
          }
        }
      }
    }

    return outlineGroup
  }

  // Update outline color
  function setColor(newColor: number) {
    outlineGroup.traverse((child) => {
      if (child instanceof THREE.Line && child.material instanceof THREE.LineBasicMaterial) {
        child.material.color.setHex(newColor)
      }
    })
  }

  // Update outline opacity
  function setOpacity(newOpacity: number) {
    outlineGroup.traverse((child) => {
      if (child instanceof THREE.Line && child.material instanceof THREE.LineBasicMaterial) {
        child.material.opacity = newOpacity
      }
    })
  }

  // Cleanup resources
  function dispose() {
    outlineGroup.traverse((child) => {
      if (child instanceof THREE.Line) {
        child.geometry.dispose()
        if (child.material instanceof THREE.Material) {
          child.material.dispose()
        }
      }
    })
    outlineGroup.clear()
  }

  return {
    outlineGroup,
    buildOutlines,
    setColor,
    setOpacity,
    dispose
  }
}
