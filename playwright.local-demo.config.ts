import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir:'./e2e',testMatch:'**/local-demo.e2e.ts',workers:1,retries:0,reporter:'list',
  use:{baseURL:'http://127.0.0.1:4175',trace:'off',screenshot:'off'},
  projects:[{name:'desktop-chromium',use:{...devices['Desktop Chrome']}},{name:'mobile-chromium',use:{...devices['Pixel 7']}}],
  webServer:{command:'VITE_LOCAL_DEMO_MODE=true npm run dev -- --port 4175',url:'http://127.0.0.1:4175',reuseExistingServer:false},
})
