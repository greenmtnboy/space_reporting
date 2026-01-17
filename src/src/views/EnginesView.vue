<script setup lang="ts">
import { onMounted, computed, ref, watch, type Ref } from 'vue'
import { useEngines, loadEngineData, useEngineDataStatus, type EngineLaunch, type EngineMetadata } from '../composables/useEngines'
import { useEngineSound } from '../composables/useEngineSound'
import { useAnimation } from '../composables/useAnimation'
import { useYearRange } from '../composables/useYearRange'
import ViewHeader from '../components/ViewHeader.vue'
import ControlPanel from '../components/ControlPanel.vue'
import CompletionModal from '../components/CompletionModal.vue'
import BarChart from '../components/BarChart.vue'

const {
  selectedRangeId,
  selectedRange,
  rangeStart,
  rangeEnd,
  rangeDuration,
  animationDurationMs,
  title,
  progressStartLabel,
  progressEndLabel,
  selectRange,
  options: yearRangeOptions
} = useYearRange(120000)

const {
  isPlaying,
  isPaused,
  isComplete,
  currentTime,
  progress,
  currentDateDisplay,
  startAnimation,
  togglePlayPause,
  resetAnimation,
  seekTo,
} = useAnimation(rangeStart, rangeDuration, animationDurationMs)

const { isLoading, loadError, engineMetadata } = useEngineDataStatus()
const {
  engineGroups,
  firstStageOnlyVisible,
  boostersVisible,
  secondStageVisible,
  upperStageVisible,
  groupStats,
  maxGroupTotal,
  totalEngineFireings
} = useEngines(currentTime, rangeStart, rangeEnd)

onMounted(async () => {
  await loadEngineData()
  startAnimation()
})

// Completion modal visibility (separate from isComplete to allow closing without resetting)
const showCompletionModal = ref(false)
watch(isComplete, (complete) => {
  if (complete) showCompletionModal.value = true
})

// Flare config - wide aspect ratio to match container
const flareWidth = 1000
const flareHeight = 250
const flareCenter = flareHeight / 2 // vertical center

// How long flares slide across (in animation time ms)
const FLARE_SLIDE_DURATION = 1000 * 60 * 60 * 24 * 14 // 14 days in animation time (slower)

// Interface for active flares with animation-time tracking
interface ActiveFlare {
  launchKey: string
  launchTimestamp: number // animation time when engine appeared
  color: string
  name: string
  count: number
}

// Track seen launches per stage (to detect new ones)
const coreSeenLaunches = ref<Set<string>>(new Set())
const secondSeenLaunches = ref<Set<string>>(new Set())
const upperSeenLaunches = ref<Set<string>>(new Set())

// Generate active flares for a stage based on recent launches
function getActiveFlares(launches: EngineLaunch[], seenSet: Ref<Set<string>>): ActiveFlare[] {
  const flares: ActiveFlare[] = []
  
  for (const launch of launches) {
    const launchKey = `${launch.launch_tag}-${launch.vehicle_stage_engine_name}-${launch.vehicle_stage_number}`
    
    // Track if we've seen this launch
    if (!seenSet.value.has(launchKey)) {
      seenSet.value.add(launchKey)
    }
    
    // Calculate age in animation time
    const age = currentTime.value - launch.timestamp
    
    // Only show flares for recent engines (within slide duration)
    if (age >= 0 && age < FLARE_SLIDE_DURATION) {
      flares.push({
        launchKey,
        launchTimestamp: launch.timestamp,
        color: launch.group_hex_color,
        name: launch.vehicle_stage_engine_name,
        count: launch.vehicle_stage_engine_count || 1
      })
    }
  }
  
  return flares
}

// Combined core visible
const allCoreVisible = computed(() => [...firstStageOnlyVisible.value, ...boostersVisible.value])

// Active flares per stage (computed from animation time)
const coreActiveFlares = computed(() => getActiveFlares(allCoreVisible.value, coreSeenLaunches))
const secondActiveFlares = computed(() => getActiveFlares(secondStageVisible.value, secondSeenLaunches))
const upperActiveFlares = computed(() => getActiveFlares(upperStageVisible.value, upperSeenLaunches))

