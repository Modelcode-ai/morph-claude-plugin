import assert from "node:assert/strict";
import { appendFileSync, mkdirSync } from "node:fs";
import { join, relative } from "node:path";

const APP = process.env.WITNESS_APP_URL ?? "http://127.0.0.1:8080";
const hang = process.env.WITNESS_KIT_HANG === "1" ? it : it.skip;

let current;
beforeEach(function () {
  current = this.currentTest;
});

// Witness evidence: append what this test saw to its timeline (a no-op outside witness).
function record(kind, data) {
  if (!process.env.WITNESS_ARTIFACTS || !current) return;
  const folder = join(process.env.WITNESS_ARTIFACTS, `${relative(process.cwd(), current.file)} > ${current.fullTitle()}`.replace(/[^\w.@-]+/g, "_"));
  mkdirSync(folder, { recursive: true });
  appendFileSync(join(folder, "evidence.jsonl"), JSON.stringify({ v: 1, kind, data }) + "\n");
}

async function get(path) {
  const r = await fetch(`${APP}${path}`);
  record("http", { method: "GET", url: `${APP}${path}`, status: r.status, response: { body: await r.clone().text() } });
  return r;
}

describe("items api", () => {
  it("lists items", async () => {
    const r = await get("/api/items");
    assert.equal(r.status, 200);
    assert.deepEqual((await r.json()).map((i) => i.name), ["apple", "pear"]);
  });

  it("item name", async () => {
    const r = await get("/api/items/1");
    assert.equal((await r.json()).name, "banana");
  });

  it.skip("skipped", async () => {
    await fetch(`${APP}/api/items`);
  });

  hang("hangs", async () => {
    await fetch(`${APP}/api/hang`);
  });
});
