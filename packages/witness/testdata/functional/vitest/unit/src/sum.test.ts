import { expect, test, vi } from "vitest";
import { sum } from "./sum";

test("adds", () => {
  const log = vi.fn();
  expect(sum(1, 2, log)).toBe(3);
});
