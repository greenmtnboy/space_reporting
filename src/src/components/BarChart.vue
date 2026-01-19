<script setup lang="ts">
import { ref, computed, nextTick, onUnmounted } from 'vue'
import type { Stats } from '../types'

const props = defineProps<{
  title: string
  stats: Stats[]
  maxTotal: number
  showFailures?: boolean
  selectedItems?: Set<string>
  clickable?: boolean
  limit?: number
}>()

const emit = defineEmits<{
  (e: 'itemClick', name: string): void
}>()

// Tooltip state
const tooltipVisible = ref(false)
const tooltipText = ref('')
const tooltipX = ref(0)
const tooltipY = ref(0)
const tooltipRef = ref<HTMLElement | null>(null)

let hideTimeout: ReturnType<typeof setTimeout> | null = null

async function showTooltip(event: MouseEvent | TouchEvent, name: string) {
  if (hideTimeout) {
    clearTimeout(hideTimeout)
    hideTimeout = null
  }

  tooltipText.value = name
  tooltipVisible.value = true

  // Get position from event
  const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX
  const clientY = 'touches' in event ? event.touches[0].clientY : event.clientY

  // Initial position
  tooltipX.value = clientX
  tooltipY.value = clientY

  // Wait for render then adjust position if needed
  await nextTick()
  if (tooltipRef.value) {
    const rect = tooltipRef.value.getBoundingClientRect()
    const padding = 8

    // Adjust horizontal position to keep tooltip in viewport
    let adjustedX = clientX
    const halfWidth = rect.width / 2

    if (clientX - halfWidth < padding) {
      // Too far left - shift right
      adjustedX = halfWidth + padding
    } else if (clientX + halfWidth > window.innerWidth - padding) {
      // Too far right - shift left
      adjustedX = window.innerWidth - halfWidth - padding
    }

    // Adjust vertical position if too close to top
    let adjustedY = clientY
    if (clientY - rect.height - 12 < padding) {
      // Show below cursor instead of above
      adjustedY = clientY + rect.height + 24
    }

    tooltipX.value = adjustedX
    tooltipY.value = adjustedY
  }
}

function hideTooltip() {
  // Small delay to allow moving between elements
  hideTimeout = setTimeout(() => {
    tooltipVisible.value = false
  }, 100)
}

function handleTouchStart(event: TouchEvent, name: string) {
  event.preventDefault()
  showTooltip(event, name)
}

function handleTouchEnd() {
  // Longer delay for touch to allow reading
  hideTimeout = setTimeout(() => {
    tooltipVisible.value = false
  }, 1500)
}

const displayStats = computed(() => {
  if (!props.limit || props.stats.length <= props.limit) {
    return props.stats
  }

  // Find items that are selected but would be hidden by the limit
  const selectedIndices = new Set<number>()
  if (props.selectedItems) {
    props.stats.forEach((item, index) => {
      if (props.selectedItems?.has(item.name)) {
        selectedIndices.add(index)
      }
    })
  }

  const topItems: Stats[] = []
  const otherItems: Stats[] = []

  props.stats.forEach((item, index) => {
    if (index < props.limit! || selectedIndices.has(index)) {
      topItems.push(item)
    } else {
      otherItems.push(item)
    }
  })

  if (otherItems.length === 0) return topItems

  // Group the remaining items into "Others"
  const others: Stats = otherItems.reduce((acc, curr) => ({
    name: 'Others',
    successes: acc.successes + curr.successes,
    failures: acc.failures + curr.failures,
    total: acc.total + curr.total
  }), { name: 'Others', successes: 0, failures: 0, total: 0 })

  return [...topItems, others]
})

function isSelected(name: string): boolean {
  if (name === 'Others') return false
  return props.selectedItems?.has(name) ?? false
}

function hasAnySelected(): boolean {
  return (props.selectedItems?.size ?? 0) > 0
}

function handleBarClick(name: string) {
  if (props.clickable && name !== 'Others') {
    emit('itemClick', name)
  }
}

onUnmounted(() => {
  if (hideTimeout) {
    clearTimeout(hideTimeout)
  }
})
</script>

