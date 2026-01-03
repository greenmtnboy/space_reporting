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
const TILE_SIZE = 256
const DEFAULT_CENTER = { lat: 0, lng: 10 }

// Virtual camera state
const camera = ref({
  zoom: 3,           // Continuous zoom level (can be fractional for smooth zooming)
  centerLat: DEFAULT_CENTER.lat,
  centerLng: DEFAULT_CENTER.lng
})

// Camera constraints
const MIN_ZOOM = 2
const MAX_ZOOM = 20
const ZOOM_SPEED = 0.002  // Zoom sensitivity for wheel
const PAN_SPEED = 20      // Pixels per keypress

// Reactive dimensions for responsiveness
const mapContainer = ref<HTMLElement | null>(null)
const mapWidth = ref(2048)
const mapHeight = ref(1024)

// Track pressed keys for smooth panning
const pressedKeys = ref(new Set<string>())

// Mouse drag state
const isDragging = ref(false)
const dragStart = ref({ x: 0, y: 0 })
const dragStartCenter = ref({ lat: 0, lng: 0 })

// Tile cache - tracks which zoom levels have been loaded
const loadedTileZooms = ref(new Set<number>())
const lastLoadedZoom = ref(3) // Start with initial zoom

// State
const isPlaying = ref(false)
const isPaused = ref(false)
const isComplete = ref(false)
const currentTime = ref(YEAR_START)
const animationStartTime = ref(0)
const pausedElapsed = ref(0)
const animationFrameId = ref<number | null>(null)

// Hover state for launch tooltips
const hoveredLaunch = ref<{ launch: Launch & { timestamp: number; isFailed: boolean }; x: number; y: number } | null>(null)

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
  // When complete, show all launches at full opacity
  if (isComplete.value) {
    return launches.value.map(l => ({ ...l, scale: 1, opacity: 0.8 }))
  }

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
  const zoom = camera.value.zoom
  const numTiles = Math.pow(2, zoom)
  const worldSize = TILE_SIZE * numTiles

  const worldX = ((lng + 180) / 360) * worldSize
  const latRad = lat * Math.PI / 180
  const mercN = Math.log(Math.tan(Math.PI / 4 + latRad / 2))
  const worldY = (worldSize / 2) - (worldSize * mercN / (2 * Math.PI))

  const centerWorldX = ((camera.value.centerLng + 180) / 360) * worldSize
  const centerLatRad = camera.value.centerLat * Math.PI / 180
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

function getTilesForZoom(targetZoom: number, scale: number): { url: string; x: number; y: number; scale: number; zIndex: number }[] {
  const tiles: { url: string; x: number; y: number; scale: number; zIndex: number }[] = []

  const numTiles = Math.pow(2, targetZoom)
  const worldSize = TILE_SIZE * numTiles

  const centerWorldX = ((camera.value.centerLng + 180) / 360) * worldSize
  const centerLatRad = camera.value.centerLat * Math.PI / 180
  const centerMercN = Math.log(Math.tan(Math.PI / 4 + centerLatRad / 2))
  const centerWorldY = (worldSize / 2) - (worldSize * centerMercN / (2 * Math.PI))

  const centerTileX = Math.floor(centerWorldX / TILE_SIZE)
  const centerTileY = Math.floor(centerWorldY / TILE_SIZE)

  const offsetX = centerWorldX - centerTileX * TILE_SIZE
  const offsetY = centerWorldY - centerTileY * TILE_SIZE

  // Need more tiles when scaled up - add extra buffer for low zoom levels
  const scaledTileSize = TILE_SIZE * scale
  const tilesX = Math.ceil(mapWidth.value / scaledTileSize) + 4
  const tilesY = Math.ceil(mapHeight.value / scaledTileSize) + 4

  const halfTilesX = Math.ceil(tilesX / 2)
  const halfTilesY = Math.ceil(tilesY / 2)
  for (let i = -halfTilesX; i <= halfTilesX; i++) {
    for (let j = -halfTilesY; j <= halfTilesY; j++) {
      const tileX = ((centerTileX + i) % numTiles + numTiles) % numTiles
      const tileY = centerTileY + j

      if (tileY >= 0 && tileY < numTiles) {
        const x = mapWidth.value / 2 + (i * TILE_SIZE - offsetX) * scale
        const y = mapHeight.value / 2 + (j * TILE_SIZE - offsetY) * scale

        tiles.push({
          url: `https://a.basemaps.cartocdn.com/light_all/${targetZoom}/${tileX}/${tileY}.png`,
          x,
          y,
          scale,
          zIndex: targetZoom
        })
      }
    }
  }

  return tiles
}

