<script setup lang="ts">
</script>

<template>
  <div class="chart-legend">
    <div class="legend-item">
      <span class="legend-color active"></span>
      <span>Active</span>
    </div>
    <div class="legend-item">
      <span class="legend-color decommissioned"></span>
      <span>Decommissioned</span>
    </div>
  </div>
</template>

<style scoped>
.chart-legend {
  display: flex;
  gap: 16px;
  justify-content: center;
  padding-top: 16px;
  border-top: 1px solid #e5e7eb;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #4b5563;
}

.legend-color {
  width: 12px;
  height: 12px;
  border-radius: 2px;
}

.legend-color.active {
  background: #4ade80;
}

.legend-color.decommissioned {
  background: #ef4444;
}
</style>
