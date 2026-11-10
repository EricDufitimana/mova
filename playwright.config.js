import { defineConfig } from '@playwright/test';
const port=process.env.MOVA_TEST_PORT || '5180';
export default defineConfig({
  testDir: './tests', workers: 1, timeout: 90000,
  use: { baseURL: `http://127.0.0.1:${port}`, headless: true, trace: 'retain-on-failure',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? {executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE} : {} },
  webServer: { command: 'node server/start.mjs', url: `http://127.0.0.1:${port}`, reuseExistingServer: false,
    env: { PORT:port, MOVA_STORE:`.mova/test-rides-${Date.now()}.json`, ...(process.env.MOVA_DIST ? {MOVA_DIST:process.env.MOVA_DIST} : {}) } }
});
