<script setup lang="ts">
import { ref, onMounted, provide, computed } from 'vue'
import {
  useTrilogyChat,
  useTrilogyCore,
  LLMChatSplitView,
} from '@trilogy-data/trilogy-studio-components'
import ViewHeader from '../components/ViewHeader.vue'

// Initialize Trilogy core (all stores/services)
const trilogy = useTrilogyCore()

// Provide stores for child components
provide('llmConnectionStore', trilogy.llmConnectionStore)
provide('connectionStore', trilogy.connectionStore)
provide('editorStore', trilogy.editorStore)
provide('chatStore', trilogy.chatStore)
provide('userSettingsStore', trilogy.userSettingsStore)
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
  // { id: 'mistral', name: 'Mistral' },
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

    // Ensure dark theme is set for Vega-Lite and other components
    trilogy.userSettingsStore.loadSettings()
    if (!trilogy.userSettingsStore.settings.theme) {
      trilogy.userSettingsStore.updateSetting('theme', 'dark')
      trilogy.userSettingsStore.saveSettings()
    }
    trilogy.userSettingsStore.toggleTheme()
    
    // Create a chat with this data connection if none exists
    if (!trilogy.chatStore.activeChatId) {
      trilogy.chatStore.newChat('', dataConnectionName, 'Chat with GCAT Data')
    }

    // Ensure production resolver is used
    trilogy.resolver.settingStore.loadSettings()
    const currentResolver = trilogy.resolver.settingStore.settings.trilogyResolver
    if (!currentResolver || currentResolver.includes('localhost')) {
      trilogy.resolver.settingStore.updateSetting('trilogyResolver', 'https://trilogy-service.fly.dev')
      trilogy.resolver.settingStore.saveSettings()
    }

    // Load bundled models
    try {
      const modelsUrl = `${import.meta.env.BASE_URL}models.json`
      console.log(`Fetching models from ${modelsUrl}...`)
      const response = await fetch(modelsUrl)
      if (response.ok) {
        const models = await response.json()
        console.log(`Loaded ${models.length} models from bundle`)
        
        models.forEach((model: any) => {
          // Check if editor already exists (using base name like 'etl')
          if (!trilogy.editorStore.editors[model.name]) {
            console.log(`Creating editor for model: ${model.name} on connection: ${dataConnectionName}`)
            trilogy.editorStore.newEditor(model.name, 'preql', dataConnectionName, model.contents)
          } else {
            console.log(`Editor for model ${model.name} already exists.`)
          }
        })
      }
    } catch (modelError) {
      console.error('Failed to load bundled models:', modelError)
    }
  } catch (error) {
    console.error('Failed to initialize DuckDB:', error)
    dbStatus.value = 'error'
    dbError.value = error instanceof Error ? error.message : 'Unknown error'
  }
})

const handlePaste = () => {
  setTimeout(loadModels, 0)
}

// Reset chat - clear messages and start fresh
function resetChat() {
  if (trilogy.chatStore.activeChatId) {
    // Clear existing chat data
    trilogy.chatStore.clearChatMessages(trilogy.chatStore.activeChatId)
  } else {
    // Create new chat if none exists
    trilogy.chatStore.newChat('', dataConnectionName, 'Space Data Chat')
  }
}

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
  if (!selectedProvider.value) {
    availableModels.value = []
    return
  }
  
  // If no API key, just show default models but don't try to fetch
  if (!apiKeyInput.value) {
    availableModels.value = getDefaultModels(selectedProvider.value)
    if (availableModels.value.length > 0 && !selectedModel.value) {
      selectedModel.value = availableModels.value[0].id
    }
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
        return lower.startsWith('gpt-5.')
      }
      if (selectedProvider.value === 'google') {
        return lower.includes('-flash')
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
      return [
        { id: 'gpt-5.2', name: 'GPT-5.2' }, 
      ]
    case 'google':
      return [{ id: 'models/gemini-2.5-flash', name: 'models/gemini-2.5-flash' }]
    // case 'mistral':
    //   return [{ id: 'mistral-large-latest', name: 'Mistral Large' }]
    default:
      return []
  }
}

const canConnect = computed(() => selectedProvider.value && apiKeyInput.value && selectedModel.value)

