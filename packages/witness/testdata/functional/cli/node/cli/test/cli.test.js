const { execFileSync } = require("node:child_process");
const path = require("node:path");

const BIN = path.join(__dirname, "..", "bin", "itemsctl.js");

test("lists items", () => {
  const out = execFileSync(process.execPath, [BIN, "list"], { encoding: "utf8" });
  expect(out.split("\n")).toContain("pear");
});
