import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeTestId, parseClaimFile } from "../src/claims.ts";
import { verifyQuote } from "../src/judge.ts";
import { parseJUnit } from "../src/junit.ts";
import { compareExchanges, pathMatches } from "../src/parity.ts";
import type { Exchange } from "../src/proxy.ts";
import { assessClaim, overall } from "../src/verdict.ts";

const EQ = { ignore_fields: ["**.id"], unordered: ["**.pets"], headers: ["content-type"], compare_status: true };

const ex = (status: number, body: unknown, path = "/a"): Exchange => ({
  seq: 1, side: "x", run: "primary", test: "T#m", ts: 0, ms: 1, method: "GET", path, reqHeaders: {}, reqBody: "",
  status, resHeaders: { "content-type": "application/json" }, resBody: JSON.stringify(body),
});

test("claims: parses tags, proof, expect-diff and multi-line text", () => {
  const f = parseClaimFile("/r/.witness/claims/x.md", `---
feature: owners
change: "Filter"
---
- C1 [api, new] Lists owners
  by city.
  proof: OwnerIT#filters
- C2 [api, changed] Status changes.
  proof: pkg.OwnerIT#status()
  expect-diff: status, body.city
- C3 [ui, judged] Reads well.
`);
  assert.equal(f.claims.length, 3);
  assert.deepEqual(f.claims[0].tags, ["new"]);
  assert.equal(f.claims[0].text, "Lists owners by city.");
  assert.deepEqual(f.claims[1].expectDiff, ["status", "body.city"]);
  assert.deepEqual(f.claims[2].surfaces, ["ui"]);
  assert.equal(normalizeTestId("pkg.OwnerIT#status()"), "OwnerIT#status");
});

test("junit: surefire failure with entity-encoded message", () => {
  const r = parseJUnit(`<?xml version="1.0"?><testsuite name="s"><testcase classname="a.b.FooIT" name="ok" time="0.5"/>
<testcase classname="a.b.FooIT" name="bad()" time="1"><failure message="line1&#10;line2">stack</failure></testcase>
<testcase classname="a.b.FooIT" name="skip"><skipped/></testcase></testsuite>`);
  assert.deepEqual(r.map((t) => [t.id, t.status]), [["FooIT#ok", "passed"], ["FooIT#bad", "failed"], ["FooIT#skip", "skipped"]]);
  assert.equal(r[1].message, "stack");
});

test("parity: equal after ignoring ids and unordered arrays", () => {
  const o = ex(200, { id: 1, name: "a", pets: [{ n: 1 }, { n: 2 }] });
  const t = ex(200, { id: 9, name: "a", pets: [{ n: 2 }, { n: 1 }] });
  assert.equal(compareExchanges([o], [t], EQ, []).status, "equal");
});

test("parity: unexplained vs intended differences", () => {
  const o = ex(500, { error: "x" });
  const t = ex(404, { error: "x" });
  assert.equal(compareExchanges([o], [t], EQ, []).status, "unexplained");
  assert.equal(compareExchanges([o], [t], EQ, ["status"]).status, "intended");
  assert.equal(compareExchanges([o], [o], EQ, ["status"]).status, "unexplained", "changed claim with no difference is suspicious");
});

test("parity: reorder is one difference", () => {
  const r = compareExchanges([ex(200, [{ a: 1 }, { a: 2 }])], [ex(200, [{ a: 2 }, { a: 1 }])], EQ, []);
  assert.deepEqual(r.diffs.map((d) => d.field), ["body[order]"]);
});

test("parity: missing exchange is a difference", () => {
  const r = compareExchanges([ex(200, {})], [], EQ, []);
  assert.equal(r.status, "unexplained");
});

test("pathMatches", () => {
  assert.ok(pathMatches("body.owners[0].id", "**.id"));
  assert.ok(pathMatches("body.city", "body"));
  assert.ok(!pathMatches("body.cityName", "body.city"));
  assert.ok(pathMatches("status", "status"));
});

