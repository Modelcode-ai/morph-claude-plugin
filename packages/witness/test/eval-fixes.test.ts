import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as net from "node:net";
import * as path from "node:path";
import { describe, test } from "node:test";
import { APPS, ctrf, latest, readJson, service, suite, tmpRepo, witness } from "./helpers.ts";

const RUN = `\n[run]\nstall_timeout = "5s"\nheartbeat = "1s"\nkill_grace = "1s"\n`;

function hold(): Promise<{ port: number; close: () => void }> {
  return new Promise((resolve) => {
    const srv = net.createServer((s) => {
      s.on("error", () => {});
      s.end("HTTP/1.1 404 Not Found\r\ncontent-length: 0\r\n\r\n");
    });
    srv.listen(0, "127.0.0.1", () => resolve({ port: (srv.address() as net.AddressInfo).port, close: () => srv.close() }));
  });
}

describe("eShopOnWeb eval fixes: boot", { concurrency: 4 }, () => {
  test("a fixed port in the ready URL that another process holds -> port_in_use before start", async () => {
    const h = await hold();
    try {
      const dir = tmpRepo(`version = 1
[[service]]
name = "api"
start = "FIXED_PORT=${h.port} node $APPS/server.mjs ok"
ready = { http = "http://127.0.0.1:${h.port}/health", timeout = "60s" }
${suite("pass")}${RUN}`);
      const t0 = Date.now();
      const r = await witness(dir, ["run", "--json"]);
      assert.equal(r.code, 3, r.stderr);
      assert.equal(r.json?.diagnosis.cause, "port_in_use");
      assert.match(r.json?.diagnosis.evidence, new RegExp(`port ${h.port} .* already accepts connections`));
      assert.ok(r.json?.diagnosis.try.some((t: string) => t.includes(`lsof -nP -iTCP:${h.port}`)));
      assert.ok(Date.now() - t0 < 20_000, "fails up front, not after the ready timeout");
    } finally {
      h.close();
    }
  });

  test("a ready URL that keeps answering 404 -> ready_timeout, not retryable, says the URL is wrong", async () => {
    const dir = tmpRepo(`version = 1
[[service]]
name = "api"
start = "node $APPS/server.mjs ok"
ready = { http = "\${self.url}/healthz", timeout = "4s" }
${suite("pass")}${RUN}`);
    const r = await witness(dir, ["run", "--json"]);
    assert.equal(r.code, 3);
    const d = r.json?.diagnosis;
    assert.equal(d.cause, "ready_timeout");
    assert.equal(d.retryable, false);
    assert.match(d.evidence, /answered HTTP 404 for \d+s: the app is up but this URL is not its health check/);
    assert.ok(d.try.some((t: string) => /fix ready\.http/.test(t)));
    assert.ok(!d.try.some((t: string) => /raise ready\.timeout/.test(t)));
    assert.match(r.stderr, /starting \(PORT=\d+, ready check http:\/\/127\.0\.0\.1:\d+\/healthz\)/);
  });

  test("a service that fails to boot skips only the suites that need it", async () => {
    const dir = tmpRepo(`version = 1\n${service("never-ready")}${suite("pass")}
[[suite]]
name = "unit"
service = []
cmd = "node $APPS/suite.mjs pass"
${RUN}`);
    const r = await witness(dir, ["run", "--json"]);
    assert.equal(r.code, 3);
    assert.equal(r.json?.outcome, "mistrial");
    assert.equal(r.json?.diagnosis.cause, "ready_timeout");
    const by = Object.fromEntries(r.json?.suites.map((s: any) => [s.name, s]));
    assert.equal(by.unit.state, "passed");
    assert.equal(by.unit.passed, 3);
    assert.equal(by.fake.state, "skipped");
    assert.match(by.fake.note, /not run: service api ready_timeout/);
  });

  test("ready.cmd sees the service env; external services are probed at their URL", async () => {
    const h = await hold();
    try {
      const dir = tmpRepo(`version = 1
[[service]]
name = "api"
start = "node $APPS/server.mjs ok"
env = { PROBE_TOKEN = "secret-\${PORT}" }
ready = { cmd = "test \\"$PROBE_TOKEN\\" = \\"secret-$PORT\\" && curl -fsS \${self.url}/health", timeout = "5s" }
[[service]]
name = "legacy"
external = "http://127.0.0.1:${h.port}"
[[suite]]
name = "fake"
cmd = "node $APPS/suite.mjs pass"
${RUN}`);
      const r = await witness(dir, ["run", "--json"]);
      assert.equal(r.code, 0, r.stderr);
      assert.match(r.stderr, /external http:\/\/127\.0\.0\.1:\d+ is ready/);
    } finally {
      h.close();
    }
  });
});

