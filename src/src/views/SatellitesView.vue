<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import * as THREE from 'three'

// Composables
import { useAnimation } from '../composables/useAnimation'
import { useYearRange } from '../composables/useYearRange'
import { useSatellites, loadSatelliteData, useSatelliteDataStatus } from '../composables/useSatellites'
import { useOrbits } from '../composables/useOrbits'
import { useGlobe } from '../composables/useGlobe'

// Components
import ControlPanel from '../components/ControlPanel.vue'
import BarChart from '../components/BarChart.vue'
import CompletionModal from '../components/CompletionModal.vue'
import YearRangeButtons from '../components/YearRangeButtons.vue'
import SatelliteLegend from '../components/SatelliteLegend.vue'

// Globe container ref
const globeContainer = ref<HTMLElement | null>(null)
const orbitGroupRef = ref<THREE.Group | null>(null)

// Initialize year range first (other composables depend on it)
const {
  selectedRangeId,
  selectedRange,
  rangeStart,
  rangeEnd,
  rangeDuration,
  animationDurationMs,
  title: yearTitle,
  progressStartLabel,
  progressEndLabel,
  selectRange,
  options: yearRangeOptions
} = useYearRange()

// Slow down satellite animation by 2x compared to rockets
const satelliteAnimationDurationMs = computed(() => animationDurationMs.value * 2)

// Custom title for satellites page
const title = computed(() => `${yearTitle.value} Satellite View`)

// Initialize animation
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
  cleanup: cleanupAnimation
} = useAnimation(rangeStart, rangeDuration, satelliteAnimationDurationMs)

// Initialize globe
const {
  init: initGlobe,
  cleanup: cleanupGlobe,
  isInitialized: isGlobeInitialized,
  latLngToVector3,
  getOrbitGroup
} = useGlobe(globeContainer)

// Initialize satellites
const {
  activeSatellites,
  orbitingSatellites,
  launchingSatellites,
  decommissioningSatellites,
  accumulatedSatellites,
  ownerStats,
  maxOwnerTotal,
  orbitTypeStats,
  maxOrbitTypeTotal
} = useSatellites(currentTime, isComplete, rangeStart, rangeEnd, rangeDuration, satelliteAnimationDurationMs)

// Data loading status
const { isLoading: isDataLoading, loadError } = useSatelliteDataStatus()

// Initialize orbits after globe is ready
let orbitsCleanup: (() => void) | null = null

watch(isGlobeInitialized, (initialized) => {
  if (initialized) {
    orbitGroupRef.value = getOrbitGroup()

    const { cleanup } = useOrbits(
      orbitGroupRef,
      orbitingSatellites,
      launchingSatellites,
      decommissioningSatellites,
      latLngToVector3
    )
    orbitsCleanup = cleanup
  }
})

function handleKeydown(event: KeyboardEvent) {
  if (event.code === 'Space' && event.target === document.body) {
    event.preventDefault()
    togglePlayPause()
  }
}

function handleReset() {
  resetAnimation()
}

function handlePlayPause() {
  togglePlayPause()
}

function handlePlayAgain() {
  startAnimation()
}

function handleYearRangeSelect(rangeId: string) {
  selectRange(rangeId)
}

