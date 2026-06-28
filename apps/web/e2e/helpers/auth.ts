import type { Page } from "@playwright/test";

export async function demoLogin(page: Page, next = "/brief") {
  await page.goto(`/api-auth/demo?next=${encodeURIComponent(next)}`);
  await page.waitForURL(new RegExp(next.replace("/", "\\/")), { timeout: 30_000 });
}

export function skipUnlessDemoLogin(test: { skip: (condition: boolean, reason: string) => void }) {
  if (process.env.DEMO_LOGIN_ENABLED !== "true" && process.env.NEXT_PUBLIC_DEMO_LOGIN_ENABLED !== "true") {
    test.skip(true, "Demo login is not enabled");
  }
}
