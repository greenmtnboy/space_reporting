import { ref, computed } from 'vue'

export interface SharedChatData {
  title: string
  messages: Array<{
    role: 'user' | 'assistant'
    content: string
  }>
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
 */
function encodeShareData(data: SharedChatData): string {
  try {
    const json = JSON.stringify(data)
    // Use base64 encoding for URL safety
    const base64 = btoa(unescape(encodeURIComponent(json)))
    return base64
  } catch (e) {
    console.error('Failed to encode share data:', e)
    throw new Error('Failed to encode chat data')
  }
}

/**
 * Decode shared chat data from URL parameter
 */
function decodeShareData(encoded: string): SharedChatData | null {
  try {
    const json = decodeURIComponent(escape(atob(encoded)))
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
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    artifacts?: Array<{ type: string; content: string; title?: string }>
  ) {
    shareError.value = ''
    copySuccess.value = false

    try {
      // Filter to only essential message data
      const cleanMessages = messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }))

      // Optionally include artifacts (simplified)
      const cleanArtifacts = artifacts?.map(art => ({
        type: art.type,
        content: art.content,
        title: art.title
      }))

      const data: SharedChatData = {
        title: title || 'Shared Chat',
        messages: cleanMessages,
        artifacts: cleanArtifacts,
        sharedAt: Date.now()
      }

      shareUrl.value = generateShareUrl(data)

      // Check URL length - browsers typically support ~2000 chars,
      // but data URLs in hash can be longer
      if (shareUrl.value.length > 100000) {
        shareError.value = 'Chat is too long to share via URL. Consider sharing a shorter conversation.'
        return false
      }

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
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    artifacts?: Array<{ type: string; content: string; title?: string }>
  ) {
    if (createShareUrl(title, messages, artifacts)) {
      showShareModal.value = true
    }
  }

  // Close share modal
  function closeShareModal() {
    showShareModal.value = false
    shareUrl.value = ''
    copySuccess.value = false
  }

  const shareUrlLength = computed(() => shareUrl.value.length)
  const isUrlTooLong = computed(() => shareUrl.value.length > 100000)

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

    // Methods
    checkForSharedChat,
    createShareUrl,
    copyShareUrl,
    clearSharedChat,
    openShareModal,
    closeShareModal
  }
}
