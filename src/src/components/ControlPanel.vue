<script setup lang="ts">
import { ref } from 'vue'

defineProps<{
  isPlaying: boolean
  isPaused: boolean
  isComplete: boolean
  progress: number
}>()

const emit = defineEmits<{
  togglePlayPause: []
  reset: []
  resetCamera: []
  seek: [progress: number]
}>()

const progressBarRef = ref<HTMLElement | null>(null)
const isDragging = ref(false)

function calculateProgress(clientX: number): number {
  if (!progressBarRef.value) return 0
  const rect = progressBarRef.value.getBoundingClientRect()
  const x = clientX - rect.left
  return Math.max(0, Math.min(100, (x / rect.width) * 100))
}

function handleMouseDown(event: MouseEvent) {
  isDragging.value = true
  const progress = calculateProgress(event.clientX)
  emit('seek', progress)

  window.addEventListener('mousemove', handleMouseMove)
  window.addEventListener('mouseup', handleMouseUp)
}

function handleMouseMove(event: MouseEvent) {
  if (!isDragging.value) return
  const progress = calculateProgress(event.clientX)
  emit('seek', progress)
}

function handleMouseUp() {
  isDragging.value = false
  window.removeEventListener('mousemove', handleMouseMove)
  window.removeEventListener('mouseup', handleMouseUp)
}
</script>

<template>
  <div class="control-panel">
    <div class="progress-container">
      <div
        ref="progressBarRef"
        class="progress-bar"
        :class="{ dragging: isDragging }"
        @mousedown="handleMouseDown"
      >
        <div class="progress-fill" :style="{ width: progress + '%' }"></div>
        <div class="progress-handle" :style="{ left: progress + '%' }"></div>
      </div>
      <div class="progress-labels">
        <span>Jan 2025</span>
        <span>Dec 2025</span>
      </div>
    </div>

    <div class="controls">
      <button @click="emit('togglePlayPause')" class="control-btn primary">
        {{ !isPlaying || isComplete ? 'Play' : (isPaused ? 'Resume' : 'Pause') }}
      </button>
      <button @click="emit('reset')" class="control-btn">Reset</button>
      <button @click="emit('resetCamera')" class="control-btn">Reset View</button>
    </div>
  </div>
</template>

<style scoped>
.control-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.progress-container {
  padding: 0 16px;
}

.progress-bar {
  height: 8px;
  margin: 4px 0;
  background: #e5e7eb;
  border-radius: 4px;
  cursor: pointer;
  position: relative;
  user-select: none;
}

.progress-bar:hover,
.progress-bar.dragging {
  height: 10px;
  margin: 3px 0;
}

.progress-bar:hover .progress-handle,
.progress-bar.dragging .progress-handle {
  opacity: 1;
  transform: translateX(-50%) translateY(-50%) scale(1);
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #3b82f6, #8b5cf6);
  transition: width 0.1s linear;
  border-radius: 4px;
  pointer-events: none;
}

.progress-handle {
  position: absolute;
  top: 50%;
  width: 16px;
  height: 16px;
  background: #3b82f6;
  border: 2px solid white;
  border-radius: 50%;
  transform: translateX(-50%) translateY(-50%) scale(0.8);
  opacity: 0;
  transition: opacity 0.15s, transform 0.15s;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  pointer-events: none;
}

.progress-labels {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: #6b7280;
  margin-top: 4px;
}

.controls {
  display: flex;
  justify-content: center;
  gap: 12px;
  padding: 8px 0;
}

.control-btn {
  padding: 8px 20px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  background: #e5e7eb;
  color: #374151;
}

.control-btn:hover {
  background: #d1d5db;
}

.control-btn.primary {
  background: #3b82f6;
  color: white;
}

.control-btn.primary:hover {
  background: #2563eb;
}
</style>
