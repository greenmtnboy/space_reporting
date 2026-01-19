<script setup lang="ts">
import { ref, onMounted } from 'vue'
import ViewHeader from '../components/ViewHeader.vue'

const currentYear = new Date().getFullYear()

const infoBlocks = [
  {
    title: 'Data Sources',
    content: 'These reports are based on data from McDowell, Jonathan C., 2020. General Catalog of Artificial Space Objects, Release 1.8.0.',
    link: 'https://planet4589.org/space/gcat',
    linkText: 'planet4589.org/space/gcat',
    icon: 'database'
  },
  {
    title: 'Open Source',
    content: 'The project is MIT licensed. Feel free to copy and edit. Source code is available on GitHub.',
    link: 'https://github.com/greenmtnboy/space_reporting',
    linkText: 'GitHub Repository',
    icon: 'code'
  },
  {
    title: 'Analytics & Privacy',
    content: 'Visitors are counted through GoatCounter, a privacy-focused web analytics tool. No personal data is tracked.',
    icon: 'shield'
  },
  {
    title: 'API Tokens',
    content: 'An API token - if provided for chat - is used solely to communicate with remote API servers. It\'s always best to use a unique token that\'s easy to change for any public website.',
    icon: 'key'
  },
  {
    title: 'Data Refresh',
    content: 'Data is refreshed daily, though upstream sources may not always have new data.',
    icon: 'refresh'
  },
  {
    title: 'Feedback',
    content: 'For feedback, requests, or comments, please open issues on the GitHub repository.',
    link: 'https://github.com/greenmtnboy/space_reporting/issues',
    linkText: 'Open GitHub Issue',
    icon: 'message'
  }
]

const isMounted = ref(false)
onMounted(() => {
  isMounted.value = true
})
</script>

<template>
  <div class="info-view" :class="{ 'is-visible': isMounted }" data-testid="info-view">
    <div class="info-container">
    <ViewHeader title="Information">
      <p class="subtitle">This is for fun.</p>
    </ViewHeader>

      <div class="info-grid">
        <div 
          v-for="(block, index) in infoBlocks" 
          :key="block.title"
          class="info-card"
          :style="{ animationDelay: `${index * 0.1}s` }"
        >
          <div class="card-icon">
            <svg v-if="block.icon === 'database'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
              <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path>
              <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path>
            </svg>
            <svg v-else-if="block.icon === 'code'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="16 18 22 12 16 6"></polyline>
              <polyline points="8 6 2 12 8 18"></polyline>
            </svg>
            <svg v-else-if="block.icon === 'shield'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
            </svg>
            <svg v-else-if="block.icon === 'key'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3y-3.5 3.5"></path>
            </svg>
            <svg v-else-if="block.icon === 'refresh'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="23 4 23 10 17 10"></polyline>
              <polyline points="1 20 1 14 7 14"></polyline>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
            </svg>
            <svg v-else-if="block.icon === 'message'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
            </svg>
          </div>
          <div class="card-content">
            <h3>{{ block.title }}</h3>
            <p>{{ block.content }}</p>
            <a v-if="block.link" :href="block.link" target="_blank" rel="noopener noreferrer" class="card-link">
              {{ block.linkText }}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="link-icon">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                <polyline points="15 3 21 3 21 9"></polyline>
                <line x1="10" y1="14" x2="21" y2="3"></line>
              </svg>
            </a>
          </div>
        </div>
      </div>

      <footer class="info-footer">
        <p>&copy; {{ currentYear }} Space Reporting Project. Built for exploration.</p>
      </footer>
    </div>
    
    <!-- Background Elements -->
    <div class="glow-sphere sphere-1"></div>
    <div class="glow-sphere sphere-2"></div>
  </div>
</template>

<style scoped>
.info-view {
  flex: 1;
  background-color: var(--color-bg);
  color: var(--color-text);
  overflow-y: auto;
  padding: 3rem 2rem;
  position: relative;
  display: flex;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.8s ease-out;
}

.info-view.is-visible {
  opacity: 1;
}

.info-container {
  width: 100%;
  max-width: 1000px;
  z-index: 10;
  display: flex;
  flex-direction: column;
  gap: 3rem;
}


.subtitle {
  font-family: var(--font-mono);
  color: var(--color-accent-bright);
  font-size: 0.875rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  opacity: 0.8;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 1.5rem;
}

.info-card {
  background: rgba(13, 15, 20, 0.4);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 16px;
  padding: 1.75rem;
  display: flex;
  gap: 1.25rem;
  transition: all 0.3s cubic-bezier(0.165, 0.84, 0.44, 1);
  animation: fadeInUp 0.6s ease-out both;
}

.info-card:hover {
  transform: translateY(-5px);
  background: rgba(13, 15, 20, 0.6);
  border-color: rgba(14, 165, 233, 0.3);
  box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.5), 0 0 20px -5px rgba(14, 165, 233, 0.1);
}

.card-icon {
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  background: rgba(14, 165, 233, 0.1);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-accent-bright);
}

.card-icon svg {
  width: 24px;
  height: 24px;
}

.card-content {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.card-content h3 {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--color-text);
}

.card-content p {
  font-size: 0.9375rem;
  line-height: 1.5;
  color: var(--color-text-muted);
}

.card-link {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  color: var(--color-accent-bright);
  text-decoration: none;
  margin-top: auto;
  transition: color 0.2s;
}

.card-link:hover {
  color: var(--color-text);
}

.link-icon {
  width: 14px;
  height: 14px;
}

.info-footer {
  text-align: center;
  margin-top: 2rem;
  padding-top: 2rem;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.info-footer p {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--color-text-muted);
  opacity: 0.6;
}

/* Background Effects */
.glow-sphere {
  position: fixed;
  border-radius: 50%;
  filter: blur(100px);
  z-index: 1;
  pointer-events: none;
  opacity: 0.15;
}

.sphere-1 {
  width: 40vw;
  height: 40vw;
  background: radial-gradient(circle, var(--color-accent) 0%, transparent 70%);
  top: -10vw;
  right: -10vw;
}

.sphere-2 {
  width: 30vw;
  height: 30vw;
  background: radial-gradient(circle, #7c3aed 0%, transparent 70%);
  bottom: -5vw;
  left: -5vw;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 640px) {
  .info-view {
    padding: 2rem 1rem;
  }
  
  .info-header h1 {
    font-size: 2rem;
  }
  
  .info-grid {
    grid-template-columns: 1fr;
  }
}
</style>
