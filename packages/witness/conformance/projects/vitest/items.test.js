import { describe, expect, test } from "vitest";

import { appendFileSync, mkdirSync } from "node:fs";
import { join, relative } from "node:path";

const APP = process.env.WITNESS_APP_URL ?? "http://127.0.0.1:8080";

// Witness evidence: append what this test saw to its timeline (a no-op outside witness).
function record(kind, data) {
  const st = expect.getState();
  if (!process.env.WITNESS_ARTIFACTS || !st.currentTestName) return;
  const folder = join(process.env.WITNESS_ARTIFACTS, `${relative(process.cwd(), st.testPath)} > ${st.currentTestName}`.replace(/[^\w.@-]+/g, "_"));
  mkdirSync(folder, { recursive: true });
  appendFileSync(join(folder, "evidence.jsonl"), JSON.stringify({ v: 1, kind, data }) + "\n");
}

async function get(path) {
  const r = await fetch(`${APP}${path}`);
  const body = await r.clone().text();
  record("http", { method: "GET", url: `${APP}${path}`, status: r.status, response: { body } });
  return r;
}
const hang = process.env.WITNESS_KIT_HANG === "1" ? test : test.skip;

describe("items api", () => {
  test("lists items", async () => {
    const r = await get("/api/items");
    expect(r.status).toBe(200);
    expect((await r.json()).map((i) => i.name)).toEqual(["apple", "pear"]);
  });

  test("item name", async () => {
    const r = await get("/api/items/1");
    expect((await r.json()).name).toBe("banana");
  });

  test.skip("skipped", async () => {
    await fetch(`${APP}/api/items`);
  });

  hang("hangs", async () => {
    await fetch(`${APP}/api/hang`);
  });
});
