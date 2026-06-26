import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "pnpm dev",
        cwd: "../..",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          ...process.env,
          DEMO_LOGIN_ENABLED: process.env.DEMO_LOGIN_ENABLED ?? "true",
          NEXT_PUBLIC_DEMO_LOGIN_ENABLED: process.env.NEXT_PUBLIC_DEMO_LOGIN_ENABLED ?? "true",
          DEMO_USER_EMAIL: process.env.DEMO_USER_EMAIL ?? process.env.SEED_USER_EMAIL ?? "demo@qship.dev",
          DEMO_USER_PASSWORD:
            process.env.DEMO_USER_PASSWORD ?? process.env.SEED_DEMO_PASSWORD ?? "DemoPass123!",
        },
      },
});
