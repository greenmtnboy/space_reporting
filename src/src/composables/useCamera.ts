import { ref, watch, type Ref } from 'vue'
import {
  TILE_SIZE,
  DEFAULT_CENTER,
  MIN_ZOOM,
  MAX_ZOOM,
  ZOOM_SPEED,
  PAN_SPEED
} from '../utils/constants'
import { pixelToLatLngDelta, latLngToPixel as latLngToPixelHelper } from '../utils/helpers'

export function useCamera(
  mapContainer: Ref<HTMLElement | null>,
  mapWidth: Ref<number>,
  mapHeight: Ref<number>
) {
  function getInitialZoom() {
    // Determine if we are on a small screen (mobile)
    const isMobile = window.innerWidth < 768

    if (!isMobile) return 3 // Desktop is "gucci"

    // On mobile, calculate zoom to fit the world map
    if (mapWidth.value > 0) {
      const zoomToFit = Math.log2(mapWidth.value / TILE_SIZE)
      // We subtract a little bit for some padding, and clamp to MIN_ZOOM
      return Math.max(MIN_ZOOM, zoomToFit - 0.5)
    }
    return 2 // Fallback for mobile if width not yet known
  }

  const camera = ref({
    zoom: getInitialZoom(),
    centerLat: DEFAULT_CENTER.lat,
    centerLng: DEFAULT_CENTER.lng
  })

  // Watch for mapWidth changes to adjust initial zoom on mobile
  // (mapWidth starts at 2048 in RocketsView and gets updated by ResizeObserver)
  watch(mapWidth, (newWidth) => {
    if (window.innerWidth < 768 && newWidth < 2000) {
      // Retrigger default zoom on resize for mobile
      camera.value.zoom = getInitialZoom()
    }
  })

  const pressedKeys = ref(new Set<string>())
  const isDragging = ref(false)
  const dragStart = ref({ x: 0, y: 0 })
  const dragStartCenter = ref({ lat: 0, lng: 0 })

  // Touch state for pinch-to-zoom
  const lastTouchDistance = ref(0)
  const lastTouchCenter = ref({ x: 0, y: 0 })
  const isTouching = ref(false)

  function latLngToPixel(lat: number, lng: number) {
    return latLngToPixelHelper(
      lat,
      lng,
      camera.value.zoom,
      camera.value.centerLat,
      camera.value.centerLng,
      mapWidth.value,
      mapHeight.value
    )
  }

  function handleWheel(event: WheelEvent) {
    event.preventDefault()

    const zoomDelta = -event.deltaY * ZOOM_SPEED
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, camera.value.zoom + zoomDelta))

    if (newZoom !== camera.value.zoom) {
      const rect = mapContainer.value?.getBoundingClientRect()
      if (rect) {
        const mouseX = event.clientX - rect.left
        const mouseY = event.clientY - rect.top

        const offsetX = mouseX - mapWidth.value / 2
        const offsetY = mouseY - mapHeight.value / 2

        const oldZoom = camera.value.zoom
        const oldWorldSize = TILE_SIZE * Math.pow(2, oldZoom)
        const newWorldSize = TILE_SIZE * Math.pow(2, newZoom)

        const scale = oldWorldSize / newWorldSize
        const newOffsetX = offsetX * scale
        const newOffsetY = offsetY * scale

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

    const delta = pixelToLatLngDelta(PAN_SPEED, PAN_SPEED, camera.value.zoom)

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

    if (pressedKeys.value.size > 0) {
      requestAnimationFrame(updateCameraFromKeys)
    }
  }

  function handleMouseDown(event: MouseEvent) {
    if (event.button !== 0) return
    isDragging.value = true
    dragStart.value = { x: event.clientX, y: event.clientY }
    dragStartCenter.value = { lat: camera.value.centerLat, lng: camera.value.centerLng }
    mapContainer.value?.style.setProperty('cursor', 'grabbing')
  }

  function handleMouseMove(event: MouseEvent) {
    if (!isDragging.value) return

    const deltaX = event.clientX - dragStart.value.x
    const deltaY = event.clientY - dragStart.value.y

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

  // Touch event handlers for mobile
  function getTouchDistance(touches: TouchList): number {
    if (touches.length < 2) return 0
    const dx = touches[0].clientX - touches[1].clientX
    const dy = touches[0].clientY - touches[1].clientY
    return Math.sqrt(dx * dx + dy * dy)
  }

  function getTouchCenter(touches: TouchList): { x: number; y: number } {
    if (touches.length < 2) {
      return { x: touches[0].clientX, y: touches[0].clientY }
    }
    return {
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2
    }
  }

  function handleTouchStart(event: TouchEvent) {
    event.preventDefault()
    isTouching.value = true

    if (event.touches.length === 1) {
      // Single finger - start drag
      dragStart.value = { x: event.touches[0].clientX, y: event.touches[0].clientY }
      dragStartCenter.value = { lat: camera.value.centerLat, lng: camera.value.centerLng }
    } else if (event.touches.length === 2) {
      // Two fingers - prepare for pinch zoom
      lastTouchDistance.value = getTouchDistance(event.touches)
      lastTouchCenter.value = getTouchCenter(event.touches)
      dragStart.value = lastTouchCenter.value
      dragStartCenter.value = { lat: camera.value.centerLat, lng: camera.value.centerLng }
    }
  }

  function handleTouchMove(event: TouchEvent) {
    event.preventDefault()
    if (!isTouching.value) return

    if (event.touches.length === 1) {
      // Single finger drag
      const deltaX = event.touches[0].clientX - dragStart.value.x
      const deltaY = event.touches[0].clientY - dragStart.value.y

      const zoom = camera.value.zoom
      const worldSize = TILE_SIZE * Math.pow(2, zoom)

      const lngDelta = (deltaX / worldSize) * 360
      const latDelta = (deltaY / worldSize) * 180

      camera.value.centerLng = Math.max(-180, Math.min(180, dragStartCenter.value.lng - lngDelta))
      camera.value.centerLat = Math.max(-85, Math.min(85, dragStartCenter.value.lat + latDelta))
    } else if (event.touches.length === 2) {
      // Pinch zoom
      const currentDistance = getTouchDistance(event.touches)
      const currentCenter = getTouchCenter(event.touches)

      if (lastTouchDistance.value > 0) {
        const scale = currentDistance / lastTouchDistance.value
        const zoomDelta = (scale - 1) * 2 // Adjust sensitivity

        const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, camera.value.zoom + zoomDelta))
        camera.value.zoom = newZoom
      }

      // Also handle pan during pinch
      const deltaX = currentCenter.x - dragStart.value.x
      const deltaY = currentCenter.y - dragStart.value.y

      const zoom = camera.value.zoom
      const worldSize = TILE_SIZE * Math.pow(2, zoom)

      const lngDelta = (deltaX / worldSize) * 360
      const latDelta = (deltaY / worldSize) * 180

      camera.value.centerLng = Math.max(-180, Math.min(180, dragStartCenter.value.lng - lngDelta))
      camera.value.centerLat = Math.max(-85, Math.min(85, dragStartCenter.value.lat + latDelta))

      lastTouchDistance.value = currentDistance
      lastTouchCenter.value = currentCenter
      dragStart.value = currentCenter
      dragStartCenter.value = { lat: camera.value.centerLat, lng: camera.value.centerLng }
    }
  }

  function handleTouchEnd(event: TouchEvent) {
    if (event.touches.length === 0) {
      isTouching.value = false
      lastTouchDistance.value = 0
    } else if (event.touches.length === 1) {
      // Switched from pinch to single finger drag
      dragStart.value = { x: event.touches[0].clientX, y: event.touches[0].clientY }
      dragStartCenter.value = { lat: camera.value.centerLat, lng: camera.value.centerLng }
      lastTouchDistance.value = 0
    }
  }

  function resetCamera() {
    camera.value.zoom = getInitialZoom()
    camera.value.centerLat = DEFAULT_CENTER.lat
    camera.value.centerLng = DEFAULT_CENTER.lng
  }

  function setupEventListeners() {
    if (!mapContainer.value) return

    mapContainer.value.addEventListener('wheel', handleWheel, { passive: false })
    mapContainer.value.addEventListener('mousedown', handleMouseDown)
    mapContainer.value.addEventListener('mousemove', handleMouseMove)
    mapContainer.value.addEventListener('mouseup', handleMouseUp)
    mapContainer.value.addEventListener('mouseleave', handleMouseLeave)
    mapContainer.value.style.cursor = 'grab'

    // Touch events for mobile
    mapContainer.value.addEventListener('touchstart', handleTouchStart, { passive: false })
    mapContainer.value.addEventListener('touchmove', handleTouchMove, { passive: false })
    mapContainer.value.addEventListener('touchend', handleTouchEnd)
    mapContainer.value.addEventListener('touchcancel', handleTouchEnd)

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
  }

  function cleanupEventListeners() {
    mapContainer.value?.removeEventListener('wheel', handleWheel)
    mapContainer.value?.removeEventListener('mousedown', handleMouseDown)
    mapContainer.value?.removeEventListener('mousemove', handleMouseMove)
    mapContainer.value?.removeEventListener('mouseup', handleMouseUp)
    mapContainer.value?.removeEventListener('mouseleave', handleMouseLeave)

    // Touch events cleanup
    mapContainer.value?.removeEventListener('touchstart', handleTouchStart)
    mapContainer.value?.removeEventListener('touchmove', handleTouchMove)
    mapContainer.value?.removeEventListener('touchend', handleTouchEnd)
    mapContainer.value?.removeEventListener('touchcancel', handleTouchEnd)

    window.removeEventListener('keydown', handleKeyDown)
    window.removeEventListener('keyup', handleKeyUp)
    pressedKeys.value.clear()
  }

  return {
    camera,
    latLngToPixel,
    resetCamera,
    setupEventListeners,
    cleanupEventListeners
  }
}
