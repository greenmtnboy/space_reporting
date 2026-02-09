import { test, expect, devices } from '@playwright/test'

test.use({ ...devices['iPhone 13'] })

test.describe('Chat page - mobile layout', () => {
    test('chat view fits within viewport width', async ({ page }) => {
        await page.goto('/chat')
        await expect(page.getByTestId('chat-view')).toBeVisible()

        const chatView = page.getByTestId('chat-view')
        const box = await chatView.boundingBox()
        const viewport = page.viewportSize()!

        // Chat view right edge should not exceed viewport
        expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1)
    })

    test('provider setup form fits within viewport', async ({ page }) => {
        await page.goto('/chat')

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
        await page.goto('/chat')
        await expect(page.getByTestId('chat-view')).toBeVisible()

        const hasHorizontalScroll = await page.evaluate(() => {
            return document.documentElement.scrollWidth > document.documentElement.clientWidth
        })
        expect(hasHorizontalScroll).toBe(false)
    })

    test('chat-view height is bounded by parent, not viewport', async ({ page }) => {
        await page.goto('/chat')
        await expect(page.getByTestId('chat-view')).toBeVisible()

        // height:100vh on mobile includes browser chrome and pushes the input
        // off-screen. height:100% respects the parent (.app-content) instead.
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
        await page.goto('/chat')
        await expect(page.getByTestId('chat-view')).toBeVisible()

        // The scroll fix depends on a specific chain of CSS properties:
        //   .chat-view: overflow:hidden (clips to parent height)
        //   .chat-interface: flex:1, overflow:hidden, min-height:0
        //     (fills remaining space, allows shrink below content)
        //   .chat-container: flex:1, overflow:hidden, min-height:0
        //     (same: fills space, clips)
        //   .chat-messages: overflow-y:auto (this is where scrolling happens)
        //   .input-container: stays pinned at bottom of flex column
        //
        // If any level uses height:100vh or drops overflow:hidden,
        // the messages push the input off-screen with no scroll.
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
                    height: cs.height,
                }
            }
            return {
                chatView: check('.chat-view'),
                chatInterface: check('.chat-interface'),
            }
        })

        // chat-view must clip overflow so content doesn't grow unbounded
        expect(chain.chatView).not.toBeNull()
        expect(chain.chatView!.overflow).toBe('hidden')

        // chat-interface must grow to fill space AND clip its own overflow,
        // with min-height:0 so flex allows it to shrink below content size
        expect(chain.chatInterface).not.toBeNull()
        expect(chain.chatInterface!.flexGrow).toBe('1')
        expect(chain.chatInterface!.overflow).toBe('hidden')
        expect(chain.chatInterface!.minHeight).toBe('0px')
    })
})
