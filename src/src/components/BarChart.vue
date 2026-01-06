<script setup lang="ts">
import type { Stats } from '../types'

defineProps<{
  title: string
  stats: Stats[]
  maxTotal: number
  showFailures?: boolean
}>()

// Default showFailures to true
</script>

<template>
  <div class="chart-block">
    <h2>{{ title }}</h2>
    <div class="bar-chart">
      <div v-for="item in stats" :key="item.name" class="bar-row">
        <div class="bar-label" :title="item.name">{{ item.name }}</div>
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
}

.bar-label {
  width: 90px;
  font-size: 11px;
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text-secondary);
}

.bar-container {
  flex: 1;
  display: flex;
  height: 16px;
  background: #f3f4f6;
  border-radius: 2px;
  overflow: hidden;
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
</style>
