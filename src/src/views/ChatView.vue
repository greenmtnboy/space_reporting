<script setup lang="ts">
import { ref, onMounted, provide, computed } from 'vue'
import {
  useTrilogyChat,
  useTrilogyCore,
  LLMChatSplitView,
} from 'trilogy-studio-components'

// Initialize Trilogy core (all stores/services)
const trilogy = useTrilogyCore()

// Provide stores for child components
provide('llmConnectionStore', trilogy.llmConnectionStore)
provide('connectionStore', trilogy.connectionStore)
provide('editorStore', trilogy.editorStore)
provide('chatStore', trilogy.chatStore)
provide('queryExecutionService', trilogy.queryExecutionService)

// Track DuckDB connection status
const dataConnectionName = 'space-duckdb'
const dbStatus = ref<'loading' | 'ready' | 'error'>('loading')
const dbError = ref<string>('')

// LLM connection state (for provider selection)
const llmStore = trilogy.llmConnectionStore
const showProviderSelector = ref(true)
const selectedProvider = ref('')
const apiKeyInput = ref('')
const selectedModel = ref('')
const loadingModels = ref(false)
const availableModels = ref<{ id: string; name: string }[]>([])
const connectionError = ref('')

const availableProviders = [
  { id: 'anthropic', name: 'Anthropic (Claude)' },
  { id: 'openai', name: 'OpenAI' },
  { id: 'google', name: 'Google (Gemini)' },
  { id: 'mistral', name: 'Mistral' },
]

const hasActiveLLMConnection = computed(() => {
  return llmStore.activeConnection !== ''
})

// Initialize DuckDB connection on mount
onMounted(async () => {
  try {
    // Check if connection already exists (handles navigation/hot reload)
    if (!trilogy.connectionStore.connections[dataConnectionName]) {
      trilogy.connectionStore.newConnection(dataConnectionName, 'duckdb', {})
    }
    
    // Only reset if not already connected
    const conn = trilogy.connectionStore.connections[dataConnectionName]
    if (conn && !conn.connected) {
      await trilogy.connectionStore.resetConnection(dataConnectionName)
    }
    
    console.log('DuckDB connection ready')
    dbStatus.value = 'ready'
    
    // Create a chat with this data connection if none exists
    if (!trilogy.chatStore.activeChatId) {
      trilogy.chatStore.newChat('', dataConnectionName, 'Space Data Chat')
    }
  } catch (error) {
    console.error('Failed to initialize DuckDB:', error)
    dbStatus.value = 'error'
    dbError.value = error instanceof Error ? error.message : 'Unknown error'
  }
})

// Use the chat composable with tools
const chat = useTrilogyChat({
  dataConnectionName,
  initialTitle: 'Space Data Chat',
  persistChat: true,
})

// Connect LLM provider
const connectProvider = async () => {
  connectionError.value = ''
  try {
    const model = selectedModel.value || availableModels.value[0]?.id
    const connName = `${selectedProvider.value}-${Date.now()}`
    
    llmStore.newConnection(connName, selectedProvider.value, {
      apiKey: apiKeyInput.value,
      model: model,
      saveCredential: false,
    })
    
    llmStore.activeConnection = connName
    showProviderSelector.value = false
    
    // Update the chat's LLM connection
    if (trilogy.chatStore.activeChatId) {
      trilogy.chatStore.chats[trilogy.chatStore.activeChatId].llmConnectionName = connName
    }
  } catch (error) {
    connectionError.value = error instanceof Error ? error.message : 'Failed to connect'
  }
}

