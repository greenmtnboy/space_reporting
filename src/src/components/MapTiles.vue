<script setup lang="ts">
import type { TileData } from '../composables/useMapTiles'

defineProps<{
  tiles: TileData[]
  mapWidth: number
  mapHeight: number
}>()

const emit = defineEmits<{
  tileLoad: [zoom: number]
}>()
</script>

<template>
  <div class="map-tiles" :style="{ width: mapWidth + 'px', height: mapHeight + 'px' }">
    <img
      v-for="tile in tiles"
      :key="`${tile.zIndex}-${tile.url}-${tile.x}-${tile.y}`"
      :src="tile.url"
      :style="{
        left: tile.x + 'px',
        top: tile.y + 'px',
        width: (256 * tile.scale) + 'px',
        height: (256 * tile.scale) + 'px',
        zIndex: tile.zIndex
      }"
      class="map-tile"
      @load="emit('tileLoad', tile.zIndex)"
    />
  </div>
</template>

<style scoped>
.map-tiles {
  position: relative;
}

.map-tile {
  position: absolute;
  user-select: none;
  pointer-events: none;
}
</style>
