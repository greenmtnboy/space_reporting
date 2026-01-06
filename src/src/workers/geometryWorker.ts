/**
 * Web Worker for precomputing satellite orbit and launch track geometry.
 *
 * Moves heavy computation (orbital math, angle searches) off main thread.
 * Transfers Float32Array buffers back via Transferable (zero-copy).
 */

// Types matching main thread
interface SatelliteInput {
  jcat: string
  perigee: number
  apogee: number
  inc: number
  launch_site_latitude: number
  launch_site_longitude: number
  orbitType: 'LEO' | 'MEO' | 'GEO' | 'HEO' | 'ESCAPE'
}

interface GeometryResult {
  jcat: string
  orbitPositions: Float32Array
  launchPositions: Float32Array
  totalOrbitPoints: number
  totalLaunchPoints: number
}

export interface GeometryWorkerRequest {
  type: 'compute'
  satellites: SatelliteInput[]
}

export interface GeometryWorkerProgress {
  type: 'progress'
  completed: number
  total: number
}

export interface GeometryWorkerComplete {
  type: 'complete'
  results: GeometryResult[]
  // ArrayBuffers to transfer
  transferList: ArrayBuffer[]
}

export type GeometryWorkerResponse = GeometryWorkerProgress | GeometryWorkerComplete

// --- Constants (matching useOrbits.ts) ---
const EARTH_RADIUS_KM = 6371
const GLOBE_RADIUS = 1
const KM_TO_UNITS = GLOBE_RADIUS / EARTH_RADIUS_KM
const ORBIT_SEGMENTS = 128
const LAUNCH_LINE_SEGMENTS = 128

// --- Pure math helpers (no THREE.js) ---

// Simple 3D vector operations
function setLatLngToPosition(
  lat: number,
  lng: number,
  altitudeKm: number,
  out: { x: number; y: number; z: number }
): void {
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lng + 180) * (Math.PI / 180)
  const radius = GLOBE_RADIUS + altitudeKm * KM_TO_UNITS

  out.x = -radius * Math.sin(phi) * Math.cos(theta)
  out.y = radius * Math.cos(phi)
  out.z = radius * Math.sin(phi) * Math.sin(theta)
}

function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
    hash = hash & hash
  }
  return (hash & 0xffff) / 0xffff
}

// 4x4 matrix operations (column-major like THREE.js)
type Mat4 = Float32Array // 16 elements

function mat4Identity(): Mat4 {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  ])
}

function mat4RotationX(angle: number): Mat4 {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return new Float32Array([
    1, 0, 0, 0,
    0, c, s, 0,
    0, -s, c, 0,
    0, 0, 0, 1
  ])
}

function mat4RotationY(angle: number): Mat4 {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return new Float32Array([
    c, 0, -s, 0,
    0, 1, 0, 0,
    s, 0, c, 0,
    0, 0, 0, 1
  ])
}

function mat4Multiply(a: Mat4, b: Mat4, out: Mat4): void {
  const a00 = a[0], a01 = a[4], a02 = a[8], a03 = a[12]
  const a10 = a[1], a11 = a[5], a12 = a[9], a13 = a[13]
  const a20 = a[2], a21 = a[6], a22 = a[10], a23 = a[14]
  const a30 = a[3], a31 = a[7], a32 = a[11], a33 = a[15]

  const b00 = b[0], b01 = b[4], b02 = b[8], b03 = b[12]
  const b10 = b[1], b11 = b[5], b12 = b[9], b13 = b[13]
  const b20 = b[2], b21 = b[6], b22 = b[10], b23 = b[14]
  const b30 = b[3], b31 = b[7], b32 = b[11], b33 = b[15]

  out[0] = a00*b00 + a01*b10 + a02*b20 + a03*b30
  out[1] = a10*b00 + a11*b10 + a12*b20 + a13*b30
  out[2] = a20*b00 + a21*b10 + a22*b20 + a23*b30
  out[3] = a30*b00 + a31*b10 + a32*b20 + a33*b30

  out[4] = a00*b01 + a01*b11 + a02*b21 + a03*b31
  out[5] = a10*b01 + a11*b11 + a12*b21 + a13*b31
  out[6] = a20*b01 + a21*b11 + a22*b21 + a23*b31
  out[7] = a30*b01 + a31*b11 + a32*b21 + a33*b31

  out[8] = a00*b02 + a01*b12 + a02*b22 + a03*b32
  out[9] = a10*b02 + a11*b12 + a12*b22 + a13*b32
  out[10] = a20*b02 + a21*b12 + a22*b22 + a23*b32
  out[11] = a30*b02 + a31*b12 + a32*b22 + a33*b32

  out[12] = a00*b03 + a01*b13 + a02*b23 + a03*b33
  out[13] = a10*b03 + a11*b13 + a12*b23 + a13*b33
  out[14] = a20*b03 + a21*b13 + a22*b23 + a23*b33
  out[15] = a30*b03 + a31*b13 + a32*b23 + a33*b33
}