// Reset tracking when animation resets
watch(() => currentTime.value, (newTime, oldTime) => {
  if (newTime < oldTime) {
    coreSeenLaunches.value.clear()
    secondSeenLaunches.value.clear()
    upperSeenLaunches.value.clear()
    resetSeenFlares() // Also reset sound tracking
  }
})

// Initialize engine sound
const {
  isMuted,
  volume,
  toggleMute,
  setVolume,
  resetSeenFlares,
  resumeAudioContext
} = useEngineSound(coreActiveFlares, secondActiveFlares, upperActiveFlares, engineMetadata, isPlaying)

// Handlers for play/pause that also handle audio context
function handlePlayPause() {
  resumeAudioContext()
  togglePlayPause()
}

function handleReset() {
  resetAnimation()
  resetSeenFlares()
}

function handlePlayAgain() {
  showCompletionModal.value = false
  resetSeenFlares()
  startAnimation()
}

function handleCloseModal() {
  showCompletionModal.value = false
}

function handleSelectRange(rangeId: string) {
  showCompletionModal.value = false
  selectRange(rangeId)
}

// Special case engine layouts - tight clustering for kill markers
function getClusterPositions(engineCount: number, dotRadius: number): Array<{ dx: number; dy: number }> {
  const spacing = dotRadius * 2.0 // tighter spacing
  const positions: Array<{ dx: number; dy: number }> = []

  if (engineCount === 1) {
    positions.push({ dx: 0, dy: 0 })
  } else if (engineCount === 2) {
    // 2 engines: horizontal line
    positions.push({ dx: -spacing/2, dy: 0 })
    positions.push({ dx: spacing/2, dy: 0 })
  } else if (engineCount === 3) {
    // 3 engines: horizontal line
    positions.push({ dx: -spacing, dy: 0 })
    positions.push({ dx: 0, dy: 0 })
    positions.push({ dx: spacing, dy: 0 })
  } else if (engineCount === 4) {
    // 4 engines: square
    const offsets = [
      { dx: -spacing/2, dy: -spacing/2 },
      { dx: spacing/2, dy: -spacing/2 },
      { dx: -spacing/2, dy: spacing/2 },
      { dx: spacing/2, dy: spacing/2 }
    ]
    for (let i = 0; i < engineCount; i++) {
      positions.push(offsets[i])
    }
  } else if (engineCount === 9) {
    // Falcon 9: 1 center + 8 around - tight
    positions.push({ dx: 0, dy: 0 })
    const ringRadius = spacing * 1.0
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2 - Math.PI / 2
      positions.push({
        dx: Math.cos(angle) * ringRadius,
        dy: Math.sin(angle) * ringRadius
      })
    }
  } else if (engineCount === 33) {
    // Starship: 3 inner + 10 middle + 20 outer - compact
    const innerRadius = spacing * 0.45
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2 - Math.PI / 2
      positions.push({
        dx: Math.cos(angle) * innerRadius,
        dy: Math.sin(angle) * innerRadius
      })
    }
    const middleRadius = spacing * 1.2
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2 - Math.PI / 2
      positions.push({
        dx: Math.cos(angle) * middleRadius,
        dy: Math.sin(angle) * middleRadius
      })
    }
    const outerRadius = spacing * 2.0
    for (let i = 0; i < 20; i++) {
      const angle = (i / 20) * Math.PI * 2 - Math.PI / 2
      positions.push({
        dx: Math.cos(angle) * outerRadius,
        dy: Math.sin(angle) * outerRadius
      })
    }
  } else if (engineCount <= 8) {
    for (let i = 0; i < engineCount; i++) {
      const angle = (i / engineCount) * Math.PI * 2 - Math.PI / 2
      positions.push({
        dx: Math.cos(angle) * spacing,
        dy: Math.sin(angle) * spacing
      })
    }
  } else {
    positions.push({ dx: 0, dy: 0 })
    let remaining = engineCount - 1
    let ring = 1
    while (remaining > 0) {
      const ringRadius = spacing * ring * 1.0
      let enginesInRing = ring === 1 ? Math.min(remaining, 8) : Math.min(remaining, ring * 6 + 2)
      for (let i = 0; i < enginesInRing; i++) {
        const angle = (i / enginesInRing) * Math.PI * 2 - Math.PI / 2
        positions.push({
          dx: Math.cos(angle) * ringRadius,
          dy: Math.sin(angle) * ringRadius
        })
      }
      remaining -= enginesInRing
      ring++
    }
  }
  return positions
}

