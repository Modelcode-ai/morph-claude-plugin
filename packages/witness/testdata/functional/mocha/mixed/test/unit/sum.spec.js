const assert = require("node:assert");
const { sum } = require("../../lib/sum");

describe("sum", () => {
  it("adds", () => {
    assert.strictEqual(sum(1, 2), 3);
  });
});
