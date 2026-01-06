<script setup lang="ts">
import type { FilterType } from '../composables/useCrossFilter'

defineProps<{
  filters: Array<{ type: FilterType; value: string; label: string }>
}>()

const emit = defineEmits<{
  (e: 'remove', type: FilterType, value: string): void
  (e: 'clearAll'): void
}>()

// Get display label for filter type
function getTypeLabel(type: FilterType): string {
  switch (type) {
    case 'organization':
      return 'Provider'
    case 'vehicle':
      return 'Vehicle'
    case 'owner':
      return 'Owner'
    case 'orbitType':
      return 'Orbit'
    default:
      return type
  }
}

// Get color class for filter type
function getTypeColorClass(type: FilterType): string {
  switch (type) {
    case 'organization':
    case 'owner':
      return 'chip--primary'
    case 'vehicle':
      return 'chip--secondary'
    case 'orbitType':
      return 'chip--tertiary'
    default:
      return ''
  }
}
</script>

<template>
  <div v-if="filters.length > 0" class="filter-chips">
    <span class="filter-label">Filters:</span>
    <div class="chips-container">
      <div
        v-for="filter in filters"
        :key="`${filter.type}-${filter.value}`"
        class="chip"
        :class="getTypeColorClass(filter.type)"
      >
        <span class="chip-type">{{ getTypeLabel(filter.type) }}:</span>
        <span class="chip-value">{{ filter.label }}</span>
        <button
          class="chip-remove"
          @click="emit('remove', filter.type, filter.value)"
          :aria-label="`Remove ${filter.label} filter`"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 2L8 8M8 2L2 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
    </div>
    <button class="clear-all-btn" @click="emit('clearAll')">
      Clear all
    </button>
  </div>
</template>

<style scoped>
.filter-chips {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background-color: var(--color-bg-tertiary);
  border-bottom: 1px solid var(--color-border);
  flex-wrap: wrap;
}

.filter-label {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.chips-container {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  flex: 1;
}

.chip {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 6px 3px 8px;
  background-color: rgba(14, 165, 233, 0.15);
  border: 1px solid rgba(14, 165, 233, 0.3);
  border-radius: 3px;
  font-family: var(--font-mono);
  font-size: 10px;
}

.chip--primary {
  background-color: rgba(14, 165, 233, 0.15);
  border-color: rgba(14, 165, 233, 0.3);
}

.chip--secondary {
  background-color: rgba(16, 185, 129, 0.15);
  border-color: rgba(16, 185, 129, 0.3);
}

.chip--tertiary {
  background-color: rgba(168, 85, 247, 0.15);
  border-color: rgba(168, 85, 247, 0.3);
}

.chip-type {
  color: var(--color-text-muted);
  font-size: 9px;
}

.chip-value {
  color: var(--color-text);
  font-weight: 500;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chip-remove {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  padding: 0;
  margin-left: 2px;
  background: transparent;
  border: none;
  border-radius: 2px;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all 0.1s ease;
}

.chip-remove:hover {
  background-color: rgba(239, 68, 68, 0.2);
  color: var(--color-failure);
}

.clear-all-btn {
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 4px 8px;
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: 2px;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all 0.1s ease;
  white-space: nowrap;
}

.clear-all-btn:hover {
  border-color: var(--color-failure);
  color: var(--color-failure);
  background-color: rgba(239, 68, 68, 0.1);
}

@media (max-width: 600px) {
  .filter-chips {
    padding: 6px 10px;
    gap: 6px;
  }

  .filter-label {
    font-size: 9px;
  }

  .chip {
    font-size: 9px;
    padding: 2px 4px 2px 6px;
  }

  .chip-type {
    display: none;
  }

  .chip-value {
    max-width: 80px;
  }

  .clear-all-btn {
    font-size: 8px;
    padding: 3px 6px;
  }
}
</style>
