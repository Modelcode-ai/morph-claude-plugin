const { sum } = require("../lib/sum");

test("adds", () => {
  expect(sum(1, 2)).toBe(3);
});
