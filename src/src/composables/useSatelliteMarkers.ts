import { ref, watch, type Ref } from 'vue'
import * as THREE from 'three'
import type { ActiveSatellite } from '../types'

// Earth radius in km (for scaling)
const EARTH_RADIUS_KM = 6371
// Globe radius in Three.js units
const GLOBE_RADIUS = 1
// Scale factor: km to Three.js units
const KM_TO_UNITS = GLOBE_RADIUS / EARTH_RADIUS_KM

// LOD thresholds (camera Z distance)
// At maxZoom (z=2), we're very close - show LEO markers
// At default (z=25), show MEO and higher
// At far out (z=50+), only show GEO and higher
const LOD_THRESHOLDS = {
  LEO: 5,      // Only show LEO markers when camera.z < 5
  MEO: 15,     // Show MEO markers when camera.z < 15
  GEO: 50,     // Show GEO markers when camera.z < 50
  HEO: 50,     // Show HEO markers when camera.z < 50
  ESCAPE: 100  // Always show escape trajectories
}

// Point size settings
const BASE_POINT_SIZE = 8   // Base size in pixels
const MIN_POINT_SIZE = 3    // Minimum size
const MAX_POINT_SIZE = 20   // Maximum size

// Reusable objects
const _tempVec3 = new THREE.Vector3()
const _matrix = new THREE.Matrix4()
const _inclinationMatrix = new THREE.Matrix4()
const _lanMatrix = new THREE.Matrix4()

export interface HoveredSatellite {
  jcat: string
  name: string
  owner: string
  orbitType: string
  perigee: number
  apogee: number
  screenPosition: { x: number; y: number }
}

