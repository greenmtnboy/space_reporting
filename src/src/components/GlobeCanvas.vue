<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useGlobe } from '../composables/useGlobe'

const containerRef = ref<HTMLElement | null>(null)

const {
  init,
  cleanup,
  isInitialized,
  latLngToVector3,
  getOrbitGroup,
  getScene,
  EARTH_RADIUS
} = useGlobe(containerRef)

onMounted(() => {
  init()
})

onUnmounted(() => {
  cleanup()
})

// Expose methods for parent component
defineExpose({
  isInitialized,
  latLngToVector3,
  getOrbitGroup,
  getScene,
  EARTH_RADIUS
})
</script>

<template>
  <div ref="containerRef" class="globe-container"></div>
</template>

<style scoped>
.globe-container {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
  background-color: #030305;
}

.globe-container :deep(canvas) {
  display: block;
}
</style>
