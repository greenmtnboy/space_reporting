<script setup lang="ts">
import DateRangeSelector from './DateRangeSelector.vue'

defineProps<{
  title: string
  currentDateDisplay?: string
  startDate?: Date
  endDate?: Date
  activePresetId?: string | null
}>()

const emit = defineEmits<{
  'range-change': [{ start: Date; end: Date; presetId: string | null }]
}>()
</script>

<template>
  <header class="view-header">
    <div class="header-left">
      <div class="header-top-row">
        <h1>{{ title }}</h1>
        <div v-if="currentDateDisplay" class="date-display mobile-only">{{ currentDateDisplay }}</div>
      </div>
      <div class="header-details">
        <DateRangeSelector
          v-if="startDate && endDate"
          :start-date="startDate"
          :end-date="endDate"
          :active-preset-id="activePresetId ?? null"
          @change="(v) => emit('range-change', v)"
        />
        <slot></slot>
      </div>
    </div>
    <div class="header-right">
      <div v-if="currentDateDisplay" class="date-display desktop-only">{{ currentDateDisplay }}</div>
      <slot name="actions"></slot>
    </div>
  </header>
</template>

<style scoped>
.view-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 1rem 1.5rem;
  flex-shrink: 0;
  background-color: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
}

.header-left {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.header-top-row {
  display: flex;
  align-items: baseline;
  gap: 1rem;
}

.view-header h1 {
  font-size: 1.5rem;
  font-weight: 300;
  color: var(--color-text);
  margin: 0;
  white-space: nowrap;
}

.header-details {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.date-display {
  font-family: var(--font-mono);
  font-size: 1.25rem;
  color: var(--color-accent);
  font-weight: 500;
  white-space: nowrap;
}

.date-display.mobile-only { display: none; }
.date-display.desktop-only { display: block; }

@media (max-width: 600px) {
  .view-header {
    padding: 0.75rem 1rem;
  }

  .view-header h1 {
    font-size: 1.25rem;
  }

  .header-top-row {
    justify-content: space-between;
    width: 100%;
  }

  .header-left {
    width: 100%;
  }

  .date-display.mobile-only {
    display: block;
    font-size: 1rem;
  }

  .date-display.desktop-only {
    display: none;
  }
}
</style>
