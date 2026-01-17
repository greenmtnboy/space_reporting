<script setup lang="ts">
import YearRangeButtons from './YearRangeButtons.vue'
import type { YearRangeOption } from '../composables/useYearRange'

defineProps<{
  title: string
  currentDateDisplay?: string
  yearRangeOptions?: YearRangeOption[]
  selectedRangeId?: string
}>()

const emit = defineEmits<{
  'select-range': [rangeId: string]
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
        <YearRangeButtons
          v-if="yearRangeOptions && selectedRangeId"
          :options="yearRangeOptions"
          :selected-id="selectedRangeId"
          @select="(id) => emit('select-range', id)"
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
