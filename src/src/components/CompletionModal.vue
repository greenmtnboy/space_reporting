<script setup lang="ts">
defineProps<{
  launchCount: number
}>()

const emit = defineEmits<{
  playAgain: []
}>()
</script>

<template>
  <div class="completion-modal">
    <div class="modal-content">
      <h2>That's a wrap!</h2>
      <p>on {{ launchCount }} launches in 2025</p>
      <button @click="emit('playAgain')" class="control-btn primary">Watch Again</button>
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
</style>
