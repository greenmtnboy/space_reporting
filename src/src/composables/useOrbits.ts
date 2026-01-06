import { watch, type Ref } from 'vue'
import * as THREE from 'three'
import type { ActiveSatellite } from '../types'

// Earth radius in km (for scaling)
const EARTH_RADIUS_KM = 6371
// Globe radius in Three.js units
const GLOBE_RADIUS = 1
// Scale factor: km to Three.js units
const KM_TO_UNITS = GLOBE_RADIUS / EARTH_RADIUS_KM

// Orbit line settings
const ORBIT_SEGMENTS = 128

// Launch line settings
const LAUNCH_LINE_SEGMENTS = 32 // Segments for curved launch arc

// Decom colors (gradient from normal to red)
const DECOM_END_COLOR = new THREE.Color(0xff4444)

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

  // Convert lat/lng to 3D position on globe surface
  function latLngToPosition(lat: number, lng: number, altitudeKm: number = 0): THREE.Vector3 {
    const phi = (90 - lat) * (Math.PI / 180)
    const theta = (lng + 180) * (Math.PI / 180)
    const radius = GLOBE_RADIUS + altitudeKm * KM_TO_UNITS

    const x = -radius * Math.sin(phi) * Math.cos(theta)
    const y = radius * Math.cos(phi)
    const z = radius * Math.sin(phi) * Math.sin(theta)

    return new THREE.Vector3(x, y, z)
  }

  // Get orbital parameters and transformation matrix for a satellite
  function getOrbitalParams(satellite: ActiveSatellite): {
    a: number           // semi-major axis in Three.js units
    b: number           // semi-minor axis in Three.js units
    matrix: THREE.Matrix4  // orbital plane transformation
    isEscape: boolean
  } {
    // Handle escape trajectories or invalid orbits
    if (satellite.orbitType === 'ESCAPE' || !isFinite(satellite.apogee) || satellite.apogee < 0) {
      return {
        a: 0,
        b: 0,
        matrix: new THREE.Matrix4(),
        isEscape: true
      }
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

    // Longitude of ascending node (derive from launch site, add some variation based on jcat)
    const lanOffset = hashString(satellite.jcat) * 360
    const longitudeOfAscendingNode = (satellite.launch_site_longitude + lanOffset) * (Math.PI / 180)

    // Create rotation matrices
    const inclinationMatrix = new THREE.Matrix4().makeRotationX(inclination)
    const lanMatrix = new THREE.Matrix4().makeRotationY(longitudeOfAscendingNode)
    const combinedMatrix = new THREE.Matrix4().multiplyMatrices(lanMatrix, inclinationMatrix)

    return { a, b, matrix: combinedMatrix, isEscape: false }
  }

  // Find the orbit insertion angle - offset to create smooth tangential entry
  function findInsertionAngle(satellite: ActiveSatellite, a: number, b: number, matrix: THREE.Matrix4): number {
    const groundPos = latLngToPosition(
      satellite.launch_site_latitude,
      satellite.launch_site_longitude,
      0
    )
    const launchSiteDir = groundPos.clone().normalize()

    // First find the closest point on the orbit to the launch site
    let closestAngle = 0
    let bestDot = -2
    for (let i = 0; i < 72; i++) {
      const testAngle = (i / 72) * Math.PI * 2
      const x = a * Math.cos(testAngle)
      const z = b * Math.sin(testAngle)
      const testPoint = new THREE.Vector3(x, 0, z)
      testPoint.applyMatrix4(matrix)
      const dot = testPoint.clone().normalize().dot(launchSiteDir)
      if (dot > bestDot) {
        bestDot = dot
        closestAngle = testAngle
      }
    }

    // Calculate the arc length we want to travel along the orbit for a smooth curve
    // This should be roughly proportional to the "climb distance" from ground to orbit
    //
    // For a tangential approach, we want the launch track length ≈ arc length on orbit
    // Arc length = angle * radius, so angle = arcLength / radius
    //
    // Launch track length (approx): distance from ground to orbit insertion
    // For simplicity, use the altitude gain as a proxy
    const orbitRadius = (a + b) / 2  // average radius
    const altitudeGain = orbitRadius - GLOBE_RADIUS  // climb from surface to orbit

    // The arc we want to "reserve" for the approach should match the climb distance
    // This gives us the angular offset: angle = arcLength / radius
    // But we also factor in how off-plane the launch is (more off-plane = longer path needed)
    const offPlaneAmount = 1 - bestDot  // 0 = on plane, 1 = perpendicular

    // Base arc length scales with altitude, amplified by off-plane distance
    // Higher orbits and more off-plane launches need more angular offset
    const effectiveArcLength = altitudeGain * (1 + offPlaneAmount * 2)

    // Convert arc length to angle (clamped to max 270 degrees to avoid overshooting)
    const insertionOffset = Math.min(effectiveArcLength / orbitRadius, Math.PI * 1.5)

    return closestAngle + insertionOffset
  }

  // Generate orbit ellipse points, starting from the insertion point
  function generateOrbitPoints(
    satellite: ActiveSatellite,
    segments: number = ORBIT_SEGMENTS
  ): THREE.Vector3[] {
    const points: THREE.Vector3[] = []
    const { a, b, matrix, isEscape } = getOrbitalParams(satellite)

    // Handle escape trajectories
    if (isEscape) {
      const startPos = latLngToPosition(
        satellite.launch_site_latitude,
        satellite.launch_site_longitude,
        Math.max(satellite.perigee, 200)
      )
      const endPos = startPos.clone().multiplyScalar(3) // Extend outward
      return [startPos, endPos]
    }

    // Find insertion angle so orbit starts from where launch track connects
    const startAngle = findInsertionAngle(satellite, a, b, matrix)

    // Generate ellipse points starting from insertion angle
    for (let i = 0; i <= segments; i++) {
      const angle = startAngle + (i / segments) * Math.PI * 2

      // Ellipse in XZ plane (before rotation)
      const x = a * Math.cos(angle)
      const z = b * Math.sin(angle)
      const point = new THREE.Vector3(x, 0, z)

      // Apply orbital plane rotation
      point.applyMatrix4(matrix)

      points.push(point)
    }

    return points
  }

  // Generate launch track points that curve up to meet the orbital plane tangentially
  function generateLaunchTrackPoints(
    satellite: ActiveSatellite,
    progress: number,
    segments: number = LAUNCH_LINE_SEGMENTS
  ): THREE.Vector3[] {
    const points: THREE.Vector3[] = []
    const { a, b, matrix, isEscape } = getOrbitalParams(satellite)

    // Ground position
    const groundPos = latLngToPosition(
      satellite.launch_site_latitude,
      satellite.launch_site_longitude,
      0
    )

    // For escape trajectories, use simple radial line
    if (isEscape) {
      const targetAltitude = Math.max(satellite.perigee, 200)
      const endPos = latLngToPosition(
        satellite.launch_site_latitude,
        satellite.launch_site_longitude,
        targetAltitude * progress
      )
      return [groundPos, endPos]
    }

    // Find insertion angle (same as orbit starting point)
    const insertionAngle = findInsertionAngle(satellite, a, b, matrix)

    // Orbit insertion point (where the launch track meets the orbit)
    const orbitInsertX = a * Math.cos(insertionAngle)
    const orbitInsertZ = b * Math.sin(insertionAngle)
    const orbitInsertPos = new THREE.Vector3(orbitInsertX, 0, orbitInsertZ)
    orbitInsertPos.applyMatrix4(matrix)

    // Calculate orbit tangent at insertion point (direction of travel)
    // Derivative of ellipse: dx/dθ = -a*sin(θ), dz/dθ = b*cos(θ)
    const tangentX = -a * Math.sin(insertionAngle)
    const tangentZ = b * Math.cos(insertionAngle)
    const orbitTangent = new THREE.Vector3(tangentX, 0, tangentZ)
    orbitTangent.applyMatrix4(matrix)
    orbitTangent.normalize()

    // We'll use a quadratic Bezier curve:
    // P0 = ground position
    // P2 = orbit insertion point
    // P1 = control point that shapes the curve to arrive tangentially
    //
    // For the curve to arrive tangent to the orbit at P2, the control point P1
    // should be along the line (P2 - tangent * distance)
    const curveLength = groundPos.distanceTo(orbitInsertPos)
    const controlPoint = orbitInsertPos.clone().sub(orbitTangent.clone().multiplyScalar(curveLength * 0.6))

    // Generate curved path using quadratic Bezier
    const numPoints = Math.max(2, Math.ceil(segments * progress))
    for (let i = 0; i <= numPoints; i++) {
      const t = (i / numPoints) * progress

      // Quadratic Bezier: B(t) = (1-t)²P0 + 2(1-t)tP1 + t²P2
      const oneMinusT = 1 - t
      const bezierPos = new THREE.Vector3()
        .addScaledVector(groundPos, oneMinusT * oneMinusT)
        .addScaledVector(controlPoint, 2 * oneMinusT * t)
        .addScaledVector(orbitInsertPos, t * t)

      // Adjust radius to smoothly interpolate altitude
      // Use the bezier for direction but enforce smooth altitude progression
      const groundRadius = GLOBE_RADIUS
      const orbitRadius = orbitInsertPos.length()
      // Ease-in altitude curve so it accelerates toward orbit height
      const altitudeT = t * t  // quadratic ease-in
      const currentRadius = groundRadius + (orbitRadius - groundRadius) * altitudeT

      bezierPos.normalize().multiplyScalar(currentRadius)
      points.push(bezierPos)
    }

    return points
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
      // Create new line with full geometry
      const points = generateOrbitPoints(satellite)
      const geometry = new THREE.BufferGeometry().setFromPoints(points)
      const material = new THREE.LineBasicMaterial({
        color: satellite.owner_color,
        transparent: true,
        opacity: 0.7
      })
      line = new THREE.Line(geometry, material)
      line.userData.satelliteId = satellite.jcat
      line.userData.totalPoints = points.length
      orbitLines.set(satellite.jcat, line)
      orbitGroup.value.add(line)
    }

    const totalPoints = line.userData.totalPoints || ORBIT_SEGMENTS + 1

    // Progressive reveal using drawRange
    // orbitProgress: 0 = just inserted, 1 = full orbit revealed
    const revealCount = Math.ceil(satellite.orbitProgress * totalPoints)
    line.geometry.setDrawRange(0, Math.max(2, revealCount))

    // Update opacity based on state
    const material = line.material as THREE.LineBasicMaterial
    if (satellite.state === 'decommissioning') {
      // Fade out and change color during decom
      material.opacity = (1 - satellite.decomProgress) * 0.7
      const originalColor = new THREE.Color(satellite.owner_color)
      material.color.lerpColors(originalColor, DECOM_END_COLOR, satellite.decomProgress)
    } else {
      material.opacity = 0.7
      material.color.set(satellite.owner_color)
    }
  }

  // Create or update launch line for a satellite
  function updateLaunchLine(satellite: ActiveSatellite) {
    if (!orbitGroup.value) return

    let line = launchLines.get(satellite.jcat)

    // Generate curved launch track points aligned with orbit inclination
    const points = generateLaunchTrackPoints(satellite, satellite.launchProgress)

    if (!line) {
      // Create new line with enough buffer for all segments
      const maxPoints = LAUNCH_LINE_SEGMENTS + 1
      const geometry = new THREE.BufferGeometry()
      const positions = new Float32Array(maxPoints * 3)
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      geometry.setDrawRange(0, points.length)

      const material = new THREE.LineBasicMaterial({
        color: satellite.owner_color,
        transparent: true,
        opacity: 1
      })
      line = new THREE.Line(geometry, material)
      line.userData.satelliteId = satellite.jcat
      launchLines.set(satellite.jcat, line)
      orbitGroup.value.add(line)
    }

    // Update geometry with current points
    const posAttr = line.geometry.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < points.length; i++) {
      posAttr.setXYZ(i, points[i].x, points[i].y, points[i].z)
    }
    posAttr.needsUpdate = true
    line.geometry.setDrawRange(0, points.length)

    // Fade out as launch completes
    const material = line.material as THREE.LineBasicMaterial
    if (satellite.launchProgress > 0.7) {
      material.opacity = 1 - ((satellite.launchProgress - 0.7) / 0.3)
    } else {
      material.opacity = 1
    }
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
    { deep: true }
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
    { deep: true }
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