describe("eShopOnWeb eval fixes: suites", { concurrency: 4 }, () => {
  const gsuite = (cmd: string) => `\n[[suite]]\nname = "unit"\nservice = []\nreport = "\${WITNESS_REPORT_DIR}/*.xml"\ncmd = "${cmd}"\n`;

  test("a compile error before any test -> setup_failed with the error line, no listing or reruns", async () => {
    const dir = tmpRepo(`version = 1${gsuite("echo 'Restore complete'; echo 'src/Basket.cs(13,59): error CS1525: Invalid expression term'; echo 'Build FAILED.'; exit 1")}${RUN}`);
    const r = await witness(dir, ["run", "--json"]);
    assert.equal(r.code, 2, r.stderr);
    assert.equal(r.json?.diagnosis.cause, "setup_failed");
    assert.equal(r.json?.diagnosis.stage, "suite");
    assert.match(r.json?.diagnosis.evidence, /error CS1525/);
    assert.ok(!r.json?.diagnosis.try.some((t: string) => /writes its report/.test(t)));
    assert.doesNotMatch(r.stderr, /listing tests|rerunning/);
  });

  test("a missing helper script (exit 127) -> setup_failed, not report_missing", async () => {
    const dir = tmpRepo(`version = 1${gsuite("bash .witness/dotnet test")}${RUN}`);
    const r = await witness(dir, ["run", "--json"]);
    assert.equal(r.code, 2);
    assert.equal(r.json?.diagnosis.cause, "setup_failed");
    assert.match(r.json?.diagnosis.evidence, /\.witness\/dotnet: No such file or directory/);
  });

  test("every test skipped -> error, not passed", async () => {
    const dir = tmpRepo(`version = 1\n${service("ok")}${suite("pass", 'env = { SKIP_ALL = "1" }')}${RUN}`);
    const r = await witness(dir, ["run", "--json"]);
    assert.equal(r.code, 2, r.stderr);
    assert.equal(r.json?.suites[0].cause, "report_incomplete");
    assert.match(r.json?.suites[0].note, /all 3 test\(s\) were skipped/);
    assert.match(r.stderr, /VERDICT error · 0 passed, 0 failed · 3 skipped/);
  });

  test("only fixture-setup failures -> error setup_failed; the verdict counts them as error", async () => {
    const dir = tmpRepo(`version = 1\n${service("ok")}${suite("pass", 'env = { FIXTURE_ERROR = "1" }')}${RUN}`);
    const r = await witness(dir, ["run", "--json"]);
    assert.equal(r.code, 2, r.stderr);
    assert.equal(r.json?.diagnosis.cause, "setup_failed");
    assert.match(r.json?.diagnosis.evidence, /threw in InitializeAsync/);
    assert.match(r.stderr, /VERDICT error · 0 passed, 0 failed · 3 error/);
  });

  test("dotnet MTP project without a TRX reporter: check fails up front, hint covers central package management", async () => {
    const dir = tmpRepo(`version = 1\n[[suite]]\nname = "publicapi"\nadapter = "dotnet"\nservice = []\ncmd = "dotnet test --project tests/Api/Api.csproj"\n`, {
      files: {
        "global.json": JSON.stringify({ test: { runner: "Microsoft.Testing.Platform" } }),
        "tests/Api/Api.csproj": `<Project Sdk="Microsoft.NET.Sdk"><ItemGroup><PackageReference Include="xunit.v2" /></ItemGroup></Project>`,
        "Directory.Packages.props": `<Project><PropertyGroup><ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally></PropertyGroup><ItemGroup><PackageVersion Include="Microsoft.Testing.Platform" Version="2.5.2" /></ItemGroup></Project>`,
      },
    });
    const r = await witness(dir, ["check", "--json"]);
    assert.equal(r.code, 2, r.stderr);
    const s = r.json?.stages.find((x: any) => x.stage === "suite");
    assert.equal(s.ok, false);
    assert.match(s.diagnosis.evidence, /<PackageVersion Include="Microsoft\.Testing\.Extensions\.TrxReport" Version="2\.5\.2" \/> to Directory\.Packages\.props/);
    assert.match(r.stderr, /CHECK failed/);
  });
});

