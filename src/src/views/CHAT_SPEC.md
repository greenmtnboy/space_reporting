# Chat View Spec

## Query Loops, the Tool Inspector and Friendly Tool Names (2026-09-02)

### The loop

Reported after the 0.1.24 upgrade: "Run a select 1" produced `run_trilogy_query`,
`list_available_imports`, `run_trilogy_query`, `search_docs`, `select_active_import`,
`run_trilogy_query`, `search_docs`, … and a spinner. The agent never returned.

What was actually missing was an *exit rule for failure*. The chat prompt says
"if a query fails, explain the error clearly and try a corrected version" and
"return_to_user is always your final tool call", and nothing in between: no cap
on corrections, no instruction to hand back when stuck. The loop itself only
stops at 50 iterations (`chatStore.executeMessage`) or after three text-only
replies, and a model that keeps *calling tools* — retrying the query with
small edits, searching the docs again — never trips either. 0.1.24 made this
more visible rather than causing it: the docs pack gave a stuck model one
more thing to do instead of a query retry, and `select 1` is an ask whose
error a small model does not know how to correct (Trilogy wants a name on a
constant, `select 1 -> one;`).

Fixed upstream (trilogy-data/trilogy-studio-core, same branch, 0.1.25), in two
layers so it does not depend on the model reading the prompt carefully:

| Layer | Change |
|-------|--------|
| Prompt | Guideline 3 caps corrections at two attempts and says what to do on the third failure: `return_to_user` with the error, what was tried, and what is needed. "Completing your response" adds: a simple question is one query and a return; if stuck (failing query, missing data, unclear ask), return and ask rather than retry or search further. |
| Loop | `runToolLoop` counts consecutive failed tool calls. From the third in a row each failed result carries a `<system_input>` note ("this is failed tool call N in a row … change approach or call return_to_user now"); at the eighth the loop stops itself and persists `(Stopped after N failed tool calls in a row — last error: …)` as the final assistant message. Any success resets the streak. Thresholds and the note text are `ToolLoopConfig` options. |

Nothing on this side changes for the loop: the prompt and the loop are both
library code and `useTrilogyChat` exposes neither. **Bump to 0.1.25 when it is
published** — until then the app runs the 0.1.24 behaviour described above.

### Tool inspector

Clicking a pill now opens a dialog with the calls behind it: for each, the
tool's friendly and raw names, ok/failed, the input as JSON, and the result.
The run's other pills are tabs across the top so a whole turn reads in one
dialog. Escape or a click outside closes it.

The result text takes some finding. The library records a call in two places:
`executedToolCalls` on the assistant message (`success`, `error`, a short
`message` — enough for a pill) and the hidden user message that follows it,
whose `toolResults` carry the *full* text the model was sent: query rows, the
error with context, the docs that matched. Hidden messages never reach the
stream, so `buildConversation` indexes every message's `toolResults` by call
id first and joins them onto the pills' calls. Persisted chats from before
this change render with the short form.

Pills also stopped folding across outcomes: two failed queries then a working
one is `Run query ×2` (red) then `Run query`, which is the shape of a retry
loop, rather than `Run query ×3`.

| Choice | Reason |
|--------|--------|
| A dialog, not an expanding row | A query result is a page of JSON; inline it would push the conversation off the phone screen. |
| Inside `.chat-view`, not teleported | Same as the share modal, so scoped styles apply without a second stylesheet. |
| Result text falls back to `error`, then `message` | Older persisted chats have no results message; the pill's own record is still shown. |
| No copy button | Text in a `pre` selects and copies; the value is the raw text, not a button. |

### Friendly names

`utils/toolNames.ts` maps tool names to the chat's vocabulary: an import is a
*data source* here, an artifact is a *result*. `select_active_import` reads
"Select data source", `run_trilogy_query` "Run query", `return_to_user`
"Reply". Used on the pills, the inspector, and the "Running …" status line.
The raw name is in the pill tooltip and beside the label in the inspector.
The library's own map (`getToolDisplayName`) is studio-flavoured and not
exported from any entry point, so this is app-owned; unknown tools open up
their underscores rather than showing raw.

