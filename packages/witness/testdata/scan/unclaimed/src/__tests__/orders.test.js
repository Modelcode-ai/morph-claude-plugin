const { total } = require("../orders");

test("total adds the lines", () => {
  expect(total([{ price: 2 }, { price: 3 }])).toBe(5);
});