function getTileUrls(): { url: string; x: number; y: number; scale: number; zIndex: number }[] {
  const continuousZoom = camera.value.zoom
  const currentZoom = Math.floor(continuousZoom)
  const zoomFraction = continuousZoom - currentZoom

  // Calculate scale for current zoom level tiles
  const currentScale = Math.pow(2, zoomFraction)

  // Get tiles for current zoom level
  const currentTiles = getTilesForZoom(currentZoom, currentScale)
  console.log('Current Zoom:', currentZoom, 'Scale:', currentScale, 'Tiles:', currentTiles.length)
  // Always include one zoom level lower as fallback for smoother transitions
  // The lower zoom tiles render behind (lower zIndex) and fill gaps while current tiles load
  const fallbackZoom = currentZoom - 1
  if (currentZoom == MAX_ZOOM) {
    // If we're at max zoom, don't include a fallback
    return currentTiles
  }
  if (fallbackZoom >= MIN_ZOOM) {
    const fallbackScale = currentScale * 2 // Lower zoom = tiles are 2x larger
    const fallbackTiles = getTilesForZoom(fallbackZoom, fallbackScale)
    return [...fallbackTiles, ...currentTiles]
  }

  return currentTiles
}

// Handle tile load events (kept for potential future use)
function handleTileLoad(zoom: number) {
  loadedTileZooms.value.add(zoom)
  lastLoadedZoom.value = zoom
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

// Launch hover handlers
function handleLaunchMouseEnter(launch: Launch & { timestamp: number; isFailed: boolean }) {
  const pos = latLngToPixel(launch.site_latitude, launch.site_longitude)
  hoveredLaunch.value = { launch, x: pos.x, y: pos.y }
}

function handleLaunchMouseLeave() {
  hoveredLaunch.value = null
}

// Camera controls
function handleWheel(event: WheelEvent) {
  event.preventDefault()

  // Calculate zoom change based on wheel delta
  const zoomDelta = -event.deltaY * ZOOM_SPEED
  const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, camera.value.zoom + zoomDelta))

  // Zoom towards mouse position for more natural feel
  if (newZoom !== camera.value.zoom) {
    const rect = mapContainer.value?.getBoundingClientRect()
    if (rect) {
      const mouseX = event.clientX - rect.left
      const mouseY = event.clientY - rect.top

      // Calculate offset from screen center to mouse position
      const offsetX = mouseX - mapWidth.value / 2
      const offsetY = mouseY - mapHeight.value / 2

      const oldZoom = camera.value.zoom
      const oldWorldSize = TILE_SIZE * Math.pow(2, oldZoom)
      const newWorldSize = TILE_SIZE * Math.pow(2, newZoom)

      // After zoom, the same world point should be at the same screen position
      // This creates a zoom-towards-cursor effect
      const scale = oldWorldSize / newWorldSize
      const newOffsetX = offsetX * scale
      const newOffsetY = offsetY * scale

      // Adjust center to keep mouse point fixed
      const centerShiftX = (offsetX - newOffsetX) / newWorldSize * 360
      const centerShiftY = (offsetY - newOffsetY) / newWorldSize * 180

      camera.value.zoom = newZoom
      camera.value.centerLng = Math.max(-180, Math.min(180, camera.value.centerLng + centerShiftX))
      camera.value.centerLat = Math.max(-85, Math.min(85, camera.value.centerLat - centerShiftY))
    } else {
      camera.value.zoom = newZoom
    }
  }
}

function pixelToLatLng(deltaX: number, deltaY: number): { lat: number; lng: number } {
  const zoom = camera.value.zoom
  const worldSize = TILE_SIZE * Math.pow(2, zoom)

  // Convert pixel delta to degrees
  const lngDelta = (deltaX / worldSize) * 360
  const latDelta = (deltaY / worldSize) * 180

  return { lat: latDelta, lng: lngDelta }
}

function handleKeyDown(event: KeyboardEvent) {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', '+', '-', '='].includes(event.key)) {
    event.preventDefault()
    pressedKeys.value.add(event.key)
    updateCameraFromKeys()
  }
}

function handleKeyUp(event: KeyboardEvent) {
  pressedKeys.value.delete(event.key)
}

function updateCameraFromKeys() {
  if (pressedKeys.value.size === 0) return

  const delta = pixelToLatLng(PAN_SPEED, PAN_SPEED)

  if (pressedKeys.value.has('ArrowLeft')) {
    camera.value.centerLng = Math.max(-180, camera.value.centerLng - delta.lng)
  }
  if (pressedKeys.value.has('ArrowRight')) {
    camera.value.centerLng = Math.min(180, camera.value.centerLng + delta.lng)
  }
  if (pressedKeys.value.has('ArrowUp')) {
    camera.value.centerLat = Math.min(85, camera.value.centerLat + delta.lat)
  }
  if (pressedKeys.value.has('ArrowDown')) {
    camera.value.centerLat = Math.max(-85, camera.value.centerLat - delta.lat)
  }
  if (pressedKeys.value.has('+') || pressedKeys.value.has('=')) {
    camera.value.zoom = Math.min(MAX_ZOOM, camera.value.zoom + 0.05)
  }
  if (pressedKeys.value.has('-')) {
    camera.value.zoom = Math.max(MIN_ZOOM, camera.value.zoom - 0.05)
  }

  // Continue updating while keys are pressed
  if (pressedKeys.value.size > 0) {
    requestAnimationFrame(updateCameraFromKeys)
  }
}

