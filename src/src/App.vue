<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import type { ActiveLaunch } from './composables/useLaunches'

// Composables
import { useAnimation } from './composables/useAnimation'
import { useCamera } from './composables/useCamera'
import { useLaunches } from './composables/useLaunches'
import { useMapTiles } from './composables/useMapTiles'
import { useSound } from './composables/useSound'

// Components
import MapTiles from './components/MapTiles.vue'
import LaunchMarkers from './components/LaunchMarkers.vue'
import LaunchTooltip from './components/LaunchTooltip.vue'
import ControlPanel from './components/ControlPanel.vue'
import BarChart from './components/BarChart.vue'
import ChartLegend from './components/ChartLegend.vue'
import CompletionModal from './components/CompletionModal.vue'

// Reactive dimensions for responsiveness
const mapContainer = ref<HTMLElement | null>(null)
const mapWidth = ref(2048)
const mapHeight = ref(1024)

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
} = useAnimation()

const {
  camera,
  latLngToPixel,
  resetCamera,
  setupEventListeners,
  cleanupEventListeners
} = useCamera(mapContainer, mapWidth, mapHeight)

const {
  activeLaunches,
  accumulatedLaunches,
  orgStats,
  maxOrgTotal,
  vehicleStats,
  maxVehicleTotal
} = useLaunches(currentTime, isComplete)

const { tileUrls, handleTileLoad } = useMapTiles(camera, mapWidth, mapHeight)

const {
  isMuted,
  volume,
  toggleMute,
  setVolume,
  resetSeenLaunches,
  resumeAudioContext
} = useSound(activeLaunches, isPlaying)

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
  resetSeenLaunches()
  startAnimation()
}

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
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
  <div class="app">
    <header class="header">
      <h1>2025 Rocket Launches</h1>
      <div class="date-display">{{ currentDateDisplay }}</div>
    </header>

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
          @toggle-play-pause="handlePlayPause"
          @reset="handleReset"
          @reset-camera="resetCamera"
          @seek="seekTo"
          @toggle-mute="toggleMute"
          @set-volume="setVolume"
        />

        <CompletionModal
          v-if="isComplete"
          :launch-count="accumulatedLaunches.length"
          @play-again="handlePlayAgain"
        />
      </div>

      <aside class="chart-section">
        <BarChart
          title="Launches by Provider"
          :stats="orgStats"
          :max-total="maxOrgTotal"
        />

        <BarChart
          title="Launches by Vehicle"
          :stats="vehicleStats"
          :max-total="maxVehicleTotal"
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
/* Styles are in global style.css */
</style>