export function useSatelliteMarkers(
  orbitGroup: Ref<THREE.Group | null>,
  orbitingSatellites: Ref<ActiveSatellite[]>,
  getCamera: () => THREE.PerspectiveCamera,
  getRenderer: () => THREE.WebGLRenderer | null
) {
  // Single Points object for all markers
  let pointsObject: THREE.Points | null = null
  let positionAttribute: THREE.BufferAttribute | null = null
  let colorAttribute: THREE.BufferAttribute | null = null
  let sizeAttribute: THREE.BufferAttribute | null = null

  // Map point index to satellite ID
  let indexToSatellite: Map<number, ActiveSatellite> = new Map()

  // Currently hovered satellite (reactive ref)
  const hoveredSatellite = ref<HoveredSatellite | null>(null)

  // Raycaster for hover detection
  const raycaster = new THREE.Raycaster()
  raycaster.params.Points = { threshold: 0.05 } // Sensitivity for point picking

  // Mouse position
  const mouse = new THREE.Vector2()

  // Simple string hash for consistent randomization (same as useOrbits)
  function hashString(str: string): number {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i)
      hash = hash & hash
    }
    return (hash & 0xffff) / 0xffff
  }

  // Get a position on the orbit for a satellite
  function getOrbitPosition(satellite: ActiveSatellite, angle: number = 0): THREE.Vector3 {
    // Handle escape trajectories
    if (satellite.orbitType === 'ESCAPE' || !isFinite(satellite.apogee) || satellite.apogee < 0) {
      const alt = Math.max(satellite.perigee, 200) * KM_TO_UNITS
      return latLngToVector3(
        satellite.launch_site_latitude,
        satellite.launch_site_longitude,
        alt
      )
    }

    // Calculate orbital parameters
    const perigeeKm = Math.max(satellite.perigee, 100)
    const apogeeKm = Math.min(satellite.apogee, 100000)
    const semiMajorAxis = (perigeeKm + apogeeKm) / 2 + EARTH_RADIUS_KM
    const semiMinorAxis = Math.sqrt((perigeeKm + EARTH_RADIUS_KM) * (apogeeKm + EARTH_RADIUS_KM))

    const a = semiMajorAxis * KM_TO_UNITS
    const b = semiMinorAxis * KM_TO_UNITS

    // Inclination and longitude of ascending node
    const inclination = satellite.inc * (Math.PI / 180)
    const lanOffset = hashString(satellite.jcat) * 360
    const longitudeOfAscendingNode = (satellite.launch_site_longitude + lanOffset) * (Math.PI / 180)

    // Build transformation matrix
    _inclinationMatrix.makeRotationX(inclination)
    _lanMatrix.makeRotationY(longitudeOfAscendingNode)
    _matrix.multiplyMatrices(_lanMatrix, _inclinationMatrix)

    // Point on ellipse at given angle
    const x = a * Math.cos(angle)
    const z = b * Math.sin(angle)

    _tempVec3.set(x, 0, z)
    _tempVec3.applyMatrix4(_matrix)

    return _tempVec3.clone()
  }

  function latLngToVector3(lat: number, lng: number, altitude: number): THREE.Vector3 {
    const phi = (90 - lat) * (Math.PI / 180)
    const theta = (lng + 180) * (Math.PI / 180)
    const radius = GLOBE_RADIUS + altitude

    return new THREE.Vector3(
      -radius * Math.sin(phi) * Math.cos(theta),
      radius * Math.cos(phi),
      radius * Math.sin(phi) * Math.sin(theta)
    )
  }

  // Check if a satellite should be visible based on camera distance and orbit type
  function shouldShowMarker(satellite: ActiveSatellite, cameraZ: number): boolean {
    const threshold = LOD_THRESHOLDS[satellite.orbitType] || LOD_THRESHOLDS.LEO
    return cameraZ < threshold
  }

  // Calculate point size based on camera distance and orbit altitude
  function calculatePointSize(satellite: ActiveSatellite, cameraZ: number): number {
    // Higher orbits get slightly larger points
    const altitudeFactor = Math.min(1 + (satellite.apogee / 50000), 2)

    // Closer camera = larger points
    const zoomFactor = Math.max(0.5, Math.min(2, 25 / cameraZ))

    const size = BASE_POINT_SIZE * altitudeFactor * zoomFactor
    return Math.max(MIN_POINT_SIZE, Math.min(MAX_POINT_SIZE, size))
  }

  // Initialize or update the points object
  function updateMarkers() {
    if (!orbitGroup.value) return

    const camera = getCamera()
    const satellites = orbitingSatellites.value
    const cameraZ = camera.position.z

    // Filter satellites that should have visible markers
    const visibleSatellites = satellites.filter(s =>
      s.state === 'active' && shouldShowMarker(s, cameraZ)
    )

    // Create points object if needed
    if (!pointsObject) {
      const maxPoints = 10000 // Max satellites we'll support

      const positions = new Float32Array(maxPoints * 3)
      const colors = new Float32Array(maxPoints * 3)
      const sizes = new Float32Array(maxPoints)

      const geometry = new THREE.BufferGeometry()
      positionAttribute = new THREE.BufferAttribute(positions, 3)
      positionAttribute.setUsage(THREE.DynamicDrawUsage)
      geometry.setAttribute('position', positionAttribute)

      colorAttribute = new THREE.BufferAttribute(colors, 3)
      colorAttribute.setUsage(THREE.DynamicDrawUsage)
      geometry.setAttribute('color', colorAttribute)

      sizeAttribute = new THREE.BufferAttribute(sizes, 1)
      sizeAttribute.setUsage(THREE.DynamicDrawUsage)
      geometry.setAttribute('size', sizeAttribute)

      const material = new THREE.PointsMaterial({
        size: BASE_POINT_SIZE,
        vertexColors: true,
        sizeAttenuation: false, // Size in pixels, not world units
        transparent: true,
        opacity: 0.9,
        depthWrite: false
      })

      pointsObject = new THREE.Points(geometry, material)
      pointsObject.frustumCulled = false
      orbitGroup.value.add(pointsObject)
    }

    // Update index mapping
    indexToSatellite.clear()

    // Update positions, colors, and sizes
    const positions = positionAttribute!.array as Float32Array
    const colors = colorAttribute!.array as Float32Array
    const sizes = sizeAttribute!.array as Float32Array

    let pointIndex = 0
    const color = new THREE.Color()

    for (const satellite of visibleSatellites) {
      // Use a consistent angle based on satellite ID
      const angle = hashString(satellite.jcat) * Math.PI * 2
      const pos = getOrbitPosition(satellite, angle)

      positions[pointIndex * 3] = pos.x
      positions[pointIndex * 3 + 1] = pos.y
      positions[pointIndex * 3 + 2] = pos.z

      color.set(satellite.owner_color)
      colors[pointIndex * 3] = color.r
      colors[pointIndex * 3 + 1] = color.g
      colors[pointIndex * 3 + 2] = color.b

      sizes[pointIndex] = calculatePointSize(satellite, cameraZ)

      indexToSatellite.set(pointIndex, satellite)
      pointIndex++
    }

    // Hide remaining points by setting size to 0
    for (let i = pointIndex; i < sizes.length; i++) {
      sizes[i] = 0
    }

    // Update draw range and notify GPU
    pointsObject!.geometry.setDrawRange(0, pointIndex)
    positionAttribute!.needsUpdate = true
    colorAttribute!.needsUpdate = true
    sizeAttribute!.needsUpdate = true
  }

  // Handle mouse move for hover detection
  function onMouseMove(event: MouseEvent) {
    const renderer = getRenderer()
    const camera = getCamera()
    if (!renderer || !pointsObject) return

    const canvas = renderer.domElement
    const rect = canvas.getBoundingClientRect()

    // Normalize mouse position
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

    // Raycast
    raycaster.setFromCamera(mouse, camera)
    const intersects = raycaster.intersectObject(pointsObject)

    if (intersects.length > 0) {
      const index = intersects[0].index
      if (index !== undefined) {
        const satellite = indexToSatellite.get(index)
        if (satellite) {
          hoveredSatellite.value = {
            jcat: satellite.jcat,
            name: satellite.name,
            owner: satellite.owner_e_name,
            orbitType: satellite.orbitType,
            perigee: satellite.perigee,
            apogee: satellite.apogee,
            screenPosition: {
              x: event.clientX,
              y: event.clientY
            }
          }
          canvas.style.cursor = 'pointer'
          return
        }
      }
    }

    // No intersection
    hoveredSatellite.value = null
    const rendererForCursor = getRenderer()
    if (rendererForCursor) {
      rendererForCursor.domElement.style.cursor = 'grab'
    }
  }

  // Watch for satellite changes
  watch(
    orbitingSatellites,
    () => {
      updateMarkers()
    },
    { deep: false }
  )

  // Setup event listeners
  function setup() {
    const renderer = getRenderer()
    if (!renderer) return
    renderer.domElement.addEventListener('mousemove', onMouseMove)
    // Also listen for wheel to update on zoom
    renderer.domElement.addEventListener('wheel', updateMarkers)
  }

  // Cleanup
  function cleanup() {
    const renderer = getRenderer()
    if (renderer) {
      renderer.domElement.removeEventListener('mousemove', onMouseMove)
      renderer.domElement.removeEventListener('wheel', updateMarkers)
    }

    if (pointsObject && orbitGroup.value) {
      orbitGroup.value.remove(pointsObject)
      pointsObject.geometry.dispose()
      ;(pointsObject.material as THREE.Material).dispose()
      pointsObject = null
    }

    indexToSatellite.clear()
  }

  return {
    setup,
    cleanup,
    updateMarkers,
    hoveredSatellite
  }
}
