import { test, expect } from '@playwright/test'

// Generate a mock shared chat with enough messages to overflow the viewport
function mockSharedChat(messageCount: number) {
    const messages = []
    for (let i = 0; i < messageCount; i++) {
        messages.push(
            { role: 'user', content: `Question ${i + 1}: Tell me about rocket launch number ${i + 1}.` },
            { role: 'assistant', content: `Here is information about launch ${i + 1}. This is a detailed response with enough text to take up space in the chat window and help test scrolling behavior on mobile devices.` }
        )
    }
    return {
        title: 'Test Shared Chat',
        messages,
        sharedAt: Date.now(),
    }
}

test.describe('Chat page - mobile layout', () => {
    test('chat view fits within viewport width', async ({ page }) => {
        await page.goto('./chat')
        await expect(page.getByTestId('chat-view')).toBeVisible()

        const chatView = page.getByTestId('chat-view')
        const box = await chatView.boundingBox()
        const viewport = page.viewportSize()!

        expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1)
    })

    test('provider setup form fits within viewport', async ({ page }) => {
        await page.goto('./chat')

        const setup = page.getByTestId('provider-setup')
        await expect(setup).toBeVisible()

        await page.getByTestId('provider-select').selectOption('anthropic')
        await expect(page.getByTestId('model-select')).toBeVisible()

        const modelSelect = page.getByTestId('model-select')
        const box = await modelSelect.boundingBox()
        const viewport = page.viewportSize()!
        expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1)
    })

    test('no horizontal scrollbar on chat page', async ({ page }) => {
        await page.goto('./chat')
        await expect(page.getByTestId('chat-view')).toBeVisible()

        const hasHorizontalScroll = await page.evaluate(() => {
            return document.documentElement.scrollWidth > document.documentElement.clientWidth
        })
        expect(hasHorizontalScroll).toBe(false)
    })

    test('chat-view height is bounded by parent, not viewport', async ({ page }) => {
        await page.goto('./chat')
        await expect(page.getByTestId('chat-view')).toBeVisible()

        const heights = await page.evaluate(() => {
            const chatView = document.querySelector('.chat-view')
            const appContent = document.querySelector('.app-content')
            if (!chatView || !appContent) return null
            return {
                chatView: chatView.getBoundingClientRect().height,
                appContent: appContent.getBoundingClientRect().height,
            }
        })

        expect(heights).not.toBeNull()
        expect(heights!.chatView).toBeLessThanOrEqual(heights!.appContent + 1)
    })

    test('flex/overflow chain enables scrollable chat without losing input', async ({ page }) => {
        await page.goto('./chat')
        await expect(page.getByTestId('chat-view')).toBeVisible()

        const chain = await page.evaluate(() => {
            const check = (selector: string) => {
                const el = document.querySelector(selector)
                if (!el) return null
                const cs = window.getComputedStyle(el)
                return {
                    overflow: cs.overflow,
                    overflowY: cs.overflowY,
                    flexGrow: cs.flexGrow,
                    minHeight: cs.minHeight,
                }
            }
            return {
                chatView: check('.chat-view'),
                chatInterface: check('.chat-interface'),
                providerSetup: check('.provider-setup'),
            }
        })

        // chat-view must clip overflow so content doesn't grow unbounded
        expect(chain.chatView).not.toBeNull()
        expect(chain.chatView!.overflow).toBe('hidden')

        // In setup mode (no LLM connected), .chat-interface doesn't exist.
        // When present (active chat), it should flex-grow and clip overflow.
        if (chain.chatInterface) {
            expect(chain.chatInterface.flexGrow).toBe('1')
            expect(chain.chatInterface.overflow).toBe('hidden')
            expect(chain.chatInterface.minHeight).toBe('0px')
        }
    })
})

test.describe('Chat page - mobile scroll with shared chat', () => {

    test('shared chat with many messages keeps input visible and scrolls', async ({ page }) => {
        const mockData = mockSharedChat(15)
        const mockGistId = 'test-mock-gist-123'

        // Intercept the GitHub Gist API call and return our mock data
        await page.route(`**/api.github.com/gists/${mockGistId}`, route => {
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    id: mockGistId,
                    files: {
                        'chat.json': {
                            content: JSON.stringify(mockData),
                        },
                    },
                }),
            })
        })

        // Navigate to chat with the shared gist hash
        await page.goto(`./chat#gist=${mockGistId}`)

        // Wait for the shared chat to render with messages
        await expect(page.locator('.shared-mode')).toBeVisible({ timeout: 10000 })

        // Wait for messages to render
        await expect(page.locator('.message').first()).toBeVisible({ timeout: 10000 })

        const messageCount = await page.locator('.message').count()
        expect(messageCount).toBeGreaterThan(0)

        const viewport = page.viewportSize()!

        // The shared-input-overlay (or input area) should be within the viewport
        // This is the key scroll test: with many messages, the input must not
        // be pushed below the visible area
        const overlay = page.locator('.shared-input-overlay')
        if (await overlay.isVisible()) {
            const overlayBox = await overlay.boundingBox()
            expect(overlayBox).not.toBeNull()
            // The top of the overlay should be within the viewport
            expect(overlayBox!.y).toBeLessThan(viewport.height)
        }

        // The chat-view should not exceed the viewport height
        const chatViewBox = await page.getByTestId('chat-view').boundingBox()
        expect(chatViewBox!.height).toBeLessThanOrEqual(viewport.height + 1)

        // Messages area should be scrollable (scrollHeight > clientHeight)
        const isScrollable = await page.evaluate(() => {
            const messagesEl = document.querySelector('.chat-messages')
            if (!messagesEl) return null
            return {
                scrollable: messagesEl.scrollHeight > messagesEl.clientHeight,
                scrollHeight: messagesEl.scrollHeight,
                clientHeight: messagesEl.clientHeight,
            }
        })

        expect(isScrollable).not.toBeNull()
        expect(isScrollable!.scrollable).toBe(true)
    })

    test('shared chat does not cause horizontal overflow', async ({ page }) => {
        const mockData = mockSharedChat(5)
        const mockGistId = 'test-mock-gist-456'

        await page.route(`**/api.github.com/gists/${mockGistId}`, route => {
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    id: mockGistId,
                    files: {
                        'chat.json': {
                            content: JSON.stringify(mockData),
                        },
                    },
                }),
            })
        })

        await page.goto(`./chat#gist=${mockGistId}`)
        await expect(page.locator('.shared-mode')).toBeVisible({ timeout: 10000 })

        const hasHorizontalScroll = await page.evaluate(() => {
            return document.documentElement.scrollWidth > document.documentElement.clientWidth
        })
        expect(hasHorizontalScroll).toBe(false)
    })
})
