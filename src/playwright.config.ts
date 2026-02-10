import { defineConfig, devices } from '@playwright/test'

const inDocker = process.env.TEST_ENV === 'docker'
const inProd = process.env.TEST_ENV === 'prod'

// Mobile viewport shared across all mobile projects.
// We intentionally omit defaultBrowserType so each project uses its own engine.
const mobileViewport = {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
}

export default defineConfig({
    testDir: './e2e',
    timeout: 30000,
    expect: {
        timeout: 10000,
    },
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    workers: process.env.CI ? 2 : undefined,
    reporter: 'html',
    use: {
        baseURL: inProd
            ? 'https://rocket-launches-2025.web.app' // Placeholder, update if known
            : inDocker
                ? 'http://localhost:8080'
                : 'http://localhost:5174/space_reporting/',
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
            testIgnore: /chat-mobile/,
        },
        {
            name: 'chromium-mobile',
            use: { ...devices['Desktop Chrome'], ...mobileViewport },
            testMatch: /chat-mobile/,
        },
        {
            name: 'firefox',
            use: { ...devices['Desktop Firefox'] },
            testIgnore: /chat-mobile/,
        },
        {
            name: 'firefox-mobile',
            use: { ...devices['Desktop Firefox'], ...mobileViewport },
            testMatch: /chat-mobile/,
        },
        {
            name: 'webkit',
            use: { ...devices['Desktop Safari'] },
            testIgnore: /chat-mobile/,
        },
        {
            name: 'webkit-mobile',
            use: { ...devices['Desktop Safari'], ...mobileViewport },
            testMatch: /chat-mobile/,
        },
    ],
    webServer:
        inDocker || inProd
            ? undefined
            : {
                command: process.env.CI ? 'pnpm preview --port 5174' : 'pnpm dev',
                port: 5174,
                reuseExistingServer: !process.env.CI,
            },
})
