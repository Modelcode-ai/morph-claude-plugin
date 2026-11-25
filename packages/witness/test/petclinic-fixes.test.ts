import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, test } from "node:test";
import type { TestRecord } from "../src/reconcile.ts";
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
});
