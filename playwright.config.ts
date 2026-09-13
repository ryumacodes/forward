import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4174',
    trace: 'off',
    screenshot: 'off',
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'VITE_SUPABASE_URL= VITE_SUPABASE_PUBLISHABLE_KEY= VITE_ELEVENLABS_AGENT_ID= bun run dev --port 4174',
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: false,
  },
})