// Load models when provider/API key change
const loadModels = async () => {
  if (!selectedProvider.value || !apiKeyInput.value) {
    availableModels.value = []
    return
  }
  
  loadingModels.value = true
  connectionError.value = ''
  
  try {
    const modelIds = await llmStore.fetchModelsForProvider(selectedProvider.value, apiKeyInput.value)
    
    // Filter to chat models
    const chatModels = modelIds.filter((id: string) => {
      const lower = id.toLowerCase()
      if (selectedProvider.value === 'openai') {
        return (lower.includes('gpt') || lower.includes('o1') || lower.includes('o3')) && !lower.includes('instruct')
      }
      if (selectedProvider.value === 'google') {
        return lower.includes('gemini')
      }
      return true
    })
    
    availableModels.value = chatModels.map((id: string) => ({ id, name: id }))
    
    if (availableModels.value.length > 0 && !selectedModel.value) {
      selectedModel.value = availableModels.value[0].id
    }
  } catch (error) {
    console.error('Failed to fetch models:', error)
    connectionError.value = error instanceof Error ? error.message : 'Failed to fetch models'
    // Fallback models
    availableModels.value = getDefaultModels(selectedProvider.value)
    if (availableModels.value.length > 0) {
      selectedModel.value = availableModels.value[0].id
    }
  } finally {
    loadingModels.value = false
  }
}

