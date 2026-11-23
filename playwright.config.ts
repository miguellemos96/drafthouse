import { defineConfig, devices } from '@playwright/test'

// End-to-end tests run against the built site, served by `vite preview`.
// The webServer below builds and serves it, so nobody starts a server by hand.
const port = 4173

const chromium = {
  ...devices['Desktop Chrome'],
  // Headless Chromium has no GPU: render WebGL in software with SwiftShader.
  launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
}

export default defineConfig({
  outputDir: 'test-results',
  forbidOnly: !!process.env.CI,
  // Each browser draws the 3D view in software, so one per core fills the CPU. Locally, at most 4
  // at once until the view stops redrawing when nothing changes (#71). CI keeps Playwright's default.
  workers: process.env.CI ? undefined : 4,
  reporter: 'list',
  use: { baseURL: `http://localhost:${port}` },
  projects: [
    { name: 'chromium', testDir: 'e2e', use: chromium },
    // `npm run e2e:scratch`: throwaway specs in .factory-tmp/e2e/ (gitignored), for an
    // agent's own checks of the app. Same server, started and stopped by Playwright.
    { name: 'scratch', testDir: '.factory-tmp/e2e', use: chromium },
  ],
  webServer: {
    command: `npm run build && npx vite preview --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
