import { watch, type Ref } from 'vue'
import * as THREE from 'three'
import type { ActiveSatellite } from '../types'
import { getCachedGeometry } from './useGeometryCache'

// Earth radius in km (for scaling)
const EARTH_RADIUS_KM = 6371
// Globe radius in Three.js units
const GLOBE_RADIUS = 1
// Scale factor: km to Three.js units
const KM_TO_UNITS = GLOBE_RADIUS / EARTH_RADIUS_KM

// Orbit line settings
const ORBIT_SEGMENTS = 128

// Launch line settings
const LAUNCH_LINE_SEGMENTS = 128 // Segments for curved launch arc

// Decom colors (gradient from normal to red)
const DECOM_END_COLOR = new THREE.Color(0xff4444)

// --- Optimization: Object Pools & Caches ---
const _tempVec3 = new THREE.Vector3()
const _groundPos = new THREE.Vector3()
const _localPos = new THREE.Vector3()
const _matrix = new THREE.Matrix4()
const _invMatrix = new THREE.Matrix4()
const _inclinationMatrix = new THREE.Matrix4()
const _lanMatrix = new THREE.Matrix4()
const _tempColor = new THREE.Color() // Reused for color lerping

// Material Cache: Color -> Material
// const materialCache = new Map<string, THREE.LineBasicMaterial>()

function getCachedMaterial(colorHex: string, opacity: number = 1): THREE.LineBasicMaterial {
  // Key by color + opacity to allow different base opacities if needed, 
  // though we mostly manipulate opacity dynamically.
  // Actually, we manipulate opacity on the instance. 
  // If we share materials, changing opacity on one affects ALL.
  // So we can only cache materials if we clone them or if we don't change properties.
  // But we DO change opacity (fade out).
  // So we CANNOT share materials if we animate opacity individually.
  // UNLESS we use vertex colors and keep opacity 1, or use a custom shader.
  // Or, we accept that material caching is only for the INITIAL creation.
  // 
  // Re-reading usage: 
  // updateOrbitLine changes opacity.
  // updateLaunchLine changes opacity.
  // So we CANNOT share the same material instance across different satellites if they need different opacities at the same time.
  // 
  // However, we can pool them? 
  // Or just minimize creation. 
  // Given the constraint, maybe just reuse the geometry logic which is the biggest win.
  // 
  // Wait, Three.js materials are heavy? Not too heavy. Geometries are heavier.
  // Let's stick to Geometry optimization for now.
  // But wait, "Each satellite creates new ... THREE.LineBasicMaterial". 
  // If thousands of satellites have opacity 0.7, they could share ONE material.
  // But during fade out, they diverge.
  // 
  // Compromise: Cache the "base" material, and clone it? Cloning is cheap.
  // Or just create new ones. The Vector3 allocation was the main bottleneck (129k vs 1k materials).
  // I will skip material caching for now to avoid opacity conflicts, as satellites animate independently.
  
  return new THREE.LineBasicMaterial({
    color: colorHex,
    transparent: true,
    opacity: opacity
  })
}
// -------------------------------------------

