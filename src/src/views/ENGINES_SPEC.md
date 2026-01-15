# Engines View Specification

## Overview
This view visualizes rocket engine firings over time using a time-series spiral chart, colored by fuel type.

## Layout
- **Spiral Chart**: A single large spiral where each point represents an engine firing
  - Time flows outward from center (earliest = inner, latest = outer)
  - 6 complete revolutions across the time range
  - Points colored by fuel type
  - Recent firings appear brighter, older ones fade

- **Legend**: Fuel type color key in top-right corner

- **Center Display**: Running count of total engine firings

## Interactivity
- **Time Controls**: Standard time controls (Play, Pause, Slider, Year Range) control the animation
- **Animation**: Points appear along the spiral as time progresses
- **Hover**: Tooltip shows engine name, fuel type, and date

## Data
- **Source**: `raw_engine_data.json`
- **Fields**:
  - `vehicle_stage_engine_name`
  - `vehicle_stage_engine_fuel`
  - `vehicle_stage_engine_isp`
  - `launch_date`

## Visuals
- **Color Coding by Fuel**:
  - LOX/Kero: Red (#ef4444)
  - LOX/LH2: Blue (#3b82f6)
  - Solid: Amber (#fbbf24)
  - NTO/UDMH: Violet (#8b5cf6)
  - LOX/Methane: Emerald (#10b981)
  - Hypergolic: Fuchsia (#d946ef)
  - Unknown: Gray (#9ca3af)

## Implementation Details
- Uses `useEngines` composable for data
- Uses `useAnimation` for time control
- SVG-based rendering with computed spiral path
- Brightness decay over 1 month for visual effect
