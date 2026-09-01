import { test, expect } from '@playwright/test'
import { fileURLToPath } from 'node:url'

// The view pulls its dataset from GCS. Serving the copy already committed under
// public/ keeps the test hermetic and off the network.
const ENGINE_DATA = fileURLToPath(new URL('../public/raw_engine_data.json', import.meta.url))

// One shared page: loading the dataset is the expensive part, so every
// assertion runs against a single load rather than one per test.
test.describe.configure({ mode: 'serial' })

test.describe('Engines page - mobile layout', () => {
    test('stages stay readable and the time bar can be scrubbed', async ({ page }) => {
        test.setTimeout(90000)

        await page.route('**/engines_over_time/raw_data.json', route =>
            route.fulfill({ path: ENGINE_DATA, contentType: 'application/json' })
        )

        await page.goto('./engines')
        await expect(page.getByTestId('engines-view')).toBeVisible()
        await expect(page.locator('.loading-overlay')).toHaveCount(0, { timeout: 60000 })

        // --- Stage sections keep a usable height instead of collapsing ---
        const sections = page.locator('.stage-section')
        await expect(sections).toHaveCount(3)
        for (const section of await sections.all()) {
            const box = await section.boundingBox()
            expect(box!.height).toBeGreaterThanOrEqual(240)
        }

        // Three full-height sections cannot fit a phone viewport, so the column scrolls.
        const scrolls = await page
            .locator('.engines-view .main-content')
            .evaluate(el => el.scrollHeight > el.clientHeight + 1)
        expect(scrolls).toBe(true)

        // --- The time bar is a touch target, not a mouse-only one ---
        const bar = page.locator('.progress-bar')
        await expect(bar).toBeVisible()
        // Without this the browser claims a horizontal drag as a page gesture.
        await expect(bar).toHaveCSS('touch-action', 'none')

        const fill = () => page.locator('.progress-fill').evaluate(el => parseFloat(el.style.width))
        const box = (await bar.boundingBox())!
        const midY = box.y + box.height / 2

        // Tap to seek, by touch.
        await page.touchscreen.tap(box.x + box.width * 0.3, midY)
        await expect.poll(fill).toBeGreaterThan(25)
        await expect.poll(fill).toBeLessThan(36)

        // Drag to scrub. Pointer events carry the drag, so this exercises the
        // same code path a finger takes.
        await page.mouse.move(box.x + box.width * 0.3, midY)
        await page.mouse.down()
        await page.mouse.move(box.x + box.width * 0.8, midY, { steps: 10 })
        const duringDrag = await fill()
        await page.mouse.up()
        expect(duringDrag).toBeGreaterThan(75)
        expect(duringDrag).toBeLessThan(86)

        // Pointer capture keeps the scrub alive when the finger slides off the bar.
        await page.mouse.move(box.x + box.width * 0.5, midY)
        await page.mouse.down()
        await page.mouse.move(box.x + box.width * 0.2, midY + 150, { steps: 5 })
        const offBar = await fill()
        await page.mouse.up()
        expect(offBar).toBeGreaterThan(15)
        expect(offBar).toBeLessThan(26)

        // --- Engine type cards are shown, not hidden away ---
        const grid = page.locator('.kill-grid').first()
        await expect(grid).toBeVisible()
        expect(await grid.evaluate(el => el.children.length)).toBeGreaterThan(0)
    })
})