## Folded Tool Runs and the Reorder Tool (2026-09-02)

### Tool runs

An agent turn is several tool-only assistant messages in a row: select the
import, run the query, list the artifacts, hide one, retitle one, return. Each
rendered as its own message block, so a single answer spent six or seven full
rows of padding on pills before any text appeared.

Consecutive tool calls now fold into one **tool run**: a single compact row
with a cog and the pills in call order, adjacent repeats of the same tool
shown once with a count (`run_trilogy_query ×2`). The rules live in
`utils/conversation.ts`, which also owns the artifact placement that used to
sit in `ChatView`:

| Rule | Reason |
|------|--------|
| Calls fold across message boundaries | The library persists one message per call; the boundary is an implementation detail, not a beat in the conversation. |
| A text message or an inline artifact ends a run | Those are the things the calls were for; the run reads as "what happened between". |
| A message with both text and calls renders as text, then its calls join the following run | Keeps one visual grammar: text is a message, calls are a run. |
| A run is keyed by its first message's index | The tail run grows as calls stream in; a stable key means Vue patches it rather than remounting. |

`buildConversation` is a pure function of the store's messages and artifacts
and is unit-tested in `utils/conversation.test.ts`; `ChatView` only wraps it in
a computed.

### Reorder tool on narrow screens

`reorder_artifacts` orders the artifact *panel*. Below 768px there is no
panel — artifacts sit inline where their carrier message is — so the tool is
meaningless there, and the prompt's curation step 4 ("reorder for maximum
impact, the panel is the primary view the user sees") sends the model on a
detour every turn.

The same goes for `hide_artifact` inline: the curation prompt tells the model
to hide "results from earlier questions no longer relevant to the current ask",
which on a panel is tidying and inline deletes a card the user already scrolled
past.

Two more are pointless on every layout here. `connect_data_connection`: the
app opens its one DuckDB connection itself, and when that fails the model
cannot fix it. `open_documentation` (0.1.24 adds the docs pack to the chat
toolset): it navigates the studio's tutorial screen, which this app does not
have; `search_docs` and `read_doc` from the same pack stay, so the model can
look up Trilogy idioms instead of guessing.

