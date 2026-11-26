const { format } = require("../../src/format.js");

test("formats one item per line", () => {
  expect(format(["a", "b"])).toBe("a\nb");
});
