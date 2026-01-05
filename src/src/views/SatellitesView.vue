<script setup lang="ts">
// Placeholder component for future satellite visualization
</script>

<template>
  <div class="satellites-view">
    <div class="placeholder-content">
      <div class="placeholder-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M12 2L12 4M12 20L12 22M4 12L2 12M22 12L20 12" stroke-linecap="round"/>
          <circle cx="12" cy="12" r="4"/>
          <path d="M12 8V4M12 20v-4M8 12H4M20 12h-4" stroke-linecap="round"/>
          <path d="M6.34 6.34L4.93 4.93M19.07 19.07l-1.41-1.41M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" stroke-linecap="round"/>
        </svg>
      </div>
      <h1>Satellites</h1>
      <p class="placeholder-description">Coming Soon</p>
      <p class="placeholder-detail">
        Satellite data will be available in a future update.
      </p>
    </div>
  </div>
</template>

<style scoped>
.satellites-view {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  width: 100%;
  background-color: var(--color-bg);
}

.placeholder-content {
  text-align: center;
  padding: 2rem;
}

.placeholder-icon {
  width: 80px;
  height: 80px;
  margin: 0 auto 1.5rem;
  color: var(--color-accent);
  opacity: 0.6;
}

.placeholder-icon svg {
  width: 100%;
  height: 100%;
}

.placeholder-content h1 {
  font-family: var(--font-mono);
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--color-text);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin-bottom: 0.5rem;
}

.placeholder-description {
  font-family: var(--font-mono);
  font-size: 0.875rem;
  color: var(--color-accent-bright);
  text-transform: uppercase;
  letter-spacing: 0.15em;
  margin-bottom: 1rem;
}

.placeholder-detail {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--color-text-muted);
  max-width: 300px;
  line-height: 1.5;
}
</style>
