import { test, expect } from '@playwright/test'

test.describe('Chat page - setup view', () => {
    test('loads chat view and shows provider setup', async ({ page }) => {
        await page.goto('./chat')
        await expect(page.getByTestId('chat-view')).toBeVisible()
        await expect(page.getByTestId('provider-setup')).toBeVisible()
    })

    test('provider select has expected options', async ({ page }) => {
        await page.goto('./chat')
        const select = page.getByTestId('provider-select')
        await expect(select).toBeVisible()

        const options = select.locator('option')
        // placeholder + 4 providers (demo, anthropic, openai, google)
        await expect(options).toHaveCount(5)
        await expect(options.nth(1)).toHaveText('Demo (limited messages)')
        await expect(options.nth(2)).toHaveText('Anthropic (Claude)')
        await expect(options.nth(3)).toHaveText('OpenAI')
        await expect(options.nth(4)).toHaveText('Google (Gemini)')
    })

    test('selecting Anthropic shows correct default models without typos', async ({ page }) => {
        await page.goto('./chat')
        const providerSelect = page.getByTestId('provider-select')
        await providerSelect.selectOption('anthropic')

        const modelSelect = page.getByTestId('model-select')
        await expect(modelSelect).toBeVisible()

        const options = modelSelect.locator('option')
        const optionTexts = await options.allTextContents()
        const trimmed = optionTexts.map(t => t.trim())

        // Should contain Claude Sonnet and Opus models
        expect(trimmed).toContain('Claude Sonnet 4.6')
        expect(trimmed).toContain('Claude Opus 4.6')
    })

    test('selecting OpenAI shows GPT-5.2 model', async ({ page }) => {
        await page.goto('./chat')
        await page.getByTestId('provider-select').selectOption('openai')

        const modelSelect = page.getByTestId('model-select')
        const options = modelSelect.locator('option')
        const optionTexts = await options.allTextContents()
        const trimmed = optionTexts.map(t => t.trim())

        expect(trimmed).toContain('GPT-5.2')
    })
})

/*
  Connect the demo provider, which needs no key and makes no request until a
  message is sent, so the header of the active-chat layout renders.
*/
async function openActiveChat(page: import('@playwright/test').Page) {
    await page.goto('./chat')
    await page.getByTestId('provider-select').selectOption('demo')
    await page.locator('.connect-btn').click()
    await expect(page.locator('.chat-interface')).toBeVisible()
}

test.describe('Chat page - active chat header', () => {
    test('every header chip is the same height', async ({ page }) => {
        await openActiveChat(page)
        const chips = page.locator('.header-actions > *')
        await expect(chips).toHaveCount(5)
        const heights = await chips.evaluateAll((els) =>
            els.map((el) => Math.round(el.getBoundingClientRect().height)),
        )
        expect(new Set(heights).size).toBe(1)
        expect(heights[0]).toBeGreaterThan(0)
    })

    test('every header icon draws a glyph', async ({ page }) => {
        await openActiveChat(page)
        // The component library injects an SVG-mask stylesheet for the icons it
        // registers. A class it does not know used to paint as a solid square,
        // so check each icon either has a mask (registered) or real font
        // content (fell through to the Material Design Icons webfont).
        const missing = await page.locator('.header-actions i.mdi').evaluateAll((els) =>
            els
                .filter((el) => {
                    const before = getComputedStyle(el, '::before')
                    const mask = before.maskImage || before.webkitMaskImage || 'none'
                    const content = before.content.replace(/^"|"$/g, '')
                    return mask === 'none' && content.length === 0
                })
                .map((el) => el.className),
        )
        expect(missing).toEqual([])
    })
})
