import { computed, ref, type Ref } from 'vue'
import type { Satellite, ProcessedSatellite, ActiveSatellite, SatelliteState, SatelliteStats, OrbitTypeStats } from '../types'

// For MVP, load from local file. Can switch to GCS URL later.
// Use Vite's BASE_URL to handle subpath deployment
const DATA_URL = `${import.meta.env.BASE_URL}raw_satellite_data.json`

// Shared state for satellite data (loaded once, shared across all useSatellites calls)
const satelliteData = ref<Satellite[]>([])
const isLoading = ref(true)
const loadError = ref<string | null>(null)
let loadPromise: Promise<void> | null = null

// Determine orbit type based on apogee
function getOrbitType(perigee: number, apogee: number): ProcessedSatellite['orbitType'] {
  // Handle escape trajectories
  if (!isFinite(apogee) || apogee < 0 || perigee < 0) {
    return 'ESCAPE'
  }

  const avgAltitude = (perigee + apogee) / 2

  // LEO: < 2000 km
  if (avgAltitude < 2000) return 'LEO'

  // MEO: 2000 - 35786 km
  if (avgAltitude < 35786) return 'MEO'

  // GEO: ~35786 km (within 500km tolerance)
  if (avgAltitude >= 35286 && avgAltitude <= 36286) return 'GEO'

  // HEO: highly elliptical orbits (large difference between perigee and apogee)
  // or anything above GEO
  return 'HEO'
}

// Shorten owner names for display
function shortenOwnerName(name: string): string {
  // Common abbreviations
  const replacements: [RegExp, string][] = [
    [/National Aeronautics and Space Administration/gi, 'NASA'],
    [/NASA .+/gi, 'NASA'],
    [/Jet Propulsion Lab/gi, 'JPL'],
    [/ОКБ-1 им\. С\.П\. Королева/gi, 'OKB-1 (Korolev)'],
    [/US Air Force .+/gi, 'USAF'],
    [/Secretary of the Air Force.+/gi, 'NRO'],
    [/Central Intelligence Agency.+/gi, 'CIA'],
    [/Bureau of Naval Weapons.+/gi, 'US Navy'],
    [/Naval Research Lab/gi, 'NRL'],
    [/Yangel KB/gi, 'Yuzhnoye'],
  ]

  let shortened = name
  for (const [pattern, replacement] of replacements) {
    shortened = shortened.replace(pattern, replacement)
  }

  // Truncate if still too long
  if (shortened.length > 30) {
    shortened = shortened.substring(0, 27) + '...'
  }

  return shortened
}

export async function loadSatelliteData(): Promise<void> {
  // If already loaded, return immediately
  if (satelliteData.value.length > 0) {
    isLoading.value = false
    return
  }

  // If already loading, wait for that to finish
  if (loadPromise) {
    return loadPromise
  }

  loadPromise = (async () => {
    try {
      isLoading.value = true
      loadError.value = null
      const response = await fetch(DATA_URL)
      if (!response.ok) {
        throw new Error(`Failed to fetch data: ${response.status} ${response.statusText}`)
      }
      const data = await response.json()

      // Filter out satellites with invalid data
      satelliteData.value = data.filter((s: Satellite) =>
        s.launch_site_latitude != null &&
        s.launch_site_longitude != null &&
        s.launch_date != null
      )
    } catch (err) {
      loadError.value = err instanceof Error ? err.message : 'Unknown error loading data'
      console.error('Failed to load satellite data:', err)
    } finally {
      isLoading.value = false
    }
  })()

  return loadPromise
}

export function useSatelliteDataStatus() {
  return { isLoading, loadError }
}

