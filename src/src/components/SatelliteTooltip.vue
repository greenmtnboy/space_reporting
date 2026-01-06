<script setup lang="ts">
import type { HoveredSatellite } from '../composables/useSatelliteMarkers'

defineProps<{
  satellite: HoveredSatellite
}>()

function formatAltitude(km: number): string {
  if (!isFinite(km) || km < 0) return 'N/A'
  if (km >= 10000) return `${(km / 1000).toFixed(0)}k km`
  return `${km.toFixed(0)} km`
}
</script>

<template>
  <div
    class="satellite-tooltip"
    :style="{
      left: `${satellite.screenPosition.x + 12}px`,
      top: `${satellite.screenPosition.y - 10}px`
    }"
  >
    <div class="tooltip-name">{{ satellite.name }}</div>
    <div class="tooltip-owner">{{ satellite.owner }}</div>
    <div class="tooltip-details">
      <span class="tooltip-orbit-type">{{ satellite.orbitType }}</span>
      <span class="tooltip-altitude">
        {{ formatAltitude(satellite.perigee) }} × {{ formatAltitude(satellite.apogee) }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.satellite-tooltip {
  position: fixed;
  z-index: 1000;
  background: rgba(10, 10, 20, 0.95);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  padding: 0.5rem 0.75rem;
  pointer-events: none;
  font-family: var(--font-mono);
  max-width: 280px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
}

.tooltip-name {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 0.25rem;
}

.tooltip-owner {
  font-size: 0.625rem;
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 0.375rem;
}

.tooltip-details {
  display: flex;
  gap: 0.5rem;
  font-size: 0.5625rem;
  color: var(--color-text-muted);
}

.tooltip-orbit-type {
  color: var(--color-accent-bright);
  font-weight: 600;
}

.tooltip-altitude {
  opacity: 0.8;
}
</style>
