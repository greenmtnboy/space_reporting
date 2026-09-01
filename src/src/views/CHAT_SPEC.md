# Chat View Spec

## Embedded Artifacts on Narrow Screens (2026-09-01)

### Overview

Below 768px the chat used to split into two 50% rows — conversation on top,
artifact panel below. Neither half was tall enough to be useful: a chart got
about a third of a phone screen, and reading the answer that produced it meant
scrolling a second, nested scroll area. Artifacts are now embedded in the
conversation itself on narrow screens, as full-width cards in the message
stream. The wide-screen side panel is unchanged.

### Implementation

| Piece | Location |
|-------|----------|
| `ChatArtifactView` — renders one artifact's body (chart/table/report/code) | `components/ChatArtifactView.vue` |
| Artifact body styles, including the `inline` variant | `views/chat-styles/_artifact-content.css` |
| Card chrome, split pane, tab bar | `views/chat-styles/_artifacts.css` |
| `isNarrow`, `conversation` (messages + artifacts interleaved) | `views/ChatView.vue` |

The artifact body was previously inlined in `ChatView`'s template. It is now one
component used by both layouts, with a `variant` prop (`'panel'` | `'inline'`)
for the one thing that genuinely differs: a panel fills its container, a card
has to size itself.

### Placement

The library already tracks this. When the tool loop creates a `chart` or
`markdown` artifact, `chatStore` appends an **artifact-carrier message** — an
empty assistant message with the artifact attached — so the message stream
itself records where each artifact belongs:

```ts
// upstream lib/stores/chatStore.ts
addArtifact: (artifact) => {
  this.addArtifactToChat(chatId, artifact)
  if (artifact.type === 'chart' || artifact.type === 'markdown') {
    this.addMessageToChat(chatId, { role: 'assistant', content: '', artifact, hidden: false })
  }
}
```

`ChatView` was dropping them: its `visibleMessages` filter required
`m.content || m.executedToolCalls?.length`, and a carrier has neither. The
filter now also keeps `m.artifact`, and `conversation` walks the visible
messages emitting a message item, an artifact item, or both.

Two cases have no carrier and are appended at the end rather than left
invisible:

- **`results` artifacts** — the installed version only creates carriers for
  `chart` and `markdown`. Upstream `main` adds `results` to that list, so those
  will place themselves once it ships.
- **Anything the chat was seeded with**, e.g. a continued shared chat.

Dedupe is by artifact id, since an artifact reaches the view through both the
carrier message and the flat `activeChatArtifacts` list.

### Design Choices

1. **Placement comes from the library, not from us**: an earlier revision of
   this view recorded its own anchor per artifact as it arrived. That was
   in-memory only, so reloading a persisted chat dumped every artifact at the
   end. Carrier messages are persisted with the chat, so the placement survives
   a reload for free.
2. **A JS breakpoint, not just CSS**: embedding moves artifacts to a different
   place in the DOM, which a media query cannot do. `isNarrow` comes from
   `matchMedia('(max-width: 768px)')` and must stay in step with the breakpoint
   in `_artifacts.css`.
3. **Carriers are skipped, not rendered blank, on wide screens**: the side panel
   shows the artifact there, so a carrier contributes no message bubble.
4. **One card per artifact, no tab bar**: on a phone you scroll to an artifact
   instead of hunting for its tab. The tab bar stays on wide screens where the
   panel shows one artifact at a time.
5. **Cards are `flex-shrink: 0`**: the message stream is a column flex
   container, so without this a card is squashed to fit the leftover space
   rather than scrolled to — it rendered 125px tall instead of 351px.
6. **Fixed 320px card height for charts and tables**: Vega and Tabulator both
   need a definite height to lay out into, and the card has no parent height to
   inherit.
7. **Reports and code flow instead**: a long report inside a short scroll box
   inside a scrolling conversation is the nested-scrolling trap this layout
   exists to remove, so those run to their natural height, capped at `70vh`.
8. **Each card owns its chart/table toggle**: the state moved into
   `ChatArtifactView`, so flipping one card to its table view does not flip
   every other card.

### Floating Chrome Theming (2026-09-01)

`DataTable`'s copy/download buttons and `VegaLiteChart`'s controls were
rendering as near-white rectangles over the dark theme. They are not broken —
the library reads four custom properties for them and falls back to light-mode
values when nobody defines them:

```css
/* upstream lib/components/DataTable.vue */
border: 1px solid var(--overlay-border, rgba(148, 163, 184, 0.24));
background-color: var(--floating-surface-strong, rgba(255, 255, 255, 0.96));
color: var(--floating-text, var(--text-color, #333333));
```

`style.css` already maps a block of these library tokens onto our palette; the
floating set was simply missing from it. Added there — `--floating-surface`,
`--floating-surface-strong`, `--floating-text`, `--overlay-border`,
`--surface-shadow`, plus `--text-color-muted` for the disabled state.

Deliberately *not* done with `:deep(.control-btn)` overrides: the custom
properties are the library's own theming seam (it defines the same four in
`lib/embedTheme.css`), so this keeps working if the button markup changes, and
it covers every consumer — tooltips and error cards read the same variables.
The surfaces stay translucent because the library pairs them with
`backdrop-filter: blur()`, and follow upstream's dark convention where `-strong`
is the more opaque resting surface and the plain one is the lighter hover.

### Empty-Message Guard (2026-09-01)

The artifact-carrier messages this view relies on are empty assistant turns, and
the installed library sends the chat's raw message list to the provider
(`getMessages: () => chat.messages`), so they reach the wire.

