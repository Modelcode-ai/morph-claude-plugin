import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { test } from "node:test";
import { PKG } from "./helpers.ts";

const dist = path.join(PKG, "dist", "witness.mjs");

test("bin/witness runs the bundle when asked to", { skip: !fs.existsSync(dist) && "dist not built" }, () => {
  const r = spawnSync(path.join(PKG, "bin", "witness"), ["--version"], { env: { ...process.env, WITNESS_USE_DIST: "1" }, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^\d+\.\d+\.\d+/);
});

