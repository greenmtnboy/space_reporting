<script setup lang="ts">
import type { Stats } from '../types'

defineProps<{
  title: string
  stats: Stats[]
  maxTotal: number
}>()
</script>

<template>
  <div class="chart-block">
    <h2>{{ title }}</h2>
    <div class="bar-chart">
      <div v-for="item in stats" :key="item.name" class="bar-row">
        <div class="bar-label">{{ item.name }}</div>
        <div class="bar-container">
          <div
            class="bar-success"
            :style="{ width: (item.successes / maxTotal) * 100 + '%' }"
          >
            <span v-if="item.successes > 0" class="bar-value">{{ item.successes }}</span>
          </div>
          <div
            class="bar-failure"
            :style="{ width: (item.failures / maxTotal) * 100 + '%' }"
          >
            <span v-if="item.failures > 0 && (item.failures / maxTotal) >= 0.08" class="bar-value">{{ item.failures }}</span>
          </div>
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

.bar-total {
  width: 30px;
  font-size: 12px;
  font-weight: 600;
  text-align: right;
  color: var(--color-text);
}
</style>
