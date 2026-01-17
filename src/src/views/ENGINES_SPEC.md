# Engines View Specification

## Overview
This view visualizes rocket engine firings over time using three time-series spiral charts grouped by rocket stage, colored by fuel type.

## Layout
- **Three Spiral Charts**: Each representing a stage group
  - **Core Stage (0+1)**: Boosters + First Stage engines
  - **Second Stage (2)**: Second stage engines
  - **Upper Stages (3+)**: Upper/kick stage engines

- **Spiral Design**:
  - Time flows outward from center (earliest = inner, latest = outer)
  - 4 complete revolutions across the time range
  - Points colored by propellant group
  - Recent firings appear brighter, older ones fade

- **Booster Rendering**: Stage 0 engines render _outside_ the core spiral ring at opposing angles

- **Counter**: Total engine firings displayed below the spirals

- **Legend**: Propellant type color key in sidebar

## Interactivity
- **Time Controls**: Standard time controls (Play, Pause, Slider, Year Range) control the animation
- **Animation**: Points spawn from center and animate outward with spring effect
- **Flare Effect**: New engines appear with a brief brightness/glow animation
- **Hover**: Tooltip shows engine name, stage, and date

## Data
- **Source**: `raw_engine_data.json`
- **Fields**:
  - `vehicle_stage_number` (0=Booster, 1=First, 2=Second, 3+=Upper)
  - `vehicle_stage_engine_name`
  - `vehicle_stage_engine_fuel`
  - `vehicle_stage_engine_count`
  - `launch_date`

## Clustering (Octaweb Pattern)
- Single engine: center only
- 2-4 engines: square/diamond pattern
- 5+ engines: 1 center + 7 first ring (octaweb), then 12, 18, etc.

## Responsive Design
- **Wide screens**: 3 spirals side-by-side
- **Medium screens**: Spirals wrap to 2+1 layout
- **Mobile**: Spirals stack vertically

## Visuals
- **Color Coding by Propellant**:
  - LOX/Kero: Blue (#1F77B4)
  - LOX/LH2: Brown (#8C564B)
  - Solid: Gray (#BDBDBD)
  - NTO/UDMH: Red (#D62728)
  - LOX/Methane: Pink (#F7B6D2)
  - And others per data

## Implementation Details
- Uses `useEngines` composable with staged filtering
- Uses `useAnimation` for time control
- SVG-based rendering with computed spiral paths
- CSS animations for spawn and flare effects
- Brightness decay over 1 month for visual effect
