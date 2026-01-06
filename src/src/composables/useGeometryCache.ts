/**
 * Manages precomputed geometry from the Web Worker.
 *
 * Provides a cache of orbit and launch track Float32Arrays
 * that can be used by useOrbits instead of computing on-demand.
 */

import { ref, readonly } from 'vue'
import type { Satellite, ProcessedSatellite } from '../types'
import type {
  GeometryWorkerRequest,
  GeometryWorkerProgress,
  GeometryWorkerComplete,
  GeometryWorkerResponse
} from '../workers/geometryWorker'

export interface CachedGeometry {
  orbitPositions: Float32Array
  launchPositions: Float32Array
  totalOrbitPoints: number
  totalLaunchPoints: number
}

// Global cache shared across all uses
const geometryCache = new Map<string, CachedGeometry>()
const isComputing = ref(false)
const computeProgress = ref(0)
const computeTotal = ref(0)
const isReady = ref(false)

let worker: Worker | null = null
let computePromise: Promise<void> | null = null

/**
 * Initialize the geometry worker and compute all satellite geometries.
 * Call this after loading satellite data.
 */
export async function computeGeometries(satellites: (Satellite | ProcessedSatellite)[]): Promise<void> {
  // If already computed or computing, wait for existing promise
  if (isReady.value) return
  if (computePromise) return computePromise

  computePromise = new Promise((resolve, reject) => {
    isComputing.value = true
    computeProgress.value = 0
    computeTotal.value = satellites.length

    // Create worker using Vite's worker import syntax
    worker = new Worker(
      new URL('../workers/geometryWorker.ts', import.meta.url),
      { type: 'module' }
    )

    worker.onmessage = (e: MessageEvent<GeometryWorkerResponse>) => {
      const data = e.data

      if (data.type === 'progress') {
        const progress = data as GeometryWorkerProgress
        computeProgress.value = progress.completed
        computeTotal.value = progress.total
      } else if (data.type === 'complete') {
        const complete = data as GeometryWorkerComplete

        // Store results in cache
        for (const result of complete.results) {
          geometryCache.set(result.jcat, {
            orbitPositions: result.orbitPositions,
            launchPositions: result.launchPositions,
            totalOrbitPoints: result.totalOrbitPoints,
            totalLaunchPoints: result.totalLaunchPoints
          })
        }

        isComputing.value = false
        isReady.value = true

        // Clean up worker
        worker?.terminate()
        worker = null

        resolve()
      }
    }

    worker.onerror = (error) => {
      console.error('Geometry worker error:', error)
      isComputing.value = false
      worker?.terminate()
      worker = null
      reject(error)
    }

    // Prepare satellite data for worker (only fields needed for geometry)
    const satelliteInputs = satellites.map(s => ({
      jcat: s.jcat,
      perigee: s.perigee,
      apogee: s.apogee,
      inc: s.inc,
      launch_site_latitude: s.launch_site_latitude,
      launch_site_longitude: s.launch_site_longitude,
      orbitType: 'orbitType' in s ? s.orbitType : getOrbitType(s.perigee, s.apogee)
    }))

    const request: GeometryWorkerRequest = {
      type: 'compute',
      satellites: satelliteInputs
    }

    worker.postMessage(request)
  })

  return computePromise
}

// Helper to determine orbit type if not already computed
function getOrbitType(perigee: number, apogee: number): 'LEO' | 'MEO' | 'GEO' | 'HEO' | 'ESCAPE' {
  if (!isFinite(apogee) || apogee < 0 || perigee < 0) {
    return 'ESCAPE'
  }
  const avgAltitude = (perigee + apogee) / 2
  if (avgAltitude < 2000) return 'LEO'
  if (avgAltitude < 35786) return 'MEO'
  if (avgAltitude >= 35286 && avgAltitude <= 36286) return 'GEO'
  return 'HEO'
}

/**
 * Get cached geometry for a satellite.
 * Returns undefined if not yet computed.
 */
export function getCachedGeometry(jcat: string): CachedGeometry | undefined {
  return geometryCache.get(jcat)
}

/**
 * Check if geometry cache is ready to use.
 */
export function useGeometryCache() {
  return {
    isReady: readonly(isReady),
    isComputing: readonly(isComputing),
    computeProgress: readonly(computeProgress),
    computeTotal: readonly(computeTotal),
    getCachedGeometry,
    computeGeometries
  }
}

/**
 * Clear the geometry cache (for testing or memory management).
 */
export function clearGeometryCache(): void {
  geometryCache.clear()
  isReady.value = false
  computePromise = null
}
