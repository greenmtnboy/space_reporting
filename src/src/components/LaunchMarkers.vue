<script setup lang="ts">
import { computed } from 'vue'
import type { ActiveLaunch } from '../composables/useLaunches'
import { getDotSize, getWrappedPositions } from '../utils/helpers'

const props = defineProps<{
  launches: ActiveLaunch[]
  mapWidth: number
  mapHeight: number
  zoom: number
  centerLat: number
  centerLng: number
  latLngToPixel: (lat: number, lng: number) => { x: number; y: number }
}>()

const emit = defineEmits<{
  mouseenter: [launch: ActiveLaunch]
  mouseleave: []
}>()

// Extended buffer for rendering markers outside the viewport (matches tile buffer)
const BUFFER = 512

// Compute all marker positions including wrapped copies
const markerPositions = computed(() => {
  return props.launches.map(launch => {
    const positions = getWrappedPositions(
      launch.site_latitude,
      launch.site_longitude,
      props.zoom,
      props.centerLat,
      props.centerLng,
      props.mapWidth,
      props.mapHeight
    )
    return { launch, positions }
  })
})
</script>

<template>
  <svg
    class="launch-layer"
    :viewBox="`${-BUFFER} ${-BUFFER} ${mapWidth + BUFFER * 2} ${mapHeight + BUFFER * 2}`"
    :style="{
      width: (mapWidth + BUFFER * 2) + 'px',
      height: (mapHeight + BUFFER * 2) + 'px',
      left: -BUFFER + 'px',
      top: -BUFFER + 'px',
      zIndex: 100
    }"
  >
    <g
      v-for="{ launch, positions } in markerPositions"
      :key="launch.launch_tag"
      class="launch-marker"
      @mouseenter="emit('mouseenter', launch)"
      @mouseleave="emit('mouseleave')"
    >
      <template v-for="(pos, idx) in positions" :key="`${launch.launch_tag}-${idx}`">
        <template v-if="!launch.isFailed">
          <circle
            :cx="pos.x"
            :cy="pos.y"
            :r="getDotSize(launch.orb_pay) * launch.scale"
            class="launch-dot success"
            :style="{ opacity: launch.opacity, fill: launch.state_color, stroke: launch.state_color, filter: `drop-shadow(0 0 3px ${launch.state_color}) drop-shadow(0 0 6px ${launch.state_color})` }"
          />
        </template>

        <template v-else>
          <g
            :transform="`translate(${pos.x}, ${pos.y}) scale(${launch.scale})`"
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
