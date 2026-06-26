import { expect, test } from "@playwright/test";

import { demoLogin, skipUnlessDemoLogin } from "./helpers/auth";

test.describe("ShipFlow demo journey", () => {
  test.beforeEach(({ }, testInfo) => {
    skipUnlessDemoLogin(testInfo);
  });

  test("demo login lands on pipeline overview", async ({ page }) => {
    await demoLogin(page, "/brief");
    await expect(page.getByRole("heading", { name: /pipeline overview/i })).toBeVisible();
  });

  test("requests hub shows seeded feature samples", async ({ page }) => {
    await demoLogin(page, "/requests");
    await expect(page.getByText(/oauth login for enterprise customers/i)).toBeVisible({ timeout: 15_000 });
  });

  test("agent page loads ShipFlow Agent", async ({ page }) => {
    await demoLogin(page, "/agent");
    await expect(page.getByText(/ShipFlow Agent/i)).toBeVisible();
  });
});
