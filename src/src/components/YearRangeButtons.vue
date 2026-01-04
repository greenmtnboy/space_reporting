<script setup lang="ts">
import type { YearRangeOption } from '../composables/useYearRange'

defineProps<{
  options: YearRangeOption[]
  selectedId: string
}>()

const emit = defineEmits<{
  select: [rangeId: string]
}>()
</script>

<template>
  <div class="year-range-buttons">
    <button
      v-for="option in options"
      :key="option.id"
      class="year-btn"
      :class="{ active: selectedId === option.id }"
      @click="emit('select', option.id)"
    >
      {{ option.label }}
    </button>
  </div>
</template>

<style scoped>
.year-range-buttons {
  display: flex;
  gap: 0.25rem;
}

.year-btn {
  padding: 0.25rem 0.625rem;
  font-family: var(--font-mono);
  font-size: 0.625rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  border: 1px solid var(--color-border);
  cursor: pointer;
  transition: all 0.15s ease;
  background-color: var(--color-bg-tertiary);
  color: var(--color-text-muted);
  clip-path: polygon(4px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%, 0 4px);
}

.year-btn:hover {
  background-color: var(--color-bg-secondary);
  border-color: var(--color-border-bright);
  color: var(--color-text);
}

.year-btn.active {
  background: linear-gradient(135deg, var(--color-accent-dim) 0%, var(--color-accent) 100%);
  border-color: var(--color-accent);
  color: white;
  box-shadow: 0 0 10px rgba(14, 165, 233, 0.3);
}

.year-btn.active:hover {
  background: linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-bright) 100%);
  box-shadow: 0 0 16px rgba(14, 165, 233, 0.4);
}

.year-btn:active {
  transform: scale(0.96);
}
</style>
