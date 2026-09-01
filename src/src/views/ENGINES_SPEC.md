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
- **Mobile (≤700px)**: Stage sections stack vertically and the content column scrolls

### Mobile Layout (2026-09-01)

The desktop layout fits the whole view into the viewport: every level of the
flex chain carries `min-height: 0` so it can shrink. Stacked vertically on a
phone that left each of the three stage sections about 38px tall — a header and
nothing else.

| Choice | Rationale |
|--------|-----------|
| `min-height: 240px` on `.stage-section`, replacing `max-height: 200px` | A floor, not a ceiling. The section is only worth showing at a size that fits its flare strip and a couple of card rows. |
| `flex: none` on `.display-section` and `.stages-container` | Without it the sections are compressed back into the viewport height and the min-height never takes effect. |
| `overflow-y: auto` on `.main-content` | The stacked sections cannot fit a phone viewport, so the content column scrolls. This is the one place the app scrolls; everything else is viewport-fitted. |
| `.flare-display` height tracks `.flare-area` | They are set separately; when only the area shrank, the SVG kept its 250px desktop height and was clipped by the area's `overflow: hidden`. |
| Kill grid shown, capped at 158px | It was previously `display: none` on mobile, which is most of why a stage section looked empty. 158px is two 73px card rows plus the 4px gap and the grid's 4px padding, so the cap lands on a row boundary; the grid keeps its own `overflow-y: auto` for the rest. |
| `.control-panel` is `position: sticky; bottom: 0` | Once the stages scroll, the time controls would scroll away with them. Pinning keeps play/pause and the scrubber reachable while a stage is in view. |

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
