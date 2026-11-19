import { defineConfig, devices } from '@playwright/test'

/** An uncommon port, so the demo server doesn't collide with other local apps. */
const PORT = 47311

const config: ReturnType<typeof defineConfig> = defineConfig({
  testDir: 'tests/e2e',
  testMatch: '*.e2e.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: 'list',
  use: { baseURL: `http://localhost:${PORT}` },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm exec vite demo --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
  },
})

export default config