function mat4Invert(m: Mat4, out: Mat4): boolean {
  const m00 = m[0], m01 = m[4], m02 = m[8], m03 = m[12]
  const m10 = m[1], m11 = m[5], m12 = m[9], m13 = m[13]
  const m20 = m[2], m21 = m[6], m22 = m[10], m23 = m[14]
  const m30 = m[3], m31 = m[7], m32 = m[11], m33 = m[15]

  const tmp0 = m22 * m33 - m23 * m32
  const tmp1 = m21 * m33 - m23 * m31
  const tmp2 = m21 * m32 - m22 * m31
  const tmp3 = m20 * m33 - m23 * m30
  const tmp4 = m20 * m32 - m22 * m30
  const tmp5 = m20 * m31 - m21 * m30

  const t0 = m11 * tmp0 - m12 * tmp1 + m13 * tmp2
  const t1 = -(m10 * tmp0 - m12 * tmp3 + m13 * tmp4)
  const t2 = m10 * tmp1 - m11 * tmp3 + m13 * tmp5
  const t3 = -(m10 * tmp2 - m11 * tmp4 + m12 * tmp5)

  const det = m00 * t0 + m01 * t1 + m02 * t2 + m03 * t3
  if (Math.abs(det) < 1e-10) return false

  const invDet = 1 / det

  out[0] = t0 * invDet
  out[1] = t1 * invDet
  out[2] = t2 * invDet
  out[3] = t3 * invDet

  out[4] = -(m01 * tmp0 - m02 * tmp1 + m03 * tmp2) * invDet
  out[5] = (m00 * tmp0 - m02 * tmp3 + m03 * tmp4) * invDet
  out[6] = -(m00 * tmp1 - m01 * tmp3 + m03 * tmp5) * invDet
  out[7] = (m00 * tmp2 - m01 * tmp4 + m02 * tmp5) * invDet

  const tmp6 = m02 * m13 - m03 * m12
  const tmp7 = m01 * m13 - m03 * m11
  const tmp8 = m01 * m12 - m02 * m11
  const tmp9 = m00 * m13 - m03 * m10
  const tmp10 = m00 * m12 - m02 * m10
  const tmp11 = m00 * m11 - m01 * m10

  out[8] = (m31 * tmp6 - m32 * tmp7 + m33 * tmp8) * invDet
  out[9] = -(m30 * tmp6 - m32 * tmp9 + m33 * tmp10) * invDet
  out[10] = (m30 * tmp7 - m31 * tmp9 + m33 * tmp11) * invDet
  out[11] = -(m30 * tmp8 - m31 * tmp10 + m32 * tmp11) * invDet

  out[12] = -(m21 * tmp6 - m22 * tmp7 + m23 * tmp8) * invDet
  out[13] = (m20 * tmp6 - m22 * tmp9 + m23 * tmp10) * invDet
  out[14] = -(m20 * tmp7 - m21 * tmp9 + m23 * tmp11) * invDet
  out[15] = (m20 * tmp8 - m21 * tmp10 + m22 * tmp11) * invDet

  return true
}

function vec3ApplyMatrix4(
  x: number, y: number, z: number,
  m: Mat4
): { x: number; y: number; z: number } {
  const w = 1 / (m[3] * x + m[7] * y + m[11] * z + m[15])
  return {
    x: (m[0] * x + m[4] * y + m[8] * z + m[12]) * w,
    y: (m[1] * x + m[5] * y + m[9] * z + m[13]) * w,
    z: (m[2] * x + m[6] * y + m[10] * z + m[14]) * w
  }
}

// --- Geometry Generation ---

interface OrbitalParams {
  a: number
  b: number
  isEscape: boolean
  matrix: Mat4
}

