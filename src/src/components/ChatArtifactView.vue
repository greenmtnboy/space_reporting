<script setup lang="ts">
import { ref, watch } from 'vue'
import {
  MarkdownRenderer,
  DataTable,
  VegaLiteChart,
} from '@trilogy-data/trilogy-studio-components/dashboard'
import type { ChatArtifact } from '@trilogy-data/trilogy-studio-components/llm'

const props = defineProps<{
  artifact: ChatArtifact
  /**
   * 'panel' fills a sized container (the wide-screen side panel); 'inline'
   * sizes itself, for a card sitting in the scrolling conversation.
   */
  variant?: 'panel' | 'inline'
}>()

// 'chart' doubles as the "primary" view: the chart for chart artifacts, the
// rendered report for markdown ones.
const tab = ref<'chart' | 'table'>(props.artifact.type === 'results' ? 'table' : 'chart')

// A tab bar swaps which artifact is bound here, so the view has to follow.
watch(
  () => props.artifact.id,
  () => {
    tab.value = props.artifact.type === 'results' ? 'table' : 'chart'
  },
)

// For chart/results artifacts, data is a Results instance directly.
// For markdown artifacts, data is { markdown: string, queryResults: Results }.
function getResults(artifact: ChatArtifact): any {
  if (artifact.type === 'chart' || artifact.type === 'results') return artifact.data
  if (artifact.type === 'markdown') return artifact.data?.queryResults ?? null
  return null
}

function getMarkdown(artifact: ChatArtifact): string {
  if (!artifact.data) return ''
  if (typeof artifact.data === 'string') return artifact.data
  if (artifact.data.markdown) return artifact.data.markdown
  return JSON.stringify(artifact.data, null, 2)
}
</script>

<template>
  <div
    class="artifact-content"
    :class="[
      `artifact-content--${artifact.type}`,
      { 'artifact-content--inline': variant === 'inline' },
    ]"
  >
    <!-- Chart artifact: chart/table toggle -->
    <template v-if="artifact.type === 'chart' && getResults(artifact)">
      <div class="artifact-view-toggle">
        <button :class="['toggle-btn', { active: tab === 'chart' }]" @click="tab = 'chart'">
          <i class="mdi mdi-chart-bar"></i> Chart
        </button>
        <button :class="['toggle-btn', { active: tab === 'table' }]" @click="tab = 'table'">
          <i class="mdi mdi-table"></i> Table
        </button>
      </div>

      <div class="artifact-render-area">
        <VegaLiteChart
          v-if="tab === 'chart'"
          :data="getResults(artifact)!.data"
          :columns="getResults(artifact)!.headers"
          :initial-config="artifact.config?.chartConfig || undefined"
          :show-controls="false"
        />
        <DataTable
          v-else
          :headers="getResults(artifact)!.headers"
          :results="getResults(artifact)!.data"
          :flush-chrome="true"
          :fit-parent="true"
        />
      </div>
    </template>

    <!-- Results artifact: table only -->
    <template v-else-if="artifact.type === 'results' && getResults(artifact)">
      <div class="artifact-render-area">
        <DataTable
          :headers="getResults(artifact)!.headers"
          :results="getResults(artifact)!.data"
          :flush-chrome="true"
          :fit-parent="true"
        />
      </div>
    </template>

    <!-- Markdown artifact (may also have queryResults for table view) -->
    <template v-else-if="artifact.type === 'markdown'">
      <div v-if="getResults(artifact)" class="artifact-view-toggle">
        <button :class="['toggle-btn', { active: tab === 'chart' }]" @click="tab = 'chart'">
          <i class="mdi mdi-language-markdown"></i> Report
        </button>
        <button :class="['toggle-btn', { active: tab === 'table' }]" @click="tab = 'table'">
          <i class="mdi mdi-table"></i> Table
        </button>
      </div>

      <div v-if="tab === 'table' && getResults(artifact)" class="artifact-render-area">
        <DataTable
          :headers="getResults(artifact)!.headers"
          :results="getResults(artifact)!.data"
          :flush-chrome="true"
          :fit-parent="true"
        />
      </div>
      <div v-else class="artifact-render-area artifact-markdown">
        <MarkdownRenderer :markdown="getMarkdown(artifact)" :results="getResults(artifact)" />
      </div>
    </template>

    <!-- Code artifact -->
    <template v-else-if="artifact.type === 'code'">
      <div class="artifact-render-area artifact-code">
        <pre><code>{{ typeof artifact.data === 'string' ? artifact.data : JSON.stringify(artifact.data, null, 2) }}</code></pre>
      </div>
    </template>

    <!-- Fallback -->
    <template v-else>
      <div class="artifact-render-area artifact-fallback">
        <pre>{{ JSON.stringify(artifact.data, null, 2) }}</pre>
      </div>
    </template>
  </div>
</template>

<style scoped>
@import '../views/chat-styles/_artifact-content.css';
</style>