function getDefaultModels(provider: string) {
  switch (provider) {
    case 'anthropic':
      return [
        { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
        { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
      ]
    case 'openai':
      return [{ id: 'gpt-4o', name: 'GPT-4o' }]
    case 'google':
      return [{ id: 'gemini-2.5-pro-preview-05-06', name: 'Gemini 2.5 Pro' }]
    case 'mistral':
      return [{ id: 'mistral-large-latest', name: 'Mistral Large' }]
    default:
      return []
  }
}

const canConnect = computed(() => selectedProvider.value && apiKeyInput.value && selectedModel.value)
const connectionInfo = computed(() => {
  if (!llmStore.activeConnection) return ''
  const conn = llmStore.getConnection(llmStore.activeConnection)
  return conn ? `${conn.name} (${conn.model})` : ''
})

// Debug query execution
const debugResult = ref<string>('')
const debugLoading = ref(false)

const runDebugQuery = async () => {
  debugLoading.value = true
  debugResult.value = 'Running tests...'
  const results: string[] = []
  
  try {
    // Get the connection
    const conn = trilogy.connectionStore.connections[dataConnectionName]
    if (!conn) {
      debugResult.value = 'Error: Connection not found'
      return
    }
    
    // Test 1: Direct DuckDB query
    console.log('Test 1: Direct DuckDB query...')
    try {
      const directResult = await conn.query('SELECT 1 as test')
      console.log('Direct query result:', directResult)
      results.push('✅ Test 1 (Direct DuckDB): Success')
    } catch (e) {
      console.error('Direct query error:', e)
      results.push(`❌ Test 1 (Direct DuckDB): ${e instanceof Error ? e.message : String(e)}`)
    }
    
    // Test 2: QueryExecutionService with SQL (bypasses resolver hash)
    console.log('Test 2: QueryExecutionService (SQL)...')
    try {
      const { resultPromise } = await trilogy.queryExecutionService.executeQuery(
        dataConnectionName,
        { text: 'SELECT 1 as test', editorType: 'sql', imports: [] }
      )
      const result = await resultPromise
      results.push(result.success 
        ? '✅ Test 2 (SQL via Service): Success' 
        : `❌ Test 2 (SQL via Service): ${result.error}`)
    } catch (e) {
      console.error('SQL service error:', e)
      results.push(`❌ Test 2 (SQL via Service): ${e instanceof Error ? e.message : String(e)}`)
    }
    
    // Test 3: Resolver validate_query (triggers createHash for caching)
    console.log('Test 3: Resolver validate_query (uses createHash)...')
    try {
      const validateResult = await trilogy.queryExecutionService.trilogyResolver.validate_query(
        'SELECT 1',
        null,
        null,
        null,
        null
      )
      console.log('Validate result:', validateResult)
      results.push('✅ Test 3 (Resolver validate_query): Success - createHash works!')
    } catch (e) {
      console.error('Resolver validate error:', e)
      results.push(`❌ Test 3 (Resolver validate_query): ${e instanceof Error ? e.message : String(e)}\n   Stack: ${e instanceof Error ? e.stack?.split('\n').slice(0, 5).join('\n   ') : 'N/A'}`)
    }
    
    // Test 4: QueryExecutionService with Trilogy (uses resolver + createHash)
    console.log('Test 4: QueryExecutionService (Trilogy)...')
    try {
      const { resultPromise } = await trilogy.queryExecutionService.executeQuery(
        dataConnectionName,
        { text: 'SELECT 1 as test', editorType: 'trilogy', imports: [] }
      )
      const result = await resultPromise
      results.push(result.success 
        ? '✅ Test 4 (Trilogy via Service): Success' 
        : `❌ Test 4 (Trilogy via Service): ${result.error}`)
    } catch (e) {
      console.error('Trilogy service error:', e)
      results.push(`❌ Test 4 (Trilogy via Service): ${e instanceof Error ? e.message : String(e)}\n   Stack: ${e instanceof Error ? e.stack?.split('\n').slice(0, 5).join('\n   ') : 'N/A'}`)
    }
    
    debugResult.value = results.join('\n\n')
  } catch (error) {
    console.error('Debug query error:', error)
    debugResult.value = `❌ Unexpected error: ${error instanceof Error ? error.message : String(error)}\n\nStack: ${error instanceof Error ? error.stack : 'N/A'}`
  } finally {
    debugLoading.value = false
  }
}
</script>

<template>
  <div class="chat-view">
    <div class="chat-header-bar">
      <h1>Chat with GCAT Data</h1>
      <div class="header-actions">
        <!-- Debug Query Button -->
        <button class="debug-btn" @click="runDebugQuery" :disabled="debugLoading || dbStatus !== 'ready'">
          🔍 Test Query
        </button>
        <div class="db-status" :class="dbStatus">
          <span class="status-dot"></span>
          <span v-if="dbStatus === 'loading'">Initializing DuckDB...</span>
          <span v-else-if="dbStatus === 'ready'">DuckDB Ready</span>
          <span v-else>DuckDB Error: {{ dbError }}</span>
        </div>
      </div>
    </div>
    
    <!-- Debug Result Panel -->
    <div v-if="debugResult" class="debug-panel">
      <div class="debug-result">
        <pre>{{ debugResult }}</pre>
        <button class="debug-close" @click="debugResult = ''">✕</button>
      </div>
    </div>
    
    <!-- Provider Selection - show when no active LLM connection -->
    <div v-if="!hasActiveLLMConnection" class="provider-setup">
      <div class="setup-header">
        <h2>Configure LLM Connection</h2>
        <p>Select a provider to start chatting about your space data.</p>
      </div>

      <div class="setup-form">
        <div class="form-group">
          <label for="provider-select">Provider</label>
          <select id="provider-select" v-model="selectedProvider" @change="loadModels">
            <option value="">Select a provider...</option>
            <option v-for="provider in availableProviders" :key="provider.id" :value="provider.id">
              {{ provider.name }}
            </option>
          </select>
        </div>

        <div class="form-group" v-if="selectedProvider">
          <label for="api-key">API Key</label>
          <input 
            id="api-key" 
            type="password" 
            v-model="apiKeyInput" 
            placeholder="Enter your API key"
            @blur="loadModels" 
          />
        </div>

        <div class="form-group" v-if="selectedProvider && apiKeyInput && availableModels.length > 0">
          <label for="model-select">Model</label>
          <select id="model-select" v-model="selectedModel">
            <option v-for="model in availableModels" :key="model.id" :value="model.id">
              {{ model.name }}
            </option>
          </select>
        </div>

        <div class="form-group" v-if="loadingModels">
          <p class="loading-text">Loading models...</p>
        </div>

        <button class="connect-btn" @click="connectProvider" :disabled="!canConnect">
          Connect
        </button>

        <div v-if="connectionError" class="error-message">
          {{ connectionError }}
        </div>
      </div>
    </div>

    <!-- Chat Interface -->
    <div v-else class="chat-container">
      <LLMChatSplitView
        :title="chat.activeChatTitle.value"
        :editableTitle="true"
        placeholder="Ask about your space data... (Enter to send)"
        :systemPrompt="chat.chatSystemPrompt.value"
        :connectionInfo="connectionInfo"
        :symbols="chat.chatSymbols.value"
        :initialMessages="chat.activeChatMessages.value"
        :initialArtifacts="chat.activeChatArtifacts.value"
        :initialActiveArtifactIndex="chat.activeChatArtifactIndex.value"
        :externalLoading="chat.isChatLoading.value"
        :activeToolName="chat.activeToolName.value"
        :onSendMessage="chat.handleChatMessageWithTools"
        @update:messages="chat.handleMessagesUpdate"
        @update:artifacts="chat.handleArtifactsUpdate"
        @update:activeArtifactIndex="chat.handleActiveArtifactUpdate"
        @title-update="chat.handleTitleUpdate"
      >
        <template #header-actions>
          <div class="chat-header-controls">
            <span v-if="connectionInfo" class="connection-badge">
              {{ connectionInfo }}
            </span>
            <button class="header-btn" @click="showProviderSelector = true" title="Change LLM">
              ⚙️
            </button>
          </div>
        </template>
      </LLMChatSplitView>
    </div>
  </div>
</template>

<style scoped>
.chat-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--color-bg-primary);
}

