import { expect, test } from "vitest";

const base = process.env.WITNESS_API_URL ?? "http://127.0.0.1:3000";

test("lists orders", async () => {
  const res = await fetch(`${base}/api/orders`);
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual([]);
});
