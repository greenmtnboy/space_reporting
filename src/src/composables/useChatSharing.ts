import { ref, computed } from 'vue'

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

const SHARE_PARAM = 'share'

/**
 * Compress and encode chat data for URL sharing
 * Uses URL-safe base64 (+ -> -, / -> _, no padding =)
 */
function encodeShareData(data: SharedChatData): string {
  try {
    const json = JSON.stringify(data)
    // Use base64 encoding, then make URL-safe
    const base64 = btoa(unescape(encodeURIComponent(json)))
    // Convert to URL-safe base64: + -> -, / -> _, remove padding =
    const urlSafe = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    return urlSafe
  } catch (e) {
    console.error('Failed to encode share data:', e)
    throw new Error('Failed to encode chat data')
  }
}

/**
 * Decode shared chat data from URL parameter
 * Handles URL-safe base64 (- -> +, _ -> /, adds padding)
 */
function decodeShareData(encoded: string): SharedChatData | null {
  try {
    // Convert URL-safe base64 back to standard base64
    let base64 = encoded.replace(/-/g, '+').replace(/_/g, '/')
    // Add padding if needed
    const pad = base64.length % 4
    if (pad) {
      base64 += '='.repeat(4 - pad)
    }
    const json = decodeURIComponent(escape(atob(base64)))
    const data = JSON.parse(json)

    // Validate structure
    if (!data.messages || !Array.isArray(data.messages)) {
      throw new Error('Invalid chat data: missing messages')
    }

    return data as SharedChatData
  } catch (e) {
    console.error('Failed to decode share data:', e)
    return null
  }
}

/**
 * Extract share data from current URL hash
 */
function getShareDataFromUrl(): string | null {
  const hash = window.location.hash
  if (!hash) return null

  // Parse hash as query params: #share=xxx
  const params = new URLSearchParams(hash.slice(1))
  return params.get(SHARE_PARAM)
}

/**
 * Generate a shareable URL with encoded chat data
 */
function generateShareUrl(data: SharedChatData): string {
  const encoded = encodeShareData(data)
  const baseUrl = window.location.origin + window.location.pathname
  return `${baseUrl}#${SHARE_PARAM}=${encoded}`
}

export function useChatSharing() {
  const isSharedChat = ref(false)
  const sharedChatData = ref<SharedChatData | null>(null)
  const shareUrl = ref('')
  const showShareModal = ref(false)
  const shareError = ref('')
  const copySuccess = ref(false)

  // Check URL for shared data on mount
  function checkForSharedChat() {
    const encoded = getShareDataFromUrl()
    if (encoded) {
      const data = decodeShareData(encoded)
      if (data) {
        isSharedChat.value = true
        sharedChatData.value = data
        return true
      }
    }
    return false
  }

  // Generate share URL from current chat data
  function createShareUrl(
    title: string,
    messages: SharedChatMessage[],
    imports?: SharedChatImport[],
    artifacts?: Array<{ type: string; content: string; title?: string }>
  ) {
    shareError.value = ''
    copySuccess.value = false

    try {
      // Preserve all message data for full fidelity
      const cleanMessages = messages.map(msg => ({ ...msg }))

      // Include imports for context
      const cleanImports = imports?.map(imp => ({ ...imp }))

      // Optionally include artifacts (simplified)
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

      shareUrl.value = generateShareUrl(data)

      return true
    } catch (e) {
      shareError.value = e instanceof Error ? e.message : 'Failed to create share URL'
      return false
    }
  }

  // Copy share URL to clipboard
  async function copyShareUrl() {
    if (!shareUrl.value) return false

    try {
      await navigator.clipboard.writeText(shareUrl.value)
      copySuccess.value = true
      setTimeout(() => {
        copySuccess.value = false
      }, 2000)
      return true
    } catch (e) {
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
    // Remove hash from URL without triggering reload
    const url = window.location.origin + window.location.pathname + window.location.search
    window.history.replaceState(null, '', url)
  }

  // Open share modal
  function openShareModal(
    title: string,
    messages: SharedChatMessage[],
    imports?: SharedChatImport[],
    artifacts?: Array<{ type: string; content: string; title?: string }>
  ) {
    if (createShareUrl(title, messages, imports, artifacts)) {
      showShareModal.value = true
    }
    else {
      console.log('Failed to create share URL:', shareError.value)
    }
  }

  // Close share modal
  function closeShareModal() {
    showShareModal.value = false
    shareUrl.value = ''
    copySuccess.value = false
  }

  const shareUrlLength = computed(() => shareUrl.value.length)
  const isUrlTooLong = computed(() => shareUrl.value.length > 2000000) // 2MB - most browsers
  const isSafariWarning = computed(() => shareUrl.value.length > 80000) // 80KB - Safari limit

  return {
    // State
    isSharedChat,
    sharedChatData,
    shareUrl,
    showShareModal,
    shareError,
    copySuccess,
    shareUrlLength,
    isUrlTooLong,
    isSafariWarning,

    // Methods
    checkForSharedChat,
    createShareUrl,
    copyShareUrl,
    clearSharedChat,
    openShareModal,
    closeShareModal
  }
}
