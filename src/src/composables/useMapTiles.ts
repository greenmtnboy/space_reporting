import { ref, computed, type Ref } from 'vue'
import { TILE_SIZE, MIN_ZOOM, MAX_ZOOM } from '../utils/constants'

export interface TileData {
  url: string
  x: number
  y: number
  scale: number
  zIndex: number
}

export function useMapTiles(
  camera: Ref<{ zoom: number; centerLat: number; centerLng: number }>,
  mapWidth: Ref<number>,
  mapHeight: Ref<number>
) {
  const loadedTileZooms = ref(new Set<number>())
  const lastLoadedZoom = ref(3)

  function getTilesForZoom(targetZoom: number, scale: number): TileData[] {
    const tiles: TileData[] = []

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

  function getTileUrls(): TileData[] {
    const continuousZoom = camera.value.zoom
    const currentZoom = Math.floor(continuousZoom)
    const zoomFraction = continuousZoom - currentZoom

    const currentScale = Math.pow(2, zoomFraction)
    const currentTiles = getTilesForZoom(currentZoom, currentScale)

    const fallbackZoom = currentZoom - 1
    if (currentZoom === MAX_ZOOM) {
      return currentTiles
    }

    if (fallbackZoom >= MIN_ZOOM) {
      const fallbackScale = currentScale * 2
      const fallbackTiles = getTilesForZoom(fallbackZoom, fallbackScale)
      return [...fallbackTiles, ...currentTiles]
    }

    return currentTiles
  }

  function handleTileLoad(zoom: number) {
    loadedTileZooms.value.add(zoom)
    lastLoadedZoom.value = zoom
  }

  const tileUrls = computed(() => getTileUrls())

  return {
    tileUrls,
    handleTileLoad,
    loadedTileZooms,
    lastLoadedZoom
  }
}
