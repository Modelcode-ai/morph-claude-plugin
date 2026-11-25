import { defineConfig, devices } from "@playwright/test";

// The init skill's capture step: screenshots and video of every test, only under Witness.
const evidence = !!process.env.WITNESS_EVIDENCE;

export default defineConfig({
  testDir: "tests",
  workers: 1,
  expect: { timeout: 2000 },
  use: {
    baseURL: process.env.BASE_URL ?? "http://127.0.0.1:8080",
    screenshot: evidence ? "on" : "only-on-failure",
    video: evidence ? "on" : "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
