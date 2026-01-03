<script setup lang="ts">
import type { ActiveLaunch } from '../composables/useLaunches'
import { getDotSize } from '../utils/helpers'

const props = defineProps<{
  launches: ActiveLaunch[]
  mapWidth: number
  mapHeight: number
  latLngToPixel: (lat: number, lng: number) => { x: number; y: number }
}>()

const emit = defineEmits<{
  mouseenter: [launch: ActiveLaunch]
  mouseleave: []
}>()
</script>

<template>
  <svg
    class="launch-layer"
    :viewBox="`0 0 ${mapWidth} ${mapHeight}`"
    :style="{ width: mapWidth + 'px', height: mapHeight + 'px', zIndex: 100 }"
  >
    <g
      v-for="launch in launches"
      :key="launch.launch_tag"
      class="launch-marker"
      @mouseenter="emit('mouseenter', launch)"
      @mouseleave="emit('mouseleave')"
    >
      <template v-if="!launch.isFailed">
        <circle
          :cx="latLngToPixel(launch.site_latitude, launch.site_longitude).x"
          :cy="latLngToPixel(launch.site_latitude, launch.site_longitude).y"
          :r="getDotSize(launch.orb_pay) * launch.scale"
          class="launch-dot success"
          :style="{ opacity: launch.opacity }"
        />
      </template>

      <template v-else>
        <g
          :transform="`translate(${latLngToPixel(launch.site_latitude, launch.site_longitude).x}, ${latLngToPixel(launch.site_latitude, launch.site_longitude).y}) scale(${launch.scale})`"
          class="explosion"
          :style="{ opacity: launch.opacity }"
        >
          <circle r="3" class="explosion-center" />
          <line x1="0" y1="-4" x2="0" y2="-10" class="explosion-ray" />
          <line x1="3.5" y1="-2" x2="8.7" y2="-5" class="explosion-ray" />
          <line x1="3.5" y1="2" x2="8.7" y2="5" class="explosion-ray" />
          <line x1="0" y1="4" x2="0" y2="10" class="explosion-ray" />
          <line x1="-3.5" y1="2" x2="-8.7" y2="5" class="explosion-ray" />
          <line x1="-3.5" y1="-2" x2="-8.7" y2="-5" class="explosion-ray" />
          <circle cx="6" cy="-6" r="1.5" class="explosion-particle" />
          <circle cx="-6" cy="-4" r="1" class="explosion-particle" />
          <circle cx="4" cy="6" r="1" class="explosion-particle" />
          <circle cx="-5" cy="5" r="1.5" class="explosion-particle" />
        </g>
      </template>
    </g>
  </svg>
</template>

<style scoped>
.launch-layer {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
}

.launch-marker {
  pointer-events: all;
  cursor: pointer;
}

.launch-dot.success {
  fill: #4ade80;
  stroke: #22c55e;
  stroke-width: 1;
}

.explosion-center {
  fill: #ef4444;
}

.explosion-ray {
  stroke: #f97316;
  stroke-width: 2;
  stroke-linecap: round;
}

.explosion-particle {
  fill: #fbbf24;
}
</style>
