# Rockets View Spec

## Cross-Filter Bar Charts (2026-01-06)

### Overview

Bar charts now support interactive cross-filtering, allowing users to click on bars to filter the visualization. Filters are persisted in the URL for sharing.

### Implementation

**Files added/modified**:
- `useCrossFilter.ts`: New composable managing filter state and URL persistence
- `FilterChips.vue`: New component displaying active filters with clear buttons
- `BarChart.vue`: Updated to support `clickable` prop and `selectedItems` highlighting
- `useLaunches.ts`: Updated to accept optional filter ref and apply filtering to launch data
- `RocketsView.vue`: Integrated cross-filter composable and FilterChips component

### Features

| Feature | Description |
|---------|-------------|
| **Click to filter** | Clicking a bar toggles filter for that item (provider or vehicle) |
| **Visual feedback** | Selected bars highlighted with cyan glow; non-selected bars dimmed |
| **Filter chips** | Active filters shown in chips bar below header with remove buttons |
| **Clear all** | Button to clear all active filters at once |
| **URL persistence** | Filters encoded in URL query params (`?org=SpaceX&vehicle=Falcon9`) |
| **Shareable links** | URL with filters can be shared to show same filtered view |
| **Cross-chart filtering** | Selecting "SpaceX" filters launches on map and in vehicle chart |

### URL Parameter Schema

| Parameter | Description | Example |
|-----------|-------------|---------|
| `org` | Launch organization filter(s) | `?org=SpaceX&org=NASA` |
| `vehicle` | Vehicle name filter(s) | `?vehicle=Falcon+9&vehicle=Atlas+V` |

### Design Choices

1. **Stats show all data**: Bar charts display stats for ALL launches (not filtered) so users can see available filter options
2. **AND logic for multiple filters**: When both org and vehicle filters are active, launches must match both
3. **Toggle behavior**: Clicking same bar again removes the filter (toggle on/off)
4. **Dimming non-selected**: When filters active, non-matching bars shown at 40% opacity for context
5. **Map filtering**: Launch markers on the map are filtered to only show matching launches
6. **Sound integration**: Audio cues only play for filtered launches when filters are active

## Basemap Tiles (2026-09-01)

### Overview

The map background is built from CARTO raster basemap tiles fetched directly by
the browser in `composables/useMapTiles.ts`. Tile requests now carry a CARTO API
key so they are attributed to our account rather than hitting the anonymous
tier.

### Implementation

| Piece | Location |
|-------|----------|
| `CARTO_API_KEY`, `CARTO_BASEMAP_STYLE` | `utils/constants.ts` |
| `tileUrl(zoom, tileX, tileY)` | `composables/useMapTiles.ts` |

Tile URL shape:
`https://a.basemaps.cartocdn.com/{style}/{z}/{x}/{y}.png?api_key={key}`

### Design Choices

1. **Single URL builder**: The URL is assembled in one `tileUrl()` helper so the
   key and style cannot drift between the current-zoom and fallback-zoom tile
   passes.
2. **Key lives in constants, not inline**: `utils/constants.ts` already owns map
   configuration (`TILE_SIZE`, `DEFAULT_CENTER`), so the key and style sit
   alongside it instead of being buried in a template literal.
3. **Key is public by design**: This is a static site — the key ships in the
   bundle and is visible in every tile request, so it is checked in rather than
   plumbed through an env var that would offer no real secrecy. Access control
   for it belongs on the CARTO side (domain restrictions), not in this repo.
4. **Style is a constant**: `light_all` was previously hardcoded; it is now
   named so swapping to a dark basemap is a one-line change.

## Time Bar Scrubbing (2026-09-01)

### Overview

`components/ControlPanel.vue` is shared by the Rockets, Satellites and Engines
views, so this applies to all three. Its progress bar handled `mousedown` /
`mousemove` / `mouseup` only. A tap on a phone still seeked, via the browser's
synthesized mouse events, but a drag produced no `mousemove` at all — the bar
could not be scrubbed. Stage sections aside, this was the one control that
simply did not work on touch.

### Implementation

| Change | Effect |
|--------|--------|
| Pointer events replace mouse events | One code path covers mouse, touch and pen. |
| `setPointerCapture` on pointerdown | Move/up stay on the bar when the finger slides off it, so the listeners live on the element instead of on `window` — and are cleaned up by the browser rather than by hand. |
| `touch-action: none` on `.progress-bar` | Without it the browser claims a horizontal drag as a page pan and cancels the pointer stream mid-scrub. |

### Design Choices

1. **Hover styles gated behind `@media (hover: hover)`**: on touch the `:hover`
   state sticks after a tap, which left the bar stuck at its hover height.
2. **Handle always visible on coarse pointers**: it was opacity-gated on hover,
   so on a phone it never appeared and the bar looked inert.
3. **40px hit area via `::before`, coarse pointers only**: a 12px bar is a hard
   target for a fingertip. It is scoped to touch because on desktop the extra
   height would overhang the map above the panel and swallow pan gestures near
   its bottom edge; `.progress-container` gains matching padding so the area
   stays inside the panel.
4. **`setPointerCapture` wrapped in try/catch**: the seek is emitted first, so a
   browser that rejects the capture loses drag tracking but still seeks.
