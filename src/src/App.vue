<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import type { Launch, OrgStats, VehicleStats } from './types'
import launchData from '../../data/raw_data.json'

// Constants
const ANIMATION_DURATION_MS = 40000 // 45 seconds for full year
const YEAR_START = new Date('2025-01-01').getTime()
const YEAR_END = new Date('2025-12-31T23:59:59').getTime()
const YEAR_DURATION = YEAR_END - YEAR_START

// Map configuration
const MAP_ZOOM = ref(3)
const TILE_SIZE = ref(256)
const MAP_CENTER = { lat: 0, lng: 10 }

// Reactive dimensions for responsiveness
const mapContainer = ref<HTMLElement | null>(null)
const mapWidth = ref(2048)
const mapHeight = ref(1024)

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
  const visibleWindow = YEAR_DURATION / 30
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
  const numTiles = Math.pow(2, MAP_ZOOM.value)
  const worldSize = TILE_SIZE.value * numTiles

  const worldX = ((lng + 180) / 360) * worldSize
  const latRad = lat * Math.PI / 180
  const mercN = Math.log(Math.tan(Math.PI / 4 + latRad / 2))
  const worldY = (worldSize / 2) - (worldSize * mercN / (2 * Math.PI))

  const centerWorldX = ((MAP_CENTER.lng + 180) / 360) * worldSize
  const centerLatRad = MAP_CENTER.lat * Math.PI / 180
  const centerMercN = Math.log(Math.tan(Math.PI / 4 + centerLatRad / 2))
  const centerWorldY = (worldSize / 2) - (worldSize * centerMercN / (2 * Math.PI))

  const x = mapWidth.value / 2 + (worldX - centerWorldX)
  const y = mapHeight.value / 2 + (worldY - centerWorldY)

  return { x, y }
}

function getDotSize(payload: number): number {
  const minSize = 2
  const maxSize = 12
  const maxPayload = 18
  return minSize + (Math.min(payload, maxPayload) / maxPayload) * (maxSize - minSize)
}