// Generate HERO flare dots - larger spacing for visibility
function getHeroClusterPositions(engineCount: number): Array<{ dx: number; dy: number }> {
  const dotRadius = 12 // larger for hero display
  const spacing = dotRadius * 2.2
  const positions: Array<{ dx: number; dy: number }> = []

  if (engineCount === 1) {
    positions.push({ dx: 0, dy: 0 })
  } else if (engineCount === 2) {
    // 2 engines: horizontal line
    positions.push({ dx: -spacing/2, dy: 0 })
    positions.push({ dx: spacing/2, dy: 0 })
  } else if (engineCount === 3) {
    // 3 engines: horizontal line
    positions.push({ dx: -spacing, dy: 0 })
    positions.push({ dx: 0, dy: 0 })
    positions.push({ dx: spacing, dy: 0 })
  } else if (engineCount === 4) {
    // 4 engines: square
    const offsets = [
      { dx: -spacing/2, dy: -spacing/2 },
      { dx: spacing/2, dy: -spacing/2 },
      { dx: -spacing/2, dy: spacing/2 },
      { dx: spacing/2, dy: spacing/2 }
    ]
    for (let i = 0; i < engineCount; i++) {
      positions.push(offsets[i])
    }
  } else if (engineCount === 9) {
    positions.push({ dx: 0, dy: 0 })
    const ringRadius = spacing * 1.0
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2 - Math.PI / 2
      positions.push({
        dx: Math.cos(angle) * ringRadius,
        dy: Math.sin(angle) * ringRadius
      })
    }
  } else if (engineCount === 33) {
    const innerRadius = spacing * 0.45
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2 - Math.PI / 2
      positions.push({
        dx: Math.cos(angle) * innerRadius,
        dy: Math.sin(angle) * innerRadius
      })
    }
    const middleRadius = spacing * 1.2
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2 - Math.PI / 2
      positions.push({
        dx: Math.cos(angle) * middleRadius,
        dy: Math.sin(angle) * middleRadius
      })
    }
    const outerRadius = spacing * 2.0
    for (let i = 0; i < 20; i++) {
      const angle = (i / 20) * Math.PI * 2 - Math.PI / 2
      positions.push({
        dx: Math.cos(angle) * outerRadius,
        dy: Math.sin(angle) * outerRadius
      })
    }
  } else if (engineCount <= 8) {
    for (let i = 0; i < engineCount; i++) {
      const angle = (i / engineCount) * Math.PI * 2 - Math.PI / 2
      positions.push({
        dx: Math.cos(angle) * spacing,
        dy: Math.sin(angle) * spacing
      })
    }
  } else {
    positions.push({ dx: 0, dy: 0 })
    let remaining = engineCount - 1
    let ring = 1
    while (remaining > 0) {
      const ringRadius = spacing * ring * 1.0
      let enginesInRing = ring === 1 ? Math.min(remaining, 8) : Math.min(remaining, ring * 6 + 2)
      for (let i = 0; i < enginesInRing; i++) {
        const angle = (i / enginesInRing) * Math.PI * 2 - Math.PI / 2
        positions.push({
          dx: Math.cos(angle) * ringRadius,
          dy: Math.sin(angle) * ringRadius
        })
      }
      remaining -= enginesInRing
      ring++
    }
  }
  return positions
}

// Flare dot interface with computed position/opacity
interface FlareDot {
  key: string  // unique key for Vue
  x: number
  y: number
  color: string
  opacity: number
  scale: number
  name: string
}

