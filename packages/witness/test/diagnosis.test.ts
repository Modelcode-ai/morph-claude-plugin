import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, test } from "node:test";
import { diagnose } from "../src/diagnosis.ts";

const log = (text: string) => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "witness-diag-")), "svc.log");
  fs.writeFileSync(f, text);
  return f;
};

test("evidence is the exception line of the last command, not a stack frame or build summary", () => {
  const text = "$ dotnet build\n    0 Error(s)\nBuild succeeded.\n$ dotnet run\nUnhandled exception. System.InvalidOperationException: CatalogRegion is not configured\n   at Program.<Main>$(String[] args) in Program.cs:line 88\n   at Program.<Main>(String[] args)\n";
  assert.equal(diagnose({ stage: "boot", cause: "exited_before_ready", service: "web", log: log(text) }).evidence, "Unhandled exception. System.InvalidOperationException: CatalogRegion is not configured");
  const py = 'Traceback (most recent call last):\n  File "app.py", line 3, in <module>\n    main()\nKeyError: \'DATABASE_URL\'\n';
  assert.equal(diagnose({ stage: "boot", cause: "exited_before_ready", service: "api", log: log(py) }).evidence, "KeyError: 'DATABASE_URL'");
  assert.equal(diagnose({ stage: "boot", cause: "exited_before_ready", service: "api", log: log("starting\nbye\n") }).evidence, "bye");
  const build = "$ dotnet build\nsrc/Basket.cs(12,27): error CS1525: Invalid expression term ';' [src/ApplicationCore.csproj]\n\nBuild FAILED.\n\nsrc/Basket.cs(12,27): error CS1525: Invalid expression term ';' [src/ApplicationCore.csproj]\n    0 Warning(s)\n    1 Error(s)\n\nTime Elapsed 00:00:05.12\n";
  assert.match(diagnose({ stage: "boot", cause: "setup_failed", service: "web", log: log(build) }).evidence!, /error CS1525/);
});

test("evidence skips Maven and npm boilerplate and names the compiler error", () => {
  const mvn = "[INFO] BUILD FAILURE\n[ERROR] COMPILATION ERROR : \n[ERROR] /r/src/main/java/App.java:[121,65] illegal start of expression\n[ERROR] Failed to execute goal org.apache.maven.plugins:maven-compiler-plugin:3.15.0:compile (default-compile) on project app: Compilation failure\n[ERROR] -> [Help 1]\n[ERROR] \n[ERROR] Re-run Maven using the -X switch to enable full debug logging.\n[ERROR] [Help 1] http://cwiki.apache.org/confluence/display/MAVEN/MojoFailureException\n";
  assert.equal(diagnose({ stage: "boot", cause: "setup_failed", service: "api", log: log(mvn) }).evidence, "[ERROR] /r/src/main/java/App.java:[121,65] illegal start of expression");
  const gate = "[INFO] Tests run: 138, Failures: 0, Errors: 0, Skipped: 0\n[INFO] BUILD FAILURE\n[ERROR] Failed to execute goal org.jacoco:jacoco-maven-plugin:0.8.16:check (check) on project app: Coverage checks have not been met. See log for details. -> [Help 1]\n[ERROR] \n[ERROR] For more information about the errors and possible solutions, please read the following articles:\n[ERROR] [Help 1] http://cwiki.apache.org/confluence/display/MAVEN/MojoExecutionException\n";
  assert.match(diagnose({ stage: "report", cause: "report_incomplete", suite: "api", log: log(gate) }).evidence!, /Coverage checks have not been met/);
  const npx = "$ npx ng serve --port 4000\nnpm error could not determine executable to run\nnpm error A complete log of this run can be found in: /home/u/.npm/_logs/x-debug-0.log\n";
  assert.equal(diagnose({ stage: "boot", cause: "exited_before_ready", service: "web", log: log(npx) }).evidence, "npm error could not determine executable to run");
});

