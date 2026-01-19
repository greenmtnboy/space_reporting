<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import type { ActiveLaunch, LaunchFilters } from '../composables/useLaunches'

// Composables
import { useAnimation } from '../composables/useAnimation'
import { useCamera } from '../composables/useCamera'
import { useLaunches, loadLaunchData, useLaunchDataStatus } from '../composables/useLaunches'
import { useMapTiles } from '../composables/useMapTiles'
import { useSound } from '../composables/useSound'
import { useYearRange } from '../composables/useYearRange'
import { useCrossFilter } from '../composables/useCrossFilter'

// Components
import MapTiles from '../components/MapTiles.vue'
import LaunchMarkers from '../components/LaunchMarkers.vue'
import LaunchTooltip from '../components/LaunchTooltip.vue'
import ControlPanel from '../components/ControlPanel.vue'
import ViewHeader from '../components/ViewHeader.vue'
import BarChart from '../components/BarChart.vue'
import ChartLegend from '../components/ChartLegend.vue'
import CompletionModal from '../components/CompletionModal.vue'
import FilterChips from '../components/FilterChips.vue'

// Reactive dimensions for responsiveness
const mapContainer = ref<HTMLElement | null>(null)
const mapWidth = ref(2048)
const mapHeight = ref(1024)

// Initialize year range first (other composables depend on it)
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

// Initialize composables
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
} = useAnimation(rangeStart, rangeDuration, animationDurationMs)

const {
  camera,
  latLngToPixel,
  resetCamera,
  setupEventListeners,
  cleanupEventListeners
} = useCamera(mapContainer, mapWidth, mapHeight)

// Initialize cross-filter
const {
  organizations: selectedOrganizations,
  vehicles: selectedVehicles,
  activeFilters,
  toggleFilter,
  removeFilter,
  clearAllFilters
} = useCrossFilter()

// Create filters ref for useLaunches
const launchFilters = computed<LaunchFilters>(() => ({
  organizations: selectedOrganizations.value,
  vehicles: selectedVehicles.value
}))

const {
  activeLaunches,
  accumulatedLaunches,
  orgStats,
  maxOrgTotal,
  vehicleStats,
  maxVehicleTotal
} = useLaunches(currentTime, isComplete, rangeStart, rangeEnd, rangeDuration, animationDurationMs, launchFilters)

const { tileUrls, handleTileLoad } = useMapTiles(camera, mapWidth, mapHeight)

const {
  isMuted,
  volume,
  toggleMute,
  setVolume,
  resetSeenLaunches,
  resumeAudioContext
} = useSound(activeLaunches, isPlaying)

// Data loading status
const { isLoading: isDataLoading, loadError } = useLaunchDataStatus()

// Completion modal visibility (separate from isComplete to allow closing without resetting)
const showCompletionModal = ref(false)
watch(isComplete, (complete) => {
  if (complete) showCompletionModal.value = true
})

// Hover state for launch tooltips
const hoveredLaunch = ref<{ launch: ActiveLaunch; x: number; y: number } | null>(null)

function handleLaunchMouseEnter(launch: ActiveLaunch) {
  const pos = latLngToPixel(launch.site_latitude, launch.site_longitude)
  hoveredLaunch.value = { launch, x: pos.x, y: pos.y }
}

function handleLaunchMouseLeave() {
  hoveredLaunch.value = null
}

function handleKeydown(event: KeyboardEvent) {
  if (event.code === 'Space' && event.target === document.body) {
    event.preventDefault()
    togglePlayPause()
  }
}

function handleReset() {
  resetAnimation()
  resetSeenLaunches()
}

function handlePlayPause() {
  resumeAudioContext()
  togglePlayPause()
}

function handlePlayAgain() {
  showCompletionModal.value = false
  resetSeenLaunches()
  startAnimation()
}

function handleCloseModal() {
  showCompletionModal.value = false
}

function handleYearRangeSelect(rangeId: string) {
  showCompletionModal.value = false
  selectRange(rangeId)
  // Animation reset is handled by watch in useAnimation
  resetSeenLaunches()
}

// Cross-filter handlers
function handleOrgClick(name: string) {
  toggleFilter('organization', name)
}

