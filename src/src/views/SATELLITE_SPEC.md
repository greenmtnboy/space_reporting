# Satellite Visualization Spec

## Current Implementation

### Overview
Satellites are visualized with:
- **Launch tracks**: Green lines rising from launch site (lat/lng) to orbit insertion altitude
- **Orbit ellipses**: Full orbital paths colored by owner, rendered as THREE.Line with 128 segments

### Current Timing Issues
The launch-to-orbit transition has visual artifacts:
1. Launch line fades out in final 30% of launch progress (`opacity = 1 - ((progress - 0.7) / 0.3)`)
2. Full orbit ellipse fades in simultaneously based on same `launchProgress`
3. Result: launch track abruptly disappears while a complete 360° orbit "flashes in"
4. No visual continuity between the ascending track and the established orbit

---

## Proposed Solution: Particle Trail System

### Concept
Replace the current discrete launch-line → full-orbit transition with a **particle/point that travels along the orbital path, leaving a persistent trail** until it completes one full revolution, then instantiate the static orbit line.

### Implementation Approach

```
Phase 1 (launch): Particle rises from surface along radial vector toward orbit altitude
Phase 2 (orbit insertion): Particle begins traveling along the elliptical orbital path
Phase 3 (first orbit): Trail extends behind particle as it completes the circle
Phase 4 (established): Full static orbit line replaces trail; particle removed
```

---

## Pros & Cons Evaluation

### Particle Trail Approach

#### Pros
| Benefit | Description |
|---------|-------------|
| **Visual continuity** | Smooth transition from launch to orbit - the trail naturally "draws" the orbit rather than popping in |
| **Physically intuitive** | Mimics how orbits are actually established - one revolution at a time |
| **Reduced visual noise** | Fewer simultaneous full orbits appearing; orbits fill in gradually |
| **Clear launch→orbit narrative** | Viewers can follow individual satellites from ground to established orbit |
| **Deferred geometry creation** | Full 128-segment orbit line only created after first revolution, potential memory savings during heavy launch periods |

#### Cons
| Drawback | Description |
|----------|-------------|
| **Tooltip complexity** | Trail segments (if using line strips) need hit-testing; point clouds harder to hover. May need invisible hover geometry or expanded click targets |
| **Performance overhead** | Per-frame trail updates vs. static geometry. GPU buffer updates each frame for active particles |
| **Animation state management** | Need to track orbital position angle per satellite during trail phase, more complex than current progress-based opacity |
| **Visual clutter during bursts** | Many simultaneous launches = many moving particles. Could overwhelm the visualization |
| **Trail rendering options** | Line trail vs. point sprites vs. mesh ribbon - each has trade-offs for appearance and interaction |

---

### Alternative: Progressive Orbit Reveal (No Particles)

Instead of a moving particle, progressively reveal the orbit line geometry from 0° to 360°.

#### Pros
- Simpler than particle system - just animate `drawRange` on existing BufferGeometry
- Same geometry used for both reveal and final state
- Hit-testing works on the visible portion of the line
- No additional objects to manage

#### Cons
- Less visually interesting than a moving "satellite point"
- Orbit appears to grow from arbitrary point rather than following a satellite
- Still need to synchronize with launch track endpoint

---

### Alternative: Hybrid Approach

Combine a visible satellite point marker with progressive line reveal:
1. Satellite point (small sphere/sprite) moves along orbital path
2. Line geometry reveals behind it via `drawRange`
3. Point continues orbiting after line complete (optional) or fades out
4. Tooltip attached to the point marker during reveal, then to full orbit line

#### Pros
- Visual appeal of particle approach
- Simpler hit-testing (hover the point, or the revealed line portion)
- Best of both approaches

#### Cons
- Two objects to manage per satellite (point + line)
- Need to sync point position with line reveal edge

---

## Tooltip Considerations

### Current State
No tooltips implemented yet. Orbits have `userData.satelliteId` for identification.

### Requirements for Tooltip Support

| Approach | Tooltip Strategy |
|----------|------------------|
| **Static orbit lines** | Raycaster against Line geometry; use `line.userData.satelliteId` |
| **Particle trail** | Raycast against the trail line OR add invisible hitbox following particle. Trail segments may have gaps in raycasting |
| **Progressive reveal** | Raycast against visible portion. Works with existing Line raycasting |
| **Hybrid (point + line)** | Raycast against point sprite (easiest) or line. Point gives clear hover target |

### Recommendation for Tooltips
Use **invisible hover geometry** (wider line or tube) that follows the visible orbit, regardless of rendering approach. This provides consistent hit areas during both reveal and established states.

