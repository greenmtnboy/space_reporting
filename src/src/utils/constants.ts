// Animation constants
export const ANIMATION_DURATION_MS = 40000 // 40 seconds for full year
export const YEAR_START = new Date('2025-01-01').getTime()
export const YEAR_END = new Date('2025-12-31T23:59:59').getTime()
export const YEAR_DURATION = YEAR_END - YEAR_START

// Map configuration
export const TILE_SIZE = 256
export const DEFAULT_CENTER = { lat: 0, lng: 10 }

// CARTO basemap tiles. The key is a public, client-side key: it is embedded in
// the static bundle and every tile request made by the browser.
export const CARTO_API_KEY = 'cb1_2qn1_1_0c18291c77c73bfb4a5a7417'
export const CARTO_BASEMAP_STYLE = 'light_all'

// Camera constraints
export const MIN_ZOOM = .5
export const MAX_ZOOM = 20
export const ZOOM_SPEED = 0.002
export const PAN_SPEED = 20
