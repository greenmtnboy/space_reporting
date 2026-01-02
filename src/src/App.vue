<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import type { Launch, OrgStats, VehicleStats } from './types'
import launchData from '../../data/raw_data.json'

// Constants
const ANIMATION_DURATION_MS = 40000 // 45 seconds for full year
const YEAR_START = new Date('2025-01-01').getTime()
const YEAR_END = new Date('2025-12-31T23:59:59').getTime()
const YEAR_DURATION = YEAR_END - YEAR_START

// Map configuration - fixed size for consistent display
// Zoom 3 = 2048px world width (8 tiles), height = 8 tiles * 256 = 2048px max
const MAP_ZOOM = 3
const TILE_SIZE = 256
const MAP_WIDTH = 2048 // Full world width at zoom 3 (8 tiles)
const MAP_HEIGHT = 256*4 // 4 tiles high to show more latitude
const MAP_CENTER = { lat: 0, lng: 10 } // Shifted south to show Scandinavia

// State
const isPlaying = ref(false)
const isPaused = ref(false)
const isComplete = ref(false)
const currentTime = ref(YEAR_START)
const animationStartTime = ref(0)
const pausedElapsed = ref(0)
const animationFrameId = ref<number | null>(null)

// Process and sort launches by date
const launches = computed(() => {
  return (launchData as Launch[])
    .map(l => ({
      ...l,
      timestamp: new Date(l.launch_date).getTime(),
      isFailed: l.success_flag.startsWith('F')
    }))
    .sort((a, b) => a.timestamp - b.timestamp)
})

// Active launches (visible on map with expand/shrink animation)
const activeLaunches = computed(() => {
  const visibleWindow = YEAR_DURATION / 30 // Each launch visible for animation cycle
  const expandDuration = 0.15 // First 15% is expansion
  const holdDuration = 0.25 // Hold at full size until 25%

  return launches.value.filter(l => {
    return l.timestamp <= currentTime.value &&
           l.timestamp > currentTime.value - visibleWindow
  }).map(l => {
    const age = currentTime.value - l.timestamp
    const progress = age / visibleWindow // 0 to 1

    // Scale animation: expand quickly, then shrink
    let scale: number
    if (progress < expandDuration) {
      // Expanding phase (0 -> 1)
      scale = progress / expandDuration
    } else if (progress < holdDuration) {
      // Hold at full size
      scale = 1
    } else {
      // Shrinking phase (1 -> 0)
      scale = 1 - ((progress - holdDuration) / (1 - holdDuration))
    }

    // Opacity fades after hold
    const opacity = progress < holdDuration ? 1 : Math.max(0, 1 - ((progress - holdDuration) / (1 - holdDuration)) * 0.7)

    return { ...l, scale: Math.max(0, scale), opacity }
  })
})

// Accumulated launches for the bar chart
const accumulatedLaunches = computed(() => {
  return launches.value.filter(l => l.timestamp <= currentTime.value)
})