<template>
  <div class="chart-block">
    <h2>{{ title }}</h2>
    <div class="bar-chart">
      <div
        v-for="item in displayStats"
        :key="item.name"
        class="bar-row"
        :class="{
          'bar-row--clickable': clickable && item.name !== 'Others',
          'bar-row--selected': isSelected(item.name),
          'bar-row--dimmed': hasAnySelected() && !isSelected(item.name) && item.name !== 'Others',
          'bar-row--others': item.name === 'Others'
        }"
        @click="handleBarClick(item.name)"
      >
        <div
          class="bar-label"
          @mouseenter="showTooltip($event, item.name)"
          @mouseleave="hideTooltip"
          @touchstart="handleTouchStart($event, item.name)"
          @touchend="handleTouchEnd"
        >{{ item.name }}</div>
        <div class="bar-container">
          <div
            class="bar-success"
            :style="{ width: (showFailures !== false ? (item.successes / maxTotal) : (item.total / maxTotal)) * 100 + '%' }"
          >
            <span v-if="(showFailures !== false ? item.successes : item.total) > 0 && (item.total / maxTotal) >= 0.15" class="bar-value">{{ showFailures !== false ? item.successes : item.total }}</span>
          </div>
          <div
            v-if="showFailures !== false"
            class="bar-failure"
            :style="{ width: (item.failures / maxTotal) * 100 + '%' }"
          >
            <span v-if="item.failures > 0 && (item.failures / maxTotal) >= 0.15" class="bar-value">{{ item.failures }}</span>
          </div>
          <!-- Show counts in white space when bar is too short -->
          <span v-if="(item.total / maxTotal) < 0.15 && item.total > 0" class="bar-value-outside">
            {{ showFailures !== false ? item.successes : item.total }}<template v-if="showFailures !== false && item.failures > 0"> (<span class="failure-text">{{ item.failures }}</span>)</template>
          </span>
          <!-- Show failures in white space when total bar is 15-30% (failures don't fit inside) -->
          <span v-if="showFailures !== false && (item.total / maxTotal) >= 0.15 && (item.total / maxTotal) < 0.30 && item.failures > 0 && (item.failures / maxTotal) < 0.10" class="bar-value-outside">
            (<span class="failure-text">{{ item.failures }}</span>)
          </span>
        </div>
        <div class="bar-total">{{ item.total }}</div>
      </div>
    </div>

    <!-- Custom tooltip -->
    <Teleport to="body">
      <div
        v-if="tooltipVisible"
        ref="tooltipRef"
        class="bar-chart-tooltip"
        :style="{
          left: tooltipX + 'px',
          top: tooltipY + 'px'
        }"
      >
        {{ tooltipText }}
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.chart-block {
  margin-bottom: 24px;
}

.chart-block h2 {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 12px;
  color: var(--color-text);
}

.bar-chart {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.bar-row {
  display: flex;
  align-items: center;
  gap: 8px;
  transition: opacity 0.15s ease;
}

.bar-row--clickable {
  cursor: pointer;
}

.bar-row--clickable:hover {
  background-color: rgba(14, 165, 233, 0.1);
  margin: 0 -4px;
  padding: 0 4px;
  border-radius: 2px;
}

.bar-row--selected {
  background-color: rgba(14, 165, 233, 0.15);
  margin: 0 -4px;
  padding: 0 4px;
  border-radius: 2px;
}

.bar-row--selected .bar-label {
  color: var(--color-accent-bright);
}

.bar-row--selected .bar-container {
  box-shadow: 0 0 0 1px var(--color-accent), 0 0 8px rgba(14, 165, 233, 0.4);
}

.bar-row--dimmed {
  opacity: 0.4;
}

.bar-row--dimmed:hover {
  opacity: 0.7;
}

.bar-label {
  width: 90px;
  font-size: 11px;
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text-secondary);
  cursor: pointer;
}

.bar-container {
  flex: 1;
  display: flex;
  height: 16px;
  background: #f3f4f6;
  border-radius: 2px;
  overflow: hidden;
  transition: box-shadow 0.15s ease;
}

.bar-success {
  background: #4ade80;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  transition: width 0.3s ease;
}

.bar-failure {
  background: #ef4444;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  transition: width 0.3s ease;
}

.bar-value {
  font-size: 9px;
  color: white;
  padding: 0 4px;
  font-weight: 600;
}

.bar-value-outside {
  font-size: 9px;
  color: #374151;
  padding: 0 4px;
  font-weight: 600;
  white-space: nowrap;
}

.failure-text {
  color: #ef4444;
}

.bar-total {
  width: 30px;
  font-size: 12px;
  font-weight: 600;
  text-align: right;
  color: var(--color-text);
}

.bar-row--others .bar-label {
  color: var(--color-text-muted);
  font-style: italic;
}

.bar-row--others .bar-container {
  background: rgba(255, 255, 255, 0.05);
  border: 1px dashed var(--color-border);
}

.bar-row--others .bar-success {
  background: var(--color-text-muted);
  opacity: 0.3;
}
</style>

<!-- Global styles for teleported tooltip -->
<style>
.bar-chart-tooltip {
  position: fixed;
  transform: translate(-50%, -100%) translateY(-12px);
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  padding: 6px 10px;
  border-radius: 4px;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 500;
  color: var(--color-text);
  white-space: nowrap;
  pointer-events: none;
  z-index: 9999;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  max-width: 90vw;
  overflow: hidden;
  text-overflow: ellipsis;
}

@media (max-width: 768px) {
  .bar-chart-tooltip {
    font-size: 12px;
    padding: 8px 12px;
  }
}
</style>
