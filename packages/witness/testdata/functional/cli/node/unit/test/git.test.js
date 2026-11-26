const { execSync } = require("node:child_process");

test("git is available for the release script", () => {
  expect(execSync("git --version").toString()).toMatch(/git/);
});