function getTileUrls(): { url: string; x: number; y: number }[] {
  const tiles: { url: string; x: number; y: number }[] = []
  const numTiles = Math.pow(2, MAP_ZOOM.value)
  const worldSize = TILE_SIZE.value * numTiles

  const centerWorldX = ((MAP_CENTER.lng + 180) / 360) * worldSize
  const centerLatRad = MAP_CENTER.lat * Math.PI / 180
  const centerMercN = Math.log(Math.tan(Math.PI / 4 + centerLatRad / 2))
  const centerWorldY = (worldSize / 2) - (worldSize * centerMercN / (2 * Math.PI))

  const centerTileX = Math.floor(centerWorldX / TILE_SIZE.value)
  const centerTileY = Math.floor(centerWorldY / TILE_SIZE.value)

  const offsetX = centerWorldX - centerTileX * TILE_SIZE.value
  const offsetY = centerWorldY - centerTileY * TILE_SIZE.value

  const tilesX = Math.ceil(mapWidth.value / TILE_SIZE.value) + 1
  const tilesY = Math.ceil(mapHeight.value / TILE_SIZE.value) + 1

  const halfTilesX = Math.ceil(tilesX / 2)
  const halfTilesY = Math.ceil(tilesY / 2)

  for (let i = -halfTilesX; i <= halfTilesX; i++) {
    for (let j = -halfTilesY; j <= halfTilesY; j++) {
      const tileX = ((centerTileX + i) % numTiles + numTiles) % numTiles
      const tileY = centerTileY + j

      if (tileY >= 0 && tileY < numTiles) {
        tiles.push({
          url: `https://a.basemaps.cartocdn.com/light_all/${MAP_ZOOM.value}/${tileX}/${tileY}.png`,
          x: mapWidth.value / 2 + i * TILE_SIZE.value - offsetX,
          y: mapHeight.value / 2 + j * TILE_SIZE.value - offsetY
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

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  if (!mapContainer.value) return

  resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const { width, height } = entry.contentRect
      const targetAspect = 2 // width / height

      if (width / height > targetAspect) {
        // Height is the constraint
        mapHeight.value = height
        mapWidth.value = height * targetAspect
      } else {
        // Width is the constraint
        mapWidth.value = width
        mapHeight.value = width / targetAspect
      }
      let minDim = Math.min(mapWidth.value, mapHeight.value * 2)
      if (minDim < 2000) {
        MAP_ZOOM.value = 2
        TILE_SIZE.value = 256
      }
      else if (minDim < 1000) {
        MAP_ZOOM.value = 1
        TILE_SIZE.value = 256
      }
      else {
        MAP_ZOOM.value = 3
        TILE_SIZE.value = 256
      }
    }
  })

  resizeObserver.observe(mapContainer.value)
})
onUnmounted(() => {
  if (animationFrameId.value) {
    cancelAnimationFrame(animationFrameId.value)
  }
  resizeObserver?.disconnect()
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
        <div ref="mapContainer" class="map-container"
          style="width: 100%; height: 100%; position: relative; overflow: hidden;">
          <div class="map-tiles" :style="{ width: mapWidth + 'px', height: mapHeight + 'px' }">
            <img v-for="(tile, index) in tileUrls" :key="index" :src="tile.url" :style="{
              left: tile.x + 'px',
              top: tile.y + 'px'
            }" class="map-tile" />
          </div>

          <svg class="launch-layer" :viewBox="`0 0 ${mapWidth} ${mapHeight}`"
            :style="{ width: mapWidth + 'px', height: mapHeight + 'px' }">
            <g v-for="launch in activeLaunches" :key="launch.launch_tag">
              <template v-if="!launch.isFailed">
                <circle :cx="latLngToPixel(launch.site_latitude, launch.site_longitude).x"
                  :cy="latLngToPixel(launch.site_latitude, launch.site_longitude).y"
                  :r="getDotSize(launch.orb_pay) * launch.scale" class="launch-dot success"
                  :style="{ opacity: launch.opacity }" />
              </template>

              <template v-else>
                <g :transform="`translate(${latLngToPixel(launch.site_latitude, launch.site_longitude).x}, ${latLngToPixel(launch.site_latitude, launch.site_longitude).y}) scale(${launch.scale})`"
                  class="explosion" :style="{ opacity: launch.opacity }">
                  <circle r="3" class="explosion-center" />
                  <line x1="0" y1="-4" x2="0" y2="-10" class="explosion-ray" />
                  <line x1="3.5" y1="-2" x2="8.7" y2="-5" class="explosion-ray" />
                  <line x1="3.5" y1="2" x2="8.7" y2="5" class="explosion-ray" />
                  <line x1="0" y1="4" x2="0" y2="10" class="explosion-ray" />
                  <line x1="-3.5" y1="2" x2="-8.7" y2="5" class="explosion-ray" />
                  <line x1="-3.5" y1="-2" x2="-8.7" y2="-5" class="explosion-ray" />
                  <circle cx="6" cy="-6" r="1.5" class="explosion-particle" />
                  <circle cx="-6" cy="-4" r="1" class="explosion-particle" />
                  <circle cx="4" cy="6" r="1" class="explosion-particle" />
                  <circle cx="-5" cy="5" r="1.5" class="explosion-particle" />
                </g>
              </template>
            </g>
          </svg>
        </div>

        <div class="progress-container">
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: progress + '%' }"></div>
          </div>
          <div class="progress-labels">
            <span>Jan 2025</span>
            <span>Dec 2025</span>
          </div>
        </div>

        <div class="controls">
          <button @click="togglePlayPause" class="control-btn primary">
            {{ !isPlaying || isComplete ? 'Play' : (isPaused ? 'Resume' : 'Pause') }}
          </button>
          <button @click="resetAnimation" class="control-btn">Reset</button>
        </div>

        <div v-if="isComplete" class="completion-modal">
          <div class="modal-content">
            <h2>That's a wrap!</h2>
            <p>on {{ accumulatedLaunches.length }} launches in 2025</p>
            <button @click="startAnimation" class="control-btn primary">Watch Again</button>
          </div>
        </div>
      </div>

      <aside class="chart-section">
        <div class="chart-block">
          <h2>Launches by Provider</h2>
          <div class="bar-chart">
            <div v-for="org in orgStats" :key="org.name" class="bar-row">
              <div class="bar-label">{{ org.name }}</div>
              <div class="bar-container">
                <div class="bar-success" :style="{ width: (org.successes / maxOrgTotal) * 100 + '%' }">
                  <span v-if="org.successes > 0" class="bar-value">{{ org.successes }}</span>
                </div>
                <div class="bar-failure" :style="{ width: (org.failures / maxOrgTotal) * 100 + '%' }">
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
            <div v-for="vehicle in vehicleStats" :key="vehicle.name" class="bar-row">
              <div class="bar-label">{{ vehicle.name }}</div>
              <div class="bar-container">
                <div class="bar-success" :style="{ width: (vehicle.successes / maxVehicleTotal) * 100 + '%' }">
                  <span v-if="vehicle.successes > 0" class="bar-value">{{ vehicle.successes }}</span>
                </div>
                <div class="bar-failure" :style="{ width: (vehicle.failures / maxVehicleTotal) * 100 + '%' }">
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