function resetCamera() {
  camera.value.zoom = 3
  camera.value.centerLat = DEFAULT_CENTER.lat
  camera.value.centerLng = DEFAULT_CENTER.lng
}

// Mouse drag handlers
function handleMouseDown(event: MouseEvent) {
  if (event.button !== 0) return // Only left click
  isDragging.value = true
  dragStart.value = { x: event.clientX, y: event.clientY }
  dragStartCenter.value = { lat: camera.value.centerLat, lng: camera.value.centerLng }
  mapContainer.value?.style.setProperty('cursor', 'grabbing')
}

function handleMouseMove(event: MouseEvent) {
  if (!isDragging.value) return

  const deltaX = event.clientX - dragStart.value.x
  const deltaY = event.clientY - dragStart.value.y

  // Convert pixel movement to lat/lng
  const zoom = camera.value.zoom
  const worldSize = TILE_SIZE * Math.pow(2, zoom)

  const lngDelta = (deltaX / worldSize) * 360
  const latDelta = (deltaY / worldSize) * 180

  camera.value.centerLng = Math.max(-180, Math.min(180, dragStartCenter.value.lng - lngDelta))
  camera.value.centerLat = Math.max(-85, Math.min(85, dragStartCenter.value.lat + latDelta))
}

function handleMouseUp() {
  if (isDragging.value) {
    isDragging.value = false
    mapContainer.value?.style.setProperty('cursor', 'grab')
  }
}

function handleMouseLeave() {
  if (isDragging.value) {
    isDragging.value = false
    mapContainer.value?.style.setProperty('cursor', 'grab')
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
    }
  })

  resizeObserver.observe(mapContainer.value)

  // Add wheel listener with passive: false to allow preventDefault
  mapContainer.value.addEventListener('wheel', handleWheel, { passive: false })

  // Add mouse drag listeners
  mapContainer.value.addEventListener('mousedown', handleMouseDown)
  mapContainer.value.addEventListener('mousemove', handleMouseMove)
  mapContainer.value.addEventListener('mouseup', handleMouseUp)
  mapContainer.value.addEventListener('mouseleave', handleMouseLeave)
  mapContainer.value.style.cursor = 'grab'

  // Add keyboard listeners
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('keyup', handleKeyUp)
})

onUnmounted(() => {
  if (animationFrameId.value) {
    cancelAnimationFrame(animationFrameId.value)
  }
  resizeObserver?.disconnect()

  // Clean up event listeners
  mapContainer.value?.removeEventListener('wheel', handleWheel)
  mapContainer.value?.removeEventListener('mousedown', handleMouseDown)
  mapContainer.value?.removeEventListener('mousemove', handleMouseMove)
  mapContainer.value?.removeEventListener('mouseup', handleMouseUp)
  mapContainer.value?.removeEventListener('mouseleave', handleMouseLeave)
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('keyup', handleKeyUp)
  pressedKeys.value.clear()
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
            <img v-for="tile in tileUrls" :key="`${tile.zIndex}-${tile.url}-${tile.x}-${tile.y}`" :src="tile.url" :style="{
              left: tile.x + 'px',
              top: tile.y + 'px',
              width: (256 * tile.scale) + 'px',
              height: (256 * tile.scale) + 'px',
              zIndex: tile.zIndex
            }" class="map-tile"  @load="handleTileLoad(tile.zIndex)" />
          </div>

          <svg class="launch-layer" :viewBox="`0 0 ${mapWidth} ${mapHeight}`"
            :style="{ width: mapWidth + 'px', height: mapHeight + 'px', zIndex: 100 }">
            <g v-for="launch in activeLaunches" :key="launch.launch_tag" class="launch-marker"
              @mouseenter="handleLaunchMouseEnter(launch)" @mouseleave="handleLaunchMouseLeave">
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

          <!-- Launch tooltip -->
          <div v-if="hoveredLaunch" class="launch-tooltip" :style="{
            left: hoveredLaunch.x + 'px',
            top: hoveredLaunch.y + 'px'
          }">
            <div class="tooltip-site">{{ hoveredLaunch.launch.site_name }}</div>
            <div class="tooltip-details">
              <span class="tooltip-id">{{ hoveredLaunch.launch.flight_id }}</span>
              <span class="tooltip-vehicle">{{ hoveredLaunch.launch.vehicle_name || 'Unknown' }}</span>
            </div>
          </div>
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
          <button @click="resetCamera" class="control-btn">Reset View</button>
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