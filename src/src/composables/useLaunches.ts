import { computed, ref, type Ref } from 'vue'
import type { Launch, OrgStats, VehicleStats } from '../types'
import { shortenOrgName } from '../utils/helpers'

const DATA_URL = 'https://storage.googleapis.com/trilogy_public_models/duckdb/launch_report/launches_over_time/raw_data.json'

export interface ProcessedLaunch extends Launch {
  timestamp: number
  isFailed: boolean
  shortenedOrg: string
}

export interface ActiveLaunch extends ProcessedLaunch {
  scale: number
  opacity: number
}

// Shared state for launch data (loaded once, shared across all useLaunches calls)
const launchData = ref<Launch[]>([])
const isLoading = ref(true)
const loadError = ref<string | null>(null)
let loadPromise: Promise<void> | null = null

export async function loadLaunchData(): Promise<void> {
  // If already loaded, return immediately
  if (launchData.value.length > 0) {
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
      launchData.value = await response.json()
    } catch (err) {
      loadError.value = err instanceof Error ? err.message : 'Unknown error loading data'
      console.error('Failed to load launch data:', err)
    } finally {
      isLoading.value = false
    }
  })()

  return loadPromise
}

export function useLaunchDataStatus() {
  return { isLoading, loadError }
}

export interface LaunchFilters {
  organizations: Set<string>
  vehicles: Set<string>
}

export function useLaunches(
  currentTime: Ref<number>,
  isComplete: Ref<boolean>,
  rangeStart: Ref<number>,
  rangeEnd: Ref<number>,
  rangeDuration: Ref<number>,
  animationDurationMs: Ref<number>,
  filters?: Ref<LaunchFilters>
) {
  // All launches processed (not filtered by range)
  const allLaunches = computed<ProcessedLaunch[]>(() => {
    return launchData.value
      .map(l => ({
        ...l,
        timestamp: new Date(l.launch_date).getTime(),
        isFailed: l.success_flag.startsWith('F'),
        shortenedOrg: shortenOrgName(l.launch_org)
      }))
      .sort((a, b) => a.timestamp - b.timestamp)
  })

  // Launches filtered by selected year range
  const launches = computed<ProcessedLaunch[]>(() => {
    return allLaunches.value.filter(l =>
      l.timestamp >= rangeStart.value && l.timestamp <= rangeEnd.value
    )
  })

  // Check if a launch matches the current filters
  function matchesFilters(launch: ProcessedLaunch): boolean {
    if (!filters?.value) return true

    const { organizations, vehicles } = filters.value

    // If no filters are active, show all
    if (organizations.size === 0 && vehicles.size === 0) {
      return true
    }

    // Check organization filter (using shortened name)
    const orgMatch = organizations.size === 0 || organizations.has(launch.shortenedOrg)

    // Check vehicle filter
    const vehicleMatch = vehicles.size === 0 || vehicles.has(launch.vehicle_name || 'Unknown')

    // Both must match (AND logic when both filters are active)
    return orgMatch && vehicleMatch
  }

  // Filtered launches (by cross-filter)
  const filteredLaunches = computed<ProcessedLaunch[]>(() => {
    return launches.value.filter(matchesFilters)
  })

  const activeLaunches = computed<ActiveLaunch[]>(() => {
    const launchesToUse = filteredLaunches.value

    if (isComplete.value) {
      return launchesToUse.map(l => ({ ...l, scale: 1, opacity: 0.8 }))
    }

    // Visible window is a fixed 1.33 seconds of screen time, converted to calendar time
    const screenTimeMs = 1333 // ~1.33 seconds of animation
    const visibleWindow = (screenTimeMs / animationDurationMs.value) * rangeDuration.value
    const expandDuration = 0.15
    const holdDuration = 0.25

    return launchesToUse.filter(l => {
      return l.timestamp <= currentTime.value &&
        l.timestamp > currentTime.value - visibleWindow
    }).map(l => {
      const age = currentTime.value - l.timestamp
      const progress = age / visibleWindow

      let scale: number
      if (progress < expandDuration) {
        scale = progress / expandDuration
      } else if (progress < holdDuration) {
        scale = 1
      } else {
        scale = 1 - ((progress - holdDuration) / (1 - holdDuration))
      }

      const opacity = progress < holdDuration ? 1 : Math.max(0, 1 - ((progress - holdDuration) / (1 - holdDuration)) * 0.7)

      return { ...l, scale: Math.max(0, scale), opacity }
    })
  })

  // Accumulated launches (filtered)
  const accumulatedLaunches = computed(() => {
    return filteredLaunches.value.filter(l => l.timestamp <= currentTime.value)
  })

  // Stats are computed from ALL launches (not filtered) so we can see full picture
  // This allows users to see all available filter options
  const allAccumulatedLaunches = computed(() => {
    return launches.value.filter(l => l.timestamp <= currentTime.value)
  })

  const orgStats = computed<OrgStats[]>(() => {
    const stats: Record<string, OrgStats> = {}

    allAccumulatedLaunches.value.forEach(l => {
      const org = l.shortenedOrg
      if (!stats[org]) {
        stats[org] = { name: org, successes: 0, failures: 0, total: 0 }
      }
      if (l.isFailed) {
        stats[org].failures++
      } else {
        stats[org].successes++
      }
      stats[org].total++
    })

    return Object.values(stats).sort((a, b) => b.total - a.total).slice(0, 15)
  })

  const maxOrgTotal = computed(() => {
    return Math.max(...orgStats.value.map(o => o.total), 1)
  })

  const vehicleStats = computed<VehicleStats[]>(() => {
    const stats: Record<string, VehicleStats> = {}

    allAccumulatedLaunches.value.forEach(l => {
      const vehicle = l.vehicle_name || 'Unknown'
      if (!stats[vehicle]) {
        stats[vehicle] = { name: vehicle, successes: 0, failures: 0, total: 0 }
      }
      if (l.isFailed) {
        stats[vehicle].failures++
      } else {
        stats[vehicle].successes++
      }
      stats[vehicle].total++
    })

    return Object.values(stats).sort((a, b) => b.total - a.total).slice(0, 12)
  })

  const maxVehicleTotal = computed(() => {
    return Math.max(...vehicleStats.value.map(v => v.total), 1)
  })

  return {
    launches,
    filteredLaunches,
    activeLaunches,
    accumulatedLaunches,
    orgStats,
    maxOrgTotal,
    vehicleStats,
    maxVehicleTotal
  }
}
