const request = require("supertest");
const { app } = require("../src/app");

test("lists orders", async () => {
  const res = await request(app).get("/api/orders");
  expect(res.status).toBe(200);
  expect(res.body).toEqual([]);
});
