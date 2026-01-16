import { computed, ref, type Ref } from 'vue'
import type { Stats } from '../types'

const DATA_URL = `${import.meta.env.BASE_URL}raw_engine_data.json`

export interface EngineLaunch {
  launch_date: string
  launch_tag: string
  vehicle_stage_number: number
  vehicle_stage_engine_name: string
  vehicle_stage_engine_fuel: string
  vehicle_stage_engine_group: string
  vehicle_stage_engine_count: number
  vehicle_stage_engine_isp: number | null
  group_hex_color: string
  timestamp: number
}

export interface EngineGroup {
  group: string
  color: string
  launches: EngineLaunch[]
}

// Represents a single engine dot on the spiral (one per engine_count)
export interface SpiralDot {
  launch: EngineLaunch
  index: number  // 0 to engine_count-1
  timestamp: number
  group: string
  color: string
}

// Shared state
const engineData = ref<EngineLaunch[]>([])
const isLoading = ref(true)
const loadError = ref<string | null>(null)
let loadPromise: Promise<void> | null = null

export async function loadEngineData(): Promise<void> {
  if (engineData.value.length > 0) {
    isLoading.value = false
    return
  }

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

      engineData.value = data.map((d: any) => ({
        ...d,
        timestamp: new Date(d.launch_date).getTime(),
        vehicle_stage_number: d.vehicle_stage_number ?? 1,
        vehicle_stage_engine_fuel: d.vehicle_stage_engine_fuel?.trim() || 'Unknown',
        vehicle_stage_engine_group: d.vehicle_stage_engine_group?.trim() || 'Unknown',
        vehicle_stage_engine_count: d.vehicle_stage_engine_count || 1,
        group_hex_color: d.group_hex_color || '#9ca3af'
      })).sort((a: any, b: any) => a.timestamp - b.timestamp)

    } catch (err) {
      loadError.value = err instanceof Error ? err.message : 'Unknown error loading data'
      console.error('Failed to load engine data:', err)
    } finally {
      isLoading.value = false
    }
  })()

  return loadPromise
}

export function useEngineDataStatus() {
  return { isLoading, loadError }
}

export function useEngines(
  currentTime: Ref<number>,
  rangeStart: Ref<number>,
  rangeEnd: Ref<number>
) {
  // Group data by engine group (LOX/Kero, Solid, etc.)
  const engineGroups = computed(() => {
    const groups: Record<string, EngineGroup> = {}

    for (const launch of engineData.value) {
      const groupName = launch.vehicle_stage_engine_group

      if (!groups[groupName]) {
        groups[groupName] = {
          group: groupName,
          color: launch.group_hex_color,
          launches: []
        }
      }

      groups[groupName].launches.push(launch)
    }

    return Object.values(groups).sort((a, b) => a.group.localeCompare(b.group))
  })

  // Get color for a group
  const groupColors = computed(() => {
    const colors: Record<string, string> = {}
    for (const group of engineGroups.value) {
      colors[group.group] = group.color
    }
    return colors
  })

  // All launches in range, sorted by time
  const launchesInRange = computed(() => {
    return engineData.value
      .filter(l => l.timestamp >= rangeStart.value && l.timestamp <= rangeEnd.value)
      .sort((a, b) => a.timestamp - b.timestamp)
  })

  // Visible launches up to current time (for spiral)
  const visibleLaunches = computed(() => {
    return launchesInRange.value.filter(l => l.timestamp <= currentTime.value)
  })

  // Staged launches for multi-spiral display
  // Stage 0+1: Boosters + First Stage (core engines)
  const coreStageVisible = computed(() => {
    return visibleLaunches.value.filter(l => l.vehicle_stage_number <= 1)
  })

  // Stage 2: Second Stage
  const secondStageVisible = computed(() => {
    return visibleLaunches.value.filter(l => l.vehicle_stage_number === 2)
  })

  // Stage 3+: Upper/Kick Stages
  const upperStageVisible = computed(() => {
    return visibleLaunches.value.filter(l => l.vehicle_stage_number >= 3)
  })

  // Boosters only (stage 0) - rendered outside main spiral
  const boostersVisible = computed(() => {
    return visibleLaunches.value.filter(l => l.vehicle_stage_number === 0)
  })

  // First stage only (stage 1) - core engines
  const firstStageOnlyVisible = computed(() => {
    return visibleLaunches.value.filter(l => l.vehicle_stage_number === 1)
  })

  // Stats for bar chart - counts engine firings (engine_count) per group up to current time
  const groupStats = computed<Stats[]>(() => {
    const counts: Record<string, number> = {}

    for (const launch of visibleLaunches.value) {
      const group = launch.vehicle_stage_engine_group
      counts[group] = (counts[group] || 0) + launch.vehicle_stage_engine_count
    }

    return engineGroups.value.map(g => ({
      name: g.group,
      successes: counts[g.group] || 0,
      failures: 0,
      total: counts[g.group] || 0
    })).sort((a, b) => b.total - a.total)
  })

  // Max for scaling bar chart
  const maxGroupTotal = computed(() => {
    return Math.max(...groupStats.value.map(s => s.total), 1)
  })

  // Total engine firings count
  const totalEngineFireings = computed(() => {
    return visibleLaunches.value.reduce((sum, l) => sum + l.vehicle_stage_engine_count, 0)
  })

  return {
    engineGroups,
    groupColors,
    launchesInRange,
    visibleLaunches,
    coreStageVisible,
    secondStageVisible,
    upperStageVisible,
    boostersVisible,
    firstStageOnlyVisible,
    groupStats,
    maxGroupTotal,
    totalEngineFireings
  }
}
