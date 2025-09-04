import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: ['**/*.spec.ts'],
  retries: 0,
  reporter: 'list',
  use: {
    headless: true,
    video: 'on',
    screenshot: 'only-on-failure',
    trace: 'off'
  }
});