---

## Recommendation

**Hybrid approach** offers the best balance:
1. Smooth visual transition (particle traveling, trail forming)
2. Manageable complexity (reuse orbit line geometry with `drawRange`)
3. Good tooltip support (satellite point provides clear hover target)
4. Performance acceptable (one point + one line per satellite, not true particle system)

### Implementation Priority
1. Fix the abrupt transition first with **progressive reveal** (`drawRange` animation)
2. Add **satellite point marker** for visual tracking (optional enhancement)
3. Implement **tooltip system** with raycasting against lines + points

---

## Implementation (Completed)

### Progressive Orbit Reveal

**Location**: [useOrbits.ts](../composables/useOrbits.ts), [useSatellites.ts](../composables/useSatellites.ts)

**Approach**: Using `BufferGeometry.setDrawRange()` to progressively reveal orbit segments.

**Key changes**:

1. **New `orbitProgress` field** in `ActiveSatellite` (0-1):
   - Starts at 0 when satellite reaches orbit insertion
   - Increases over `ORBIT_REVEAL_DAYS` (3 days) to 1
   - At 1, full orbit is visible

2. **Progressive reveal in `updateOrbitLine()`**:
   ```typescript
   const revealCount = Math.ceil(satellite.orbitProgress * totalPoints)
   line.geometry.setDrawRange(0, Math.max(2, revealCount))
   ```

3. **Performance**: Zero GPU buffer uploads - just changing draw count integer.

### Inclined Launch Tracks

**Problem**: Launch tracks were vertical (radial) lines that didn't connect smoothly to inclined orbits.

**Solution**: `generateLaunchTrackPoints()` computes curved arc from ground to orbit insertion point:

1. Find the point on the orbit ellipse closest to "above" the launch site
2. Generate curved path that interpolates from ground position to that orbit insertion point
3. Path follows spherical interpolation (slerp-like) while altitude increases linearly

**Key algorithm**:
```typescript
// Find orbit insertion point (closest point on orbit to launch site direction)
for (let i = 0; i < 36; i++) {
  const testAngle = (i / 36) * Math.PI * 2
  // ... find angle with max dot product to launch site direction
}

// Curved interpolation from ground to insertion
for (let i = 0; i <= numPoints; i++) {
  const t = (i / numPoints) * progress
  const interpPos = new THREE.Vector3().lerpVectors(groundPos, orbitInsertPos, t)
  const currentRadius = groundRadius + (orbitRadius - groundRadius) * t
  interpPos.normalize().multiplyScalar(currentRadius)
}
```

### Timing

| Phase | Duration | Visual |
|-------|----------|--------|
| Launch rise | 2-8 days (altitude-dependent) | Green curved track rises to orbit |
| Track fade | 1 day | Track fades out (opacity 1→0) |
| Orbit reveal | 3 days | Orbit draws from insertion point around full ellipse |

Orbit reveal **starts when launch track reaches altitude** (overlaps with track fade period), creating smooth handoff.

---

## Performance Analysis (2026-01-06)

### Current Optimizations

| Technique | Location | Impact |
|-----------|----------|--------|
| **Object Pooling** | `useOrbits.ts:22-28` | Reusable temp vectors (`_tempVec3`, `_groundPos`, etc.) eliminate per-frame allocation |
| **Float32Array Geometry** | `generateOrbitPoints()`, `generateLaunchTrackPoints()` | Direct buffer writes, no intermediate Vector3 array |
| **Draw Range Animation** | `updateOrbitLine():364`, `updateLaunchLine():401` | Zero GPU uploads - just updates draw count integer |
| **Map-Based Tracking** | `orbitLines`, `launchLines` Maps | O(1) lookup for add/update/remove operations |
| **Proper Disposal** | `cleanupRemovedSatellites()` | Geometry + material dispose prevents memory leaks |
| **Shallow Watching** | `watch(..., { deep: false })` | Avoids deep comparison overhead |

### Remaining Bottlenecks

#### 1. **Vue Reactivity Per-Frame Recalculation**
**Location**: `useSatellites.ts:241-270`

Every frame, `currentTime` changes trigger full recalculation of:
- `activeSatellites` - filters all satellites, maps state
- `orbitingSatellites`, `launchingSatellites`, `decommissioningSatellites` - additional filters

**Impact**: O(n) work per frame where n = total satellites in year range

**Potential Fix**:
- Use time-binned indexing (binary search on sorted launch timestamps)
- Only recalculate satellites near state transitions
- Or: move to RAF-driven updates outside Vue reactivity

