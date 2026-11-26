import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, test } from "node:test";
import { okOf, readEvidence, titleOf } from "../src/evidence/contract.ts";
import { gapLine, visualGaps } from "../src/evidence/visuals.ts";
import { renderHtml } from "../src/report/html.ts";
import { renderMd } from "../src/report/md.ts";
import { buildModel } from "../src/report/model.ts";
import { collectArtifacts } from "../src/suite.ts";
import type { TestRecord } from "../src/reconcile.ts";
import { latest, service, tmpRepo, witness } from "./helpers.ts";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "witness-ev-"));
const line = (o: object) => JSON.stringify(o) + "\n";

describe("evidence contract", () => {
  test("known kinds get a title; unknown kinds are kept and titled from their fields; bad lines are problems", () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, "shot.png"), "x");
    const f = path.join(dir, "evidence.jsonl");
    fs.writeFileSync(
      f,
      [
        line({ v: 1, kind: "http", data: { method: "post", url: "http://h:1/basket/update?x=1", status: 200 } }),
        line({ v: 1, kind: "cli", data: { argv: ["app", "list"], exit: 0 } }),
        line({ v: 1, kind: "ui", step: "open the basket", data: { action: "see", target: "#total", value: "8.50" }, files: ["shot.png"] }),
        line({ v: 1, kind: "check", data: { what: "total is 8.50", ok: false, expected: "8.50", actual: "0" } }),
        line({ v: 1, kind: "grpc-stream", data: { service: "Orders", frames: 3 } }),
        "not json\n",
        line({ v: 1, kind: "http", data: { url: "http://h/x" } }),
        line({ v: 1, kind: "ui", data: { action: "click" }, files: ["missing.png"] }),
        line({ kind: "note", data: { text: "no version" } }),
      ].join(""),
    );
    const r = readEvidence(f, new Set(fs.readdirSync(dir)));
    assert.deepEqual(r.observations.map(titleOf), ["POST /basket/update?x=1 → 200", "$ app list → exit 0", 'see #total "8.50"', "total is 8.50", "grpc-stream: service Orders", "? /x", "click", "no version"]);
    assert.equal(okOf(r.observations[3]), false);
    assert.equal(r.observations[2].step, "open the basket");
    assert.deepEqual(r.problems.map((p) => [p.line, p.message]), [[6, "not JSON"], [7, "http: missing method"], [8, 'file "missing.png" is not in the folder'], [9, '"v" should be 1']]);
  });

  test("a folder named without the namespace, or without a trailing (), still ties to its test", () => {
    const run = tmp();
    const art = path.join(run, "artifacts");
    for (const d of ["ItemsTests_ListsItems", "kit.ItemsTest_listsItems", "Other_thing", "Kit.ManageTests.Returns_url_a_", "Kit.ManageTests.Returns_url_b_"]) {
      fs.mkdirSync(path.join(art, d), { recursive: true });
      fs.writeFileSync(path.join(art, d, "evidence.jsonl"), line({ v: 1, kind: "note", data: { text: "x" } }));
    }
    const rec = (id: string, adapter: string): TestRecord => ({ id: `${adapter}:${id}`, name: id, suite: "s", adapter: adapter as TestRecord["adapter"], status: "passed", durationMs: 1, obtained: "report" });
    const arts = collectArtifacts(run, run, [rec("Kit.ItemsTests#ListsItems", "dotnet"), rec("kit.ItemsTest#listsItems()", "junit-gradle"), rec('Kit.ManageTests#Returns(url: "a")', "dotnet"), rec('Kit.ManageTests#Returns(url: "b")', "dotnet")]);
    const by = Object.fromEntries(arts.map((a) => [path.dirname(a.file).split("/").pop(), [a.test_id, a.artifact_type]]));
    assert.deepEqual(by.ItemsTests_ListsItems, ["dotnet:Kit.ItemsTests#ListsItems", "evidence"]);
    assert.deepEqual(by["kit.ItemsTest_listsItems"], ["junit-gradle:kit.ItemsTest#listsItems()", "evidence"]);
    assert.deepEqual(by.Other_thing, [null, "evidence"]);
    assert.deepEqual(by["Kit.ManageTests.Returns_url_b_"], ['dotnet:Kit.ManageTests#Returns(url: "b")', "evidence"], "a display name with its case ties to that case");
  });
});