export function useSatellites(
  currentTime: Ref<number>,
  _isComplete: Ref<boolean>,
  rangeStart: Ref<number>,
  rangeEnd: Ref<number>,
  rangeDuration: Ref<number>,
  animationDurationMs: Ref<number>
) {
  // All satellites processed (not filtered by range)
  const allSatellites = computed<ProcessedSatellite[]>(() => {
    return satelliteData.value
      .map(s => ({
        ...s,
        launchTimestamp: new Date(s.launch_date).getTime(),
        decomTimestamp: new Date(s.end_date).getTime(),
        orbitType: getOrbitType(s.perigee, s.apogee)
      }))
      .sort((a, b) => a.launchTimestamp - b.launchTimestamp)
  })

  // Satellites filtered by selected year range (launched within range)
  const satellites = computed<ProcessedSatellite[]>(() => {
    return allSatellites.value.filter(s =>
      s.launchTimestamp >= rangeStart.value && s.launchTimestamp <= rangeEnd.value
    )
  })

  // Animation timing parameters (in days)
  // LEO (~400km) takes ~2 days, GEO (~36000km, capped at visualization max) takes ~8 days
  const LEO_LAUNCH_DAYS = 2        // Days for LEO (~400km) launch track to reach orbit
  const MAX_LAUNCH_DAYS = 8        // Days for highest orbits (capped altitude) to reach orbit
  const MAX_ORBIT_ALTITUDE_KM = 36000  // Cap altitude for timing calculation
  
  // Screen time constants (ms)
  const HOLD_DURATION_SCREEN_MS = 0 // Start fading immediately after reaching orbit
  const FADE_DURATION_SCREEN_MS = 3000 // Fade out over 10s

  // Decom track decay time (in animation days)
  const DECOM_TRACK_DECAY_DAYS = 7

  // Calculate ascent duration based on target orbit altitude
  function getAscentDurationMs(satellite: ProcessedSatellite): number {
    // Target altitude is average of perigee and apogee, capped for visualization
    const targetAltitudeKm = Math.min(
      Math.max((Math.max(satellite.perigee, 100) + Math.min(satellite.apogee, MAX_ORBIT_ALTITUDE_KM)) / 2, 100),
      MAX_ORBIT_ALTITUDE_KM
    )
    // Linear interpolation: LEO (400km) -> LEO_LAUNCH_DAYS, MAX_ORBIT -> MAX_LAUNCH_DAYS
    const leoAltitude = 400
    const altitudeFraction = Math.min((targetAltitudeKm - leoAltitude) / (MAX_ORBIT_ALTITUDE_KM - leoAltitude), 1)
    const daysToOrbit = LEO_LAUNCH_DAYS + altitudeFraction * (MAX_LAUNCH_DAYS - LEO_LAUNCH_DAYS)
    return daysToOrbit * 24 * 60 * 60 * 1000  // Convert to ms
  }

  // Time for orbit to complete one full revolution after insertion (in days)
  const ORBIT_REVEAL_DAYS = 3

  // Get satellite state and animation progress
  function getSatelliteState(satellite: ProcessedSatellite, time: number): { state: SatelliteState; launchProgress: number; launchOpacity: number; decomProgress: number; orbitProgress: number } {
    const ascentDurationMs = getAscentDurationMs(satellite)
    
    // Convert screen time to simulation time
    const simTimePerScreenMs = rangeDuration.value / Math.max(animationDurationMs.value, 1)
    const holdDurationMs = HOLD_DURATION_SCREEN_MS * simTimePerScreenMs
    const fadeDurationMs = FADE_DURATION_SCREEN_MS * simTimePerScreenMs
    
    const totalLaunchWindowMs = ascentDurationMs + holdDurationMs + fadeDurationMs
    
    const decomWindowMs = DECOM_TRACK_DECAY_DAYS * 24 * 60 * 60 * 1000
    const orbitRevealMs = ORBIT_REVEAL_DAYS * 24 * 60 * 60 * 1000

    // Before launch
    if (time < satellite.launchTimestamp) {
      return { state: 'pending', launchProgress: 0, launchOpacity: 0, decomProgress: 0, orbitProgress: 0 }
    }

    // During launch animation (Ascent + Hold + Fade)
    const timeSinceLaunch = time - satellite.launchTimestamp
    if (timeSinceLaunch < totalLaunchWindowMs) {
      let launchProgress = 0
      let launchOpacity = 1
      
      if (timeSinceLaunch < ascentDurationMs) {
        // Ascent Phase
        launchProgress = timeSinceLaunch / ascentDurationMs
        launchOpacity = 1
      } else if (timeSinceLaunch < ascentDurationMs + holdDurationMs) {
        // Hold Phase
        launchProgress = 1
        launchOpacity = 1
      } else {
        // Fade Phase
        launchProgress = 1
        const fadeProgress = (timeSinceLaunch - (ascentDurationMs + holdDurationMs)) / fadeDurationMs
        launchOpacity = 1 - fadeProgress
      }

      // Orbit starts drawing when ascent completes (at ascentDurationMs)
      // Even though state is 'launching', we can calculate orbitProgress to see if we should start drawing orbit
      // But filtering logic typically hides 'launching' satellites from orbit list. 
      // We'll address orbit visibility in the `orbitingSatellites` computed property.
      
      const timeSinceInsertion = timeSinceLaunch - ascentDurationMs
      const orbitProgress = timeSinceInsertion > 0 ? Math.min(timeSinceInsertion / orbitRevealMs, 1) : 0

      return { state: 'launching', launchProgress, launchOpacity, decomProgress: 0, orbitProgress }
    }

    // Post-launch (Active)
    // Orbit is fully revealed
    // Calculate orbit relative to insertion time
    const orbitInsertionTime = satellite.launchTimestamp + ascentDurationMs
    const timeSinceInsertion = time - orbitInsertionTime
    const orbitProgress = Math.min(Math.max(0, timeSinceInsertion) / orbitRevealMs, 1)

    // Before decommission
    if (time < satellite.decomTimestamp) {
      return { state: 'active', launchProgress: 1, launchOpacity: 0, decomProgress: 0, orbitProgress }
    }

    // During decommission animation
    const timeSinceDecom = time - satellite.decomTimestamp
    if (timeSinceDecom < decomWindowMs) {
      const progress = timeSinceDecom / decomWindowMs
      return { state: 'decommissioning', launchProgress: 1, launchOpacity: 0, decomProgress: progress, orbitProgress }
    }

    // Fully decommissioned
    return { state: 'decommissioned', launchProgress: 1, launchOpacity: 0, decomProgress: 1, orbitProgress: 1 }
  }

  // Active satellites with their current state and animation progress
  const activeSatellites = computed<ActiveSatellite[]>(() => {
    const time = currentTime.value

    return satellites.value
      .map(s => {
        const { state, launchProgress, launchOpacity, decomProgress, orbitProgress } = getSatelliteState(s, time)
        return {
          ...s,
          state,
          launchProgress,
          launchOpacity,
          decomProgress,
          orbitProgress
        }
      })
      .filter(s =>
        s.state === 'launching' ||
        s.state === 'active' ||
        s.state === 'decommissioning'
      )
  })

  // Satellites that are currently in orbit (for orbit rendering)
  // Orbits appear when ascent completes.
  // We now include 'launching' state if orbitProgress > 0 (meaning ascent is done, now in hold/fade)
  const orbitingSatellites = computed<ActiveSatellite[]>(() => {
    return activeSatellites.value.filter(s => {
      // Show orbit if active, decommissioning, OR launching but ascent complete
      if (s.state === 'active' || s.state === 'decommissioning') return true
      if (s.state === 'launching' && s.orbitProgress > 0) return true
      return false
    })
  })

  // Satellites currently launching (for launch line animation)
  const launchingSatellites = computed<ActiveSatellite[]>(() => {
    return activeSatellites.value.filter(s => s.state === 'launching')
  })

  // Satellites currently decommissioning (for decom animation)
  const decommissioningSatellites = computed<ActiveSatellite[]>(() => {
    return activeSatellites.value.filter(s => s.state === 'decommissioning')
  })

  // Accumulated satellites (all that have launched up to current time)
  const accumulatedSatellites = computed(() => {
    return satellites.value.filter(s => s.launchTimestamp <= currentTime.value)
  })

  // Stats by owner
  const ownerStats = computed<SatelliteStats[]>(() => {
    const stats: Record<string, SatelliteStats> = {}

    accumulatedSatellites.value.forEach(s => {
      const owner = shortenOwnerName(s.owner_e_name)
      if (!stats[owner]) {
        stats[owner] = { name: owner, successes: 0, failures: 0, total: 0 }
      }
      // For satellites, treat decommissioned as "completed" (success) and active as "ongoing"
      // Since we don't have success/failure data, just count totals
      stats[owner].successes++
      stats[owner].total++
    })

    return Object.values(stats).sort((a, b) => b.total - a.total).slice(0, 15)
  })

  const maxOwnerTotal = computed(() => {
    return Math.max(...ownerStats.value.map(o => o.total), 1)
  })

  // Stats by orbit type
  const orbitTypeStats = computed<OrbitTypeStats[]>(() => {
    const stats: Record<string, OrbitTypeStats> = {}

    accumulatedSatellites.value.forEach(s => {
      const orbitType = s.orbitType
      if (!stats[orbitType]) {
        stats[orbitType] = { name: orbitType, successes: 0, failures: 0, total: 0 }
      }
      stats[orbitType].successes++
      stats[orbitType].total++
    })

    // Order: LEO, MEO, GEO, HEO, ESCAPE
    const order = ['LEO', 'MEO', 'GEO', 'HEO', 'ESCAPE']
    return order
      .filter(type => stats[type])
      .map(type => stats[type])
  })

  const maxOrbitTypeTotal = computed(() => {
    return Math.max(...orbitTypeStats.value.map(o => o.total), 1)
  })

  return {
    satellites,
    activeSatellites,
    orbitingSatellites,
    launchingSatellites,
    decommissioningSatellites,
    accumulatedSatellites,
    ownerStats,
    maxOwnerTotal,
    orbitTypeStats,
    maxOrbitTypeTotal
  }
}
