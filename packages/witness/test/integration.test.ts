import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as net from "node:net";
import * as path from "node:path";
import { describe, test } from "node:test";
import { alive, ctrf, latest, readJson, service, suite, tmpRepo, witness } from "./helpers.ts";

const RUN = `\n[run]\nstall_timeout = "2s"\nheartbeat = "1s"\nkill_grace = "1s"\n`;

describe("witness run: outcomes and causes", { concurrency: 4 }, () => {
  test("passing suite -> passed, exit 0, CTRF + status + events", async () => {
    const dir = tmpRepo(`version = 1\n${service("ok")}${suite("pass")}${RUN}`);
    const r = await witness(dir, ["run", "--json", "--label", "smoke"]);
    assert.equal(r.code, 0, r.stderr);
    assert.equal(r.json?.outcome, "passed");
    assert.match(r.stderr, /witness {2}VERDICT passed · 3 passed, 0 failed/);
    const c = ctrf(dir);
    assert.equal(c.results.summary.tests, 3);
    assert.equal(c.results.extra.witness.schema, "witness.run/v1");
    assert.equal(c.results.extra.witness.label, "smoke");
    assert.deepEqual(c.results.tests.map((t: any) => t.extra.witness.id).sort(), ["generic:Api#hello", "generic:Calc#add", "generic:Calc#sub"]);
    assert.ok(c.results.tests.every((t: any) => t.extra.witness.obtained === "report" && t.extra.witness.kind === "api"));
    const st = readJson(path.join(latest(dir), "status.json"));
    assert.equal(st.phase, "finished");
    assert.deepEqual([st.suites[0].kind, st.suites[0].services], ["api", ["api"]]);
    assert.match(st.run_id, /^r-\d{8}-\d{6}-[0-9a-f]{4}$/);
    const events = fs.readFileSync(path.join(latest(dir), "events.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l).type);
    assert.ok(events.includes("service_ready") && events.includes("suite_finished") && events.at(-1) === "run_finished");
    const state = readJson(path.join(latest(dir), "state.json"));
    assert.deepEqual(state.procs, []);
    assert.ok(fs.readFileSync(path.join(latest(dir), "logs", "fake.log"), "utf8").includes("GET /hello -> 200"));
  });

  test("failing test -> failed, exit 1", async () => {
    const dir = tmpRepo(`version = 1\n${service("ok")}${suite("fail")}${RUN}`);
    const r = await witness(dir, ["run", "--json"]);
    assert.equal(r.code, 1);
    assert.equal(r.json?.outcome, "failed");
    const sub = ctrf(dir).results.tests.find((t: any) => t.extra.witness.id === "generic:Calc#sub");
    assert.equal(sub.status, "failed");
    assert.equal(sub.message, "expected 1 got 2");
  });

  test("service crashes after ready -> mistrial service_died, exit 3", async () => {
    const dir = tmpRepo(`version = 1\n${service("crash-after-ready")}${suite("slow")}${RUN}`);
    const r = await witness(dir, ["run", "--json"]);
    assert.equal(r.code, 3, r.stderr);
    assert.equal(r.json?.outcome, "mistrial");
    assert.equal(r.json?.diagnosis.cause, "service_died");
    assert.equal(r.json?.diagnosis.service, "api");
    assert.match(r.json?.diagnosis.evidence, /exited with code 137/);
    assert.match(r.stderr, /cause: service_died/);
  });

  test("service never ready -> mistrial ready_timeout, exit 3", async () => {
    const dir = tmpRepo(`version = 1\n${service("never-ready")}${suite("pass")}${RUN}`);
    const r = await witness(dir, ["run", "--json"]);
    assert.equal(r.code, 3);
    assert.equal(r.json?.diagnosis.cause, "ready_timeout");
    assert.equal(r.json?.diagnosis.stage, "boot");
    assert.ok(r.json?.diagnosis.try.some((t: string) => t.startsWith("curl -i http://127.0.0.1:")));
    assert.equal(r.json?.suites[0].state, "skipped");
  });

  test("hanging suite -> stalled, exit 4, suite process group killed", async () => {
    const dir = tmpRepo(`version = 1\n${service("ok")}${suite("hang", 'per_test_timeout = "30s"')}${RUN}`);
    const r = await witness(dir, ["run", "--json"]);
    assert.equal(r.code, 4, r.stderr);
    assert.equal(r.json?.outcome, "stalled");
    assert.equal(r.json?.diagnosis.cause, "stalled");
    assert.match(r.stderr, /stopping: no output and no report growth/);
    assert.match(r.stderr, /witness {2}\[\d\d:\d\d\] … /, "heartbeat line while the suite is quiet");
  });

  test("suite timeout -> stalled with suite_timeout, exit 4", async () => {
    const dir = tmpRepo(`version = 1\n${service("ok")}${suite("slow", 'timeout = "2s"')}${RUN}`);
    const r = await witness(dir, ["run", "--json"]);
    assert.equal(r.code, 4);
    assert.equal(r.json?.diagnosis.cause, "suite_timeout");
    assert.equal(r.json?.suites[0].state, "timeout");
  });

  test("port already in use -> mistrial port_in_use with the log line as evidence", async () => {
    const blocker = net.createServer().listen(0, "127.0.0.1");
    await new Promise((r) => blocker.once("listening", r));
    const port = (blocker.address() as net.AddressInfo).port;
    try {
      const dir = tmpRepo(`version = 1\n${service("ok", `env = { FIXED_PORT = "${port}" }`)}${suite("pass")}${RUN}`);
      const r = await witness(dir, ["run", "--json"]);
      assert.equal(r.code, 3);
      assert.equal(r.json?.diagnosis.cause, "port_in_use");
      assert.match(r.json?.diagnosis.evidence, /address already in use/);
      const pool = tmpRepo(`version = 1\n${service("ok", `ports = "${port}"`)}${suite("pass")}${RUN}`);
      const r2 = await witness(pool, ["run", "--json"]);
      assert.equal(r2.json?.diagnosis.cause, "port_in_use");
      assert.match(r2.json?.diagnosis.evidence, new RegExp(`port ${port} is already in use`));
      assert.ok(r2.json?.diagnosis.try.some((t: string) => t.includes(`lsof -nP -iTCP:${port}`)));
    } finally {
      blocker.close();
    }
  });

  test("broken XML + non-zero exit -> error report_unreadable, suite-level result", async () => {
    const dir = tmpRepo(`version = 1\n${service("ok")}${suite("broken-xml")}${RUN}`);
    const r = await witness(dir, ["run", "--json"]);
    assert.equal(r.code, 2);
    assert.equal(r.json?.outcome, "error");
    assert.equal(r.json?.diagnosis.cause, "report_unreadable");
    assert.match(r.json?.diagnosis.evidence, /truncated|invalid XML/);
    const tests = ctrf(dir).results.tests;
    assert.equal(tests.length, 1);
    assert.equal(tests[0].extra.witness.obtained, "suite-level");
    assert.equal(tests[0].status, "failed");
  });

  test("broken XML with selected tests -> each test rerun alone via select", async () => {
    const dir = tmpRepo(`version = 1\n${service("ok")}${suite("broken-xml", 'select = "node $APPS/suite.mjs broken-xml --only {ids}"')}${RUN}`);
    const r = await witness(dir, ["run", "--json", "--select", "generic:Calc#add,generic:Calc#sub"]);
    const tests = ctrf(dir).results.tests;
    assert.deepEqual(tests.map((t: any) => [t.extra.witness.id, t.status, t.extra.witness.obtained]), [
      ["generic:Calc#add", "passed", "per-test-rerun"],
      ["generic:Calc#sub", "passed", "per-test-rerun"],
    ]);
    assert.equal(r.json?.outcome, "error", "suite exited 1 without a report, so the run is not clean even though each test passes alone");
    assert.equal(r.json?.suites[0].cause, "report_incomplete");
  });

  test("report all passed but exit non-zero -> error report_incomplete, tests keep status", async () => {
    const dir = tmpRepo(`version = 1\n${service("ok")}${suite("passed-nonzero")}${RUN}`);
    const r = await witness(dir, ["run", "--json"]);
    assert.equal(r.code, 2);
    assert.equal(r.json?.diagnosis.cause, "report_incomplete");
    assert.ok(ctrf(dir).results.tests.every((t: any) => t.status === "passed"));
    assert.equal(ctrf(dir).results.extra.witness.outcome, "error");
  });

  test("expected test absent from the report -> other/missing", async () => {
    const dir = tmpRepo(`version = 1\n${service("ok")}${suite("pass", 'select = "node $APPS/suite.mjs pass --only {ids}"')}${RUN}`);
    const r = await witness(dir, ["run", "--json", "--select", "generic:Calc#add,generic:Calc#nope"]);
    const nope = ctrf(dir).results.tests.find((t: any) => t.extra.witness.id === "generic:Calc#nope");
    assert.equal(nope.status, "other");
    assert.equal(nope.extra.witness.status_detail, "missing");
    assert.equal(r.json?.outcome, "error");
  });

  test("no report from a generic suite without report config -> exit code decides", async () => {
    const dir = tmpRepo(`version = 1\n${service("ok")}${suite("no-report")}${RUN}`);
    const r = await witness(dir, ["run", "--json"]);
    assert.equal(r.code, 0);
    assert.equal(ctrf(dir).results.tests[0].extra.witness.obtained, "suite-level");
  });

  test("report configured but missing -> error report_missing", async () => {
    const dir = tmpRepo(`version = 1\n${service("ok")}${suite("no-report", 'report = "out/*.xml"')}${RUN}`);
    const r = await witness(dir, ["run", "--json"]);
    assert.equal(r.code, 2);
    assert.equal(r.json?.diagnosis.cause, "report_missing");
  });

  test("missing required env -> mistrial missing_env with names", async () => {
    const dir = tmpRepo(`version = 1\n[env]\nrequired = ["WITNESS_TEST_DB_URL"]\n${service("ok")}${suite("pass")}${RUN}`);
    const r = await witness(dir, ["run", "--json"]);
    assert.equal(r.code, 3);
    assert.equal(r.json?.diagnosis.cause, "missing_env");
    assert.deepEqual(r.json?.diagnosis.env_missing, ["WITNESS_TEST_DB_URL"]);
    fs.writeFileSync(path.join(dir, ".witness", ".env"), "WITNESS_TEST_DB_URL=postgres://x\n");
    fs.writeFileSync(path.join(dir, ".witness", "witness.toml"), fs.readFileSync(path.join(dir, ".witness", "witness.toml"), "utf8").replace("[env]", '[env]\nfile = ".witness/.env"'));
    const r2 = await witness(dir, ["run", "--json"]);
    assert.equal(r2.code, 0, r2.stderr);
  });

  test("bad config -> exit 3 naming the key", async () => {
    const dir = tmpRepo(`version = 1\n[[service]]\nname = "api"\nstart = "x"\nready = { http = "/", timeout = "soon" }\n`);
    const r = await witness(dir, ["run"]);
    assert.equal(r.code, 3);
    assert.match(r.stderr, /service\.api\.ready\.timeout: expected a duration/);
  });

  test("unreachable dependency -> mistrial dependency_unreachable", async () => {
    const dir = tmpRepo(`version = 1\n[[dependency]]\nname = "db"\ncheck = "echo 'no response from db:5432'; exit 2"\n${service("ok")}${suite("pass")}${RUN}`);
    const r = await witness(dir, ["run", "--json"]);
    assert.equal(r.code, 3);
    assert.equal(r.json?.diagnosis.cause, "dependency_unreachable");
    assert.match(r.json?.diagnosis.evidence, /no response from db:5432/);
  });

  test("dependency started by witness when its check fails", async () => {
    const dir = tmpRepo(`version = 1\n[[dependency]]\nname = "db"\ncheck = "test -f db.up"\nstart = "touch db.up"\nstop = "rm db.up"\ntimeout = "5s"\n${service("ok")}${suite("pass")}${RUN}`);
    const r = await witness(dir, ["run", "--json"]);
    assert.equal(r.code, 0, r.stderr);
    assert.ok(!fs.existsSync(path.join(dir, "db.up")), "stop ran at teardown");
  });

  test("service exits before ready with a missing module -> exited_before_ready + evidence", async () => {
    const dir = tmpRepo(`version = 1\n${service("missing-module")}${suite("pass")}${RUN}`);
    const r = await witness(dir, ["run", "--json"]);
    assert.equal(r.json?.diagnosis.cause, "exited_before_ready");
    assert.match(r.json?.diagnosis.evidence, /ModuleNotFoundError/);
  });

  test("service log shows connection refused -> dependency_unreachable", async () => {
    const dir = tmpRepo(`version = 1\n${service("dep-refused")}${suite("pass")}${RUN}`);
    const r = await witness(dir, ["run", "--json"]);
    assert.equal(r.json?.diagnosis.cause, "dependency_unreachable");
    assert.match(r.json?.diagnosis.evidence, /ECONNREFUSED/);
  });

  test("setup failure -> setup_failed; setup skipped when inputs unchanged", async () => {
    const bad = tmpRepo(`version = 1\n${service("ok", 'setup = "echo installing; exit 7"')}${suite("pass")}${RUN}`);
    const r = await witness(bad, ["run", "--json"]);
    assert.equal(r.json?.diagnosis.cause, "setup_failed");
    const good = tmpRepo(`version = 1\n${service("ok", 'setup = "echo installing >> setup.count"')}${suite("pass")}${RUN}`, { git: true, files: { ".gitignore": "setup.count\n" } });
    await witness(good, ["run"]);
    const r2 = await witness(good, ["run"]);
    assert.match(r2.stderr, /setup {2}api · skipped \(inputs unchanged/);
    const r3 = await witness(good, ["run", "--no-setup"]);
    assert.match(r3.stderr, /skipped \(--no-setup\)/);
    assert.equal(fs.readFileSync(path.join(good, "setup.count"), "utf8").trim().split("\n").length, 1);
  });

  test("artifacts left under WITNESS_ARTIFACTS/<test-id>/ are listed in artifacts.json", async () => {
    const dir = tmpRepo(`version = 1\n${service("ok")}${suite("artifacts")}${RUN}`);
    await witness(dir, ["run"]);
    const arts = readJson(path.join(latest(dir), "artifacts.json"));
    const shot = arts.find((a: any) => a.file.endsWith("01-home.png"));
    assert.equal(shot.artifact_type, "screenshot");
    assert.equal(shot.test_id, "generic:Api#hello");
    assert.equal(shot.step_index, 1);
    assert.equal(shot.step_label, "home");
    assert.equal(arts.find((a: any) => a.file.endsWith("server.log")).artifact_type, "log");
  });
});

describe("witness run: lifecycle", { concurrency: 2 }, () => {
  test("SIGINT -> interrupted, exit 5, run dir kept, service killed", async () => {
    const dir = tmpRepo(`version = 1\n${service("ok")}${suite("slow")}${RUN}`);
    let pid = 0;
    const p = witness(dir, ["run", "--json"], { onSpawn: (x) => (pid = x) });
    const statusFile = () => path.join(latest(dir), "status.json");
    for (let i = 0; i < 100; i++) {
      await new Promise((r) => setTimeout(r, 100));
      try {
        if (readJson(statusFile()).phase === "suite") break;
      } catch {
        /* not yet */
      }
    }
    await new Promise((r) => setTimeout(r, 500));
    process.kill(pid, "SIGINT");
    const r = await p;
    assert.equal(r.code, 5, r.stderr);
    assert.equal(r.json?.outcome, "interrupted");
    const st = readJson(statusFile());
    assert.equal(st.phase, "finished");
    const servicePid = JSON.parse(fs.readFileSync(path.join(latest(dir), "events.jsonl"), "utf8").split("\n").find((l) => l.includes("service_started"))!).pid;
    assert.equal(alive(servicePid), false);
  });

  test("stale run is reaped on the next invocation (process group killed, marked interrupted)", async () => {
    const dir = tmpRepo(`version = 1\n${service("ok")}${suite("pass")}${RUN}`);
    const orphan = spawn("bash", ["-c", "sleep 300"], { detached: true, stdio: "ignore" });
    orphan.unref();
    const stale = path.join(dir, ".witness", "runs", "r-20260101-000000-abcd");
    fs.mkdirSync(stale, { recursive: true });
    fs.writeFileSync(path.join(stale, "status.json"), JSON.stringify({ run_id: "r-20260101-000000-abcd", phase: "suite", suites: [], started_at: new Date().toISOString(), last_event: "x", pid: 999999 }));
    fs.writeFileSync(path.join(stale, "state.json"), JSON.stringify({ pid: 999999, started_at: new Date().toISOString(), procs: [{ kind: "service", name: "api", pid: orphan.pid, pgid: orphan.pid }], ports: {}, worktrees: [] }));
    const r = await witness(dir, ["run"]);
    assert.match(r.stderr, /reaped stale run r-20260101-000000-abcd/);
    await new Promise((res) => setTimeout(res, 200));
    assert.equal(alive(orphan.pid!), false);
    assert.equal(readJson(path.join(stale, "status.json")).outcome, "interrupted");
  });

  test("lock: a second run on the same checkout is refused", async () => {
    const dir = tmpRepo(`version = 1\n${service("ok")}${suite("pass")}${RUN}`);
    fs.writeFileSync(path.join(dir, ".witness", "run.lock"), String(process.pid));
    const r = await witness(dir, ["run"]);
    assert.equal(r.code, 2);
    assert.match(r.stderr, /another witness run \(pid \d+\) is using this checkout/);
    fs.writeFileSync(path.join(dir, ".witness", "run.lock"), "999999");
    const r2 = await witness(dir, ["run"]);
    assert.equal(r2.code, 0, "a stale lock is taken over");
  });

  test("up / run reuses / down", async () => {
    const dir = tmpRepo(`version = 1\n${service("ok")}${suite("pass")}${RUN}`);
    const up = await witness(dir, ["up", "--json"]);
    assert.equal(up.code, 0, up.stderr);
    const pgid = up.json?.services.api.pgid;
    assert.ok(alive(pgid));
    const r = await witness(dir, ["run"]);
    assert.equal(r.code, 0);
    assert.match(r.stderr, /reusing the service from `witness up`/);
    assert.ok(alive(pgid), "run leaves services it did not start");
    const down = await witness(dir, ["down"]);
    assert.equal(down.code, 0);
    await new Promise((res) => setTimeout(res, 200));
    assert.equal(alive(pgid), false);
    assert.ok(!fs.existsSync(path.join(dir, ".witness", "up.json")));
  });

  test("depends_on boots in order and exposes ${svc.url}", async () => {
    const dir = tmpRepo(`version = 1
[[service]]
name = "web"
start = "node $APPS/server.mjs ok"
ready = { http = "\${self.url}/health", timeout = "3s" }
env = { BACKEND = "\${api.url}" }
depends_on = ["api"]
${service("ok")}
[[suite]]
kind = "api"
name = "fake"
service = "web"
cmd = "node $APPS/suite.mjs pass"
env = { WEB = "\${web.url}" }
${RUN}`);
    const r = await witness(dir, ["run"]);
    assert.equal(r.code, 0, r.stderr);
    assert.ok(r.stderr.indexOf("boot   api · ready") < r.stderr.indexOf("boot   web · starting"));
  });

  test("--against <ref>: per-test parity in CTRF; outcome from the target", async () => {
    const toml = `version = 1\n${service("ok")}\n[[suite]]\nkind = "api"\nname = "fake"\nservice = "api"\ncmd = "bash run.sh"\n${RUN}`;
    const dir = tmpRepo(toml, { git: true, files: { "run.sh": `node ${path.join(import.meta.dirname, "..", "testdata", "apps", "suite.mjs")} pass\n` } });
    const { spawnSync } = await import("node:child_process");
    fs.writeFileSync(path.join(dir, "run.sh"), `EXTRA_TEST=newtest FLIP=Calc#add node ${path.join(import.meta.dirname, "..", "testdata", "apps", "suite.mjs")} pass\n`);
    spawnSync("git", ["commit", "-qam", "change"], { cwd: dir });
    const r = await witness(dir, ["run", "--json", "--against", "HEAD~1"]);
    assert.equal(r.code, 1, r.stderr);
    assert.equal(r.json?.outcome, "failed");
    assert.equal(r.json?.against.outcome, "passed");
    const byId = Object.fromEntries(ctrf(dir).results.tests.map((t: any) => [t.extra.witness.id, t.extra.witness]));
    assert.equal(byId["generic:Calc#add"].parity, "differs");
    assert.equal(byId["generic:Calc#add"].origin_status, "passed");
    assert.equal(byId["generic:Calc#sub"].parity, "same");
    assert.equal(byId["generic:Api#newtest"].parity, "target_only");
    assert.deepEqual(ctrf(dir).results.extra.witness.against.parity, { same: 2, differs: 1, origin_only: 0, target_only: 1 });
    const wts = spawnSync("git", ["worktree", "list"], { cwd: dir, encoding: "utf8" }).stdout.trim().split("\n");
    assert.equal(wts.length, 1, "temporary worktree removed");
    const bad = await witness(dir, ["run", "--against", "master"]);
    assert.equal(bad.code, 64);
    assert.match(bad.stderr, /--against master: not a commit in this repo/);
  });

  test("--against with role = origin services", async () => {
    const dir = tmpRepo(`version = 1\n${service("ok")}
[[service]]
name = "api-origin"
role = "origin"
start = "node $APPS/server.mjs ok"
ready = { http = "\${self.url}/health", timeout = "3s" }
${suite("pass")}${RUN}`);
    const r = await witness(dir, ["run", "--json", "--against", "legacy"]);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stderr, /using role = "origin" services: api-origin/);
    assert.equal(r.json?.against.parity.same, 3);
  });

  test("check: config, boot and suite stages", async () => {
    const dir = tmpRepo(`version = 1\n${service("ok")}${suite("pass")}${RUN}`);
    const r = await witness(dir, ["check", "--json"]);
    assert.equal(r.code, 0, r.stderr);
    assert.deepEqual(r.json?.stages.map((s: any) => s.stage), ["config", "deps", "boot", "suite"]);
    const bad = tmpRepo(`version = 1\n${service("never-ready")}${suite("pass")}${RUN}`);
    const r2 = await witness(bad, ["check", "--stage", "boot"]);
    assert.equal(r2.code, 3);
    assert.match(r2.stderr, /cause: ready_timeout/);
  });

  test("status and report read the latest run", async () => {
    const dir = tmpRepo(`version = 1\n${service("ok")}${suite("fail")}${RUN}`);
    await witness(dir, ["run"]);
    const s = await witness(dir, ["status", "latest", "--json"]);
    assert.equal(s.json?.outcome, "failed");
    const md = await witness(dir, ["report"]);
    assert.match(md.stdout, /# Witness run r-.*: failed/);
    assert.match(md.stdout, /`generic:Calc#sub` failed: expected 1 got 2/);
    assert.match(md.stdout, /\| Suite \| Kind \| App \| State \|/);
    assert.match(md.stdout, /\| fake \| api \| api \| failed \|/);
    const js = await witness(dir, ["report", "--format", "json"]);
    assert.equal(js.json?.not_passing[0].id, "generic:Calc#sub");
    assert.equal(js.json?.suites[0].kind, "api");
  });

  test("external service is attached, not started or stopped", async () => {
    const ext = spawn(process.execPath, [path.join(import.meta.dirname, "..", "testdata", "apps", "server.mjs"), "ok"], { env: { ...process.env, PORT: "0" }, stdio: ["ignore", "pipe", "ignore"] });
    const port = await new Promise<number>((res) => ext.stdout!.once("data", (d) => res(Number(/listening on (\d+)/.exec(String(d))![1]))));
    try {
      const dir = tmpRepo(`version = 1\n[[service]]\nname = "api"\nexternal = "http://127.0.0.1:${port}"\nready = { http = "\${self.url}/health", timeout = "3s" }\n${suite("pass")}${RUN}`);
      const r = await witness(dir, ["run"]);
      assert.equal(r.code, 0, r.stderr);
      assert.match(r.stderr, /external http:\/\/127\.0\.0\.1:\d+ is ready/);
      assert.ok(alive(ext.pid!), "external service left running");
    } finally {
      ext.kill();
    }
  });

  test("daemonizing start with pidfile and stop command", async () => {
    const dir = tmpRepo(`version = 1
[[service]]
name = "api"
start = "node $APPS/server.mjs ok > svc.out 2>&1 & echo $! > svc.pid"
pidfile = "svc.pid"
stop = "kill $(cat svc.pid) && echo stopped >> stop.log"
ready = { http = "\${self.url}/health", timeout = "3s" }
${suite("pass")}${RUN}`);
    const r = await witness(dir, ["run"]);
    assert.equal(r.code, 0, r.stderr);
    assert.equal(fs.readFileSync(path.join(dir, "stop.log"), "utf8").trim(), "stopped");
    assert.equal(alive(Number(fs.readFileSync(path.join(dir, "svc.pid"), "utf8"))), false);
  });

  test("keep_runs prunes old run dirs", async () => {
    const dir = tmpRepo(`version = 1\n${service("ok")}${suite("pass")}\n[run]\nkeep_runs = 2\n`);
    for (let i = 0; i < 3; i++) await witness(dir, ["run"]);
    const runs = fs.readdirSync(path.join(dir, ".witness", "runs")).filter((d) => d.startsWith("r-"));
    assert.equal(runs.length, 2);
  });

  test("usage errors exit 64", async () => {
    const dir = tmpRepo(`version = 1\n${service("ok")}${suite("pass")}`);
    assert.equal((await witness(dir, ["run", "--bogus"])).code, 64);
    assert.equal((await witness(dir, ["run", "--suite", "nope"])).code, 64);
    assert.equal((await witness(dir, ["frobnicate"])).code, 64);
  });
});
