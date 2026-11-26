import { expect, test } from "@playwright/test";

test.describe("items page", () => {
  test("shows the items", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#title")).toHaveText("Items");
    await expect(page.locator("#items li")).toHaveText(["apple", "pear"]);
  });

  test("heading", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#title")).toHaveText("Fruits");
  });

  test.skip("skipped", async ({ page }) => {
    await page.goto("/");
  });

  test("hangs", async ({ page }) => {
    test.skip(process.env.WITNESS_KIT_HANG !== "1", "kit: hangs only when WITNESS_KIT_HANG=1");
    await page.goto("/hang");
  });
});