#### 2. **Orbit Insertion Angle Search**
**Location**: `useOrbits.ts:132-188`

Per-satellite creation, runs coarse (72 steps) + fine (2×10 steps) angle search.

**Impact**: ~92 trig operations per new orbit

**Potential Fix**:
- Cache the insertion angle result (orbits are static once created)
- Current code already avoids re-searching on updates (only on creation)
- **Status**: Already optimized - search only runs once per satellite

#### 3. **Material Instance Per Satellite**
**Location**: `useOrbits.ts:33-68`

Each satellite gets unique `LineBasicMaterial` because opacity animates independently.

**Impact**: ~1000+ material instances in heavy years

**Potential Fix**:
- Use vertex colors with alpha channel instead of material opacity
- Or: custom shader with per-instance opacity uniform via InstancedMesh
- **Trade-off**: Significant refactor for marginal gain (materials are lightweight vs geometry)

#### 4. **Color Lerping in Decommission**
**Location**: `useOrbits.ts:370-371`

```typescript
const originalColor = new THREE.Color(satellite.owner_color)
material.color.lerpColors(originalColor, DECOM_END_COLOR, satellite.decomProgress)
```

Creates new `THREE.Color` every frame per decommissioning satellite.

**Fix**: Cache original color in material userData on creation.

#### 5. **Launch Track Full Regeneration**
**Location**: `generateLaunchTrackPoints()` called with `progress=1.0` on creation

Launch tracks are generated at full length, then revealed via `setDrawRange()`. This is correct.

**Status**: Already optimized

### Recommendations (Priority Order)

1. **[Low Effort]** Cache original color for decom lerping ✅ Implemented
2. **[Medium Effort]** Time-binned satellite indexing for O(log n) lookups
3. **[Medium Effort]** Web Worker geometry precomputation ✅ Implemented
4. **[Optional]** Vertex colors for shared materials (diminishing returns)

---

## Web Worker Geometry Precomputation (Implemented)

### Constraints

**Must stay on main thread:**
- WebGL rendering (`renderer.render()`) - WebGL context tied to main thread
- DOM access (canvas element)
- THREE.js scene graph mutations (add/remove objects)
- Material/geometry GPU uploads

**Can move to Web Worker:**
- All pure math computation (no DOM/WebGL)
- Orbit point generation
- Launch track point generation
- Orbital parameter calculations (angle searches, matrix transforms)

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Main Thread                               │
├─────────────────────────────────────────────────────────────────┤
│  loadSatelliteData()                                            │
│       │                                                          │
│       ▼                                                          │
│  ┌──────────────────────┐    postMessage     ┌────────────────┐ │
│  │ useSatellites        │ ──────────────────▶│ Worker         │ │
│  │ (sends satellite[])  │                    │                │ │
│  └──────────────────────┘                    │ Computes:      │ │
│                                              │ - orbitPoints  │ │
│  ┌──────────────────────┐    onmessage      │ - launchPoints │ │
│  │ useOrbits            │ ◀──────────────────│                │ │
│  │ (receives buffers)   │   Transferable     └────────────────┘ │
│  └──────────────────────┘   ArrayBuffers                        │
│       │                                                          │
│       ▼                                                          │
│  THREE.BufferGeometry.setAttribute(precomputed)                 │
└─────────────────────────────────────────────────────────────────┘
```

### Implementation

**Location**: `src/workers/geometryWorker.ts`

**Data flow**:
1. `loadSatelliteData()` fetches JSON, posts satellite array to worker
2. Worker computes all orbit + launch track `Float32Array` buffers
3. Worker transfers buffers back via `Transferable` (zero-copy)
4. `useOrbits` uses precomputed buffers instead of computing on-demand

**Key benefits**:
- Geometry computation off main thread during load
- Zero per-satellite math during animation
- `Transferable` ArrayBuffers = zero-copy transfer
- Loading spinner can show progress while computing

### Worker API

```typescript
// Main → Worker
interface GeometryRequest {
  type: 'compute'
  satellites: SatelliteData[]
}

// Worker → Main
interface GeometryResponse {
  type: 'complete'
  geometries: Map<string, {
    orbitPositions: Float32Array    // Transferable
    launchPositions: Float32Array   // Transferable
    totalOrbitPoints: number
    totalLaunchPoints: number
  }>
}

