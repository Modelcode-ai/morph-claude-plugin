import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, test } from "node:test";
import { pathToFileURL } from "node:url";
import { parse } from "smol-toml";
import { ConfigError, parseConfig, referenceServices } from "../src/config.ts";
import { service, sh, tmpRepo, witness } from "./helpers.ts";

const RUN = `\n[run]\nstall_timeout = "5s"\nheartbeat = "1s"\nkill_grace = "1s"\n`;
const LEGACY_START = sh("test -f legacy.marker && node $APPS/server.mjs ok", "if (-not (Test-Path legacy.marker)) { exit 1 }; node $APPS/server.mjs ok");
const cfg = (toml: string) => parseConfig(parse(`version = 1\n${service("ok")}\n${toml}`) as Record<string, unknown>, "/r/.witness/witness.toml");
const git = (dir: string, ...a: string[]) => spawnSync("git", a, { cwd: dir, encoding: "utf8" });
const worktrees = (dir: string) => git(dir, "worktree", "list").stdout.trim().split("\n").length;

/** The suite needs report.flag, which only the target's setup change adds (like a test-report package). */
const FLAG_SUITE = `
[[suite]]
kind = "api"
name = "fake"
service = "api"
cmd = "${sh(
  "test -f report.flag || { echo 'no report package' >&2; exit 2; }; EXTRA_TEST=$(cat new-test.txt 2>/dev/null) node $APPS/suite.mjs pass",
  "if (-not (Test-Path report.flag)) { [Console]::Error.WriteLine('no report package'); exit 2 }; if (Test-Path new-test.txt) { $env:EXTRA_TEST = Get-Content new-test.txt }; node $APPS/suite.mjs pass",
)}"
report = "\${WITNESS_REPORT_DIR}/*.xml"
`;

describe("[reference] config", () => {
  test("overrides merge into the target's services; tests defaults by where the reference lives", () => {
    const c = cfg(`[reference]\nref = "main"\nsetup = "make deps"\n[reference.service.api]\nstart = "./legacy"\nenv = { MODE = "legacy" }\n`);
    assert.equal(c.reference?.tests, undefined, "decided once --against resolves the ref");
    assert.equal(c.reference?.setup, "make deps");
    const [api] = referenceServices(c);
    assert.equal(api.start, "./legacy");
    assert.deepEqual(api.env, { MODE: "legacy" });
    assert.ok(api.ready, "ready is inherited");
    assert.equal(cfg(`[reference]\nref = "main"\ntests = "target"\n`).reference?.tests, "target");
  });

  test("bad references are config errors naming the key", () => {
    const err = (toml: string, re: RegExp) => assert.throws(() => cfg(toml), (e: Error) => e instanceof ConfigError && re.test(e.message));
    err(`[reference]\n`, /reference: needs ref .* repo .* setup, or a .* override/);
    assert.equal(cfg(`[reference]\nsetup = "touch report.flag"\n`).reference?.ref, undefined, "setup alone: the ref comes from --against <ref>");
    err(`[reference]\nref = "main"\n[reference.service.ap]\nstart = "x"\n`, /reference\.service\.ap: no target service "ap" to override \(did you mean "api"\?\)/);
    err(`[reference]\nref = "main"\ntests = "both"\n`, /reference\.tests: expected "reference"/);
    err(`[reference]\nref = "main"\n[reference.service.api]\nstart = ""\n`, /reference\.service\.api: leaves the service without start or external/);
    err(`[reference]\nref = "main"\n[reference.service.api]\nport = "1"\n`, /reference\.service\.api\.port: unknown key \(did you mean "ports"\?\)/);
    err(`[reference]\nref = "main"\n[[service]]\nname = "api-origin"\nrole = "origin"\nstart = "x"\nready = { cmd = "true" }\n`, /reference: use \[reference\] or role = "origin" services, not both/);
  });
});

