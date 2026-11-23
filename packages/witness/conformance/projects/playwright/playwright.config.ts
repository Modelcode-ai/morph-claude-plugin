import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests",
  workers: 1,
  expect: { timeout: 2000 },
  use: { baseURL: process.env.BASE_URL ?? "http://127.0.0.1:8080" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