.chat-header-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1.5rem;
  border-bottom: 1px solid var(--color-border);
  background-color: var(--color-bg-secondary);
}

.chat-header-bar h1 {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--color-text);
  margin: 0;
}

.db-status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
  font-family: var(--font-mono);
  color: var(--color-text-muted);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: var(--color-text-muted);
}

.db-status.loading .status-dot {
  background-color: #f59e0b;
  animation: pulse 1s infinite;
}

.db-status.ready .status-dot {
  background-color: #10b981;
}

.db-status.error .status-dot {
  background-color: #ef4444;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* Header Actions */
.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* Debug Button */
.debug-btn {
  padding: 6px 12px;
  background-color: var(--color-bg-tertiary);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  font-size: 0.75rem;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.debug-btn:hover:not(:disabled) {
  background-color: var(--color-bg-secondary);
}

.debug-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Debug Panel */
.debug-panel {
  background-color: var(--color-bg-tertiary);
  border-bottom: 1px solid var(--color-border);
  padding: 12px 16px;
}

.debug-result {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.debug-result pre {
  flex: 1;
  margin: 0;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--color-text);
}

.debug-close {
  background: transparent;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  padding: 4px;
  font-size: 1rem;
}

.debug-close:hover {
  color: var(--color-text);
}

/* Provider Setup */
.provider-setup {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  padding: 20px;
}

.setup-header {
  text-align: center;
  margin-bottom: 30px;
}

.setup-header h2 {
  margin: 0 0 10px 0;
  font-size: 24px;
  font-weight: 600;
  color: var(--color-text);
}

.setup-header p {
  margin: 0;
  color: var(--color-text-muted);
}

.setup-form {
  width: 100%;
  max-width: 400px;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-weight: 500;
  color: var(--color-text);
}

.form-group select,
.form-group input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  background-color: var(--color-bg-tertiary);
  color: var(--color-text);
  font-size: 0.875rem;
  border-radius: 4px;
}

.loading-text {
  color: var(--color-text-muted);
  font-size: 0.75rem;
  font-style: italic;
}

.connect-btn {
  width: 100%;
  padding: 12px;
  background-color: var(--color-accent);
  color: white;
  border: none;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  margin-top: 10px;
  border-radius: 4px;
}

.connect-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.error-message {
  margin-top: 16px;
  padding: 10px;
  background-color: rgba(244, 67, 54, 0.1);
  border: 1px solid rgba(244, 67, 54, 0.3);
  color: #f44336;
  font-size: 0.75rem;
  border-radius: 4px;
}

/* Chat Container */
.chat-container {
  flex: 1;
  overflow: hidden;
  display: flex;
  min-height: 0; /* Critical for flex children to shrink properly */
  
  /* CSS variables for trilogy-studio-components theming */
  --bg-color: var(--color-bg-primary);
  --text-color: var(--color-text);
  --text-faint: var(--color-text-muted);
  --text-subtle: var(--color-text-muted);
  --border: var(--color-border);
  --border-light: var(--color-border);
  --border-color: var(--color-border);
  --sidebar-bg: var(--color-bg-secondary);
  --sidebar-font: var(--color-text);
  --sidebar-selector-selected-bg: var(--color-accent);
  --sidebar-selector-font: white;
  --query-window-bg: var(--color-bg-tertiary);
  --query-window-font: var(--color-text);
  --result-window-bg: var(--color-bg-primary);
  --button-bg: var(--color-bg-tertiary);
  --button-text: var(--color-text);
  --button-mouseover: var(--color-bg-secondary);
  --special-text: var(--color-accent);
  --font-size: 0.875rem;
  --small-font-size: 0.75rem;
  --editor-bg: var(--color-bg-tertiary);
}

/* Deep overrides for split view layout */
.chat-container :deep(.chat-split-container) {
  display: flex;
  flex-direction: row;
  height: 100%;
  width: 100%;
}

.chat-container :deep(.chat-panel) {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 300px;
  height: 100%;
}

.chat-container :deep(.sidebar-panel) {
  width: 350px;
  min-width: 250px;
  max-width: 500px;
  height: 100%;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--color-border);
  background-color: var(--color-bg-primary);
}

