<script setup lang="ts">
import { onMounted, computed, ref, watch } from 'vue'
import { useEngines, loadEngineData, useEngineDataStatus, type EngineLaunch } from '../composables/useEngines'
import { useAnimation } from '../composables/useAnimation'
import { useYearRange } from '../composables/useYearRange'
import ControlPanel from '../components/ControlPanel.vue'
import YearRangeButtons from '../components/YearRangeButtons.vue'
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
} = useYearRange()

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

const { isLoading, loadError } = useEngineDataStatus()
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

// Spiral chart config - larger spirals
const spiralSize = 550
const spiralCenter = spiralSize / 2
const maxRadius = spiralSize / 2 - 50
const minRadius = 10 // Start very close to center
const boosterRadius = maxRadius + 30 // Boosters render outside

// How long it takes for an engine to spiral from center to edge (in animation ms)
const SPIRAL_OUT_DURATION = 1000 * 60 * 60 * 24 * 60 // 60 days in animation time

// Interface for individual dots on the spiral
interface SpiralDot {
  launch: EngineLaunch
  engineIndex: number
  x: number
  y: number
  color: string
  opacity: number
  isNew: boolean
}

// Special case engine layouts
function getClusterPositions(engineCount: number, dotRadius: number): Array<{ dx: number; dy: number }> {
  const spacing = dotRadius * 2.2
  const positions: Array<{ dx: number; dy: number }> = []

  if (engineCount === 1) {
    positions.push({ dx: 0, dy: 0 })
  } else if (engineCount <= 4) {
    // Square/diamond pattern for 2-4 engines
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
    // Falcon 9 octaweb: 1 center + 8 around
    positions.push({ dx: 0, dy: 0 })
    const ringRadius = spacing * 1.2
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2 - Math.PI / 2
      positions.push({
        dx: Math.cos(angle) * ringRadius,
        dy: Math.sin(angle) * ringRadius
      })
    }
  } else if (engineCount === 33) {
    // Starship Raptor: 3 center + 10 middle + 20 outer
    // Inner 3 in triangle
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2 - Math.PI / 2
      positions.push({
        dx: Math.cos(angle) * spacing * 0.6,
        dy: Math.sin(angle) * spacing * 0.6
      })
    }
    // Middle ring of 10
    const middleRadius = spacing * 1.8
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2 - Math.PI / 2
      positions.push({
        dx: Math.cos(angle) * middleRadius,
        dy: Math.sin(angle) * middleRadius
      })
    }
    // Outer ring of 20
    const outerRadius = spacing * 3.2
    for (let i = 0; i < 20; i++) {
      const angle = (i / 20) * Math.PI * 2 - Math.PI / 2
      positions.push({
        dx: Math.cos(angle) * outerRadius,
        dy: Math.sin(angle) * outerRadius
      })
    }
  } else if (engineCount <= 8) {
    // Single ring for 5-8 engines
    for (let i = 0; i < engineCount; i++) {
      const angle = (i / engineCount) * Math.PI * 2 - Math.PI / 2
      positions.push({
        dx: Math.cos(angle) * spacing,
        dy: Math.sin(angle) * spacing
      })
    }
  } else {
    // Default: center + concentric rings (7 in first ring for octaweb-style)
    positions.push({ dx: 0, dy: 0 })
    let remaining = engineCount - 1
    let ring = 1

    while (remaining > 0) {
      const ringRadius = spacing * ring * 1.1
      // First ring: use 7 or 8 based on remaining, then scale up
      let enginesInRing: number
      if (ring === 1) {
        enginesInRing = Math.min(remaining, remaining <= 8 ? remaining : 8)
      } else {
        enginesInRing = Math.min(remaining, ring * 6 + 2)
      }

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

// Track recently appeared engines for flare effect
const recentLaunches = ref<Set<string>>(new Set())
const seenLaunches = ref<Set<string>>(new Set())
const FLARE_DURATION = 300 // ms

// Generate dots for a spiral - engines spawn at center and spiral outward based on age
function generateSpiralDots(
  launches: EngineLaunch[],
  spiralCenterX: number
): SpiralDot[] {
  const dots: SpiralDot[] = []
  const turns = 4
  const decayMs = 1000 * 60 * 60 * 24 * 30 // 1 month brightness decay

  for (const launch of launches) {
    // Age = time since this engine appeared (in animation time)
    const age = currentTime.value - launch.timestamp
    if (age < 0) continue // Not yet visible

    // Progress through spiral: 0 = just appeared (center), 1 = fully spiraled out
    const spiralProgress = Math.min(1, age / SPIRAL_OUT_DURATION)
    
    // Skip engines that have fully spiraled out (they disappear)
    if (spiralProgress >= 1) continue
    
    // Angle increases as engine spirals outward (multiple turns)
    const baseAngle = spiralProgress * turns * Math.PI * 2 - Math.PI / 2
    
    // Radius: start near center, move outward
    const r = minRadius + spiralProgress * (maxRadius - minRadius)

    // Brightness: recent engines are brighter, fade out near edge
    let opacity = 0.4
    if (age >= 0 && age < decayMs) {
      opacity = 0.4 + 0.6 * (1 - age / decayMs)
    }
    
    // Fade out as approaching end of spiral
    if (spiralProgress > 0.8) {
      const fadeProgress = (spiralProgress - 0.8) / 0.2 // 0 to 1 in last 20%
      opacity = opacity * (1 - fadeProgress)
    }

    const engineCount = launch.vehicle_stage_engine_count || 1
    const color = launch.group_hex_color
    const dotRadius = 2.5

    // Position on spiral
    const baseX = spiralCenterX + Math.cos(baseAngle) * r
    const baseY = spiralCenter + Math.sin(baseAngle) * r

    // Check for flare effect (newly appearing)
    const launchKey = `${launch.launch_tag}-${launch.vehicle_stage_engine_name}-${launch.vehicle_stage_number}`
    let isNew = false
    if (!seenLaunches.value.has(launchKey)) {
      seenLaunches.value.add(launchKey)
      recentLaunches.value.add(launchKey)
      isNew = true
      setTimeout(() => {
        recentLaunches.value.delete(launchKey)
      }, FLARE_DURATION)
    } else if (recentLaunches.value.has(launchKey)) {
      isNew = true
    }

    // Create dots arranged like rocket engine clusters
    const positions = getClusterPositions(engineCount, dotRadius)

    for (let i = 0; i < engineCount && i < positions.length; i++) {
      dots.push({
        launch,
        engineIndex: i,
        x: baseX + positions[i].dx,
        y: baseY + positions[i].dy,
        color,
        opacity,
        isNew
      })
    }
  }

  return dots
}

// Generate booster dots (outside main spiral, also spiral out)
function generateBoosterDots(launches: EngineLaunch[], spiralCenterX: number): SpiralDot[] {
  const dots: SpiralDot[] = []
  
  const boostersByLaunch = new Map<string, EngineLaunch[]>()
  for (const launch of launches) {
    const key = launch.launch_tag
    if (!boostersByLaunch.has(key)) {
      boostersByLaunch.set(key, [])
    }
    boostersByLaunch.get(key)!.push(launch)
  }

  const decayMs = 1000 * 60 * 60 * 24 * 30
  const turns = 4

  for (const [launchTag, boosters] of boostersByLaunch) {
    const firstBooster = boosters[0]
    const age = currentTime.value - firstBooster.timestamp
    if (age < 0) continue

    const spiralProgress = Math.min(1, age / SPIRAL_OUT_DURATION)
    
    // Skip boosters that have fully spiraled out
    if (spiralProgress >= 1) continue
    
    const baseAngle = spiralProgress * turns * Math.PI * 2 - Math.PI / 2
    
    let opacity = 0.4
    if (age >= 0 && age < decayMs) {
      opacity = 0.4 + 0.6 * (1 - age / decayMs)
    }
    
    // Fade out as approaching end of spiral
    if (spiralProgress > 0.8) {
      const fadeProgress = (spiralProgress - 0.8) / 0.2
      opacity = opacity * (1 - fadeProgress)
    }

    // Position boosters at opposing angles around the booster ring
    const totalBoosters = boosters.reduce((sum, b) => sum + (b.vehicle_stage_engine_count || 1), 0)
    const angleSpread = totalBoosters <= 2 ? Math.PI : (Math.PI * 2) / totalBoosters

    // Flare effect
    const launchKey = `booster-${launchTag}`
    let isNew = false
    if (!seenLaunches.value.has(launchKey)) {
      seenLaunches.value.add(launchKey)
      recentLaunches.value.add(launchKey)
      isNew = true
      setTimeout(() => {
        recentLaunches.value.delete(launchKey)
      }, FLARE_DURATION)
    } else if (recentLaunches.value.has(launchKey)) {
      isNew = true
    }

    // Boosters also spiral out but stay on the outer ring
    const boosterR = minRadius + spiralProgress * (boosterRadius - minRadius)

    let boosterIdx = 0
    for (const booster of boosters) {
      const count = booster.vehicle_stage_engine_count || 1

      for (let i = 0; i < count; i++) {
        const angle = baseAngle + (boosterIdx + i) * angleSpread
        
        dots.push({
          launch: booster,
          engineIndex: i,
          x: spiralCenterX + Math.cos(angle) * boosterR,
          y: spiralCenter + Math.sin(angle) * boosterR,
          color: booster.group_hex_color,
          opacity,
          isNew
        })
      }
      boosterIdx += count
    }
  }

  return dots
}

// Reset tracking when animation resets or seeks backward
watch(() => currentTime.value, (newTime, oldTime) => {
  if (newTime < oldTime) {
    seenLaunches.value.clear()
    recentLaunches.value.clear()
  }
})

// Spiral dots for each stage
const coreSpiral = computed(() => generateSpiralDots(firstStageOnlyVisible.value, spiralCenter))
const boosterDots = computed(() => generateBoosterDots(boostersVisible.value, spiralCenter))
const secondSpiral = computed(() => generateSpiralDots(secondStageVisible.value, spiralCenter))
const upperSpiral = computed(() => generateSpiralDots(upperStageVisible.value, spiralCenter))

// Generate spiral guide path (faint background line)
function generateSpiralPath(centerX: number): string {
  const points: string[] = []
  const turns = 4
  const steps = 300

  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const angle = t * turns * Math.PI * 2 - Math.PI / 2
    const r = minRadius + t * (maxRadius - minRadius)
    const x = centerX + Math.cos(angle) * r
    const y = spiralCenter + Math.sin(angle) * r
    points.push(i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`)
  }

  return points.join(' ')
}

const spiralGuidePath = computed(() => generateSpiralPath(spiralCenter))

// Count engines per spiral
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

    <header class="header">
      <div class="header-left">
        <div class="header-top-row">
          <h1>{{ title }} Engine Firings</h1>
          <div class="date-display mobile-only">{{ currentDateDisplay }}</div>
        </div>
        <YearRangeButtons
          :options="yearRangeOptions"
          :selected-id="selectedRangeId"
          @select="selectRange"
        />
      </div>
      <div class="date-display desktop-only">{{ currentDateDisplay }}</div>
    </header>

    <main class="main-content">
      <div class="spirals-section">
        <div class="spirals-container">
          <!-- Core Stage Spiral (Stage 0+1) -->
          <div class="spiral-wrapper">
            <h3 class="spiral-label">Core Stage</h3>
            <svg :viewBox="`0 0 ${spiralSize} ${spiralSize}`" class="spiral-chart">
              <!-- Spiral guide line (faint background) -->
              <path
                :d="spiralGuidePath"
                fill="none"
                stroke="rgba(255,255,255,0.08)"
                stroke-width="2"
                class="spiral-guide"
              />
              
              <!-- Booster outer ring guide -->
              <circle
                :cx="spiralCenter"
                :cy="spiralCenter"
                :r="boosterRadius"
                fill="none"
                stroke="rgba(255,255,255,0.05)"
                stroke-width="1"
                stroke-dasharray="4 4"
              />

              <!-- Booster dots (outside spiral) -->
              <circle
                v-for="dot in boosterDots"
                :key="`booster-${dot.launch.launch_tag}-${dot.engineIndex}`"
                :cx="dot.x"
                :cy="dot.y"
                :r="3"
                :fill="dot.color"
                :opacity="dot.opacity"
                class="engine-dot"
                :class="{ 'is-new': dot.isNew }"
              >
                <title>{{ dot.launch.vehicle_stage_engine_name }} (Booster) - {{ dot.launch.launch_date }}</title>
              </circle>

              <!-- Core engine dots -->
              <circle
                v-for="dot in coreSpiral"
                :key="`core-${dot.launch.launch_tag}-${dot.launch.vehicle_stage_engine_name}-${dot.engineIndex}`"
                :cx="dot.x"
                :cy="dot.y"
                :r="2.5"
                :fill="dot.color"
                :opacity="dot.opacity"
                class="engine-dot"
                :class="{ 'is-new': dot.isNew }"
              >
                <title>{{ dot.launch.vehicle_stage_engine_name }} - {{ dot.launch.launch_date }}</title>
              </circle>
            </svg>
            <div class="spiral-count">{{ coreStageCounts }}</div>
          </div>

          <!-- Second Stage Spiral -->
          <div class="spiral-wrapper">
            <h3 class="spiral-label">Second Stage</h3>
            <svg :viewBox="`0 0 ${spiralSize} ${spiralSize}`" class="spiral-chart">
              <path
                :d="spiralGuidePath"
                fill="none"
                stroke="rgba(255,255,255,0.08)"
                stroke-width="2"
                class="spiral-guide"
              />

              <circle
                v-for="dot in secondSpiral"
                :key="`second-${dot.launch.launch_tag}-${dot.launch.vehicle_stage_engine_name}-${dot.engineIndex}`"
                :cx="dot.x"
                :cy="dot.y"
                :r="2.5"
                :fill="dot.color"
                :opacity="dot.opacity"
                class="engine-dot"
                :class="{ 'is-new': dot.isNew }"
              >
                <title>{{ dot.launch.vehicle_stage_engine_name }} - {{ dot.launch.launch_date }}</title>
              </circle>
            </svg>
            <div class="spiral-count">{{ secondStageCounts }}</div>
          </div>

          <!-- Upper Stages Spiral -->
          <div class="spiral-wrapper">
            <h3 class="spiral-label">Upper Stages</h3>
            <svg :viewBox="`0 0 ${spiralSize} ${spiralSize}`" class="spiral-chart">
              <path
                :d="spiralGuidePath"
                fill="none"
                stroke="rgba(255,255,255,0.08)"
                stroke-width="2"
                class="spiral-guide"
              />

              <circle
                v-for="dot in upperSpiral"
                :key="`upper-${dot.launch.launch_tag}-${dot.launch.vehicle_stage_engine_name}-${dot.engineIndex}`"
                :cx="dot.x"
                :cy="dot.y"
                :r="2.5"
                :fill="dot.color"
                :opacity="dot.opacity"
                class="engine-dot"
                :class="{ 'is-new': dot.isNew }"
              >
                <title>{{ dot.launch.vehicle_stage_engine_name }} - {{ dot.launch.launch_date }}</title>
              </circle>
            </svg>
            <div class="spiral-count">{{ upperStageCounts }}</div>
          </div>
        </div>

        <!-- Total counter below spirals -->
        <div class="total-counter">
          <span class="total-count">{{ totalEngineFireings }}</span>
          <span class="total-label">total engine firings</span>
        </div>

        <ControlPanel
          :is-playing="isPlaying"
          :is-paused="isPaused"
          :is-complete="isComplete"
          :progress="progress"
          :is-muted="false"
          :volume="0"
          :progress-start-label="progressStartLabel"
          :progress-end-label="progressEndLabel"
          :hide-sound="true"
          @toggle-play-pause="togglePlayPause"
          @seek="seekTo"
          @reset="resetAnimation"
        />

        <CompletionModal
          v-if="isComplete"
          :launch-count="totalEngineFireings"
          :year-range-label="selectedRange.label"
          item-label="engine firings"
          @play-again="resetAnimation"
        />
      </div>

      <aside class="chart-section">
        <BarChart
          title="Engine Firings by Propellant"
          :stats="groupStats"
          :max-total="maxGroupTotal"
          :show-failures="false"
        />

        <!-- Legend -->
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

.header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 1rem 1.5rem;
  flex-shrink: 0;
}

.header-left {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.header-top-row {
  display: flex;
  align-items: baseline;
  gap: 1rem;
}

.header h1 {
  font-size: 1.5rem;
  font-weight: 300;
  color: var(--color-text);
  margin: 0;
}

.date-display {
  font-family: var(--font-mono);
  font-size: 1.25rem;
  color: var(--color-accent);
  font-weight: 500;
}

.date-display.mobile-only {
  display: none;
}

.date-display.desktop-only {
  display: block;
}

.main-content {
  display: flex;
  flex: 1;
  min-height: 0;
  gap: 1rem;
  padding: 0 1.5rem;
}

.spirals-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  position: relative;
}

.spirals-container {
  flex: 1;
  display: flex;
  align-items: stretch;
  justify-content: center;
  gap: 0.5rem;
  min-height: 0;
  padding: 0;
}

.spiral-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
  min-width: 0;
  max-width: 450px;
}

.spiral-label {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin: 0;
}

.spiral-chart {
  width: 100%;
  height: 100%;
  max-height: 100%;
  flex: 1;
}

.spiral-guide {
  opacity: 0.5;
}

.spiral-count {
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--color-text);
  font-family: var(--font-mono);
}

.engine-dot {
  transition: opacity 0.1s ease;
}

.engine-dot.is-new {
  animation: flare 0.4s ease-out;
}

@keyframes flare {
  0% {
    filter: brightness(3) drop-shadow(0 0 6px currentColor);
    r: 6;
  }
  50% {
    filter: brightness(2) drop-shadow(0 0 3px currentColor);
  }
  100% {
    filter: brightness(1) drop-shadow(0 0 0 transparent);
  }
}

.total-counter {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  padding: 1rem 0;
}

.total-count {
  font-size: 2.5rem;
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

.loading-content {
  text-align: center;
}

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
  to {
    transform: rotate(360deg);
  }
}

/* Responsive */
@media (max-width: 1100px) {
  .spirals-container {
    flex-wrap: wrap;
  }

  .spiral-chart {
    max-width: 200px;
  }
}

@media (max-width: 900px) {
  .main-content {
    flex-direction: column;
  }

  .spirals-container {
    flex-direction: row;
    flex-wrap: wrap;
    justify-content: center;
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
  .spirals-container {
    flex-direction: column;
  }

  .spiral-chart {
    max-width: 280px;
  }
}

@media (max-width: 600px) {
  .header {
    padding: 0.75rem 1rem;
  }

  .header h1 {
    font-size: 1.25rem;
  }

  .date-display.mobile-only {
    display: block;
    font-size: 1rem;
  }

  .date-display.desktop-only {
    display: none;
  }

  .main-content {
    padding: 0 1rem;
  }

  .footer {
    padding: 0.5rem 1rem;
  }

  .spiral-chart {
    max-width: 250px;
  }

  .total-count {
    font-size: 2rem;
  }
}
</style>