// Generate flare dots with time-based positioning and vertical offsets for simultaneous firings
function generateFlareDots(flares: ActiveFlare[]): FlareDot[] {
  const dots: FlareDot[] = []
  
  // Group flares by timestamp to handle simultaneous firings
  const flaresByTime = new Map<number, ActiveFlare[]>()
  for (const flare of flares) {
    if (!flaresByTime.has(flare.launchTimestamp)) {
      flaresByTime.set(flare.launchTimestamp, [])
    }
    flaresByTime.get(flare.launchTimestamp)!.push(flare)
  }

  // Sort timestamps so we process them consistently
  const sortedTimestamps = Array.from(flaresByTime.keys()).sort((a, b) => b - a)

  for (const timestamp of sortedTimestamps) {
    const concurrentFlares = flaresByTime.get(timestamp)!
    const age = currentTime.value - timestamp
    const progress = Math.min(1, age / FLARE_SLIDE_DURATION) // 0 = just appeared, 1 = gone
    
    // Position: slide across full SVG viewBox width
    const clusterMargin = 60 // room for engine cluster dots
    const startX = flareWidth - clusterMargin // start at right edge
    const endX = clusterMargin // end at left edge
    const xPos = startX - progress * (startX - endX)
    
    // Opacity: quadratic fade for slower start
    const opacity = Math.max(0, 1 - progress * progress)
    
    // Scale: start big, shrink slightly
    const scale = 1 - progress * 0.3
    
    // Vertical offset for simultaneous firings
    // Spread them out centered around flareCenter
    const verticalGap = 65 // distance between concurrent engine clusters
    const totalHeight = (concurrentFlares.length - 1) * verticalGap
    const startYOffset = -totalHeight / 2

    for (let fIdx = 0; fIdx < concurrentFlares.length; fIdx++) {
      const flare = concurrentFlares[fIdx]
      const yBaseOffset = startYOffset + fIdx * verticalGap
      const positions = getHeroClusterPositions(flare.count)
      
      for (let i = 0; i < positions.length; i++) {
        dots.push({
          key: `${flare.launchKey}-${i}`,
          x: xPos + positions[i].dx * scale,
          y: flareCenter + yBaseOffset + positions[i].dy * scale,
          color: flare.color,
          opacity,
          scale,
          name: flare.name
        })
      }
    }
  }
  
  return dots
}

// Computed flare dots per stage
const coreFlareDots = computed(() => generateFlareDots(coreActiveFlares.value))
const secondFlareDots = computed(() => generateFlareDots(secondActiveFlares.value))
const upperFlareDots = computed(() => generateFlareDots(upperActiveFlares.value))

// Most recent flare name per stage (for label) - combines simultaneous ones with counts
function formatCurrentName(flares: ActiveFlare[]) {
  if (flares.length === 0) return ''
  
  // Get the most recent timestamp among active flares
  const maxTimestamp = Math.max(...flares.map(f => f.launchTimestamp))
  
  // Filter for all flares at that timestamp
  const latestFlares = flares.filter(f => f.launchTimestamp === maxTimestamp)
  
  // Format as "Name - Count" and join with dashes
  return latestFlares
    .map(f => `${f.name} - ${f.count}`)
    .join(' - ')
}

const coreCurrentName = computed(() => formatCurrentName(coreActiveFlares.value))
const secondCurrentName = computed(() => formatCurrentName(secondActiveFlares.value))
const upperCurrentName = computed(() => formatCurrentName(upperActiveFlares.value))

// Kill marker - grouped by engine type for performance
interface EngineTypeMarker {
  engineName: string
  engineCount: number  // engines per launch
  launchCount: number  // number of launches with this engine
  totalEngines: number // engineCount * launchCount
  color: string
  positions: Array<{ dx: number; dy: number }>
}

// Group launches by engine type
function groupByEngineType(launches: EngineLaunch[]): EngineTypeMarker[] {
  const groups = new Map<string, { launches: EngineLaunch[]; color: string; count: number }>()
  
  for (const launch of launches) {
    const key = launch.vehicle_stage_engine_name
    if (!groups.has(key)) {
      groups.set(key, { 
        launches: [], 
        color: launch.group_hex_color,
        count: launch.vehicle_stage_engine_count || 1
      })
    }
    groups.get(key)!.launches.push(launch)
  }
  
  return Array.from(groups.entries()).map(([name, data]) => ({
    engineName: name,
    engineCount: data.count,
    launchCount: data.launches.length,
    totalEngines: data.count * data.launches.length,
    color: data.color,
    positions: getClusterPositions(data.count, 4)
  })).sort((a, b) => b.totalEngines - a.totalEngines)
}