describe("evidence in the report", () => {
  test("a run whose planned test records evidence shows its timeline, base side and screenshots; one without gets a step", async () => {
    const suite = `
[[suite]]
kind = "api"
name = "fake"
service = "api"
cmd = "node rec.mjs && node $APPS/suite.mjs pass"
`;
    const dir = tmpRepo(`version = 1\n${service("ok")}${suite}\n[run]\nstall_timeout = "5s"\nheartbeat = "1s"\nkill_grace = "1s"\n`, {
      git: true,
      files: {
        "rec.mjs": `import fs from "node:fs";
const d = process.env.WITNESS_ARTIFACTS + "/Calc_add";
fs.mkdirSync(d, { recursive: true });
fs.writeFileSync(d + "/after.png", "png");
const lines = [
  { v: 1, kind: "http", data: { method: "POST", url: "http://x/calc/add", status: 200, request: { body: '{"a":1,"b":2}' }, response: { body: '{"sum":3}' } } },
  { v: 1, kind: "ui", step: "see the sum", data: { action: "see", target: "#sum", value: "3" }, files: ["after.png"] },
  { v: 1, kind: "queue-message", data: { topic: "sums", payload: 3 } },
];
fs.appendFileSync(d + "/evidence.jsonl", lines.map((l) => JSON.stringify(l) + "\\n").join("") + "oops\\n");
`,
        ".witness/plan.yaml": `version: 1\nsource: the request\nitems:\n  - {id: P1, behavior: adds, expect: "3", kind: new, tests: ["generic:Calc#add"]}\n  - {id: P2, behavior: subtracts, expect: "1", kind: parity, tests: ["generic:Calc#sub"]}\n`,
      },
    });
    const r = await witness(dir, ["run", "--against", "HEAD"]);
    assert.equal(r.code, 0, r.stderr);
    const m = buildModel(fs.realpathSync(latest(dir)));
    const e = m.evidence["generic:Calc#add"];
    assert.equal(e.here?.observations.length, 3);
    assert.equal(e.base?.observations.length, 3, "the base side recorded too");
    assert.equal(e.here?.problems.length, 1);
    assert.equal(m.signals.find((s) => s.key === "evidence")?.state, "p");
    assert.ok(m.steps.some((s) => s.title === "Record evidence for P2"));
    assert.ok(m.steps.some((s) => /Fix the evidence of 1 test/.test(s.title)));
    const html = renderHtml(m);
    assert.match(html, /POST \/calc\/add → 200/);
    assert.match(html, /queue-message/);
    assert.match(html, /src="artifacts\/Calc_add\/after\.png"/);
    assert.match(html, /On the base/);
    assert.match(renderMd(m), /- http: POST \/calc\/add → 200/);
  });
});

describe("screenshots and video of ui, mobile and desktop tests", () => {
  test("only passing tests of those kinds count; a trace or a log is not a screen", () => {
    const suites = [{ name: "web", kind: "ui" }, { name: "app", kind: "mobile" }, { name: "win", kind: "desktop" }, { name: "api", kind: "api" }];
    const tests = [
      { id: "playwright:a", suite: "web", status: "passed" },
      { id: "playwright:b", suite: "web", status: "failed" },
      { id: "generic:c", suite: "app", status: "passed" },
      { id: "generic:d", suite: "win", status: "skipped" },
      { id: "pytest:e", suite: "api", status: "passed" },
    ];
    const arts = [
      { file: "artifacts/a/trace.zip", test_id: "playwright:a", artifact_type: "trace" },
      { file: "artifacts/c/rec.mp4", test_id: "generic:c", artifact_type: "video" },
    ];
    const gaps = visualGaps(suites, tests, arts);
    assert.deepEqual(gaps, [
      { suite: "web", kind: "ui", passed: 1, bare: ["playwright:a"] },
      { suite: "app", kind: "mobile", passed: 1, bare: [] },
    ]);
    assert.equal(gapLine(gaps[0]), "The passing test in web (ui) left no screenshot or video");
    assert.equal(gapLine(gaps[1]), undefined);
  });
});
