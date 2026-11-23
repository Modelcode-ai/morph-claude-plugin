const APP = process.env.WITNESS_APP_URL ?? "http://127.0.0.1:8080";
const hang = process.env.WITNESS_KIT_HANG === "1" ? test : test.skip;

describe("items api", () => {
  test("lists items", async () => {
    const r = await fetch(`${APP}/api/items`);
    expect(r.status).toBe(200);
    expect((await r.json()).map((i) => i.name)).toEqual(["apple", "pear"]);
  });

  test("item name", async () => {
    const r = await fetch(`${APP}/api/items/1`);
    expect((await r.json()).name).toBe("banana");
  });

  test.skip("skipped", async () => {
    await fetch(`${APP}/api/items`);
  });

  hang("hangs", async () => {
    await fetch(`${APP}/api/hang`);
  });
});
