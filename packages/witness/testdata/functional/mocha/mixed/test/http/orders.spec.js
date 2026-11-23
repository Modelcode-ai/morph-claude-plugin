const assert = require("node:assert");
const request = require("supertest");
const { app } = require("../../src/app");

describe("orders", () => {
  it("lists orders", async () => {
    const res = await request(app).get("/api/orders");
    assert.strictEqual(res.status, 200);
  });
});
