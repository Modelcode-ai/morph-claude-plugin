import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, test } from "node:test";
import type { TestRecord } from "../src/reconcile.ts";
import { guess, springContextPath } from "../src/init.ts";
import { listSuiteTests, writeListCache } from "../src/listing.ts";
import type { Suite } from "../src/config.ts";
import { machineFacts, type ScanResult } from "../src/scan.ts";
import { collectArtifacts, copyAttachments } from "../src/suite.ts";
import { suite, tmpRepo, witness } from "./helpers.ts";

describe("PetClinic eval fixes", () => {
  test("a suite's Playwright attachments survive a later suite that clears the same output folder", () => {
    const run = fs.mkdtempSync(path.join(os.tmpdir(), "witness-pc-"));
    const out = path.join(run, "test-results");
    const video = path.join(out, "e2e-welcome", "video.webm");
    fs.mkdirSync(path.dirname(video), { recursive: true });
    fs.writeFileSync(video, "x");
    const first = { id: "playwright:app.spec.ts > welcome", name: "app.spec.ts > welcome", suite: "e2e", adapter: "playwright", status: "passed", durationMs: 1, obtained: "report", attachments: [{ name: "video", contentType: "video/webm", path: video }] } as TestRecord;
    copyAttachments(run, run, [first]);
    fs.rmSync(out, { recursive: true });
    const arts = collectArtifacts(run, run, [first]);
    assert.deepEqual(arts.map((a) => [a.artifact_type, a.test_id]), [["video", first.id]]);
  });

  test("a boot failure after a cached setup runs setup again next time (its output was removed)", async () => {
    const svc = `
[[service]]
name = "api"
setup = "mkdir -p build && echo x > build/app.txt"
start = "test -f build/app.txt && node $APPS/server.mjs ok"
ready = { http = "\${self.url}/health", timeout = "3s" }
`;
    const dir = tmpRepo(`version = 1\n${svc}${suite("pass")}\n[run]\nstall_timeout = "2s"\nheartbeat = "1s"\nkill_grace = "1s"\n`, { git: true, files: { ".gitignore": "build/\n" } });
    assert.equal((await witness(dir, ["run"])).code, 0);
    fs.rmSync(path.join(dir, "build"), { recursive: true });
    const r2 = await witness(dir, ["run", "--json"]);
    assert.match(r2.stderr, /setup {2}api · skipped \(inputs unchanged/);
    assert.equal(r2.json?.diagnosis.cause, "exited_before_ready");
    assert.match(r2.json?.diagnosis.try[0], /setup of api was skipped .*the next run runs it again/);
    const r3 = await witness(dir, ["run"]);
    assert.equal(r3.code, 0, r3.stderr);
    assert.match(r3.stderr, /setup {2}api · mkdir -p build/);
  });

  test("machine facts: a java that can't run (the macOS stub) is not found", { skip: process.platform === "win32" }, () => {
    const bin = fs.mkdtempSync(path.join(os.tmpdir(), "witness-bin-"));
    fs.writeFileSync(path.join(bin, "java"), "#!/bin/sh\necho 'The operation couldn’t be completed. Unable to locate a Java Runtime.' >&2\nexit 1\n", { mode: 0o755 });
    const out = { adapters: ["junit-maven"], frameworks: [], containers: [], infrastructure: [], commands: [] } as unknown as ScanResult;
    const java = machineFacts(out, { PATH: bin }).find((f) => f.tool === "java")!;
    assert.equal(java.found, false);
    assert.match(java.evidence.join(" "), /Unable to locate a Java Runtime/);
    fs.writeFileSync(path.join(bin, "java"), "#!/bin/sh\necho 'openjdk version \"17.0.12\"' >&2\n", { mode: 0o755 });
    assert.equal(machineFacts(out, { PATH: bin }).find((f) => f.tool === "java")!.found, true);
  });

  test("init's Spring Boot service: the Maven wrapper, the context path and the actuator health route", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "witness-spring-"));
    const write = (f: string, c: string) => {
      fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
      fs.writeFileSync(path.join(dir, f), c);
    };
    write("pom.xml", "<project><parent><artifactId>spring-boot-starter-parent</artifactId></parent><dependencies><dependency><artifactId>spring-boot-starter-actuator</artifactId></dependency></dependencies></project>");
    write("mvnw", "#!/bin/sh\n");
    write("src/main/resources/application.properties", "server.port=9966\nserver.servlet.context-path=/petclinic/\n");
    const app = guess(dir).services.find((s) => s.name === "app")!;
    assert.equal(app.ready, "${self.url}/petclinic/actuator/health");
    assert.match(app.start, /^\.\/mvnw -B spring-boot:run/);
    fs.rmSync(path.join(dir, "src/main/resources/application.properties"));
    write("src/main/resources/application.yml", "server:\n  port: 8080\n  servlet:\n    context-path: /api\n");
    assert.equal(springContextPath(dir), "/api");
  });

  test("the base side never lists its tests from this checkout's last report (a suite whose tests are all new)", async () => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "witness-list-")));
    const s = { name: "e2e-live", kind: "ui", adapter: "junit-maven", cwd: ".", cmd: "mvn test", env: {}, service: [] } as unknown as Suite;
    writeListCache(root, s, "r-1", "abc", ["a.B#new1", "a.B#new2"]);
    const ctx = { root, cwd: root, vars: {}, env: { PATH: process.env.PATH ?? "" }, log: path.join(root, "list.log"), scratch: path.join(root, "scratch") };
    assert.equal((await listSuiteTests(s, ctx)).source, "last-report");
    assert.equal((await listSuiteTests(s, { ...ctx, noCache: true })).source, "none");
  });
});