test("overturn quotes must be verbatim, long enough, and from an overturn-capable source", () => {
  const sources = [
    { name: "VERIFY.md@base", text: "Owner list responses are not guaranteed\n to be in any particular order.", canOverturn: true },
    { name: "claims/x.md", text: "Owner list responses are not guaranteed to be in any particular order.", canOverturn: false },
  ];
  assert.ok(verifyQuote("owner list responses are not guaranteed to be in any particular order", sources, "VERIFY.md@base"));
  assert.ok(!verifyQuote("Owner list responses are not guaranteed to be in any particular order", sources, "claims/x.md"));
  assert.ok(!verifyQuote("not guaranteed", sources, "VERIFY.md@base"));
});

const claim = (over: object = {}) => ({ id: "C1", text: "t", surfaces: ["api"], tags: ["new"], proof: "T#m", expectDiff: [], feature: "f", file: "f.md", line: 1, ...over }) as any;
const res = (status: "passed" | "failed") => new Map([["T#m", { id: "T#m", classname: "T", name: "m", status, ms: 1, message: status === "failed" ? "boom" : undefined }]]);

test("verdict: a new test that passes on base doesn't bite and fails the claim", () => {
  const r = assessClaim(claim(), { head: res("passed"), base: res("passed"), level: "medium" });
  assert.equal(r.status, "failed");
  assert.equal(r.bite, "vacuous");
});

test("verdict: bites when failing on base and passing on head", () => {
  const r = assessClaim(claim(), { head: res("passed"), base: res("failed"), level: "medium" });
  assert.equal(r.status, "proven");
  assert.equal(r.bite, "bites");
});

test("verdict: failed then passed on rerun is flaky, missing test fails", () => {
  assert.equal(assessClaim(claim(), { head: res("failed"), rerun: res("passed"), level: "medium" }).status, "flaky");
  assert.equal(assessClaim(claim({ proof: "X#y" }), { head: res("passed"), level: "medium" }).status, "failed");
});

test("verdict: unexplained parity fails a passing claim; regressions make the run need a look", () => {
  const r = assessClaim(claim({ tags: ["parity"] }), { head: res("passed"), base: res("passed"), level: "high", parity: { status: "unexplained", diffs: [{ field: "status", origin: "1", target: "2" }], pairs: [] } });
  assert.equal(r.status, "failed");
  assert.equal(r.bite, "preserved");
  assert.equal(overall([assessClaim(claim(), { head: res("passed"), level: "medium" })], []), "proven");
  const ok = assessClaim(claim(), { head: res("passed"), level: "medium" });
  assert.equal(overall([ok], [{ id: "x", classname: "", name: "", status: "failed", ms: 0 }]), "needs_a_look");
  assert.equal(overall([], []), "unproven", "no claims is never proven");
});

test("parity: allow_added_fields ignores target-only keys but not removed ones", () => {
  const eq = { ...EQ, allow_added_fields: true };
  assert.equal(compareExchanges([ex(200, { a: 1 })], [ex(200, { a: 1, b: 2 })], eq, []).status, "equal");
  assert.equal(compareExchanges([ex(200, { a: 1, b: 2 })], [ex(200, { a: 1 })], eq, []).status, "unexplained");
});

import { failureHeadline } from "../src/verdict.ts";
test("failureHeadline keeps expected/actual lines", () => {
  const h = failureHeadline("1 expectation failed.\nJSON path firstName doesn't match.\nExpected: iterable containing [\"Harold\"]\n  Actual: <[Betty, Harold]>\n\tat x.y(z)");
  assert.match(h, /Expected: iterable/);
  assert.match(h, /Actual: <\[Betty, Harold\]>/);
});

test("verdict: a passing proof test that never reached the app can't prove the claim", () => {
  const r = assessClaim(claim(), { head: res("passed"), level: "medium", observed: 0 });
  assert.equal(r.status, "cant_tell");
});
