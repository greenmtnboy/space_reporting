# Chat View Spec

## Chat Sharing via Data URLs (2026-01-31)

### Overview

Users can share their chat conversations with others via data URLs. The chat data is encoded in the URL hash, allowing recipients to view the conversation without requiring their own LLM connection.

### Implementation

**Files added/modified**:
- `composables/useChatSharing.ts`: New composable managing share state, encoding/decoding, and clipboard operations
- `views/ChatView.vue`: Updated to detect shared chats, render read-only view, and provide share functionality
- `views/chat-styles/_sharing.css`: New stylesheet for share modal and shared chat view
- `views/chat-styles/index.css`: Updated to import sharing styles

### Features

| Feature | Description |
|---------|-------------|
| **Share button** | Header action to generate shareable URL from current conversation |
| **Data URL encoding** | Chat messages and artifacts encoded as base64 JSON in URL hash |
| **Share modal** | Modal displays shareable URL with copy-to-clipboard functionality |
| **Read-only view** | Recipients can view shared chat without LLM setup |
| **Continue conversation** | Option to set up LLM and continue the shared conversation |
| **Start fresh** | Option to ignore shared chat and start new conversation |
| **URL length indicator** | Shows URL character count with warning for very long chats |

### URL Schema

Chat data is encoded in the URL hash fragment:

```
/chat#share=<base64-encoded-json>
```

**Encoded data structure**:
```typescript
interface SharedChatData {
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
  sharedAt: number  // Timestamp when shared
}
```

### View Modes

The ChatView now supports three view modes:

| Mode | Condition | Description |
|------|-----------|-------------|
| `setup` | No LLM connection, no shared chat | Shows provider selection form |
| `shared` | Shared chat detected, no LLM | Shows read-only shared conversation |
| `chat` | LLM connected | Full interactive chat interface |

### Design Choices

1. **Hash-based encoding**: Uses URL hash (`#share=...`) instead of query params to avoid server-side processing and keep data client-side
2. **Base64 encoding**: Provides URL-safe encoding while preserving all message content including special characters
3. **No compression**: Uses plain JSON for simplicity; very long chats may hit URL length limits
4. **URL length warning**: Warns users when URL exceeds 100KB (may cause issues with some browsers/services)
5. **Read-only by default**: Shared chats shown in read-only mode to clearly indicate it's not the viewer's conversation
6. **Continue option**: Users can choose to continue the conversation by setting up their own LLM connection
7. **Minimal message data**: Only essential message fields (role, content) are included to minimize URL size
8. **Timestamp preservation**: `sharedAt` timestamp shows when the chat was shared

### Limitations

- **URL length**: Very long conversations may exceed browser URL limits (~2MB for most browsers, but some services limit to ~2KB)
- **No real-time updates**: Shared URL is a snapshot; changes to original chat are not reflected
- **No authentication**: Anyone with the URL can view the chat content
- **Artifacts simplified**: Complex artifacts may not render in read-only view

### User Flow

**Sharing a chat**:
1. User has active conversation with messages
2. Clicks "Share" button in header
3. Modal shows generated URL
4. User copies URL and shares with others

**Viewing a shared chat**:
1. Recipient opens shared URL
2. Chat loads in read-only mode showing all messages
3. Recipient can:
   - Read through the conversation
   - Click "Continue This Conversation" to set up LLM and continue
   - Click "Start New Chat" to ignore shared content and start fresh
