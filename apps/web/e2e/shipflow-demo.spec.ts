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

  test("intake hub simulates email channel intake", async ({ page }) => {
    await demoLogin(page, "/inbox");
    await expect(page.getByRole("heading", { name: /intake hub/i })).toBeVisible();
    await page.getByRole("button", { name: "Simulate" }).first().click();
    await page.getByRole("button", { name: /send to pipeline/i }).click();
    await expect(page.getByText(/intake received|existing capability detected/i)).toBeVisible({
      timeout: 20_000,
    });
  });

  test("engineering board shows kanban columns and seeded tasks", async ({ page }) => {
    await demoLogin(page, "/tasks");
    await expect(page.getByRole("heading", { name: /engineering board/i })).toBeVisible();
    await expect(page.getByTestId("kanban-column-in_progress")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/add oauth provider config/i)).toBeVisible({ timeout: 15_000 });
  });
});
