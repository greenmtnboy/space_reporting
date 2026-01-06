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
const LAUNCH_LINE_SEGMENTS = 128 // Segments for curved launch arc

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

  // Find the closest point on the orbit to the launch site (angle in radians)
  function findClosestOrbitAngle(
    satellite: ActiveSatellite,
    a: number,
    b: number,
    matrix: THREE.Matrix4
  ): number {
    const groundPos = latLngToPosition(
      satellite.launch_site_latitude,
      satellite.launch_site_longitude,
      0
    )
    
    // Transform ground position to local orbit space
    const invMatrix = matrix.clone().invert()
    const localPos = groundPos.clone().applyMatrix4(invMatrix)

    // We want to find t such that distance from (a*cos t, 0, b*sin t) to (lx, ly, lz) is minimized
    // Coarse search
    let closestAngle = 0
    let minDidstSq = Infinity
    const steps = 72
    
    for (let i = 0; i < steps; i++) {
      const angle = (i / steps) * Math.PI * 2
      const dx = localPos.x - a * Math.cos(angle)
      const dz = localPos.z - b * Math.sin(angle)
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
        const dx = localPos.x - a * Math.cos(ang)
        const dz = localPos.z - b * Math.sin(ang)
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
    const startAngle = findClosestOrbitAngle(satellite, a, b, matrix)

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

  // Generate launch track points that spiral up to meet the orbit
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

    // 1. Identify start and target angles in local orbit space
    const invMatrix = matrix.clone().invert()
    const localStart = groundPos.clone().applyMatrix4(invMatrix)
    const startAngle = Math.atan2(localStart.z, localStart.x)
    
    // Target is the closest point on the orbit ellipse
    const targetAngleRef = findClosestOrbitAngle(satellite, a, b, matrix)
    
    // 2. Calculate Angle Delta for Spiral
    // Ensure we go "forward" (positive dTheta) and complete at least one full circle (+2PI)
    let dTheta = targetAngleRef - startAngle
    while (dTheta < 0) dTheta += Math.PI * 2
    
    // Add full revolution(s) to "circle the earth completely"
    // One full extra turn
    dTheta += Math.PI * 2

    // 3. Generate Spiral Points
    const numPoints = Math.max(2, Math.ceil(segments * progress))
    for (let i = 0; i <= numPoints; i++) {
      const t = (i / numPoints) * progress
      
      // Interpolate Angle
      const currentAngle = startAngle + t * dTheta
      
      // Interpolate Altitude (Radius)
      // Calculate target radius at the specific current angle (on the ellipse)
      // Ellipse radius r(theta) = (a*b) / sqrt((b*cos)^2 + (a*sin)^2)
      // Note: standard ellipse parametric is x=a cos t, z=b sin t.
      // The radius at parameter t is sqrt((a cos t)^2 + (b sin t)^2)
      const rEllipse = Math.sqrt(Math.pow(a * Math.cos(currentAngle), 2) + Math.pow(b * Math.sin(currentAngle), 2))
      
      // Interpolate from Ground Radius to Ellipse Radius
      // Quadratic Ease-Out: t * (2 - t) -> Starts fast, flattens at top
      const groundRadius = GLOBE_RADIUS
      const altT = t * (2 - t)
      const currentRadius = groundRadius + (rEllipse - groundRadius) * altT
      
      // Interpolate Off-Plane Offset (y)
      // Decay from start Y to 0
      // Use (1-t)^2 to flatten the approach to 0
      const currentY = localStart.y * (1 - t) * (1 - t)
      
      // Construct Local Position
      const x = currentRadius * Math.cos(currentAngle)
      const z = currentRadius * Math.sin(currentAngle)
      // Note: r in previous step was magnitude. But wait, x/z are parametric.
      // Correction: The spiral should interpolate smoothly between a circle (ground) and ellipse (orbit).
      // But we derived rEllipse using the angle. 
      // If we use x = r * cos, z = r * sin, we get a point at distance r.
      // This is effectively blending polar coordinates.
      
      const localPos = new THREE.Vector3(x, currentY, z)

      // Transform back to World Space
      const worldPos = localPos.clone().applyMatrix4(matrix)
      
      points.push(worldPos)
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

    if (!line) {
      // Create new line with full spiral geometry (progress = 1.0)
      const points = generateLaunchTrackPoints(satellite, 1.0)
      
      const geometry = new THREE.BufferGeometry().setFromPoints(points)
      // Store total points for drawRange calculation
      geometry.userData = { totalPoints: points.length }

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

    // Update draw range based on progress
    // launchProgress is clamped to 1.0 by useSatellites, so this works for hold/fade phases too
    const totalPoints = line.geometry.userData.totalPoints || LAUNCH_LINE_SEGMENTS + 1
    const revealCount = Math.ceil(satellite.launchProgress * totalPoints)
    line.geometry.setDrawRange(0, Math.max(2, revealCount))

    // Update opacity using explicit control from useSatellites
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