const coreEngineTypes = computed(() => groupByEngineType(allCoreVisible.value))
const secondEngineTypes = computed(() => groupByEngineType(secondStageVisible.value))
const upperEngineTypes = computed(() => groupByEngineType(upperStageVisible.value))

// Count engines per stage
const coreStageCounts = computed(() => 
  firstStageOnlyVisible.value.reduce((sum, l) => sum + l.vehicle_stage_engine_count, 0) +
  boostersVisible.value.reduce((sum, l) => sum + l.vehicle_stage_engine_count, 0)
)
const secondStageCounts = computed(() => 
  secondStageVisible.value.reduce((sum, l) => sum + l.vehicle_stage_engine_count, 0)
)
const upperStageCounts = computed(() => 
  upperStageVisible.value.reduce((sum, l) => sum + l.vehicle_stage_engine_count, 0)
)

// Tooltip state
interface TooltipData {
  engineType: EngineTypeMarker
  meta: EngineMetadata | undefined
}
const hoveredEngine = ref<TooltipData | null>(null)
const tooltipPosition = ref({ x: 0, y: 0 })

function showTooltip(engineType: EngineTypeMarker, event: MouseEvent) {
  const meta = engineMetadata.value.get(engineType.engineName)
  hoveredEngine.value = { engineType, meta }
  tooltipPosition.value = { x: event.clientX + 10, y: event.clientY - 10 }
}

function hideTooltip() {
  hoveredEngine.value = null
}

function updateTooltipPosition(event: MouseEvent) {
  if (hoveredEngine.value) {
    tooltipPosition.value = { x: event.clientX + 10, y: event.clientY - 10 }
  }
}
</script>

