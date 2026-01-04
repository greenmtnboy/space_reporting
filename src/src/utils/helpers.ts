import { TILE_SIZE } from './constants'

// Shorten organization names for display
export function shortenOrgName(name: string): string {
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

// Calculate dot size based on payload
export function getDotSize(payload: number): number {
  const minSize = 2
  const maxSize = 12
  const maxPayload = 18
  return minSize + (Math.min(payload, maxPayload) / maxPayload) * (maxSize - minSize)
}

// Convert lat/lng to pixel coordinates using Web Mercator projection
export function latLngToPixel(
  lat: number,
  lng: number,
  zoom: number,
  centerLat: number,
  centerLng: number,
  mapWidth: number,
  mapHeight: number
): { x: number; y: number } {
  const numTiles = Math.pow(2, zoom)
  const worldSize = TILE_SIZE * numTiles

  const worldX = ((lng + 180) / 360) * worldSize
  const latRad = lat * Math.PI / 180
  const mercN = Math.log(Math.tan(Math.PI / 4 + latRad / 2))
  const worldY = (worldSize / 2) - (worldSize * mercN / (2 * Math.PI))

  const centerWorldX = ((centerLng + 180) / 360) * worldSize
  const centerLatRad = centerLat * Math.PI / 180
  const centerMercN = Math.log(Math.tan(Math.PI / 4 + centerLatRad / 2))
  const centerWorldY = (worldSize / 2) - (worldSize * centerMercN / (2 * Math.PI))

  const x = mapWidth / 2 + (worldX - centerWorldX)
  const y = mapHeight / 2 + (worldY - centerWorldY)

  return { x, y }
}

// Convert pixel delta to lat/lng delta
export function pixelToLatLngDelta(
  deltaX: number,
  deltaY: number,
  zoom: number
): { lat: number; lng: number } {
  const worldSize = TILE_SIZE * Math.pow(2, zoom)
  const lngDelta = (deltaX / worldSize) * 360
  const latDelta = (deltaY / worldSize) * 180
  return { lat: latDelta, lng: lngDelta }
}

// Get all wrapped positions for a launch marker (handles horizontal world wrapping)
export function getWrappedPositions(
  lat: number,
  lng: number,
  zoom: number,
  centerLat: number,
  centerLng: number,
  mapWidth: number,
  mapHeight: number
): { x: number; y: number }[] {
  const numTiles = Math.pow(2, zoom)
  const worldSize = TILE_SIZE * numTiles

  // Get the base position
  const basePos = latLngToPixel(lat, lng, zoom, centerLat, centerLng, mapWidth, mapHeight)

  const positions: { x: number; y: number }[] = [basePos]

  // Add wrapped copies to the left and right
  // We need copies when the marker is near the edge of the visible world
  const wrappedLeft = { x: basePos.x - worldSize, y: basePos.y }
  const wrappedRight = { x: basePos.x + worldSize, y: basePos.y }

  // Include wrapped positions if they're within the extended viewport
  // Use a generous buffer (half a world width on each side)
  const buffer = worldSize / 2

  if (wrappedLeft.x > -buffer && wrappedLeft.x < mapWidth + buffer) {
    positions.push(wrappedLeft)
  }
  if (wrappedRight.x > -buffer && wrappedRight.x < mapWidth + buffer) {
    positions.push(wrappedRight)
  }

  return positions
}