describe("eShopOnWeb eval fixes: --against", { concurrency: 2 }, () => {
  test("the worktree gets the target's .witness/ helpers; check --against boots the base; suite-level origin rows stay out", async () => {
    const dir = tmpRepo(`version = 1\n${service("ok")}
[[suite]]
name = "fake"
service = "api"
cmd = "bash .witness/run-suite.sh"
report = "\${WITNESS_REPORT_DIR}/*.xml"
${RUN}`, { git: true });
    fs.writeFileSync(path.join(dir, ".witness", "run-suite.sh"), `node ${APPS}/suite.mjs pass\n`);
    spawnSync("git", ["add", "-A"], { cwd: dir });
    spawnSync("git", ["commit", "-qm", "helper"], { cwd: dir });
    const r = await witness(dir, ["run", "--json", "--against", "HEAD~1"]);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stderr, /copied the target's \.witness\/ \(config helpers\) into the worktree/);
    assert.equal(r.json?.against.outcome, "passed");
    assert.equal(r.json?.against.parity.same, 3);
    const c = await witness(dir, ["check", "--stage", "boot", "--against", "HEAD~1"]);
    assert.equal(c.code, 0, c.stderr);
    assert.match(c.stderr, /CHECK ok · up to boot · against HEAD~1/);
    const wts = spawnSync("git", ["worktree", "list"], { cwd: dir, encoding: "utf8" }).stdout.trim().split("\n");
    assert.equal(wts.length, 1, "temporary worktrees removed");
    assert.equal(spawnSync("git", ["status", "--porcelain"], { cwd: dir, encoding: "utf8" }).stdout.trim(), "", ".witness/scratch ignores itself");
    assert.ok(fs.existsSync(path.join(dir, ".witness", "scratch", ".gitignore")));
  });

  test("origin suite-level rows are not added to the target's tests", async () => {
    const dir = tmpRepo(`version = 1\n${service("ok")}
[[service]]
name = "api-origin"
role = "origin"
start = "node $APPS/server.mjs ok"
env = { GREETING = "legacy" }
ready = { http = "\${self.url}/health", timeout = "3s" }
[[suite]]
name = "fake"
service = "api"
cmd = "curl -fsS $WITNESS_API_URL/hello | grep -q world || exit 3; node $APPS/suite.mjs pass"
${RUN}`);
    const r = await witness(dir, ["run", "--json", "--against", "legacy"]);
    assert.equal(r.code, 0, r.stderr);
    assert.equal(r.json?.against.outcome, "failed");
    const tests = ctrf(dir).results.tests;
    assert.ok(!tests.some((t: any) => t.extra.witness.parity === "origin_only"), JSON.stringify(tests.map((t: any) => t.extra.witness)));
    assert.equal(r.json?.summary.tests, 3);
    assert.equal(r.json?.summary.other, 0);
    assert.doesNotMatch(r.stderr, /VERDICT passed .*other/);
  });
});