<template>
  <div class="engines-view">
    <!-- Loading State -->
    <div v-if="isLoading" class="loading-overlay">
      <div class="loading-content">
        <div class="loading-spinner"></div>
        <p>Loading engine data...</p>
      </div>
    </div>

    <!-- Error State -->
    <div v-else-if="loadError" class="loading-overlay error">
      <div class="loading-content">
        <p>Failed to load engine data</p>
        <p class="error-detail">{{ loadError }}</p>
        <button @click="() => loadEngineData()">Retry</button>
      </div>
    </div>

    <ViewHeader
      :title="`${title} Engine Firings`"
      :current-date-display="currentDateDisplay"
      :year-range-options="yearRangeOptions"
      :selected-range-id="selectedRangeId"
      @select-range="handleSelectRange"
    />

    <main class="main-content">
      <div class="display-section">
        <!-- Stage Sections with Flare + Kill Markers -->
        <div class="stages-container">
          <!-- Core Stage -->
          <div class="stage-section">
            <div class="stage-header">
              <h3>Core Stage</h3>
              <span class="stage-count">{{ coreStageCounts }}</span>
            </div>
            
            <!-- Flare Display -->
            <div class="flare-area">
              <svg :viewBox="`0 0 ${flareWidth} ${flareHeight}`" class="flare-display">
                <circle
                  v-for="dot in coreFlareDots"
                  :key="dot.key"
                  :cx="dot.x"
                  :cy="dot.y"
                  :r="10 * dot.scale"
                  :fill="dot.color"
                  :opacity="dot.opacity"
                  class="flare-dot"
                />
                <text
                  v-if="coreCurrentName"
                  :x="flareWidth / 2"
                  :y="flareHeight - 15"
                  text-anchor="middle"
                  class="flare-engine-name"
                >
                  {{ coreCurrentName }}
                </text>
              </svg>
            </div>
            
            <!-- Kill Markers Grid (engine types with counts) -->
            <div class="kill-grid">
              <div
                v-for="engineType in coreEngineTypes"
                :key="`core-type-${engineType.engineName}`"
                class="engine-type-card"
                @mouseenter="showTooltip(engineType, $event)"
                @mousemove="updateTooltipPosition($event)"
                @mouseleave="hideTooltip"
              >
                <svg viewBox="-25 -25 50 50" class="cluster-svg">
                  <circle
                    v-for="(pos, pIdx) in engineType.positions"
                    :key="`core-${engineType.engineName}-${pIdx}`"
                    :cx="pos.dx"
                    :cy="pos.dy"
                    r="3"
                    :fill="engineType.color"
                  />
                </svg>
                <div class="engine-type-info">
                  <span class="engine-type-name">{{ engineType.engineName }}</span>
                  <span class="engine-type-count">×{{ engineType.launchCount }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Second Stage -->
          <div class="stage-section">
            <div class="stage-header">
              <h3>Second Stage</h3>
              <span class="stage-count">{{ secondStageCounts }}</span>
            </div>
            
            <div class="flare-area">
              <svg :viewBox="`0 0 ${flareWidth} ${flareHeight}`" class="flare-display">
                <circle
                  v-for="dot in secondFlareDots"
                  :key="dot.key"
                  :cx="dot.x"
                  :cy="dot.y"
                  :r="10 * dot.scale"
                  :fill="dot.color"
                  :opacity="dot.opacity"
                  class="flare-dot"
                />
                <text
                  v-if="secondCurrentName"
                  :x="flareWidth / 2"
                  :y="flareHeight - 15"
                  text-anchor="middle"
                  class="flare-engine-name"
                >
                  {{ secondCurrentName }}
                </text>
              </svg>
            </div>
            
            <div class="kill-grid">
              <div
                v-for="engineType in secondEngineTypes"
                :key="`second-type-${engineType.engineName}`"
                class="engine-type-card"
                @mouseenter="showTooltip(engineType, $event)"
                @mousemove="updateTooltipPosition($event)"
                @mouseleave="hideTooltip"
              >
                <svg viewBox="-25 -25 50 50" class="cluster-svg">
                  <circle
                    v-for="(pos, pIdx) in engineType.positions"
                    :key="`second-${engineType.engineName}-${pIdx}`"
                    :cx="pos.dx"
                    :cy="pos.dy"
                    r="3"
                    :fill="engineType.color"
                  />
                </svg>
                <div class="engine-type-info">
                  <span class="engine-type-name">{{ engineType.engineName }}</span>
                  <span class="engine-type-count">×{{ engineType.launchCount }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Upper Stages -->
          <div class="stage-section">
            <div class="stage-header">
              <h3>Upper Stages</h3>
              <span class="stage-count">{{ upperStageCounts }}</span>
            </div>
            
            <div class="flare-area">
              <svg :viewBox="`0 0 ${flareWidth} ${flareHeight}`" class="flare-display">
                <circle
                  v-for="dot in upperFlareDots"
                  :key="dot.key"
                  :cx="dot.x"
                  :cy="dot.y"
                  :r="10 * dot.scale"
                  :fill="dot.color"
                  :opacity="dot.opacity"
                  class="flare-dot"
                />
                <text
                  v-if="upperCurrentName"
                  :x="flareWidth / 2"
                  :y="flareHeight - 15"
                  text-anchor="middle"
                  class="flare-engine-name"
                >
                  {{ upperCurrentName }}
                </text>
              </svg>
            </div>
            
            <div class="kill-grid">
              <div
                v-for="engineType in upperEngineTypes"
                :key="`upper-type-${engineType.engineName}`"
                class="engine-type-card"
                @mouseenter="showTooltip(engineType, $event)"
                @mousemove="updateTooltipPosition($event)"
                @mouseleave="hideTooltip"
              >
                <svg viewBox="-25 -25 50 50" class="cluster-svg">
                  <circle
                    v-for="(pos, pIdx) in engineType.positions"
                    :key="`upper-${engineType.engineName}-${pIdx}`"
                    :cx="pos.dx"
                    :cy="pos.dy"
                    r="3"
                    :fill="engineType.color"
                  />
                </svg>
                <div class="engine-type-info">
                  <span class="engine-type-name">{{ engineType.engineName }}</span>
                  <span class="engine-type-count">×{{ engineType.launchCount }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Total Counter -->
        <div class="total-counter">
          <span class="total-count">{{ totalEngineFireings }}</span>
          <span class="total-label">total engine firings</span>
        </div>

        <ControlPanel
          :is-playing="isPlaying"
          :is-paused="isPaused"
          :is-complete="isComplete"
          :progress="progress"
          :is-muted="isMuted"
          :volume="volume"
          :progress-start-label="progressStartLabel"
          :progress-end-label="progressEndLabel"
          @toggle-play-pause="handlePlayPause"
          @seek="seekTo"
          @reset="handleReset"
          @toggle-mute="toggleMute"
          @set-volume="setVolume"
        />

        <CompletionModal
          v-if="showCompletionModal"
          :launch-count="totalEngineFireings"
          :year-range-label="selectedRange.label"
          item-label="engine firings"
          @play-again="handlePlayAgain"
          @close="handleCloseModal"
        />
      </div>

      <aside class="chart-section">
        <BarChart
          title="Engine Firings by Propellant"
          :stats="groupStats"
          :max-total="maxGroupTotal"
          :show-failures="false"
        />

        <div class="legend-card">
          <h3 class="legend-title">Propellant Groups</h3>
          <div class="legend">
            <div
              v-for="group in engineGroups"
              :key="group.group"
              class="legend-item"
            >
              <span class="legend-dot" :style="{ background: group.color }"></span>
              <span class="legend-label">{{ group.group }}</span>
            </div>
          </div>
        </div>
      </aside>
    </main>

    <footer class="footer">
      <p>Data source: McDowell, Jonathan C., 2020. General Catalog of Artificial Space Objects</p>
    </footer>
    
    <!-- Engine Tooltip -->
    <Teleport to="body">
      <div
        v-if="hoveredEngine"
        class="engine-tooltip"
        :style="{ left: tooltipPosition.x + 'px', top: tooltipPosition.y + 'px' }"
      >
        <div class="tooltip-header">
          <span class="tooltip-engine-name">{{ hoveredEngine.engineType.engineName }}</span>
        </div>
        <div class="tooltip-row">
          <span class="tooltip-label">Maker:</span>
          <span class="tooltip-value">{{ hoveredEngine.meta?.engine_manufacturer || 'Unknown' }}</span>
        </div>
        <div class="tooltip-row">
          <span class="tooltip-label">Fuel:</span>
          <span class="tooltip-value">{{ hoveredEngine.meta?.engine_group || 'Unknown' }}</span>
        </div>
        <div v-if="hoveredEngine.meta?.engine_thrust" class="tooltip-row">
          <span class="tooltip-label">Thrust:</span>
          <span class="tooltip-value">{{ hoveredEngine.meta.engine_thrust }} kN</span>
        </div>
        <div class="tooltip-row">
          <span class="tooltip-label">Launches:</span>
          <span class="tooltip-value">{{ hoveredEngine.engineType.launchCount }}</span>
        </div>
        <div class="tooltip-row">
          <span class="tooltip-label">Total Engines:</span>
          <span class="tooltip-value">{{ hoveredEngine.engineType.totalEngines }}</span>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.engines-view {
  display: flex;
  flex-direction: column;
  flex: 1;
  height: 100%;
  width: 100%;
  position: relative;
  min-height: 0;
}


.main-content {
  display: flex;
  flex: 1;
  min-height: 0;
  gap: 1rem;
  padding: 0 1.5rem;
}

.display-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  position: relative;
}

/* Stages Container */
.stages-container {
  flex: 1;
  display: flex;
  gap: 1rem;
  min-height: 0;
}

.stage-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-secondary);
  border-radius: 12px;
  padding: 1rem;
  min-height: 0;
  overflow: hidden;
}

