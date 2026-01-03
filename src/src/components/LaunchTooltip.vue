<script setup lang="ts">
import type { ProcessedLaunch } from '../composables/useLaunches'

defineProps<{
  launch: ProcessedLaunch
  x: number
  y: number
}>()
</script>

<template>
  <div
    class="launch-tooltip"
    :style="{
      left: x + 'px',
      top: y + 'px'
    }"
  >
    <div class="tooltip-site">{{ launch.site_name }}</div>
    <div class="tooltip-details">
      <span class="tooltip-id">{{ launch.flight_id }}</span>
      <span class="tooltip-vehicle">{{ launch.vehicle_name || 'Unknown' }}</span>
    </div>
  </div>
</template>

<style scoped>
.launch-tooltip {
  position: absolute;
  transform: translate(-50%, -100%);
  margin-top: -15px;
  background: rgba(0, 0, 0, 0.85);
  color: white;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 12px;
  white-space: nowrap;
  z-index: 200;
  pointer-events: none;
}

.tooltip-site {
  font-weight: 600;
  margin-bottom: 4px;
}

.tooltip-details {
  display: flex;
  gap: 8px;
  font-size: 11px;
  opacity: 0.8;
}

.tooltip-id {
  color: #93c5fd;
}

.tooltip-vehicle {
  color: #d1d5db;
}
</style>
