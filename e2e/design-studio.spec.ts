import { test, expect } from "@playwright/test";
import { loginAsDefault } from "./helpers";

test.describe("Design Studio navigation", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDefault(page);
  });

  test("Create menu exposes Chat entry", async ({ page }) => {
    await page.getByRole("button", { name: "Create" }).click();
    await expect(page.getByRole("menuitem", { name: "Chat" })).toBeVisible();
  });

  test("Create menu exposes Design Studio entry", async ({ page }) => {
    await page.getByRole("button", { name: "Create" }).click();
    await expect(page.getByRole("menuitem", { name: /Design Studio|设计工作室/ })).toBeVisible();
  });

  test("design project picker is reachable", async ({ page }) => {
    await page.getByRole("button", { name: "Create" }).click();
    await page.getByRole("menuitem", { name: /Design Studio|设计工作室/ }).click();
    await page.waitForURL("**/design");
    await expect(page).toHaveURL(/\/design$/);
  });

  test("projects page remains reachable", async ({ page }) => {
    await page.getByRole("button", { name: "Work" }).click();
    await page.getByRole("menuitem", { name: "Projects" }).click();
    await page.waitForURL("**/projects");
    await expect(page).toHaveURL(/\/projects/);
  });
});
