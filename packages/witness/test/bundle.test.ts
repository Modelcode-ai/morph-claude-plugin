import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { test } from "node:test";
import { PKG } from "./helpers.ts";

const dist = path.join(PKG, "dist", "witness.mjs");

test("bin/witness runs the bundle when asked to", { skip: (!fs.existsSync(dist) && "dist not built") || (process.platform === "win32" && "bash launcher") }, () => {
  const r = spawnSync(path.join(PKG, "bin", "witness"), ["--version"], { env: { ...process.env, WITNESS_USE_DIST: "1" }, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^\d+\.\d+\.\d+/);
});

test("bin/witness.mjs runs the sources, or the bundle when asked to", () => {
  const run = (env: Record<string, string>) => spawnSync(process.execPath, [path.join(PKG, "bin", "witness.mjs"), "--version"], { env: { ...process.env, ...env }, encoding: "utf8" });
  const src = run({});
  assert.equal(src.status, 0, src.stderr);
  assert.match(src.stdout, /^\d+\.\d+\.\d+/);
  assert.equal(src.stderr, "", "no experimental-feature warnings");
  if (!fs.existsSync(dist)) return;
  const bundle = run({ WITNESS_USE_DIST: "1" });
  assert.equal(bundle.status, 0, bundle.stderr);
  assert.match(bundle.stdout, /^\d+\.\d+\.\d+/);
});

