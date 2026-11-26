import assert from "node:assert/strict";
import { test } from "node:test";

test("page shows the backend's greeting", async () => {
  const html = await (await fetch(`${process.env.WITNESS_WEB_URL}/`)).text();
  assert.match(html, /<h1 class="greeting">hello, witness<\/h1>/);
});

test("backend api answers", async () => {
  const r = await fetch(`${process.env.WITNESS_BACKEND_API_URL}/api/greeting`);
  assert.equal(r.status, 200);
});