/* LLM Chat Container - ensure full height */
.chat-container :deep(.llm-chat-container) {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--color-bg-primary);
}

/* Chat messages area - fill available space */
.chat-container :deep(.chat-messages) {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  background-color: var(--color-bg-primary);
}

/* Fix textarea styling */
.chat-container :deep(textarea) {
  background-color: var(--color-bg-tertiary) !important;
  color: var(--color-text) !important;
  border: 1px solid var(--color-border) !important;
  border-radius: 6px;
  width: 100%;
  min-height: 44px;
  max-height: 200px;
  padding: 12px 14px;
  font-size: 0.9rem;
  line-height: 1.5;
  resize: none;
  font-family: inherit;
}

.chat-container :deep(textarea:focus) {
  outline: none;
  border-color: var(--color-accent) !important;
  box-shadow: 0 0 0 2px rgba(14, 165, 233, 0.15);
}

.chat-container :deep(textarea::placeholder) {
  color: var(--color-text-muted);
}

/* Fix input container */
.chat-container :deep(.input-container) {
  background-color: var(--color-bg-secondary);
  border-top: 1px solid var(--color-border);
  padding: 12px 16px;
  display: flex;
  gap: 12px;
  align-items: flex-end;
}

/* Fix buttons */
.chat-container :deep(.send-button) {
  background-color: var(--color-accent);
  color: white;
  border: none;
  border-radius: 6px;
  padding: 10px 20px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.15s ease;
  flex-shrink: 0;
  height: 44px;
}

.chat-container :deep(.send-button:hover:not(:disabled)) {
  background-color: var(--color-accent-dim);
}

.chat-container :deep(.send-button:disabled) {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Fix sidebar tabs */
.chat-container :deep(.sidebar-tabs) {
  background-color: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
}

.chat-container :deep(.sidebar-tab) {
  background: transparent;
  color: var(--color-text);
}

.chat-container :deep(.sidebar-tab.active) {
  color: var(--color-accent);
  border-bottom-color: var(--color-accent);
}

/* Fix symbols pane */
.chat-container :deep(.symbols-pane) {
  background-color: var(--color-bg-primary);
  border: none;
  width: 100%;
}

.chat-container :deep(.symbols-search) {
  background-color: var(--color-bg-tertiary);
  color: var(--color-text);
  border: 1px solid var(--color-border);
}

/* Message bubbles */
.chat-container :deep(.message) {
  border-radius: 8px;
}

.chat-container :deep(.message.user) {
  background-color: var(--color-accent);
  color: white;
}

.chat-container :deep(.message.assistant) {
  background-color: var(--color-bg-secondary);
  color: var(--color-text);
}

/* Chat header */
.chat-container :deep(.chat-header) {
  background-color: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
}

.chat-header-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.connection-badge {
  padding: 4px 10px;
  background-color: rgba(76, 175, 80, 0.1);
  color: #4caf50;
  font-size: 0.75rem;
  border: 1px solid rgba(76, 175, 80, 0.3);
  border-radius: 4px;
}

.header-btn {
  background: transparent;
  border: 1px solid var(--color-border);
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  color: var(--color-text);
}

.header-btn:hover {
  background-color: var(--color-bg-secondary);
}
</style>