function getOrbitalParams(satellite: SatelliteInput): OrbitalParams {
  if (satellite.orbitType === 'ESCAPE' || !isFinite(satellite.apogee) || satellite.apogee < 0) {
    return { a: 0, b: 0, isEscape: true, matrix: mat4Identity() }
  }

  const perigeeKm = Math.max(satellite.perigee, 100)
  const apogeeKm = Math.min(satellite.apogee, 100000)
  const semiMajorAxis = (perigeeKm + apogeeKm) / 2 + EARTH_RADIUS_KM
  const semiMinorAxis = Math.sqrt((perigeeKm + EARTH_RADIUS_KM) * (apogeeKm + EARTH_RADIUS_KM))

  const a = semiMajorAxis * KM_TO_UNITS
  const b = semiMinorAxis * KM_TO_UNITS

  const inclination = satellite.inc * (Math.PI / 180)
  const lanOffset = hashString(satellite.jcat) * 360
  const longitudeOfAscendingNode = (satellite.launch_site_longitude + lanOffset) * (Math.PI / 180)

  const incMatrix = mat4RotationX(inclination)
  const lanMatrix = mat4RotationY(longitudeOfAscendingNode)
  const matrix = mat4Identity()
  mat4Multiply(lanMatrix, incMatrix, matrix)

  return { a, b, isEscape: false, matrix }
}

function findClosestOrbitAngle(
  satellite: SatelliteInput,
  a: number,
  b: number,
  matrix: Mat4
): number {
  const groundPos = { x: 0, y: 0, z: 0 }
  setLatLngToPosition(
    satellite.launch_site_latitude,
    satellite.launch_site_longitude,
    0,
    groundPos
  )

  const invMatrix = mat4Identity()
  mat4Invert(matrix, invMatrix)
  const localPos = vec3ApplyMatrix4(groundPos.x, groundPos.y, groundPos.z, invMatrix)

  // Coarse search
  let closestAngle = 0
  let minDistSq = Infinity
  const steps = 72

  for (let i = 0; i < steps; i++) {
    const angle = (i / steps) * Math.PI * 2
    const dx = localPos.x - a * Math.cos(angle)
    const dz = localPos.z - b * Math.sin(angle)
    const d2 = dx * dx + dz * dz
    if (d2 < minDistSq) {
      minDistSq = d2
      closestAngle = angle
    }
  }

  // Refine search
  const refine = (center: number, range: number): number => {
    let best = center
    let minDist = minDistSq
    const fineSteps = 10
    for (let i = 0; i <= fineSteps; i++) {
      const ang = center - range / 2 + (i / fineSteps) * range
      const dx = localPos.x - a * Math.cos(ang)
      const dz = localPos.z - b * Math.sin(ang)
      const d = dx * dx + dz * dz
      if (d < minDist) {
        minDist = d
        best = ang
      }
    }
    minDistSq = minDist
    return best
  }

  const stepSize = (Math.PI * 2) / steps
  closestAngle = refine(closestAngle, stepSize * 2)
  closestAngle = refine(closestAngle, stepSize * 0.2)

  return closestAngle
}

function generateOrbitPoints(satellite: SatelliteInput): Float32Array {
  const { a, b, isEscape, matrix } = getOrbitalParams(satellite)
  const segments = ORBIT_SEGMENTS
  const numPoints = segments + 1
  const positions = new Float32Array(numPoints * 3)

  if (isEscape) {
    const pos1 = { x: 0, y: 0, z: 0 }
    setLatLngToPosition(
      satellite.launch_site_latitude,
      satellite.launch_site_longitude,
      Math.max(satellite.perigee, 200),
      pos1
    )
    positions[0] = pos1.x
    positions[1] = pos1.y
    positions[2] = pos1.z

    positions[3] = pos1.x * 3
    positions[4] = pos1.y * 3
    positions[5] = pos1.z * 3

    return positions.slice(0, 6)
  }

  const startAngle = findClosestOrbitAngle(satellite, a, b, matrix)

  for (let i = 0; i < numPoints; i++) {
    const angle = startAngle + (i / segments) * Math.PI * 2
    const x = a * Math.cos(angle)
    const z = b * Math.sin(angle)

    const transformed = vec3ApplyMatrix4(x, 0, z, matrix)
    positions[i * 3] = transformed.x
    positions[i * 3 + 1] = transformed.y
    positions[i * 3 + 2] = transformed.z
  }

  return positions
}

