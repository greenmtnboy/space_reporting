import { computed, type Ref } from 'vue'
import type { Launch, OrgStats, VehicleStats } from '../types'
import { shortenOrgName } from '../utils/helpers'
import launchData from '../../../data/raw_data.json'

export interface ProcessedLaunch extends Launch {
  timestamp: number
  isFailed: boolean
}

export interface ActiveLaunch extends ProcessedLaunch {
  scale: number
  opacity: number
}

export function useLaunches(
  currentTime: Ref<number>,
  isComplete: Ref<boolean>,
  rangeStart: Ref<number>,
  rangeEnd: Ref<number>,
  rangeDuration: Ref<number>
) {
  // All launches processed (not filtered by range)
  const allLaunches = computed<ProcessedLaunch[]>(() => {
    return (launchData as Launch[])
      .map(l => ({
        ...l,
        timestamp: new Date(l.launch_date).getTime(),
        isFailed: l.success_flag.startsWith('F')
      }))
      .sort((a, b) => a.timestamp - b.timestamp)
  })

  // Launches filtered by selected year range
  const launches = computed<ProcessedLaunch[]>(() => {
    return allLaunches.value.filter(l =>
      l.timestamp >= rangeStart.value && l.timestamp <= rangeEnd.value
    )
  })

  const activeLaunches = computed<ActiveLaunch[]>(() => {
    if (isComplete.value) {
      return launches.value.map(l => ({ ...l, scale: 1, opacity: 0.8 }))
    }

    const visibleWindow = rangeDuration.value / 30
    const expandDuration = 0.15
    const holdDuration = 0.25

    return launches.value.filter(l => {
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

  const accumulatedLaunches = computed(() => {
    return launches.value.filter(l => l.timestamp <= currentTime.value)
  })

  const orgStats = computed<OrgStats[]>(() => {
    const stats: Record<string, OrgStats> = {}

    accumulatedLaunches.value.forEach(l => {
      const org = shortenOrgName(l.launch_org)
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

    accumulatedLaunches.value.forEach(l => {
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
    activeLaunches,
    accumulatedLaunches,
    orgStats,
    maxOrgTotal,
    vehicleStats,
    maxVehicleTotal
  }
}