export function useOrbits(
  orbitGroup: Ref<THREE.Group | null>,
  orbitingSatellites: Ref<ActiveSatellite[]>,
  launchingSatellites: Ref<ActiveSatellite[]>,
  _decommissioningSatellites: Ref<ActiveSatellite[]>,
  _latLngToVector3: (lat: number, lng: number, altitude?: number) => THREE.Vector3
) {
  // Track created objects by satellite ID for efficient updates
  const orbitLines = new Map<string, THREE.Line>()
  const launchLines = new Map<string, THREE.Line>()

  // Convert lat/lng to 3D position on globe surface (writes to target or _tempVec3)
  function setLatLngToPosition(lat: number, lng: number, altitudeKm: number, target: THREE.Vector3) {
    const phi = (90 - lat) * (Math.PI / 180)
    const theta = (lng + 180) * (Math.PI / 180)
    const radius = GLOBE_RADIUS + altitudeKm * KM_TO_UNITS

    target.x = -radius * Math.sin(phi) * Math.cos(theta)
    target.y = radius * Math.cos(phi)
    target.z = radius * Math.sin(phi) * Math.sin(theta)
  }

  // Get orbital parameters and transformation matrix for a satellite
  // Returns values and sets the shared _matrix
  function getOrbitalParams(satellite: ActiveSatellite): {
    a: number
    b: number
    isEscape: boolean
  } {
    // Handle escape trajectories or invalid orbits
    if (satellite.orbitType === 'ESCAPE' || !isFinite(satellite.apogee) || satellite.apogee < 0) {
      _matrix.identity()
      return { a: 0, b: 0, isEscape: true }
    }

    // Calculate orbital parameters
    const perigeeKm = Math.max(satellite.perigee, 100) // Minimum 100km
    const apogeeKm = Math.min(satellite.apogee, 100000) // Cap for visualization
    const semiMajorAxis = (perigeeKm + apogeeKm) / 2 + EARTH_RADIUS_KM
    const semiMinorAxis = Math.sqrt((perigeeKm + EARTH_RADIUS_KM) * (apogeeKm + EARTH_RADIUS_KM))

    // Convert to Three.js units
    const a = semiMajorAxis * KM_TO_UNITS
    const b = semiMinorAxis * KM_TO_UNITS

    // Inclination in radians
    const inclination = satellite.inc * (Math.PI / 180)

    // Longitude of ascending node
    const lanOffset = hashString(satellite.jcat) * 360
    const longitudeOfAscendingNode = (satellite.launch_site_longitude + lanOffset) * (Math.PI / 180)

    // Compute Matrix directly to avoid allocations
    _inclinationMatrix.makeRotationX(inclination)
    _lanMatrix.makeRotationY(longitudeOfAscendingNode)
    _matrix.multiplyMatrices(_lanMatrix, _inclinationMatrix)

    return { a, b, isEscape: false }
  }

  // Find the closest point on the orbit to the launch site (angle in radians)
  function findClosestOrbitAngle(
    satellite: ActiveSatellite,
    a: number,
    b: number
  ): number {
    setLatLngToPosition(
      satellite.launch_site_latitude,
      satellite.launch_site_longitude,
      0,
      _groundPos
    )
    
    // Transform ground position to local orbit space
    _invMatrix.copy(_matrix).invert()
    _localPos.copy(_groundPos).applyMatrix4(_invMatrix)

    // Coarse search
    let closestAngle = 0
    let minDidstSq = Infinity
    const steps = 72
    
    for (let i = 0; i < steps; i++) {
      const angle = (i / steps) * Math.PI * 2
      const dx = _localPos.x - a * Math.cos(angle)
      const dz = _localPos.z - b * Math.sin(angle)
      const d2 = dx*dx + dz*dz
      if (d2 < minDidstSq) {
        minDidstSq = d2
        closestAngle = angle
      }
    }

    // Refine search (2 passes)
    const refine = (center: number, range: number) => {
      let best = center
      let minDist = minDidstSq
      const fineSteps = 10
      for(let i=0; i<=fineSteps; i++) {
        const ang = center - range/2 + (i/fineSteps)*range
        const dx = _localPos.x - a * Math.cos(ang)
        const dz = _localPos.z - b * Math.sin(ang)
        const d = dx*dx + dz*dz
        if (d < minDist) {
          minDist = d
          best = ang
        }
      }
      minDidstSq = minDist
      return best
    }

    const stepSize = (Math.PI * 2) / steps
    closestAngle = refine(closestAngle, stepSize * 2)
    closestAngle = refine(closestAngle, stepSize * 0.2)

    return closestAngle
  }

  // Generate orbit ellipse points directly into a Float32Array
  function generateOrbitPoints(
    satellite: ActiveSatellite,
    segments: number = ORBIT_SEGMENTS
  ): Float32Array {
    const { a, b, isEscape } = getOrbitalParams(satellite) // Sets _matrix
    
    const numPoints = segments + 1
    const positions = new Float32Array(numPoints * 3)

    // Handle escape trajectories
    if (isEscape) {
      setLatLngToPosition(
        satellite.launch_site_latitude,
        satellite.launch_site_longitude,
        Math.max(satellite.perigee, 200),
        _tempVec3
      )
      positions[0] = _tempVec3.x
      positions[1] = _tempVec3.y
      positions[2] = _tempVec3.z
      
      _tempVec3.multiplyScalar(3) // Extend outward
      positions[3] = _tempVec3.x
      positions[4] = _tempVec3.y
      positions[5] = _tempVec3.z
      
      return positions.slice(0, 6) // Return just 2 points
    }

    // Find insertion angle
    const startAngle = findClosestOrbitAngle(satellite, a, b)

    // Generate points
    for (let i = 0; i < numPoints; i++) {
      const angle = startAngle + (i / segments) * Math.PI * 2

      // Ellipse in XZ plane
      const x = a * Math.cos(angle)
      const z = b * Math.sin(angle)
      
      _tempVec3.set(x, 0, z)
      _tempVec3.applyMatrix4(_matrix)

      positions[i * 3] = _tempVec3.x
      positions[i * 3 + 1] = _tempVec3.y
      positions[i * 3 + 2] = _tempVec3.z
    }

    return positions
  }

  // Generate launch track points directly into Float32Array
  function generateLaunchTrackPoints(
    satellite: ActiveSatellite,
    progress: number,
    segments: number = LAUNCH_LINE_SEGMENTS
  ): Float32Array {
    const { a, b, isEscape } = getOrbitalParams(satellite) // Sets _matrix

    if (isEscape) {
      const positions = new Float32Array(6)
      
      setLatLngToPosition(
        satellite.launch_site_latitude,
        satellite.launch_site_longitude,
        0,
        _tempVec3
      )
      positions[0] = _tempVec3.x
      positions[1] = _tempVec3.y
      positions[2] = _tempVec3.z

      const targetAltitude = Math.max(satellite.perigee, 200)
      setLatLngToPosition(
        satellite.launch_site_latitude,
        satellite.launch_site_longitude,
        targetAltitude * progress,
        _tempVec3
      )
      positions[3] = _tempVec3.x
      positions[4] = _tempVec3.y
      positions[5] = _tempVec3.z
      
      return positions
    }

    // 1. Identify start and target angles in local orbit space
    _invMatrix.copy(_matrix).invert()
    
    setLatLngToPosition(
      satellite.launch_site_latitude,
      satellite.launch_site_longitude,
      0,
      _groundPos
    )
    _localPos.copy(_groundPos).applyMatrix4(_invMatrix)
    
    const startAngle = Math.atan2(_localPos.z, _localPos.x)
    
    // Target is the closest point on the orbit ellipse
    // findClosestOrbitAngle returns PARAMETRIC angle t
    const targetParametricAngle = findClosestOrbitAngle(satellite, a, b)
    
    // Convert to GEOMETRIC angle phi for consistent interpolation
    // P = (a cos t, b sin t) -> phi = atan2(y, x)
    const targetAngleGeo = Math.atan2(
      b * Math.sin(targetParametricAngle),
      a * Math.cos(targetParametricAngle)
    )
    
    // 2. Calculate Angle Delta for Spiral
    let dTheta = targetAngleGeo - startAngle
    while (dTheta < 0) dTheta += Math.PI * 2
    dTheta += Math.PI * 2 // One full extra turn

    const numPoints = Math.max(2, Math.ceil(segments * progress))
    const totalPoints = numPoints + 1
    const positions = new Float32Array(totalPoints * 3)

    for (let i = 0; i <= numPoints; i++) {
      const t = (i / numPoints) * progress
      
      const currentAngle = startAngle + t * dTheta
      
      // Ellipse radius at current GEOMETRIC angle
      // r = (ab) / sqrt( (b cos theta)^2 + (a sin theta)^2 )
      const cosTheta = Math.cos(currentAngle)
      const sinTheta = Math.sin(currentAngle)
      const denom = Math.sqrt(
        Math.pow(b * cosTheta, 2) + Math.pow(a * sinTheta, 2)
      )
      // Safety check for degenerate orbits
      const rEllipse = denom > 0.0001 ? (a * b) / denom : a
      
      const groundRadius = GLOBE_RADIUS
      const altT = t * (2 - t)
      const currentRadius = groundRadius + (rEllipse - groundRadius) * altT
      
      // Decay offset
      const currentY = _localPos.y * (1 - t) * (1 - t)
      
      const x = currentRadius * cosTheta
      const z = currentRadius * sinTheta
      
      _tempVec3.set(x, currentY, z)
      _tempVec3.applyMatrix4(_matrix)

      positions[i * 3] = _tempVec3.x
      positions[i * 3 + 1] = _tempVec3.y
      positions[i * 3 + 2] = _tempVec3.z
    }

    return positions
  }

  // Simple string hash for consistent randomization
  function hashString(str: string): number {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i)
      hash = hash & hash
    }
    return (hash & 0xffff) / 0xffff
  }

  // Create or update orbit line for a satellite
  function updateOrbitLine(satellite: ActiveSatellite) {
    if (!orbitGroup.value) return

    let line = orbitLines.get(satellite.jcat)

    if (!line) {
      // Try to use precomputed geometry from worker cache
      const cached = getCachedGeometry(satellite.jcat)
      const positions = cached?.orbitPositions ?? generateOrbitPoints(satellite)
      const totalPoints = cached?.totalOrbitPoints ?? positions.length / 3

      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))

      const material = getCachedMaterial(satellite.owner_color, 0.7)

      line = new THREE.Line(geometry, material)
      line.userData.satelliteId = satellite.jcat
      line.userData.totalPoints = totalPoints
      orbitLines.set(satellite.jcat, line)
      orbitGroup.value.add(line)
    }

    const totalPoints = line.userData.totalPoints
    const revealCount = Math.ceil(satellite.orbitProgress * totalPoints)
    line.geometry.setDrawRange(0, Math.max(2, revealCount))

    // Update opacity based on state
    const material = line.material as THREE.LineBasicMaterial
    if (satellite.state === 'decommissioning') {
      material.opacity = (1 - satellite.decomProgress) * 0.7
      // Reuse _tempColor to avoid per-frame allocation
      _tempColor.set(satellite.owner_color)
      material.color.lerpColors(_tempColor, DECOM_END_COLOR, satellite.decomProgress)
    } else {
      material.opacity = 0.7
      material.color.set(satellite.owner_color)
    }
  }

  // Create or update launch line for a satellite
  function updateLaunchLine(satellite: ActiveSatellite) {
    if (!orbitGroup.value) return

    let line = launchLines.get(satellite.jcat)

    if (!line) {
      // Try to use precomputed geometry from worker cache
      const cached = getCachedGeometry(satellite.jcat)
      const positions = cached?.launchPositions ?? generateLaunchTrackPoints(satellite, 1.0)
      const totalPoints = cached?.totalLaunchPoints ?? positions.length / 3

      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      geometry.userData = { totalPoints }

      const material = getCachedMaterial(satellite.owner_color, 1)

      line = new THREE.Line(geometry, material)
      line.userData.satelliteId = satellite.jcat
      launchLines.set(satellite.jcat, line)
      orbitGroup.value.add(line)
    }

    const totalPoints = line.geometry.userData.totalPoints
    const revealCount = Math.ceil(satellite.launchProgress * totalPoints)
    line.geometry.setDrawRange(0, Math.max(2, revealCount))

    const material = line.material as THREE.LineBasicMaterial
    material.opacity = satellite.launchOpacity
  }

  // Remove objects for satellites no longer in view
  function cleanupRemovedSatellites(
    currentIds: Set<string>,
    objectMap: Map<string, THREE.Line>
  ) {
    if (!orbitGroup.value) return

    for (const [id, line] of objectMap) {
      if (!currentIds.has(id)) {
        orbitGroup.value.remove(line)
        line.geometry.dispose()
        ;(line.material as THREE.Material).dispose()
        objectMap.delete(id)
      }
    }
  }

  // Watch for changes in satellites and update Three.js objects
  watch(
    [orbitingSatellites, orbitGroup],
    ([satellites, group]) => {
      if (!group) return

      const currentIds = new Set(satellites.map(s => s.jcat))

      // Update or create orbit lines
      for (const satellite of satellites) {
        updateOrbitLine(satellite)
      }

      // Clean up removed satellites
      cleanupRemovedSatellites(currentIds, orbitLines)
    },
    { deep: false }
  )

  watch(
    [launchingSatellites, orbitGroup],
    ([satellites, group]) => {
      if (!group) return

      const currentIds = new Set(satellites.map(s => s.jcat))

      // Update or create launch lines
      for (const satellite of satellites) {
        updateLaunchLine(satellite)
      }

      // Clean up completed launches
      cleanupRemovedSatellites(currentIds, launchLines)
    },
    { deep: false }
  )

  // Cleanup function
  function cleanup() {
    if (orbitGroup.value) {
      for (const line of orbitLines.values()) {
        orbitGroup.value.remove(line)
        line.geometry.dispose()
        ;(line.material as THREE.Material).dispose()
      }
      for (const line of launchLines.values()) {
        orbitGroup.value.remove(line)
        line.geometry.dispose()
        ;(line.material as THREE.Material).dispose()
      }
    }
    orbitLines.clear()
    launchLines.clear()
  }

  return {
    cleanup,
    orbitLines,
    launchLines
  }
}
