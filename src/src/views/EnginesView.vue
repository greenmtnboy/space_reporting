<script setup lang="ts">
import { onMounted, computed } from 'vue'
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
  groupColors,
  visibleLaunches,
  groupStats,
  maxGroupTotal,
  totalEngineFireings
} = useEngines(currentTime, rangeStart, rangeEnd)

onMounted(async () => {
  await loadEngineData()
  startAnimation()
})

// Spiral chart config
const spiralSize = 800
const spiralCenter = spiralSize / 2
const maxRadius = spiralSize / 2 - 60
const minRadius = 40

// Interface for individual dots on the spiral
interface SpiralDot {
  launch: EngineLaunch
  engineIndex: number
  x: number
  y: number
  color: string
  opacity: number
}

// Generate dots for the spiral - one dot per engine in engine_count
const spiralDots = computed<SpiralDot[]>(() => {
  const dots: SpiralDot[] = []
  const timeRange = rangeEnd.value - rangeStart.value
  const turns = 6
  const decayMs = 1000 * 60 * 60 * 24 * 30 // 1 month decay

  for (const launch of visibleLaunches.value) {
    const t = (launch.timestamp - rangeStart.value) / timeRange
    const baseAngle = t * turns * Math.PI * 2 - Math.PI / 2
    const r = minRadius + t * (maxRadius - minRadius)

    // Calculate brightness based on recency
    const age = currentTime.value - launch.timestamp
    let opacity = 0.4
    if (age >= 0 && age < decayMs) {
      opacity = 0.4 + 0.6 * (1 - age / decayMs)
    }

    const engineCount = launch.vehicle_stage_engine_count || 1
    const color = launch.group_hex_color

    // Base position on spiral
    const baseX = spiralCenter + Math.cos(baseAngle) * r
    const baseY = spiralCenter + Math.sin(baseAngle) * r

    // Create dots arranged like rocket engine clusters (concentric circles)
    // Engine arrangements: 1 center, then rings of 6, 12, etc.
    const dotRadius = 3 // radius of each dot
    const spacing = dotRadius * 2.2 // space between dot centers

    // Generate positions in concentric pattern
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
    } else {
      // Center engine + concentric rings
      positions.push({ dx: 0, dy: 0 })
      let remaining = engineCount - 1
      let ring = 1

      while (remaining > 0) {
        const ringRadius = spacing * ring
        const enginesInRing = Math.min(remaining, ring * 6) // 6, 12, 18...

        for (let i = 0; i < enginesInRing; i++) {
          const ringAngle = (i / enginesInRing) * Math.PI * 2 - Math.PI / 2
          positions.push({
            dx: Math.cos(ringAngle) * ringRadius,
            dy: Math.sin(ringAngle) * ringRadius
          })
        }

        remaining -= enginesInRing
        ring++
      }
    }

    // Add dots at calculated positions
    for (let i = 0; i < engineCount && i < positions.length; i++) {
      dots.push({
        launch,
        engineIndex: i,
        x: baseX + positions[i].dx,
        y: baseY + positions[i].dy,
        color,
        opacity
      })
    }
  }

  return dots
})

// Generate spiral guide path
const spiralGuidePath = computed(() => {
  const points: string[] = []
  const turns = 6
  const steps = 360

  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const angle = t * turns * Math.PI * 2 - Math.PI / 2
    const r = minRadius + t * (maxRadius - minRadius)
    const x = spiralCenter + Math.cos(angle) * r
    const y = spiralCenter + Math.sin(angle) * r
    points.push(i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`)
  }

  return points.join(' ')
})
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
      <div class="spiral-section">
        <div class="spiral-container">
          <!-- Main spiral visualization -->
          <svg :viewBox="`0 0 ${spiralSize} ${spiralSize}`" class="spiral-chart">
            <!-- Spiral guide line -->
            <path
              :d="spiralGuidePath"
              fill="none"
              stroke="rgba(255,255,255,0.1)"
              stroke-width="1"
            />

            <!-- Engine dots - one per engine in engine_count -->
            <circle
              v-for="dot in spiralDots"
              :key="`${dot.launch.launch_tag}-${dot.launch.vehicle_stage_engine_name}-${dot.engineIndex}`"
              :cx="dot.x"
              :cy="dot.y"
              :r="3"
              :fill="dot.color"
              :opacity="dot.opacity"
              class="launch-point"
            >
              <title>{{ dot.launch.vehicle_stage_engine_name }} ({{ dot.launch.vehicle_stage_engine_group }}) - {{ dot.launch.launch_date }}</title>
            </circle>

            <!-- Center info -->
            <text :x="spiralCenter" :y="spiralCenter - 10" text-anchor="middle" class="center-count">
              {{ totalEngineFireings }}
            </text>
            <text :x="spiralCenter" :y="spiralCenter + 15" text-anchor="middle" class="center-label">
              engine firings
            </text>
          </svg>
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

.spiral-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  position: relative;
}

.spiral-container {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
}

.spiral-chart {
  width: 100%;
  max-width: 600px;
  height: auto;
  max-height: 100%;
  aspect-ratio: 1;
}

.launch-point {
  transition: opacity 0.1s ease;
}

.center-count {
  font-size: 48px;
  font-weight: 700;
  fill: var(--color-text);
}

.center-label {
  font-size: 14px;
  fill: var(--color-text-muted);
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

/* Mobile responsive */
@media (max-width: 900px) {
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
}
</style>