describe("diagnosis heuristics", () => {
  const cases: [string, string, string, RegExp][] = [
    ["exited_before_ready", "Error: listen EADDRINUSE: address already in use :::3000\n", "port_in_use", /EADDRINUSE/],
    ["exited_before_ready", "OSError: [Errno 48] Address already in use\n", "port_in_use", /Address already in use/],
    ["exited_before_ready", "System.IO.IOException: Failed to bind to address http://127.0.0.1:5000: address already in use.\n", "port_in_use", /Failed to bind/],
    ["exited_before_ready", "psycopg2.OperationalError: could not connect to server: Connection refused\n", "dependency_unreachable", /Connection refused/],
    ["service_died", "Error: connect ECONNREFUSED 127.0.0.1:6379\n", "dependency_unreachable", /ECONNREFUSED/],
    ["exited_before_ready", 'FATAL:  password authentication failed for user "app"\n', "auth_failed", /password authentication failed/],
    ["report_missing", "requests.exceptions.HTTPError: 401 Unauthorized for url: http://x/api\n", "auth_failed", /401 Unauthorized/],
    ["exited_before_ready", "Error: getaddrinfo ENOTFOUND db.internal\n", "network", /ENOTFOUND/],
    ["setup_failed", "curl: (6) Could not resolve host: registry.npmjs.org\n", "network", /Could not resolve host/],
  ];
  for (const [base, text, cause, ev] of cases) {
    test(`${base} + "${text.trim().slice(0, 40)}" -> ${cause}`, () => {
      const d = diagnose({ stage: "boot", cause: base as "exited_before_ready", service: "api", log: log(`starting\n${text}bye\n`), port: 3000 });
      assert.equal(d.cause, cause);
      assert.match(d.evidence!, ev);
      assert.ok(d.try.length > 0);
    });
  }

  test("missing module keeps the cause, quotes the line and suggests running setup", () => {
    const d = diagnose({ stage: "boot", cause: "exited_before_ready", service: "api", log: log("Traceback (most recent call last):\nModuleNotFoundError: No module named 'fastapi'\n") });
    assert.equal(d.cause, "exited_before_ready");
    assert.match(d.evidence!, /No module named 'fastapi'/);
    assert.ok(d.try.some((t) => t.includes("witness check --stage boot --service api")));
  });

  test("command not found during setup stays setup_failed with evidence", () => {
    const d = diagnose({ stage: "boot", cause: "setup_failed", service: "api", command: "poetry install", log: log("bash: poetry: command not found\n") });
    assert.equal(d.cause, "setup_failed");
    assert.match(d.evidence!, /command not found/);
    assert.equal(d.retryable, false);
  });

  test("port_in_use suggests lsof on the port", () => {
    const d = diagnose({ stage: "boot", cause: "port_in_use", service: "api", port: 4100, evidence: "port 4100 is already in use" });
    assert.ok(d.try.includes("lsof -nP -iTCP:4100 -sTCP:LISTEN"));
    assert.equal(d.retryable, true);
  });

  test("stalled is never refined; evidence is the last log line", () => {
    const d = diagnose({ stage: "suite", cause: "stalled", suite: "e2e", log: log("Error: connect ECONNREFUSED 1.2.3.4:1\nrunning test 7 of 9\n") });
    assert.equal(d.cause, "stalled");
    assert.equal(d.evidence, "running test 7 of 9");
  });

  test("missing_env lists names and how to set them", () => {
    const d = diagnose({ stage: "config", cause: "missing_env", envMissing: ["DATABASE_URL"] });
    assert.deepEqual(d.env_missing, ["DATABASE_URL"]);
    assert.match(d.try[0], /DATABASE_URL=\.\.\.' >> \.witness\/\.env/);
  });
});

describe("eShopOnWeb eval fixes: diagnosis", () => {
  test("stalled dotnet MTP suite: no per_test_timeout advice, hang dump and --select instead", () => {
    const d = diagnose({ stage: "suite", cause: "stalled", suite: "unit", perTestTimeout: false, adapter: "dotnet" });
    assert.ok(!d.try.some((t) => /set per_test_timeout/.test(t)));
    assert.ok(d.try.some((t) => /--hangdump/.test(t)));
    assert.ok(d.try.some((t) => /witness run --suite unit --select/.test(t)));
    assert.ok(diagnose({ stage: "suite", cause: "stalled", suite: "unit", perTestTimeout: true }).try.some((t) => /set per_test_timeout/.test(t)));
  });

  test("ready_timeout on a steady 4xx is not retryable", () => {
    const d = diagnose({ stage: "boot", cause: "ready_timeout", service: "web", url: "http://x/health", steadyStatus: 404 });
    assert.equal(d.retryable, false);
    assert.ok(d.try.some((t) => /does not exist: fix ready\.http/.test(t)));
    assert.equal(diagnose({ stage: "boot", cause: "ready_timeout", service: "web" }).retryable, true);
  });
});