const connectTooltip = computed(() => {
  if (canConnect.value) return 'Connect to LLM'
  const missing = []
  if (!selectedProvider.value) missing.push('provider')
  if (!apiKeyInput.value) missing.push('API key')
  if (!selectedModel.value) missing.push('model')
  return `Missing: ${missing.join(', ')}`
})

const connectionInfo = computed(() => {
  if (!llmStore.activeConnection) return ''
  const conn = llmStore.getConnection(llmStore.activeConnection)
  return conn ? `${conn.name} (${conn.model})` : ''
})

const activeDatasets = computed(() => {
  return chat.activeImportsForChat.value.map(imp => imp.alias || imp.name)
})
</script>

<template>
  <div class="chat-view">
    <!-- Provider Selection - show when no active LLM connection -->
    <div v-if="!hasActiveLLMConnection" class="provider-setup">
      <div class="setup-header">
        <h1>Chat with GCAT Data</h1>
        <div class="db-status-badge" :class="dbStatus">
          <span class="status-dot"></span>
          <span v-if="dbStatus === 'loading'">Initializing Local Database...</span>
          <span v-else-if="dbStatus === 'ready'">Database Ready</span>
          <span v-else>Database Creation Error</span>
        </div>
        <p>Select an AI provider to start chatting about space data.</p>
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
          <div class="input-with-cta">
            <input 
              id="api-key" 
              type="password" 
              v-model="apiKeyInput" 
              placeholder="Enter your API key"
              @blur="loadModels"
              @paste="handlePaste"
            />
            <button 
              v-if="apiKeyInput && availableModels.length === 0" 
              class="cta-btn" 
              @click="loadModels"
              title="Fetch models for this API key"
            >
              Fetch Models
            </button>
          </div>
        </div>

        <div class="form-group" v-if="selectedProvider">
          <label for="model-select">Model</label>
          <select 
            id="model-select" 
            v-model="selectedModel" 
            :disabled="!apiKeyInput || loadingModels"
          >
            <option v-if="availableModels.length === 0" value="">
              {{ apiKeyInput ? 'Loading models...' : 'Enter API key to see models' }}
            </option>
            <option v-for="model in availableModels" :key="model.id" :value="model.id">
              {{ model.name }}
            </option>
          </select>
        </div>

        <div class="form-group" v-if="loadingModels">
          <p class="loading-text">Loading models...</p>
        </div>

        <button 
          class="connect-btn" 
          @click="connectProvider" 
          :disabled="!canConnect"
          :title="connectTooltip"
        >
          Connect
        </button>

        <div v-if="connectionError" class="error-message">
          {{ connectionError }}
        </div>
      </div>
    </div>

    <!-- Chat Interface -->
    <div v-else class="chat-interface">
      <ViewHeader :title="chat.activeChatTitle.value">
        <div v-if="activeDatasets.length > 0" class="looking-at">
          <span class="looking-at-label">Looking at:</span>
          <div class="dataset-tags">
            <span v-for="name in activeDatasets" :key="name" class="dataset-tag">{{ name }}</span>
          </div>
        </div>

        <template #actions>
          <div class="header-actions">
            <button class="header-action-btn primary" @click="resetChat" title="New Chat">
              <i class="mdi mdi-refresh"></i>
              <span class="desktop-only">New Chat</span>
            </button>
            
            <div class="db-status mini" :class="dbStatus" :title="dbError || dbStatus">
              <span class="status-dot"></span>
              <span class="status-text desktop-only">DuckDB</span>
            </div>
            
            <span v-if="connectionInfo" class="connection-badge">
              {{ connectionInfo }}
            </span>
            
            <button class="header-action-btn" @click="showProviderSelector = true; llmStore.activeConnection = ''" title="Change LLM">
              <i class="mdi mdi-cog-outline"></i>
            </button>
          </div>
        </template>
      </ViewHeader>

      <div class="chat-container">
        <LLMChatSplitView
          :editableTitle="true"
          :showHeader="false"
          :placeholder="['What rockets have the most engines?', 'Plot the top launch sites in Asia.', 'What\'s the biggest GEO satellite cluster?']"
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
        />
      </div>
    </div>
  </div>
</template>

<!-- Styles are modularized in ./chat-styles/ directory -->
<style scoped>
@import './chat-styles/index.css';
</style>

