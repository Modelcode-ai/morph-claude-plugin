const request = require("supertest");
const app = require("../src/server");

test("lists invoices for the admin", async () => {
  const password = process.env.E2E_ADMIN_PASSWORD;
  const res = await request(app).get("/invoices").auth("admin@billing.test", password);
  expect(res.status).toBe(200);
});
