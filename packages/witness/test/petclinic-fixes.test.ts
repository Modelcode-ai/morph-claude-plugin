import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, test } from "node:test";
import type { TestRecord } from "../src/reconcile.ts";
import { collectArtifacts, copyAttachments } from "../src/suite.ts";

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
});