Library 0.1.24 (trilogy-data/trilogy-studio-core#254) added `disabledTools`
to `useTrilogyChat`: it withholds the named tools from the request and drops
the prompt lines that ask for them, renumbering the curation steps. Wired in
`ChatView` as a getter over `isNarrow`, so the list follows the layout:

```ts
const ALWAYS_DISABLED_TOOLS = ['connect_data_connection', 'open_documentation']
const INLINE_DISABLED_TOOLS = ['reorder_artifacts', 'hide_artifact']
disabledTools: () =>
  isNarrow.value ? [...ALWAYS_DISABLED_TOOLS, ...INLINE_DISABLED_TOOLS] : ALWAYS_DISABLED_TOOLS
```

The toolset is part of the provider's prompt-cache prefix, so rotating a phone
across the breakpoint mid-conversation costs one cache miss on the next send.
If a curated (panel) view is ever offered on narrow screens as a toggle, the
getter reads that toggle instead.

### Copy/download in the host chrome (done with 0.1.24)

`DataTable`'s copy and download buttons floated over the rows: bottom-right on
a phone, where they covered data. 0.1.24 adds `showControls` to `DataTable` and
documents `copyToClipboard()` / `downloadData()` as public. `ChatArtifactView`
now mounts every table with `showControls=false`, holds a ref to it, and
exposes `hasTable`, `copyTable` and `downloadTable`. `ChatView` renders the two
buttons in the artifact card header on narrow screens and at the end of the
panel tab bar on wide ones, driving the active view through that ref. Inline
cards are tracked in a map keyed by artifact id since they live in a `v-for`;
the panel shows one artifact at a time so a single ref covers it.

### Deferred: a deep-link tool into the visualisations

Chat is a dead end beside the rockets, satellites and engines views today.
0.1.24 also adds `extraTools` to `useTrilogyChat`: host-defined tools, each a
definition for the model plus the function that runs it, sent ahead of
`return_to_user` and executed here rather than in the library. The plan is
one tool, `show_in_view`, that returns a link card into a view with a filter
applied (a launch site, a year range, a rocket family), so an answer can end
with "see it on the globe" and the phone user taps through.

Prerequisite on this side, independent of the release: the views do not read
any route query today (`useRoute` is not used anywhere under `views/`). Each
view needs to accept its filter state from the query string before the tool
has anything to link to. Do that first, then the tool is:

```ts
extraTools: [{
  definition: {
    name: 'show_in_view',
    description: 'Open one of the app views filtered to what the user asked about.',
    input_schema: { type: 'object', properties: { view: { enum: ['rockets', 'satellites', 'engines'] }, /* filters */ } },
  },
  execute: async (input) => ({ success: true, message: `[Open in ${input.view}](${buildViewUrl(input)})` }),
}]
```

### Artifact titles (done now)

The curation prompt spends a step on `update_artifact` titles, but the view
never showed them: the mobile card header and the desktop tab bar both showed
the artifact *type*. Both now show `config.title` when the agent has set one,
falling back to the type (`results` reads as "table"), via `artifactTitle` in
`utils/conversation.ts`. Tab labels are capped at 180px with the full title in
the tooltip so one long title cannot push its siblings off the bar.

Not done against 0.1.22, where the option does not exist. One consequence to
keep in mind when it lands: the toolset is part of the provider's prompt-cache
prefix, so rotating a phone across the breakpoint mid-conversation costs one
cache miss on the next send. If a curated (panel) view is ever offered on
narrow screens as a toggle, the getter simply reads that toggle instead.


## Header Chips, Table Layout and Icons (2026-09-02)

### What was wrong

Three faults on the active-chat view, all reproduced in Chromium at 390px and 1280px:

| Symptom | Root cause |
|---------|------------|
| The Share button rendered as a solid grey square | The component library injects an SVG-mask stylesheet at runtime for the `mdi-*` icons *it* uses. Its base rule was a bare `.mdi::before { content: ""; background-color: currentColor }`, which out-cascades the Material Design Icons webfont this app loads from the CDN and paints a 1em box for any class the library has not registered. `mdi-share-variant` and `mdi-connection` were the two unregistered icons here. |
| Header chips came out at three different heights | Each chip sized itself from its own padding and font size: buttons at 31px, the DuckDB status and connection badge at 28px (mobile: 24 / 20 / 20). `_base.css` also carried two conflicting `.db-status.mini` / `.mini.db-status` rules. |
| Table headers wrapped onto several lines and overlapped the first rows; cells were squashed | Tabulator's own stylesheet was never loaded. The library depends on `tabulator-tables` but ships none of its CSS (the studio app imports it itself), so the table had no layout rules: no `white-space: nowrap` on the header, no `inline-block` cells. `_tabulator.css` had been papering over this with `display: flex` on rows and `display: inline-block !important` on cells, which is what squashed them. |

### Fixes

| Change | Where |
|--------|-------|
| Import `tabulator-tables/dist/css/tabulator.min.css` ahead of the library stylesheet; `tabulator-tables` pinned as a direct dependency at the version the library resolves | `main.ts`, `package.json` |
| `_tabulator.css` reduced to colour overrides. Layout belongs to Tabulator now | `views/chat-styles/_tabulator.css` |
| One `--chip-height` custom property on `.header-actions` (28px, 24px on mobile) that buttons, the status dot and the badge all read | `_header.css`, `_base.css`, `_mobile.css` |
| Share and Connect use icons the library registers: `mdi-export-variant` (Material's own share glyph) and `mdi-power-plug-outline` | `ChatView.vue` |
| e2e: every header chip is one height; every header icon draws either a mask or font content | `e2e/chat.spec.ts`, `e2e/chat-mobile.spec.ts` |

### Design choices

1. **Tabulator's sheet comes from us, not from `:deep()` reimplementation.** The previous
   `_tabulator.css` was a partial reimplementation of Tabulator's layout that fought the real
   thing. The studio app upstream imports Tabulator's CSS itself, and the library README now
   says consumers must; doing the same is the supported path. The one specificity trap: Tabulator
   paints `.tabulator-table` white at (0,3,0), and the alternate-row tint is translucent, so that
   override has to match at that specificity or even rows show white through.
2. **Icons the library ships, rather than waiting on the font fallback.** Upstream (same branch
   in trilogy-studio-core) now scopes the mask box to registered classes, so unregistered icons
   fall through to the webfont. That lands with the next release; switching the two icons to
   registered ones fixes the installed version today and stays correct afterwards. Both
   replacements are the Material glyphs for those actions anyway.
3. **A shared height, not matched paddings.** Chips have different content (icon-only, icon +
   text, dot + text), so matching paddings would drift again at the next edit. A single custom
   property is the one place to change it.

### Deferred: copy/download in the card header

The table's copy and download buttons float over the rows (bottom-right on mobile, where they
cover data). Moving them into the artifact card header needs two things from the library, both
now on the upstream branch and waiting on a release:

- `DataTable`'s new `showControls` prop (default `true`) to drop the floating buttons.
- `copyToClipboard()` / `downloadData()` being documented as public, callable through a template
  ref.

The wiring here is then: `ChatArtifactView` holds a ref to its `DataTable`, passes
`:show-controls="false"`, and exposes the two actions to the card header in `ChatView`. Not done
against 0.1.22: the prop would be ignored and the buttons would appear twice.


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

### Audit Fixes (2026-09-01)

Found while auditing this branch; the first two are regressions from the
embedded-artifact work, the third predates it.

| Issue | Fix |
|---|---|
| **Shared chats could crash the view.** A share round-trips through JSON, which flattens a `Results` instance's `headers` Map into a plain object, and `continueSharedChat` copied the messages back without calling `Results.fromJSON`. Once carriers render inline, `DataTable` mounted against that data and threw on `headers.values()`. | `continueSharedChat` drops the `artifact` from restored messages, and `ChatArtifactView.getResults` treats results whose `headers` is not a `Map` as absent — chart/results fall through to the JSON fallback, markdown renders text-only. |
| **Artifact cards remounted on every turn.** The conversation `v-for` keyed on the array index, but an artifact with no carrier is appended last, so each new message shifted it and rebuilt its whole Tabulator table. | Each item carries a stable `key` — `art:<id>` for artifacts, `msg:<index>` for messages, which only grows because messages append. Verified: with the index key the trailing card remounted; with the stable key all three survive. |
| **Shared chats showed blank bubbles.** `sharedMessagesForDisplay` filtered only system messages, so every carrier rendered as an empty bubble in the read-only view, which has no artifact renderer. | Also drop messages with no text. Covered by an e2e test. |

### Testing

`pnpm test` runs Vitest over `src/**/*.test.ts`; `vitest.config.ts` excludes
`e2e/`, whose Playwright specs throw when a non-Playwright runner collects them.
CI runs it as its own job rather than once per browser.

`utils/llmHistoryGuard.test.ts` covers the guard — including that it keeps
empty turns carrying `toolCalls`/`toolResults`, so tool_use/tool_result pairing
survives, and that installing twice does not stack wrappers.

The inline artifact rendering itself still has no automated coverage: artifacts
require a live LLM round-trip, and the shared-chat format is too lossy to stand
in. It was verified manually against a fixture shaped like real `chatStore`
output.

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