// Organization statistics
const orgStats = computed(() => {
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

// Vehicle statistics
const vehicleStats = computed(() => {
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

// Current date display
const currentDateDisplay = computed(() => {
  const date = new Date(currentTime.value)
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
})

// Progress percentage
const progress = computed(() => {
  return ((currentTime.value - YEAR_START) / YEAR_DURATION) * 100
})

// Shorten organization names
function shortenOrgName(name: string): string {
  const mappings: Record<string, string> = {
    'Chinese Academy of Launch Vehicle Technology (CASC 1st Acad)': 'CASC',
    'Shanghai Academy of Space Technology (CASC 8th Acad)': 'CASC (8th)',
    'NASA Goddard Space Flight Center': 'NASA',
    'Indian Space Research Organization': 'ISRO',
    'Japan Aerospace Exploration Agency': 'JAXA',
    'United Launch Alliance, Decatur': 'ULA',
    'Khrunichev State Research and Production Center': 'Khrunichev',
    'Aerospace Defence Forces': 'Russian ADF',
    'Russian Strategic Rocket Forces': 'Russian SRF',
    'Mitsubishi Heavy Industries (Launch Services)': 'MHI',
    'Beijing Zhongke Aerospace Exploration Tech. Co. Ltd.': 'CAS Space',
    'US Air Force Global Strike Command': 'USAF',
    'Gilmour Space Technologies': 'Gilmour',
    'Rocket Lab Ltd.': 'Rocket Lab',
    'Rocket Lab USA': 'Rocket Lab',
    'Blue Origin LLC': 'Blue Origin',
    'Firefly Aerospace': 'Firefly',
    'Arianespace, Inc.': 'Arianespace',
    'Galactic Energy Co.': 'Galactic Energy'
  }
  return mappings[name] || name
}

// Convert lat/lng to pixel coordinates using Web Mercator projection
function latLngToPixel(lat: number, lng: number): { x: number; y: number } {
  // Web Mercator projection matching tile coordinates
  const numTiles = Math.pow(2, MAP_ZOOM)
  const worldSize = TILE_SIZE * numTiles

  // Convert lng to x (0 to worldSize)
  const worldX = ((lng + 180) / 360) * worldSize

  // Convert lat to y using Mercator projection
  const latRad = lat * Math.PI / 180
  const mercN = Math.log(Math.tan(Math.PI / 4 + latRad / 2))
  const worldY = (worldSize / 2) - (worldSize * mercN / (2 * Math.PI))

  // Calculate center point in world coordinates
  const centerWorldX = ((MAP_CENTER.lng + 180) / 360) * worldSize
  const centerLatRad = MAP_CENTER.lat * Math.PI / 180
  const centerMercN = Math.log(Math.tan(Math.PI / 4 + centerLatRad / 2))
  const centerWorldY = (worldSize / 2) - (worldSize * centerMercN / (2 * Math.PI))

  // Convert to screen coordinates relative to center
  const x = MAP_WIDTH / 2 + (worldX - centerWorldX)
  const y = MAP_HEIGHT / 2 + (worldY - centerWorldY)

  return { x, y }
}

// Calculate dot size based on payload (halved from original)
function getDotSize(payload: number): number {
  // Scale from 2px (no payload) to 12px (max ~18 tons) - half of original
  const minSize = 2
  const maxSize = 12
  const maxPayload = 18
  return minSize + (Math.min(payload, maxPayload) / maxPayload) * (maxSize - minSize)
}

// Get tile URLs for map background
function getTileUrls(): { url: string; x: number; y: number }[] {
  const tiles: { url: string; x: number; y: number }[] = []
  const numTiles = Math.pow(2, MAP_ZOOM)
  const worldSize = TILE_SIZE * numTiles

  // Calculate center in world coordinates
  const centerWorldX = ((MAP_CENTER.lng + 180) / 360) * worldSize
  const centerLatRad = MAP_CENTER.lat * Math.PI / 180
  const centerMercN = Math.log(Math.tan(Math.PI / 4 + centerLatRad / 2))
  const centerWorldY = (worldSize / 2) - (worldSize * centerMercN / (2 * Math.PI))

  // Calculate center tile
  const centerTileX = Math.floor(centerWorldX / TILE_SIZE)
  const centerTileY = Math.floor(centerWorldY / TILE_SIZE)

  // Offset within center tile
  const offsetX = centerWorldX - centerTileX * TILE_SIZE
  const offsetY = centerWorldY - centerTileY * TILE_SIZE

  // Calculate how many tiles we need (add 1 to ensure full coverage)
  const tilesX = Math.ceil(MAP_WIDTH / TILE_SIZE) + 1
  const tilesY = Math.ceil(MAP_HEIGHT / TILE_SIZE) + 1

  const halfTilesX = Math.ceil(tilesX / 2)
  const halfTilesY = Math.ceil(tilesY / 2)

  for (let i = -halfTilesX; i <= halfTilesX; i++) {
    for (let j = -halfTilesY; j <= halfTilesY; j++) {
      const tileX = ((centerTileX + i) % numTiles + numTiles) % numTiles
      const tileY = centerTileY + j

      if (tileY >= 0 && tileY < numTiles) {
        tiles.push({
          url: `https://a.basemaps.cartocdn.com/light_all/${MAP_ZOOM}/${tileX}/${tileY}.png`,
          x: MAP_WIDTH / 2 + i * TILE_SIZE - offsetX,
          y: MAP_HEIGHT / 2 + j * TILE_SIZE - offsetY
        })
      }
    }
  }

  return tiles
}

const tileUrls = computed(() => getTileUrls())

// Animation loop
function animate(timestamp: number) {
  if (!isPlaying.value || isPaused.value) return

  const elapsed = timestamp - animationStartTime.value + pausedElapsed.value
  const timeProgress = Math.min(elapsed / ANIMATION_DURATION_MS, 1)
  currentTime.value = YEAR_START + timeProgress * YEAR_DURATION

  if (timeProgress >= 1) {
    isPlaying.value = false
    isComplete.value = true
    return
  }

  animationFrameId.value = requestAnimationFrame(animate)
}

function startAnimation() {
  if (isComplete.value) {
    // Reset for new loop
    currentTime.value = YEAR_START
    pausedElapsed.value = 0
    isComplete.value = false
  }

  isPlaying.value = true
  isPaused.value = false
  animationStartTime.value = performance.now()
  animationFrameId.value = requestAnimationFrame(animate)
}

function pauseAnimation() {
  if (isPlaying.value && !isPaused.value) {
    isPaused.value = true
    pausedElapsed.value += performance.now() - animationStartTime.value
    if (animationFrameId.value) {
      cancelAnimationFrame(animationFrameId.value)
    }
  }
}

function resumeAnimation() {
  if (isPlaying.value && isPaused.value) {
    isPaused.value = false
    animationStartTime.value = performance.now()
    animationFrameId.value = requestAnimationFrame(animate)
  }
}

function togglePlayPause() {
  if (!isPlaying.value || isComplete.value) {
    startAnimation()
  } else if (isPaused.value) {
    resumeAnimation()
  } else {
    pauseAnimation()
  }
}

function resetAnimation() {
  isPlaying.value = false
  isPaused.value = false
  isComplete.value = false
  currentTime.value = YEAR_START
  pausedElapsed.value = 0
  if (animationFrameId.value) {
    cancelAnimationFrame(animationFrameId.value)
  }
}

onMounted(() => {
  // No dynamic sizing needed - using fixed dimensions
})

onUnmounted(() => {
  if (animationFrameId.value) {
    cancelAnimationFrame(animationFrameId.value)
  }
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
        <div class="map-container" :style="{ width: MAP_WIDTH + 'px', height: MAP_HEIGHT + 'px' }">
          <!-- Map tiles -->
          <div class="map-tiles">
            <img
              v-for="(tile, index) in tileUrls"
              :key="index"
              :src="tile.url"
              :style="{
                left: tile.x + 'px',
                top: tile.y + 'px'
              }"
              class="map-tile"
            />
          </div>

          <!-- Launch dots -->
          <svg class="launch-layer" :viewBox="`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`">
            <g v-for="launch in activeLaunches" :key="launch.launch_tag">
              <!-- Success: expanding/shrinking circle -->
              <template v-if="!launch.isFailed">
                <circle
                  :cx="latLngToPixel(launch.site_latitude, launch.site_longitude).x"
                  :cy="latLngToPixel(launch.site_latitude, launch.site_longitude).y"
                  :r="getDotSize(launch.orb_pay) * launch.scale"
                  class="launch-dot success"
                  :style="{ opacity: launch.opacity }"
                />
              </template>

              <!-- Failure: explosion -->
              <template v-else>
                <g
                  :transform="`translate(${latLngToPixel(launch.site_latitude, launch.site_longitude).x}, ${latLngToPixel(launch.site_latitude, launch.site_longitude).y}) scale(${launch.scale})`"
                  class="explosion"
                  :style="{ opacity: launch.opacity }"
                >
                  <!-- Explosion center -->
                  <circle r="3" class="explosion-center" />
                  <!-- Explosion rays -->
                  <line x1="0" y1="-4" x2="0" y2="-10" class="explosion-ray" />
                  <line x1="3.5" y1="-2" x2="8.7" y2="-5" class="explosion-ray" />
                  <line x1="3.5" y1="2" x2="8.7" y2="5" class="explosion-ray" />
                  <line x1="0" y1="4" x2="0" y2="10" class="explosion-ray" />
                  <line x1="-3.5" y1="2" x2="-8.7" y2="5" class="explosion-ray" />
                  <line x1="-3.5" y1="-2" x2="-8.7" y2="-5" class="explosion-ray" />
                  <!-- Debris particles -->
                  <circle cx="6" cy="-6" r="1.5" class="explosion-particle" />
                  <circle cx="-6" cy="-4" r="1" class="explosion-particle" />
                  <circle cx="4" cy="6" r="1" class="explosion-particle" />
                  <circle cx="-5" cy="5" r="1.5" class="explosion-particle" />
                </g>
              </template>
            </g>
          </svg>
        </div>

        <!-- Progress bar -->
        <div class="progress-container">
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: progress + '%' }"></div>
          </div>
          <div class="progress-labels">
            <span>Jan 2025</span>
            <span>Dec 2025</span>
          </div>
        </div>

        <!-- Controls -->
        <div class="controls">
          <button @click="togglePlayPause" class="control-btn primary">
            {{ !isPlaying || isComplete ? 'Play' : (isPaused ? 'Resume' : 'Pause') }}
          </button>
          <button @click="resetAnimation" class="control-btn">Reset</button>
        </div>

        <!-- Completion modal -->
        <div v-if="isComplete" class="completion-modal">
          <div class="modal-content">
            <h2>That's a wrap!</h2>
            <p>on {{ accumulatedLaunches.length }} launches in 2025</p>
            <button @click="startAnimation" class="control-btn primary">Watch Again</button>
          </div>
        </div>
      </div>

      <!-- Charts section -->
      <aside class="chart-section">
        <div class="chart-block">
          <h2>Launches by Provider</h2>
          <div class="bar-chart">
            <div
              v-for="org in orgStats"
              :key="org.name"
              class="bar-row"
            >
              <div class="bar-label">{{ org.name }}</div>
              <div class="bar-container">
                <div
                  class="bar-success"
                  :style="{ width: (org.successes / maxOrgTotal) * 100 + '%' }"
                >
                  <span v-if="org.successes > 0" class="bar-value">{{ org.successes }}</span>
                </div>
                <div
                  class="bar-failure"
                  :style="{ width: (org.failures / maxOrgTotal) * 100 + '%' }"
                >
                  <span v-if="org.failures > 0" class="bar-value">{{ org.failures }}</span>
                </div>
              </div>
              <div class="bar-total">{{ org.total }}</div>
            </div>
          </div>
        </div>

        <div class="chart-block">
          <h2>Launches by Vehicle</h2>
          <div class="bar-chart">
            <div
              v-for="vehicle in vehicleStats"
              :key="vehicle.name"
              class="bar-row"
            >
              <div class="bar-label">{{ vehicle.name }}</div>
              <div class="bar-container">
                <div
                  class="bar-success"
                  :style="{ width: (vehicle.successes / maxVehicleTotal) * 100 + '%' }"
                >
                  <span v-if="vehicle.successes > 0" class="bar-value">{{ vehicle.successes }}</span>
                </div>
                <div
                  class="bar-failure"
                  :style="{ width: (vehicle.failures / maxVehicleTotal) * 100 + '%' }"
                >
                  <span v-if="vehicle.failures > 0" class="bar-value">{{ vehicle.failures }}</span>
                </div>
              </div>
              <div class="bar-total">{{ vehicle.total }}</div>
            </div>
          </div>
        </div>

        <div class="chart-legend">
          <div class="legend-item">
            <span class="legend-color success"></span>
            <span>Success</span>
          </div>
          <div class="legend-item">
            <span class="legend-color failure"></span>
            <span>Failure</span>
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
/* Styles are in global style.css */
</style>
