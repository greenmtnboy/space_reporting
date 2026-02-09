import { defineConfig, devices } from '@playwright/test'

const inDocker = process.env.TEST_ENV === 'docker'
const inProd = process.env.TEST_ENV === 'prod'

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
                : 'http://localhost:5174/space_reporting',
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
        {
            name: 'firefox',
            use: { ...devices['Desktop Firefox'] },
        },
        {
            name: 'webkit',
            use: { ...devices['Desktop Safari'] },
        },
    ],
    webServer:
        inDocker || inProd
            ? undefined
            : {
                command: 'pnpm dev',
                port: 5174,
                reuseExistingServer: !process.env.CI,
            },
})
