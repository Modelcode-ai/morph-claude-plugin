import assert from "node:assert/strict";
import { test } from "node:test";

test("greeting comes from the store", async () => {
  const r = await fetch(`${process.env.WITNESS_API_URL}/api/greeting`);
  assert.equal(r.status, 200);
  assert.match((await r.json()).greeting, /^hello, /i);
});