.stage-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
  flex-shrink: 0;
}

.stage-header h3 {
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin: 0;
}

.stage-count {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--color-text);
  font-family: var(--font-mono);
}

/* Flare Display - Hero size, time-based animation */
.flare-area {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  height: 250px;
  margin-bottom: 0.5rem;
  overflow: hidden;
  padding-right: 10px;
}

.flare-display {
  width: 100%;
  height: 250px;
}

.flare-dot {
  filter: drop-shadow(0 0 8px currentColor) brightness(1.5);
  transition: cx 0.1s linear, opacity 0.1s linear;
}

.flare-engine-name {
  font-size: 1.1rem;
  font-weight: 600;
  fill: var(--color-text);
  text-shadow: 0 0 10px rgba(0, 0, 0, 0.8);
}

/* Kill Grid - engine clusters */
.kill-grid {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  overflow-y: auto;
  align-content: flex-start;
  padding: 4px;
}

.engine-type-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 6px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 6px;
  min-width: 60px;
  animation: cardAppear 0.3s ease-out;
}

.cluster-svg {
  width: 36px;
  height: 36px;
}

.engine-type-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
}

.engine-type-name {
  font-size: 8px;
  color: var(--color-text-muted);
  text-align: center;
  max-width: 70px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.engine-type-count {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text);
  font-family: var(--font-mono);
}

