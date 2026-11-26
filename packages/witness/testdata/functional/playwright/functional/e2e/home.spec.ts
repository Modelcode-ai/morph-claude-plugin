import { expect, test } from "@playwright/test";

test("home page lists products", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Products" })).toBeVisible();
});
