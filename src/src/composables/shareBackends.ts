import type { SharedChatData } from './useChatSharing'

export interface ShareBackend {
  id: string
  name: string

  // Check if backend can be used (has credentials, etc.)
  isAvailable(): boolean

  // Create a share, return the URL fragment (e.g., "gist=abc123")
  createShare(data: SharedChatData): Promise<string>

  // Load shared data from identifier
  loadShare(identifier: string): Promise<SharedChatData | null>

  // Check if URL hash matches this backend, return identifier
  parseUrl(hash: string): string | null
}

const GIST_API = 'https://api.github.com/gists'

interface GistFile {
  content: string
}

interface GistResponse {
  id: string
  files: Record<string, GistFile>
}

export function createGistBackend(getToken: () => string): ShareBackend {
  return {
    id: 'gist',
    name: 'GitHub Gist',

    isAvailable() {
      return !!getToken()
    },

    async createShare(data: SharedChatData): Promise<string> {
      const token = getToken()
      if (!token) {
        throw new Error('GitHub token required')
      }

      const res = await fetch(GIST_API, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/vnd.github+json'
        },
        body: JSON.stringify({
          description: `Shared Chat: ${data.title}`,
          public: true,
          files: {
            'chat.json': {
              content: JSON.stringify(data)
            }
          }
        })
      })

      if (!res.ok) {
        if (res.status === 401) {
          throw new Error('Invalid GitHub token')
        }
        if (res.status === 403) {
          throw new Error('Rate limited or token lacks gist scope')
        }
        throw new Error(`GitHub API error: ${res.status}`)
      }

      const gist: GistResponse = await res.json()
      return `gist=${gist.id}`
    },

    async loadShare(gistId: string): Promise<SharedChatData | null> {
      try {
        // Public gists can be read without auth
        const res = await fetch(`${GIST_API}/${gistId}`, {
          headers: {
            'Accept': 'application/vnd.github+json'
          }
        })

        if (!res.ok) {
          console.error('Failed to fetch gist:', res.status)
          return null
        }

        const gist: GistResponse = await res.json()
        const chatFile = gist.files['chat.json']

        if (!chatFile) {
          console.error('Gist does not contain chat.json')
          return null
        }

        const data = JSON.parse(chatFile.content)
        if (!data.messages || !Array.isArray(data.messages)) {
          throw new Error('Invalid chat data structure')
        }

        return data as SharedChatData
      } catch (e) {
        console.error('Failed to load gist:', e)
        return null
      }
    },

    parseUrl(hash: string): string | null {
      const params = new URLSearchParams(hash.slice(1))
      return params.get('gist')
    }
  }
}