onMounted(async () => {
  // Load satellite data from local JSON
  await loadSatelliteData()

  // Initialize globe after data is loaded
  initGlobe()

  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  cleanupAnimation()
  cleanupGlobe()
  if (orbitsCleanup) {
    orbitsCleanup()
  }
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div class="satellites-view">
    <!-- Loading State -->
    <div v-if="isDataLoading" class="loading-overlay">
      <div class="loading-content">
        <div class="loading-spinner"></div>
        <p>Loading satellite data...</p>
      </div>
    </div>

    <!-- Error State -->
    <div v-else-if="loadError" class="loading-overlay error">
      <div class="loading-content">
        <p>Failed to load satellite data</p>
        <p class="error-detail">{{ loadError }}</p>
        <button @click="() => loadSatelliteData()">Retry</button>
      </div>
    </div>

    <header class="header">
      <div class="header-left">
        <div class="header-top-row">
          <h1>{{ title }}</h1>
          <div class="date-display mobile-only">{{ currentDateDisplay }}</div>
        </div>
        <YearRangeButtons
          :options="yearRangeOptions"
          :selected-id="selectedRangeId"
          @select="handleYearRangeSelect"
        />
      </div>
      <div class="date-display desktop-only">{{ currentDateDisplay }}</div>
    </header>

    <main class="main-content">
      <div class="globe-section">
        <div
          ref="globeContainer"
          class="globe-container"
        >
          <!-- Three.js canvas will be inserted here -->
        </div>

        <div class="satellite-counter">
          <span class="counter-value">{{ activeSatellites.length }}</span>
          <span class="counter-label">active satellites</span>
        </div>

        <ControlPanel
          :is-playing="isPlaying"
          :is-paused="isPaused"
          :is-complete="isComplete"
          :progress="progress"
          :is-muted="true"
          :volume="0"
          :progress-start-label="progressStartLabel"
          :progress-end-label="progressEndLabel"
          :hide-sound="true"
          @toggle-play-pause="handlePlayPause"
          @reset="handleReset"
          @seek="seekTo"
        />

        <CompletionModal
          v-if="isComplete"
          :launch-count="accumulatedSatellites.length"
          :year-range-label="selectedRange.label"
          :item-label="'satellites launched'"
          @play-again="handlePlayAgain"
        />
      </div>

      <aside class="chart-section">
        <BarChart
          title="Satellites by Owner"
          :stats="ownerStats"
          :max-total="maxOwnerTotal"
        />

        <BarChart
          title="Satellites by Orbit Type"
          :stats="orbitTypeStats"
          :max-total="maxOrbitTypeTotal"
        />

        <SatelliteLegend />

        <div class="orbit-legend">
          <h2>Orbit Types</h2>
          <div class="legend-items">
            <div class="legend-item">
              <span class="legend-abbr">LEO</span>
              <span class="legend-desc">Low Earth Orbit (&lt;2000km)</span>
            </div>
            <div class="legend-item">
              <span class="legend-abbr">MEO</span>
              <span class="legend-desc">Medium Earth Orbit</span>
            </div>
            <div class="legend-item">
              <span class="legend-abbr">GEO</span>
              <span class="legend-desc">Geostationary (~35,786km)</span>
            </div>
            <div class="legend-item">
              <span class="legend-abbr">HEO</span>
              <span class="legend-desc">Highly Elliptical Orbit</span>
            </div>
            <div class="legend-item">
              <span class="legend-abbr">ESCAPE</span>
              <span class="legend-desc">Escape Trajectory</span>
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
.satellites-view {
  display: flex;
  flex-direction: column;
  flex: 1;
  height: 100%;
  width: 100%;
  position: relative;
  min-height: 0;
}

.globe-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 0.5rem;
  position: relative;
  gap: 0.5rem;
  min-height: 0;
  overflow: hidden;
}

.globe-container {
  flex: 1;
  width: 100%;
  max-width: 800px;
  aspect-ratio: 1;
  position: relative;
  border: 1px solid var(--color-border);
  background-color: #030305;
}

@media (max-width: 900px) {
  .globe-container {
    max-width: 100%;
    aspect-ratio: auto;
    height: 60vh;
  }
}

.satellite-counter {
  position: absolute;
  top: 1rem;
  left: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  font-family: var(--font-mono);
  text-shadow: 0 0 10px rgba(0, 0, 0, 0.8);
}

.counter-value {
  font-size: 2rem;
  font-weight: 700;
  color: var(--color-accent-bright);
  text-shadow: 0 0 20px var(--color-accent);
  line-height: 1;
}

.counter-label {
  font-size: 0.625rem;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

/* Orbit legend */
.orbit-legend {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--color-border);
  margin-top: auto;
}

.orbit-legend h2 {
  font-family: var(--font-mono);
  font-size: 0.625rem;
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.12em;
}

.legend-items {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-family: var(--font-mono);
  font-size: 0.5625rem;
}

.legend-abbr {
  width: 50px;
  font-weight: 600;
  color: var(--color-accent-bright);
}

.legend-desc {
  color: var(--color-text-muted);
}
</style>
