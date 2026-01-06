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