function handleVehicleClick(name: string) {
  toggleFilter('vehicle', name)
}

function handleFilterRemove(type: Parameters<typeof removeFilter>[0], value: string) {
  removeFilter(type, value)
}

let resizeObserver: ResizeObserver | null = null

onMounted(async () => {
  // Load launch data from remote source
  await loadLaunchData()

  if (!mapContainer.value) return

  resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const { width, height } = entry.contentRect
      const targetAspect = 2

      if (width / height > targetAspect) {
        mapHeight.value = height
        mapWidth.value = height * targetAspect
      } else {
        mapWidth.value = width
        mapHeight.value = width / targetAspect
      }
    }
  })

  resizeObserver.observe(mapContainer.value)
  setupEventListeners()
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  cleanupAnimation()
  cleanupEventListeners()
  resizeObserver?.disconnect()
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div class="rockets-view" data-testid="rockets-view">
    <!-- Loading State -->
    <div v-if="isDataLoading" class="loading-overlay">
      <div class="loading-content">
        <div class="loading-spinner"></div>
        <p>Loading launch data...</p>
      </div>
    </div>

    <!-- Error State -->
    <div v-else-if="loadError" class="loading-overlay error">
      <div class="loading-content">
        <p>Failed to load launch data</p>
        <p class="error-detail">{{ loadError }}</p>
        <button @click="() => loadLaunchData()">Retry</button>
      </div>
    </div>

    <ViewHeader
      :title="`${title} Rocket Launches`"
      :current-date-display="currentDateDisplay"
      :year-range-options="yearRangeOptions"
      :selected-range-id="selectedRangeId"
      @select-range="handleYearRangeSelect"
    />

    <!-- Filter Chips -->
    <FilterChips
      :filters="activeFilters"
      @remove="handleFilterRemove"
      @clear-all="clearAllFilters"
    />

    <main class="main-content">
      <div class="map-section">
        <div
          ref="mapContainer"
          class="map-container"
          style="width: 100%; height: 100%; position: relative; overflow: hidden;"
        >
          <MapTiles
            :tiles="tileUrls"
            :map-width="mapWidth"
            :map-height="mapHeight"
            @tile-load="handleTileLoad"
          />

          <LaunchMarkers
            :launches="activeLaunches"
            :map-width="mapWidth"
            :map-height="mapHeight"
            :zoom="camera.zoom"
            :center-lat="camera.centerLat"
            :center-lng="camera.centerLng"
            :lat-lng-to-pixel="latLngToPixel"
            @mouseenter="handleLaunchMouseEnter"
            @mouseleave="handleLaunchMouseLeave"
          />

          <LaunchTooltip
            v-if="hoveredLaunch"
            :launch="hoveredLaunch.launch"
            :x="hoveredLaunch.x"
            :y="hoveredLaunch.y"
          />
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
          @reset="handleReset"
          @reset-camera="resetCamera"
          @seek="seekTo"
          @toggle-mute="toggleMute"
          @set-volume="setVolume"
        />

        <CompletionModal
          v-if="showCompletionModal"
          :launch-count="accumulatedLaunches.length"
          :year-range-label="selectedRange.label"
          @play-again="handlePlayAgain"
          @close="handleCloseModal"
        />
      </div>

      <aside class="chart-section">
        <BarChart
          title="Launches by Provider"
          :stats="orgStats"
          :max-total="maxOrgTotal"
          :clickable="true"
          :selected-items="selectedOrganizations"
          @item-click="handleOrgClick"
        />

        <BarChart
          title="Launches by Vehicle"
          :stats="vehicleStats"
          :max-total="maxVehicleTotal"
          :clickable="true"
          :selected-items="selectedVehicles"
          @item-click="handleVehicleClick"
        />

        <ChartLegend />
      </aside>
    </main>

    <footer class="footer">
      <p>Data source: McDowell, Jonathan C., 2020. General Catalog of Artificial Space Objects</p>
    </footer>
  </div>
</template>

<style scoped>
.rockets-view {
  display: flex;
  flex-direction: column;
  flex: 1;
  height: 100%;
  width: 100%;
  position: relative;
  min-height: 0;
}
</style>
