import { ref, type Ref } from 'vue'
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
  const camera = ref({
    zoom: 3,
    centerLat: DEFAULT_CENTER.lat,
    centerLng: DEFAULT_CENTER.lng
  })

  const pressedKeys = ref(new Set<string>())
  const isDragging = ref(false)
  const dragStart = ref({ x: 0, y: 0 })
  const dragStartCenter = ref({ lat: 0, lng: 0 })

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

  function resetCamera() {
    camera.value.zoom = 3
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

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
  }

  function cleanupEventListeners() {
    mapContainer.value?.removeEventListener('wheel', handleWheel)
    mapContainer.value?.removeEventListener('mousedown', handleMouseDown)
    mapContainer.value?.removeEventListener('mousemove', handleMouseMove)
    mapContainer.value?.removeEventListener('mouseup', handleMouseUp)
    mapContainer.value?.removeEventListener('mouseleave', handleMouseLeave)
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
