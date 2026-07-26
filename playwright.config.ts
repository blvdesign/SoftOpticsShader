import { defineConfig, devices } from "@playwright/test";

const port = 4173;

export default defineConfig({
  testDir: "./tests",
  snapshotPathTemplate:
    "{testDir}/{testFilePath}-snapshots/{arg}{ext}",
  timeout: 30_000,
  expect: {
    timeout: 8_000,
    toHaveScreenshot: {
      animations: "disabled",
      maxDiffPixelRatio: 0.035,
      threshold: 0.25
    }
  },
  fullyParallel: false,
  forbidOnly: Boolean(process.env["CI"]),
  workers: process.env["CI"] ? 1 : 2,
  retries: 0,
  reporter: process.env["CI"]
    ? [["github"], ["html", { open: "never" }]]
    : "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: `http://127.0.0.1:${port}`,
    colorScheme: "light",
    deviceScaleFactor: 1,
    locale: "en-US",
    reducedMotion: "no-preference",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
    viewport: { width: 1440, height: 900 }
  },
  webServer: {
    command: `pnpm --filter @soft-optics/demo dev --host 127.0.0.1 --port ${port}`,
    reuseExistingServer: !process.env["CI"],
    timeout: 120_000,
    url: `http://127.0.0.1:${port}`
  },
  projects: [
    {
      name: "chromium"
    }
  ]
});