@keyframes cardAppear {
  0% {
    transform: scale(0.8);
    opacity: 0;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}

/* Total Counter */
.total-counter {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 0.75rem 0;
  flex-shrink: 0;
}

.total-count {
  font-size: 2rem;
  font-weight: 700;
  color: var(--color-text);
  font-family: var(--font-mono);
}

.total-label {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.chart-section {
  width: 280px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  overflow-y: auto;
  padding-bottom: 1rem;
}

.legend-card {
  background: var(--color-bg-secondary);
  border-radius: 8px;
  padding: 1rem;
}

.legend-title {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text);
  margin: 0 0 0.75rem 0;
}

.legend {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.legend-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
}

.legend-label {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.footer {
  padding: 0.75rem 1.5rem;
  text-align: center;
  flex-shrink: 0;
}

.footer p {
  font-size: 0.7rem;
  color: var(--color-text-muted);
  margin: 0;
}

/* Loading & Error */
.loading-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg);
  z-index: 100;
}

.loading-overlay.error {
  background: rgba(0, 0, 0, 0.9);
}

.loading-content { text-align: center; }

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid rgba(255, 255, 255, 0.1);
  border-radius: 50%;
  border-top-color: var(--color-accent);
  animation: spin 1s ease-in-out infinite;
  margin: 0 auto 1rem;
}

.error-detail {
  font-size: 0.875rem;
  color: var(--color-text-muted);
  margin-top: 0.5rem;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Responsive */
@media (max-width: 1000px) {
  .main-content {
    flex-direction: column;
  }
  .chart-section {
    width: 100%;
    flex-direction: row;
    flex-wrap: wrap;
    overflow-y: visible;
  }
  .legend-card {
    flex: 1;
    min-width: 200px;
  }
}

@media (max-width: 700px) {
  .stages-container {
    flex-direction: column;
  }
  .stage-section {
    max-height: 200px;
  }
  .flare-area {
    height: 80px;
  }
  .kill-grid {
    display: none;
  }


}

@media (max-width: 600px) {
  .date-display.mobile-only { display: block; font-size: 1rem; }
  .date-display.desktop-only { display: none; }
  .main-content { padding: 0 1rem; }
  .footer { padding: 0.5rem 1rem; }
}
</style>

<style>
/* Global tooltip styles (teleported to body) */
.engine-tooltip {
  position: fixed;
  z-index: 9999;
  background: linear-gradient(135deg, rgba(30, 30, 40, 0.98), rgba(20, 20, 30, 0.98));
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 10px;
  padding: 12px 16px;
  min-width: 180px;
  max-width: 280px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), 0 0 20px rgba(100, 150, 255, 0.1);
  backdrop-filter: blur(10px);
  pointer-events: none;
  font-family: inherit;
}

.tooltip-header {
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.tooltip-engine-name {
  font-size: 1rem;
  font-weight: 700;
  color: #fff;
  letter-spacing: 0.02em;
}

.tooltip-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin: 4px 0;
}

.tooltip-label {
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.6);
}

.tooltip-value {
  font-size: 0.85rem;
  color: #fff;
  font-weight: 500;
  text-align: right;
}
</style>