describe("--against with [reference]", { concurrency: 2 }, () => {
  test("a base without the target's setup change: the VERDICT names the origin failure; [reference] setup fixes it", async () => {
    const dir = tmpRepo(`version = 1\n${service("ok")}${FLAG_SUITE}${RUN}`, { git: true });
    fs.writeFileSync(path.join(dir, "report.flag"), "");
    fs.writeFileSync(path.join(dir, "new-test.txt"), "filtersByName");
    git(dir, "add", "-A");
    git(dir, "commit", "-qm", "setup: add the report package");
    const bare = await witness(dir, ["run", "--json", "--against", "HEAD~1"]);
    assert.equal(bare.code, 0, bare.stderr);
    assert.match(bare.stderr, /against HEAD~1: origin error \(\w+ in fake: no comparison for that suite\)/);
    assert.match(bare.stderr, /add that step as \[reference\] setup/);

    fs.appendFileSync(path.join(dir, ".witness", "witness.toml"), `\n[reference]\nsetup = "${sh("touch report.flag", "Set-Content report.flag x")}"\n`);
    const noRef = await witness(dir, ["run", "--against", "reference"]);
    assert.equal(noRef.code, 64);
    assert.match(noRef.stderr, /\[reference\] has no ref.*pass --against <base branch>/);
    const viaFlag = await witness(dir, ["run", "--json", "--against", "HEAD~1"]);
    assert.equal(viaFlag.json?.against.outcome, "passed", viaFlag.stderr);
    assert.deepEqual(viaFlag.json?.against.parity, { same: 3, differs: 0, target_only: 1, origin_only: 0 }, "the base runs its own tests, so the new test is only on the target");
    fs.appendFileSync(path.join(dir, ".witness", "witness.toml"), `ref = "HEAD~1"\n`);
    const r = await witness(dir, ["run", "--json", "--against", "reference"]);
    assert.equal(r.code, 0, r.stderr);
    assert.equal(r.json?.against.outcome, "passed");
    assert.equal(r.json?.against.parity.same, 3);
    assert.equal(r.json?.against.parity.target_only, 1);
    assert.match(r.stderr, /copied the target's \.witness\/ \(config helpers\) into the worktree/);
    const c = await witness(dir, ["check", "--against", "reference"]);
    assert.equal(c.code, 0, c.stderr);
    assert.match(c.stderr, /CHECK ok · against reference/);
    assert.equal(worktrees(dir), 1, "temporary worktrees removed");
  });

  test("another repo at a path: its services run there with their own commands; the suites run from this checkout", async () => {
    const legacy = tmpRepo(`version = 1\n${service("ok")}${RUN}`, { files: { "legacy.marker": "" } });
    const dir = tmpRepo(`version = 1\n${service("ok")}
[[suite]]
kind = "api"
name = "fake"
service = "api"
cmd = "${sh('curl -fsS $WITNESS_API_URL/hello | grep -q \\"$GREETING_WANTED\\" && node $APPS/suite.mjs pass', "if ((curl -fsS $env:WITNESS_API_URL/hello) -notmatch $env:GREETING_WANTED) { exit 3 }; node $APPS/suite.mjs pass")}"
env = { GREETING_WANTED = "world" }

[reference]
repo = "${legacy.split(path.sep).join("/")}"

[reference.service.api]
start = "${LEGACY_START}"
env = { GREETING = "legacy" }
${RUN}`);
    const r = await witness(dir, ["run", "--json", "--against", "reference"]);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stderr, new RegExp(`reference services run in ${legacy.replace(/[\\/.]/g, "\\$&")}`));
    assert.match(r.stderr, /suites run from this checkout against the reference services/);
    assert.equal(r.json?.against.outcome, "failed", "the legacy app answers with its own greeting");
  });

  test("a git URL is cloned once into .witness/cache and checked out at ref; a bad ref or no section is a usage error", async () => {
    const legacy = tmpRepo(`version = 1\n${service("ok")}${RUN}`, { git: true, files: { "legacy.marker": "" } });
    git(legacy, "tag", "v1");
    const dir = tmpRepo(`version = 1\n${service("ok")}
[[suite]]
kind = "api"
name = "fake"
service = "api"
cmd = "node $APPS/suite.mjs pass"

[reference]
repo = "${pathToFileURL(legacy).href}"
ref = "v1"

[reference.service.api]
start = "${LEGACY_START}"
${RUN}`);
    const r = await witness(dir, ["run", "--json", "--against", "reference"]);
    assert.equal(r.code, 0, r.stderr);
    assert.equal(r.json?.against.parity.same, 3);
    assert.ok(fs.readdirSync(path.join(dir, ".witness", "cache", "reference")).length === 1);
    assert.equal(worktrees(legacy), 1, "the clone's worktree is removed");
    const again = await witness(dir, ["run", "--json", "--against", "main"]);
    assert.equal(again.json?.against.outcome, "passed", "a ref on the command line overrides [reference] ref; the clone is fetched");

    const none = tmpRepo(`version = 1\n${service("ok")}\n[[suite]]\nkind = "api"\nname = "fake"\nservice = "api"\ncmd = "node $APPS/suite.mjs pass"\n${RUN}`, { git: true });
    const u = await witness(none, ["run", "--against", "reference"]);
    assert.equal(u.code, 64);
    assert.match(u.stderr, /the config has no \[reference\] section/);
  });

  test("a failing [reference] setup is a mistrial of the origin side, in run and check", async () => {
    const dir = tmpRepo(`version = 1\n${service("ok")}
[[suite]]
kind = "api"
name = "fake"
service = "api"
cmd = "node $APPS/suite.mjs pass"

[reference]
ref = "HEAD"
setup = "${sh("echo 'package not found' >&2; exit 4", "[Console]::Error.WriteLine('package not found'); exit 4")}"
${RUN}`, { git: true });
    const r = await witness(dir, ["run", "--json", "--against", "reference"]);
    assert.equal(r.code, 0, r.stderr);
    assert.equal(r.json?.against.outcome, "mistrial");
    assert.match(r.stderr, /origin mistrial \(setup_failed: no comparison\)/);
    assert.match(r.stderr, /\[reference\] setup exited 4: package not found/);
    const c = await witness(dir, ["check", "--against", "reference"]);
    assert.equal(c.code, 3, c.stderr);
    assert.match(c.stderr, /cause: setup_failed/);
    assert.equal(worktrees(dir), 1);
  });
});
