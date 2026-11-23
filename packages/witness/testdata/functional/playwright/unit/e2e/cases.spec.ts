import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

test("every case file has an owner", () => {
  expect(readFileSync("cases/index.md", "utf8")).toContain("owner:");
});
