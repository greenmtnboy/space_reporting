<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()

const navItems = [
  {
    name: 'rockets',
    path: '/',
    label: 'Rockets',
    icon: 'rocket'
  },
  {
    name: 'satellites',
    path: '/satellites',
    label: 'Satellite',
    icon: 'satellite'
  },
  {
    name: 'engines',
    path: '/engines',
    label: 'Engines',
    icon: 'engine'
  },
  {
    name: 'chat',
    path: '/chat',
    label: 'Chat',
    icon: 'chat'
  },
  {
    name: 'info',
    path: '/info',
    label: 'Info',
    icon: 'info'
  }
]

const currentRoute = computed(() => route.name)
</script>

<template>
  <nav class="nav-sidebar">
    <a href="https://github.com/greenmtnboy/space_reporting" target="_blank" rel="noopener noreferrer" class="nav-logo" title="Source code/repo">
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
      </svg>
    </a>

    <div class="nav-items">
      <router-link
        v-for="item in navItems"
        :key="item.name"
        :to="item.path"
        class="nav-item"
        :class="{ active: currentRoute === item.name }"
        :title="item.label"
        :data-testid="`nav-link-${item.name}`"
      >
        <img
          v-if="item.icon === 'rocket'"
          src="/rocket.svg"
          alt="Rockets"
          class="nav-icon"
        />
        <img
          v-else-if="item.icon === 'satellite'"
          src="/satellite.svg"
          alt="Satellites"
          class="nav-icon"
        />
        <img
          v-else-if="item.icon === 'engine'"
          src="/engine.svg"
          alt="Engines"
          class="nav-icon"
        />
        <svg
          v-else-if="item.icon === 'chat'"
          viewBox="0 0 24 24"
          fill="currentColor"
          class="nav-icon nav-icon-svg"
        >
          <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>
        </svg>
        <svg
          v-else-if="item.icon === 'info'"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="nav-icon nav-icon-svg"
        >
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="16" x2="12" y2="12"></line>
          <line x1="12" y1="8" x2="12.01" y2="8"></line>
        </svg>

        <span class="nav-label">{{ item.label }}</span>
      </router-link>
    </div>

    <div class="nav-footer">
      <div class="nav-version">v1.0</div>
    </div>
  </nav>
</template>

<style scoped>
.nav-sidebar {
  width: 60px;
  height: 100%;
  background-color: var(--color-bg-secondary);
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.75rem 0;
  flex-shrink: 0;
}

.nav-logo {
  width: 32px;
  height: 32px;
  color: var(--color-accent);
  margin-bottom: 1.5rem;
  opacity: 0.8;
}

.nav-logo svg {
  width: 100%;
  height: 100%;
}

.nav-items {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  flex: 1;
}

.nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 8px;
  color: var(--color-text-muted);
  text-decoration: none;
  transition: all 0.15s ease;
  position: relative;
}

.nav-item svg {
  width: 22px;
  height: 22px;
}

.nav-icon {
  width: 22px;
  height: 22px;
  filter: invert(70%) sepia(10%) saturate(150%) brightness(110%);
  transition: filter 0.15s ease;
}

.nav-item:hover .nav-icon {
  filter: invert(90%) sepia(10%) saturate(100%) brightness(100%);
}

.nav-item.active .nav-icon {
  filter: invert(65%) sepia(70%) saturate(500%) hue-rotate(170deg) brightness(105%);
}

.nav-icon-svg {
  width: 22px;
  height: 22px;
  color: #9ca3af;
  transition: color 0.15s ease;
}

.nav-item:hover .nav-icon-svg {
  color: #e5e7eb;
}

.nav-item.active .nav-icon-svg {
  color: var(--color-accent-bright, #38bdf8);
}

.nav-item:hover {
  background-color: var(--color-bg-tertiary);
  color: var(--color-text);
}

.nav-item.active {
  background-color: rgba(14, 165, 233, 0.15);
  color: var(--color-accent-bright);
}

.nav-item.active::before {
  content: '';
  position: absolute;
  top: 100%;
  transform: translateY(-50%);
  width: 20px;
  height: 2px;
  background-color: var(--color-accent);
  border-radius: 0 2px 2px 0;
}

.nav-label {
  font-family: var(--font-mono);
  font-size: 0.5rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  margin-top: 2px;
  opacity: 0.8;
}

.nav-footer {
  margin-top: auto;
}

.nav-version {
  font-family: var(--font-mono);
  font-size: 0.5rem;
  color: var(--color-text-muted);
  opacity: 0.5;
}
</style>
