<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import * as THREE from 'three'

// Composables
import { useAnimation } from '../composables/useAnimation'
import { useYearRange } from '../composables/useYearRange'
import { useSatellites, loadSatelliteData, useSatelliteDataStatus } from '../composables/useSatellites'
import type { SatelliteFilters } from '../composables/useSatellites'
import { useOrbits } from '../composables/useOrbits'
import { useGlobe } from '../composables/useGlobe'
import { useCrossFilter } from '../composables/useCrossFilter'
import { useSatelliteSound } from '../composables/useSatelliteSound'
// TODO: Satellite markers - disabled pending debugging
// import { useSatelliteMarkers } from '../composables/useSatelliteMarkers'

// Components
import ControlPanel from '../components/ControlPanel.vue'
import BarChart from '../components/BarChart.vue'
import CompletionModal from '../components/CompletionModal.vue'
import YearRangeButtons from '../components/YearRangeButtons.vue'
import SatelliteLegend from '../components/SatelliteLegend.vue'
import FilterChips from '../components/FilterChips.vue'
// TODO: Satellite tooltip - disabled pending debugging
// import SatelliteTooltip from '../components/SatelliteTooltip.vue'

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
  getOrbitGroup,
  getCamera
  // TODO: For satellite markers - disabled pending debugging
  // getRenderer
} = useGlobe(globeContainer)

// Initialize cross-filter
const {
  owners: selectedOwners,
  orbitTypes: selectedOrbitTypes,
  activeFilters,
  toggleFilter,
  removeFilter,
  clearAllFilters
} = useCrossFilter()

// Create filters ref for useSatellites
const satelliteFilters = computed<SatelliteFilters>(() => ({
  owners: selectedOwners.value,
  orbitTypes: selectedOrbitTypes.value
}))

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
} = useSatellites(currentTime, isComplete, rangeStart, rangeEnd, rangeDuration, satelliteAnimationDurationMs, satelliteFilters)

// Data loading status
const { isLoading: isDataLoading, loadError } = useSatelliteDataStatus()

// Completion modal visibility (separate from isComplete to allow closing without resetting)
const showCompletionModal = ref(false)
watch(isComplete, (complete) => {
  if (complete) showCompletionModal.value = true
})

// Initialize sound
const {
  isMuted,
  volume,
  toggleMute,
  setVolume,
  resumeAudioContext
} = useSatelliteSound(activeSatellites, getCamera, isPlaying)

// Initialize orbits after globe is ready
let orbitsCleanup: (() => void) | null = null

// TODO: Satellite markers for hover interaction - disabled pending debugging
// let markersCleanup: (() => void) | null = null
// let hoveredSatellite: ReturnType<typeof useSatelliteMarkers>['hoveredSatellite'] | null = null

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

    // TODO: Satellite markers for hover interaction - disabled pending debugging
    // const markers = useSatelliteMarkers(
    //   orbitGroupRef,
    //   orbitingSatellites,
    //   getCamera,
    //   getRenderer
    // )
    // markers.setup()
    // markersCleanup = markers.cleanup
    // hoveredSatellite = markers.hoveredSatellite
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
  resumeAudioContext()
  togglePlayPause()
}

function handlePlayAgain() {
  showCompletionModal.value = false
  startAnimation()
}

function handleCloseModal() {
  showCompletionModal.value = false
}

function handleYearRangeSelect(rangeId: string) {
  showCompletionModal.value = false
  selectRange(rangeId)
}

// Cross-filter handlers
function handleOwnerClick(name: string) {
  toggleFilter('owner', name)
}

function handleOrbitTypeClick(name: string) {
  toggleFilter('orbitType', name)
}

function handleFilterRemove(type: Parameters<typeof removeFilter>[0], value: string) {
  removeFilter(type, value)
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
  // TODO: Satellite markers cleanup - disabled pending debugging
  // if (markersCleanup) {
  //   markersCleanup()
  // }
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

    <!-- Filter Chips -->
    <FilterChips
      :filters="activeFilters"
      @remove="handleFilterRemove"
      @clear-all="clearAllFilters"
    />

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
          :is-muted="isMuted"
          :volume="volume"
          :progress-start-label="progressStartLabel"
          :progress-end-label="progressEndLabel"
          :hide-sound="false"
          @toggle-play-pause="handlePlayPause"
          @reset="handleReset"
          @seek="seekTo"
          @toggle-mute="toggleMute"
          @set-volume="setVolume"
        />

        <CompletionModal
          v-if="showCompletionModal"
          :launch-count="accumulatedSatellites.length"
          :year-range-label="selectedRange.label"
          :item-label="'satellites launched'"
          @play-again="handlePlayAgain"
          @close="handleCloseModal"
        />
      </div>

      <aside class="chart-section">
        <BarChart
          title="Satellites by Owner"
          :stats="ownerStats"
          :max-total="maxOwnerTotal"
          :show-failures="true"
          :clickable="true"
          :selected-items="selectedOwners"
          @item-click="handleOwnerClick"
        />

        <BarChart
          title="Satellites by Orbit Type"
          :stats="orbitTypeStats"
          :max-total="maxOrbitTypeTotal"
          :show-failures="true"
          :clickable="true"
          :selected-items="selectedOrbitTypes"
          @item-click="handleOrbitTypeClick"
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
  overflow: visible;
}

.globe-container {
  flex: 0 1 auto;
  width: 100%;
  max-height: calc(100vh - 200px);
  aspect-ratio: 1;
  position: relative;
  border: 1px solid var(--color-border);
  background-color: #030305;
}

@media (max-width: 900px) {
  .globe-section {
    flex: 1 1 auto;
    min-height: 200px;
    overflow: visible;
  }

  .globe-container {
    max-width: 100%;
    flex: 0 1 auto;
    width: 100%;
    height: auto;
    max-height: calc(50vh - 80px);
    aspect-ratio: 1;
  }
}

@media (max-width: 600px) {
  .globe-container {
    max-height: calc(45vh - 70px);
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

/* Responsive chart section for satellite view */
@media (max-width: 900px) {
  .chart-section {
    flex: 0 1 auto;
    max-height: 35vh;
    overflow-y: auto;
    padding: 0.5rem;
  }

  .orbit-legend {
    flex: 1;
    min-width: 200px;
    margin-top: 0;
  }

  .legend-items {
    flex-direction: row;
    flex-wrap: wrap;
    gap: 0.25rem 0.75rem;
  }
}

@media (max-width: 600px) {
  .chart-section {
    max-height: 30vh;
    flex-wrap: nowrap;
    flex-direction: column;
    gap: 0.5rem;
  }

  .orbit-legend {
    min-width: auto;
    padding-top: 0.375rem;
    gap: 0.375rem;
  }

  .legend-items {
    flex-direction: row;
    flex-wrap: wrap;
    gap: 0.125rem 0.5rem;
  }

  .legend-item {
    font-size: 0.5rem;
  }

  .legend-abbr {
    width: auto;
    min-width: 35px;
  }
}
</style>
