<script setup lang="ts">
import NavSidebar from './components/NavSidebar.vue'
</script>

<template>
  <div class="app">
    <NavSidebar />
    <div class="app-content">
      <router-view />
    </div>
  </div>
</template>

<style scoped>
.app {
  display: flex;
  height: 100%;
  max-height: 100vh;
}

.app-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
</style>