// Progress updates
interface GeometryProgress {
  type: 'progress'
  completed: number
  total: number
}
```

---

## Bar Chart Active vs Decommissioned Breakdown (Implemented)

### Overview

The bar charts now show a breakdown of **active** vs **decommissioned** satellites, similar to the success/failure breakdown in the launch view.

### Design Choices

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Color scheme** | Green = Active, Red = Decommissioned | Consistent with launch view (green = positive state, red = ended state) |
| **Reuse Stats interface** | `successes` = active, `failures` = decommissioned | Avoids creating new types; BarChart component already supports this display mode |
| **Decom threshold** | `currentTime >= decomTimestamp` | A satellite is considered decommissioned once the animation time passes its end_date |
| **Legend placement** | Between bar charts and orbit legend | Groups chart-related legends together |

### Implementation

**Files modified**:
- [useSatellites.ts](../composables/useSatellites.ts): `ownerStats` and `orbitTypeStats` now track active vs decommissioned counts
- [SatellitesView.vue](./SatellitesView.vue): Enabled `showFailures` (default true), added `SatelliteLegend`
- [SatelliteLegend.vue](../components/SatelliteLegend.vue): New component with "Active" (green) and "Decommissioned" (red) legend items

### Behavior

As the animation progresses:
1. Newly launched satellites appear in the green (active) portion of bars
2. When a satellite's `end_date` is reached, it moves from green to red (decommissioned)
3. The legend clarifies the color meaning: Active vs Decommissioned

---

## Responsive Design (2026-01-06)

### Problem

On smaller desktop screens and mobile devices, the fixed `height: 60vh` on the globe container caused:
- Control panel buttons pushed off the bottom of the viewport
- Overflow issues with the combined height of header, globe, charts, and footer

### Solution

Replaced fixed vh units with `calc()`-based constraints that reserve space for the control panel:

| Breakpoint | Globe Container | Chart Section |
|------------|-----------------|---------------|
| > 900px | `max-height: calc(100vh - 200px)`, aspect-ratio: 1 | Fixed 300px sidebar |
| 600-900px | `max-height: calc(50vh - 80px)` | `max-height: 35vh`, scrollable |
| < 600px | `max-height: calc(45vh - 70px)` | `max-height: 30vh`, compact legends |

### Key Design Choices

1. **calc() for control panel space**: Globe container uses `calc(50vh - 80px)` to explicitly reserve ~80px for the control panel buttons
2. **Aspect ratio preservation**: Keeping `aspect-ratio: 1` on the globe container maintains the proper spherical rendering
3. **overflow: visible on globe-section**: Allows control panel to remain visible even when globe section is constrained
4. **Compact orbit legend on mobile**: Legend items displayed in horizontal rows to reduce vertical space usage
5. **Scrollable chart section**: Chart section is scrollable with constrained max-height to ensure controls remain visible

---

## Cross-Filter Bar Charts (2026-01-06)

### Overview

Bar charts now support interactive cross-filtering, allowing users to click on bars to filter the visualization. Filters are persisted in the URL for sharing.

### Implementation

**Files added/modified**:
- `useCrossFilter.ts`: New composable managing filter state and URL persistence
- `FilterChips.vue`: New component displaying active filters with clear buttons
- `BarChart.vue`: Updated to support `clickable` prop and `selectedItems` highlighting
- `useSatellites.ts`: Updated to accept optional filter ref and apply filtering to satellite data
- `SatellitesView.vue`: Integrated cross-filter composable and FilterChips component

### Features

| Feature | Description |
|---------|-------------|
| **Click to filter** | Clicking a bar toggles filter for that item (owner or orbit type) |
| **Visual feedback** | Selected bars highlighted with cyan glow; non-selected bars dimmed |
| **Filter chips** | Active filters shown in chips bar below header with remove buttons |
| **Clear all** | Button to clear all active filters at once |
| **URL persistence** | Filters encoded in URL query params (`?owner=NASA&orbit=LEO`) |
| **Shareable links** | URL with filters can be shared to show same filtered view |
| **Cross-chart filtering** | Selecting "LEO" orbit type filters to only LEO satellites across all charts |

### URL Parameter Schema

| Parameter | Description | Example |
|-----------|-------------|---------|
| `owner` | Satellite owner filter(s) | `?owner=NASA&owner=SpaceX` |
| `orbit` | Orbit type filter(s) | `?orbit=LEO&orbit=GEO` |

### Design Choices

1. **Stats show all data**: Bar charts display stats for ALL satellites (not filtered) so users can see available filter options
2. **AND logic for multiple filters**: When both owner and orbit type filters are active, satellites must match both
3. **Toggle behavior**: Clicking same bar again removes the filter (toggle on/off)
4. **Dimming non-selected**: When filters active, non-matching bars shown at 40% opacity for context
