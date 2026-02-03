import { ref, computed } from 'vue'
import { createGistBackend, type ShareBackend } from './shareBackends'

export interface SharedChatMessage {
  role: string
  content: string
  [key: string]: unknown  // Allow additional properties (tool calls, etc.)
}

export interface SharedChatImport {
  name: string
  alias?: string
  [key: string]: unknown  // Allow additional properties
}

export interface SharedChatData {
  title: string
  messages: SharedChatMessage[]
  imports?: SharedChatImport[]
  artifacts?: Array<{
    type: string
    content: string
    title?: string
  }>
  sharedAt: number
}

const TOKEN_STORAGE_KEY = 'github-gist-token'

export function useChatSharing() {
  // Token management
  const githubToken = ref(localStorage.getItem(TOKEN_STORAGE_KEY) || '')

  function setGitHubToken(token: string) {
    githubToken.value = token
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token)
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY)
    }
  }

  // Create backend instance
  const backend: ShareBackend = createGistBackend(() => githubToken.value)

  // State
  const isSharedChat = ref(false)
  const sharedChatData = ref<SharedChatData | null>(null)
  const shareUrl = ref('')
  const showShareModal = ref(false)
  const shareError = ref('')
  const copySuccess = ref(false)
  const isSharing = ref(false)

  // Check URL for shared data on mount
  async function checkForSharedChat(): Promise<boolean> {
    const hash = window.location.hash
    if (!hash) return false

    const gistId = backend.parseUrl(hash)
    if (gistId) {
      const data = await backend.loadShare(gistId)
      if (data) {
        isSharedChat.value = true
        sharedChatData.value = data
        return true
      }
    }

    return false
  }

  // Generate share URL from current chat data
  async function createShareUrl(
    title: string,
    messages: SharedChatMessage[],
    imports?: SharedChatImport[],
    artifacts?: Array<{ type: string; content: string; title?: string }>
  ): Promise<boolean> {
    shareError.value = ''
    copySuccess.value = false
    isSharing.value = true

    try {
      if (!backend.isAvailable()) {
        throw new Error('GitHub token required. Please enter your token below.')
      }

      const cleanMessages = messages.map(msg => ({ ...msg }))
      const cleanImports = imports?.map(imp => ({ ...imp }))
      const cleanArtifacts = artifacts?.map(art => ({
        type: art.type,
        content: art.content,
        title: art.title
      }))

      const data: SharedChatData = {
        title: title || 'Shared Chat',
        messages: cleanMessages,
        imports: cleanImports,
        artifacts: cleanArtifacts,
        sharedAt: Date.now()
      }

      const fragment = await backend.createShare(data)
      const baseUrl = window.location.origin + window.location.pathname
      shareUrl.value = `${baseUrl}#${fragment}`

      return true
    } catch (e) {
      shareError.value = e instanceof Error ? e.message : 'Failed to create share'
      return false
    } finally {
      isSharing.value = false
    }
  }

  // Copy share URL to clipboard
  async function copyShareUrl(): Promise<boolean> {
    if (!shareUrl.value) return false

    try {
      await navigator.clipboard.writeText(shareUrl.value)
      copySuccess.value = true
      setTimeout(() => {
        copySuccess.value = false
      }, 2000)
      return true
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea')
      textarea.value = shareUrl.value
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      try {
        document.execCommand('copy')
        copySuccess.value = true
        setTimeout(() => {
          copySuccess.value = false
        }, 2000)
        return true
      } catch {
        shareError.value = 'Failed to copy to clipboard'
        return false
      } finally {
        document.body.removeChild(textarea)
      }
    }
  }

  // Clear shared state and URL hash
  function clearSharedChat() {
    isSharedChat.value = false
    sharedChatData.value = null
    const url = window.location.origin + window.location.pathname + window.location.search
    window.history.replaceState(null, '', url)
  }

  // Open share modal
  async function openShareModal(
    title: string,
    messages: SharedChatMessage[],
    imports?: SharedChatImport[],
    artifacts?: Array<{ type: string; content: string; title?: string }>
  ) {
    showShareModal.value = true
    await createShareUrl(title, messages, imports, artifacts)
  }

  // Close share modal
  function closeShareModal() {
    showShareModal.value = false
    shareUrl.value = ''
    copySuccess.value = false
    shareError.value = ''
  }

  const hasGitHubToken = computed(() => !!githubToken.value)

  return {
    // State
    isSharedChat,
    sharedChatData,
    shareUrl,
    showShareModal,
    shareError,
    copySuccess,
    isSharing,
    hasGitHubToken,
    githubToken,

    // Methods
    checkForSharedChat,
    createShareUrl,
    copyShareUrl,
    clearSharedChat,
    openShareModal,
    closeShareModal,
    setGitHubToken
  }
}
