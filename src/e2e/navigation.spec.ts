import { test, expect } from '@playwright/test'

test('navigation to all main pages', async ({ page }) => {
    // 1. Visit Home (Rockets)
    await page.goto('/')
    await expect(page.getByTestId('rockets-view')).toBeVisible()

    // 2. Navigate to Satellites
    await page.getByTestId('nav-link-satellites').click()
    await expect(page).toHaveURL(/.*satellites/)
    await expect(page.getByTestId('satellites-view')).toBeVisible()

    // 3. Navigate to Engines
    await page.getByTestId('nav-link-engines').click()
    await expect(page).toHaveURL(/.*engines/)
    await expect(page.getByTestId('engines-view')).toBeVisible()

    // 4. Navigate to Info
    await page.getByTestId('nav-link-info').click()
    await expect(page).toHaveURL(/.*info/)
    await expect(page.getByTestId('info-view')).toBeVisible()

    // 5. Navigate back to Home
    await page.getByTestId('nav-link-rockets').click()
    await expect(page).toHaveURL('/') // Exact match for home if base is correct, or just /
    await expect(page.getByTestId('rockets-view')).toBeVisible()
})

test('check page titles', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/Rocket Launches/)
})
