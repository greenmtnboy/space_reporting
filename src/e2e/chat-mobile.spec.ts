import { test, expect, devices } from '@playwright/test'

test.use({ ...devices['iPhone 13'] })

test.describe('Chat page - mobile layout', () => {
    test('chat view fits within viewport width', async ({ page }) => {
        await page.goto('/chat')
        await expect(page.getByTestId('chat-view')).toBeVisible()

        // The chat view should not cause horizontal overflow
        const chatView = page.getByTestId('chat-view')
        const box = await chatView.boundingBox()
        const viewport = page.viewportSize()!

        // Chat view right edge should not exceed viewport
        // (it sits next to the 60px nav sidebar)
        expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1)
    })

    test('provider setup form fits within viewport', async ({ page }) => {
        await page.goto('/chat')

        const setup = page.getByTestId('provider-setup')
        await expect(setup).toBeVisible()

        // Select a provider - form should remain within viewport
        await page.getByTestId('provider-select').selectOption('anthropic')
        await expect(page.getByTestId('model-select')).toBeVisible()

        // Verify model select doesn't overflow
        const modelSelect = page.getByTestId('model-select')
        const box = await modelSelect.boundingBox()
        const viewport = page.viewportSize()!
        expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1)
    })

    test('no horizontal scrollbar on chat page', async ({ page }) => {
        await page.goto('/chat')
        await expect(page.getByTestId('chat-view')).toBeVisible()

        // Check that page body doesn't have horizontal overflow
        const hasHorizontalScroll = await page.evaluate(() => {
            return document.documentElement.scrollWidth > document.documentElement.clientWidth
        })
        expect(hasHorizontalScroll).toBe(false)
    })
})
