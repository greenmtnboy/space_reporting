import { test, expect } from '@playwright/test'

// Capture page errors and console errors for debugging CI failures
function attachErrorListeners(page: import('@playwright/test').Page) {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(`PAGE_ERROR: ${err.message}`))
    page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(`CONSOLE_ERROR: ${msg.text()}`)
    })
    return errors
}

test.describe('Chat page - setup view', () => {
    test('loads chat view and shows provider setup', async ({ page }) => {
        const errors = attachErrorListeners(page)
        await page.goto('/chat')
        await expect(page.getByTestId('chat-view')).toBeVisible({ timeout: 15000 })
            .catch(() => { throw new Error(`chat-view not visible. Errors:\n${errors.join('\n')}`) })
        await expect(page.getByTestId('provider-setup')).toBeVisible()
    })

    test('provider select has expected options', async ({ page }) => {
        await page.goto('/chat')
        const select = page.getByTestId('provider-select')
        await expect(select).toBeVisible()

        const options = select.locator('option')
        // placeholder + 3 providers
        await expect(options).toHaveCount(4)
        await expect(options.nth(1)).toHaveText('Anthropic (Claude)')
        await expect(options.nth(2)).toHaveText('OpenAI')
        await expect(options.nth(3)).toHaveText('Google (Gemini)')
    })

    test('selecting Anthropic shows correct default models without typos', async ({ page }) => {
        await page.goto('/chat')
        const providerSelect = page.getByTestId('provider-select')
        await providerSelect.selectOption('anthropic')

        const modelSelect = page.getByTestId('model-select')
        await expect(modelSelect).toBeVisible()

        const options = modelSelect.locator('option')
        const optionTexts = await options.allTextContents()
        const trimmed = optionTexts.map(t => t.trim())

        // Should contain properly spelled 'Opus', not 'Pous'
        expect(trimmed.some(t => t.includes('Opus'))).toBe(true)
        expect(trimmed.some(t => t.includes('Pous'))).toBe(false)

        // Should have Claude Opus 4.6 as first real option
        expect(trimmed).toContain('Claude Opus 4.6')
        expect(trimmed).toContain('Claude Opus 4.5')
    })

    test('selecting OpenAI shows GPT-5.2 model', async ({ page }) => {
        await page.goto('/chat')
        await page.getByTestId('provider-select').selectOption('openai')

        const modelSelect = page.getByTestId('model-select')
        const options = modelSelect.locator('option')
        const optionTexts = await options.allTextContents()
        const trimmed = optionTexts.map(t => t.trim())

        expect(trimmed).toContain('GPT-5.2')
    })
})
