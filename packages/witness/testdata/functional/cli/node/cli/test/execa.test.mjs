import { execa } from "execa";

test("runs the installed command", async () => {
  const { stdout, exitCode } = await execa("itemsctl", ["list"]);
  expect(exitCode).toBe(0);
  expect(stdout).toMatch(/apple/);
});
