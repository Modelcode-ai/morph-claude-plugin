import assert from "node:assert/strict";

const APP = process.env.WITNESS_APP_URL ?? "http://127.0.0.1:8080";
const hang = process.env.WITNESS_KIT_HANG === "1" ? it : it.skip;

describe("items api", () => {
  it("lists items", async () => {
    const r = await fetch(`${APP}/api/items`);
    assert.equal(r.status, 200);
    assert.deepEqual((await r.json()).map((i) => i.name), ["apple", "pear"]);
  });

  it("item name", async () => {
    const r = await fetch(`${APP}/api/items/1`);
    assert.equal((await r.json()).name, "banana");
  });

  it.skip("skipped", async () => {
    await fetch(`${APP}/api/items`);
  });

  hang("hangs", async () => {
    await fetch(`${APP}/api/hang`);
  });
});
