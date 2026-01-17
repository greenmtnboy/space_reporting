<script setup lang="ts">
defineProps<{
  launchCount: number
  yearRangeLabel: string
  itemLabel?: string
}>()

const emit = defineEmits<{
  playAgain: []
  close: []
}>()
</script>

<template>
  <div class="completion-modal">
    <div class="modal-content">
      <h2>That's a wrap!</h2>
      <p>{{ launchCount }} {{ itemLabel || 'launches' }} in {{ yearRangeLabel }}</p>
      <div class="button-group">
        <button @click="emit('close')" class="control-btn secondary">Close</button>
        <button @click="emit('playAgain')" class="control-btn primary">Watch Again</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.completion-modal {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 300;
}

.modal-content {
  background: white;
  padding: 32px 48px;
  border-radius: 12px;
  text-align: center;
}

.modal-content h2 {
  font-size: 24px;
  font-weight: 700;
  margin-bottom: 8px;
  color: #111827;
}

.modal-content p {
  color: #6b7280;
  margin-bottom: 20px;
}

.control-btn {
  padding: 8px 20px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.control-btn.primary {
  background: #3b82f6;
  color: white;
}

.control-btn.primary:hover {
  background: #2563eb;
}

.control-btn.secondary {
  background: #f3f4f6;
  color: #374151;
  border: 1px solid #d1d5db;
}

.control-btn.secondary:hover {
  background: #e5e7eb;
}

.button-group {
  display: flex;
  gap: 12px;
  justify-content: center;
}
</style>