function generateLaunchTrackPoints(satellite: SatelliteInput): Float32Array {
  const { a, b, isEscape, matrix } = getOrbitalParams(satellite)
  const segments = LAUNCH_LINE_SEGMENTS
  const progress = 1.0 // Always generate full track

  if (isEscape) {
    const positions = new Float32Array(6)
    const pos = { x: 0, y: 0, z: 0 }

    setLatLngToPosition(satellite.launch_site_latitude, satellite.launch_site_longitude, 0, pos)
    positions[0] = pos.x
    positions[1] = pos.y
    positions[2] = pos.z

    const targetAltitude = Math.max(satellite.perigee, 200)
    setLatLngToPosition(satellite.launch_site_latitude, satellite.launch_site_longitude, targetAltitude, pos)
    positions[3] = pos.x
    positions[4] = pos.y
    positions[5] = pos.z

    return positions
  }

  const invMatrix = mat4Identity()
  mat4Invert(matrix, invMatrix)

  const groundPos = { x: 0, y: 0, z: 0 }
  setLatLngToPosition(satellite.launch_site_latitude, satellite.launch_site_longitude, 0, groundPos)
  const localPos = vec3ApplyMatrix4(groundPos.x, groundPos.y, groundPos.z, invMatrix)

  const startAngle = Math.atan2(localPos.z, localPos.x)
  const targetParametricAngle = findClosestOrbitAngle(satellite, a, b, matrix)
  const targetAngleGeo = Math.atan2(
    b * Math.sin(targetParametricAngle),
    a * Math.cos(targetParametricAngle)
  )

  let dTheta = targetAngleGeo - startAngle
  while (dTheta < 0) dTheta += Math.PI * 2
  dTheta += Math.PI * 2 // One full extra turn

  const numPoints = Math.max(2, Math.ceil(segments * progress))
  const totalPoints = numPoints + 1
  const positions = new Float32Array(totalPoints * 3)

  for (let i = 0; i <= numPoints; i++) {
    const t = (i / numPoints) * progress
    const currentAngle = startAngle + t * dTheta

    const cosTheta = Math.cos(currentAngle)
    const sinTheta = Math.sin(currentAngle)
    const denom = Math.sqrt(
      Math.pow(b * cosTheta, 2) + Math.pow(a * sinTheta, 2)
    )
    const rEllipse = denom > 0.0001 ? (a * b) / denom : a

    const groundRadius = GLOBE_RADIUS
    const altT = t * (2 - t)
    const currentRadius = groundRadius + (rEllipse - groundRadius) * altT
    const currentY = localPos.y * (1 - t) * (1 - t)

    const x = currentRadius * cosTheta
    const z = currentRadius * sinTheta

    const transformed = vec3ApplyMatrix4(x, currentY, z, matrix)
    positions[i * 3] = transformed.x
    positions[i * 3 + 1] = transformed.y
    positions[i * 3 + 2] = transformed.z
  }

  return positions
}

// --- Worker Message Handler ---

self.onmessage = function(e: MessageEvent<GeometryWorkerRequest>) {
  const { type, satellites } = e.data

  if (type !== 'compute') return

  const results: GeometryResult[] = []
  const transferList: ArrayBuffer[] = []
  const total = satellites.length
  const progressInterval = Math.max(1, Math.floor(total / 20)) // Report every 5%

  for (let i = 0; i < total; i++) {
    const satellite = satellites[i]

    const orbitPositions = generateOrbitPoints(satellite)
    const launchPositions = generateLaunchTrackPoints(satellite)

    results.push({
      jcat: satellite.jcat,
      orbitPositions,
      launchPositions,
      totalOrbitPoints: orbitPositions.length / 3,
      totalLaunchPoints: launchPositions.length / 3
    })

    transferList.push(orbitPositions.buffer as ArrayBuffer)
    transferList.push(launchPositions.buffer as ArrayBuffer)

    // Progress update
    if ((i + 1) % progressInterval === 0 || i === total - 1) {
      const progress: GeometryWorkerProgress = {
        type: 'progress',
        completed: i + 1,
        total
      }
      self.postMessage(progress)
    }
  }

  const response: GeometryWorkerComplete = {
    type: 'complete',
    results,
    transferList
  }

  // Transfer ownership of ArrayBuffers (zero-copy)
  // Use the worker-specific postMessage overload
  ;(self as unknown as Worker).postMessage(response, transferList)
}
