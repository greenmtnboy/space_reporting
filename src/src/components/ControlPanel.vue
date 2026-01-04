<script setup lang="ts">
import { ref } from 'vue'

defineProps<{
  isPlaying: boolean
  isPaused: boolean
  isComplete: boolean
  progress: number
  isMuted: boolean
  volume: number
}>()

const emit = defineEmits<{
  togglePlayPause: []
  reset: []
  resetCamera: []
  seek: [progress: number]
  toggleMute: []
  setVolume: [volume: number]
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

      <div class="sound-controls">
        <button @click="emit('toggleMute')" class="control-btn sound-btn" :title="isMuted ? 'Unmute' : 'Mute'">
          <svg v-if="!isMuted" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
          </svg>
          <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
          </svg>
        </button>
        <input
          type="range"
          min="0"
          max="100"
          :value="volume * 100"
          @input="emit('setVolume', ($event.target as HTMLInputElement).valueAsNumber / 100)"
          class="volume-slider"
          :disabled="isMuted"
        />
      </div>
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

.sound-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: 16px;
  padding-left: 16px;
  border-left: 1px solid #e5e7eb;
}

.sound-btn {
  padding: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.volume-slider {
  width: 80px;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: #e5e7eb;
  border-radius: 2px;
  cursor: pointer;
}

.volume-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 14px;
  height: 14px;
  background: #3b82f6;
  border-radius: 50%;
  cursor: pointer;
}

.volume-slider::-moz-range-thumb {
  width: 14px;
  height: 14px;
  background: #3b82f6;
  border-radius: 50%;
  cursor: pointer;
  border: none;
}

.volume-slider:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.volume-slider:disabled::-webkit-slider-thumb {
  background: #9ca3af;
}

.volume-slider:disabled::-moz-range-thumb {
  background: #9ca3af;
}
</style>