**Measured against the live Anthropic API** (claude-opus-5, claude-opus-4-8,
claude-sonnet-4-6 — the app's Anthropic default):

| Message shape | Result |
|---|---|
| control, no empty content | 200 |
| `{role: "assistant", content: ""}` mid-history | **200 — accepted** |
| `{role: "assistant", content: [{type: "text", text: ""}]}` mid-history | **400** `text content blocks must be non-empty` |
| `{role: "assistant", content: ""}` trailing | 200 |

So upstream's note on `Chat.getLLMMessages()` — "Anthropic rejects empty-content
messages mid-history" — is imprecise. The constraint is on empty *text blocks*,
not bare empty strings, and the Anthropic adapter emits the bare form for a
carrier (both places it builds a text block guard on `if (msg.content)` first).
**Anthropic was never broken by this.**

The Google adapter is the actual exposure. Its regular-message branch builds
`parts: [{text: message.content}]`, so a carrier becomes `parts: [{text: ""}]` —
the block-shaped form, i.e. the one Anthropic demonstrably rejects. Untested
against Gemini (no key available), but that is the concrete risk
`utils/llmHistoryGuard.ts` exists for. OpenAI emits the bare form, like
Anthropic.

| Choice | Rationale |
|--------|-----------|
| The guard wraps `llmConnectionStore.generateCompletion` | The only interception point the app owns. For a persisted chat `handleChatMessageWithTools` hands straight to `chatStore.executeMessage` and **ignores the history argument its caller passed** — filtering in `ChatView` before the call would be a no-op. Wrapping the one method every adapter routes through is also what makes it cover Google, which is the provider that needs it. |
| Drops only on text AND tool calls AND tool results all being absent | A tool-call turn legitimately has empty content and must survive; that is the exact shape a carrier lacks. |
| Idempotent, flagged on the store | `ChatView` can remount; without the flag each mount would stack another wrapper. |

Kept as cheap insurance rather than a fix for a live break. Monkey-patching a
store method is invasive, so it can go the moment the library ships
`getLLMMessages()` — check on the next version bump.

### Upstream Notes

Checked against `trilogy-data/trilogy-studio-core` @ `d85ef50` while the app is
on `@trilogy-data/trilogy-studio-components` 0.1.22 (0.1.23 is the latest
published).

- `ChatArtifact.vue` and `ArtifactsPane.vue` exist upstream but are **not**
  exported from any package entry point (`entry.dashboard.ts`, `entry.llm.ts`).
  Only `MarkdownRenderer`, `DataTable` and `VegaLiteChart` are public, which is
  what `ChatArtifactView` composes — there is nothing to swap it for today.
- On `main`, `Chat` gains `getLLMMessages()`, which strips carrier messages from
  LLM history with the note that "Anthropic rejects empty-content messages
  mid-history". 0.1.22 and 0.1.23 pass `chat.messages` to the loop unfiltered,
  so carriers do reach the provider on the version we run. Not reproduced here,
  but worth watching if Anthropic chats start erroring after a chart is made.

## Library Upgrade & Demo Login (2026-04-07)

### Overview

Upgraded `@trilogy-data/trilogy-studio-components` from 0.1.7 to 0.1.22. Replaced the removed `LLMChatSplitView` component with a custom chat UI using `MarkdownRenderer` from `@trilogy-data/trilogy-studio-components/dashboard`. Added demo provider login support.

### Key Changes

| Change | Details |
|--------|---------|
| **Import paths** | Switched from bare `@trilogy-data/trilogy-studio-components` (removed) to subpath exports: `./dashboard` for `useTrilogyCore`, `useTrilogyChat`, `MarkdownRenderer`; `./llm` for types |
| **Demo provider** | Added "Demo (limited messages)" option using library's `DemoProvider` — no API key needed, auto-minted OpenRouter token |
| **Custom chat UI** | Built message list + input directly in template instead of relying on removed `LLMChatSplitView` |
| **Tool loop** | Uses `useTrilogyChat`'s `handleChatMessageWithTools` which internally runs the library's `runToolLoop` with `RETURN_TO_USER_TOOL` for proper loop termination |
| **CSS rewrite** | Replaced `:deep()` selectors targeting old component internals with direct class selectors for the new markup |

### Provider Options

| Provider | API Key Required | Default Model |
|----------|-----------------|---------------|
| Demo | No | Auto-selected by DemoProvider |
| Anthropic | Yes | claude-sonnet-4-6 |
| OpenAI | Yes | gpt-5.2 |
| Google | Yes | models/gemini-2.5-flash |

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
interface SharedChatMessage {
  role: string  // 'user' | 'assistant' | 'system' | tool-specific roles
  content: string
  [key: string]: unknown  // Preserves tool calls and other properties
}

interface SharedChatData {
  title: string
  messages: SharedChatMessage[]  // All messages for full fidelity
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

- **URL length limits by browser**:
  - Chrome/Firefox/Edge: ~2MB (works well)
  - Safari: ~80KB (shows warning when exceeded)
  - Some URL shorteners/services: ~2KB-8KB
- **No real-time updates**: Shared URL is a snapshot; changes to original chat are not reflected
- **No authentication**: Anyone with the URL can view the chat content
- **Artifacts simplified**: Complex artifacts may not render in read-only view

### URL Length Warnings

The share modal displays warnings based on URL size:
- **Over 80KB**: Warning that Safari may not load the URL
- **Over 2MB**: Error that most browsers won't handle this URL

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
