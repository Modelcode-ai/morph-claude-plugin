import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { ADAPTERS, selectCommand } from "../src/adapters.ts";
import { readEvidence } from "../src/evidence/contract.ts";
import { parseReportFile, parseReportText } from "../src/parsers/index.ts";
import { newmanListFromCollection, newmanRequestOf, newmanTestNames } from "../src/parsers/newman.ts";
import { toRecord } from "../src/reconcile.ts";
import { writeObservations } from "../src/suite.ts";
import { shq } from "../src/util.ts";
import { PKG, REPORTS } from "./helpers.ts";

const newman = ADAPTERS.newman;
const COLLECTION = path.join(PKG, "testdata", "newman", "shop.postman_collection.json");

function rows() {
  const r = parseReportFile(path.join(REPORTS, "newman", "shop.json"), newman.format);
  assert.equal(r.error, undefined, r.error);
  assert.equal(r.format, "newman-json");
  return Object.fromEntries(r.cases.map((c) => [newman.id(c), c]));
}

test("newman report: a row per assertion named `<folders> / <request> > <assertion>`, iterations folded into one row", () => {
  const r = rows();
  assert.equal(r["Orders / Create order > creates"].status, "passed");
  assert.equal(r["Orders / Create order > responds"].status, "passed", "a collection-level test counts for each request");
  assert.equal(r['Orders / Create order > legacy "quoted" name'].status, "passed");
  assert.equal(r["Orders / Get order > later"].status, "skipped", "pm.test.skip is skipped (the JUnit reporter says passed)");
  const banana = r["Orders / Get order > name is banana"];
  assert.equal(banana.status, "failed");
  assert.match(banana.message!, /banana/);
  assert.equal(banana.observations!.length, 4, "two iterations, a request and a check each");
  assert.ok(r["Orders / Create order > made 0"] && r["Orders / Create order > made 1"], "a name built at run time is a row per value");
});

test("newman report: a script error and a failed request with no assertion become failed rows of their own", () => {
  const r = rows();
  assert.deepEqual([r["Orders / Admin / Purge > (test script)"].status, r["Orders / Admin / Purge > (test script)"].statusDetail], ["failed", "error"]);
  assert.equal(r["Orders / Admin / Purge > never runs"], undefined, "an assertion after the error never ran");
  const down = r["Down > is up"];
  assert.equal(down.status, "failed");
  assert.match(down.message!, /^request failed \(ECONNREFUSED\); /);
  assert.equal(down.statusDetail, undefined);
});

test("newman report: each row's evidence is the request, the response and its own assertion, without headers", () => {
  const c = rows()["Orders / Create order > creates"];
  const [http, check] = c.observations!;
  assert.equal(http.kind, "http");
  const d = http.data as any;
  assert.equal(d.method, "POST");
  assert.match(d.url, /^http:\/\/127\.0\.0\.1:\d+\/api\/items$/);
  assert.equal(d.status, 200);
  assert.equal(d.request.body, '{"name": "mug"}');
  assert.match(d.response.body, /"apple"/);
  assert.equal(JSON.stringify(c.observations).includes("Bearer"), false);
  assert.deepEqual(check, { v: 1, kind: "check", step: "Orders / Create order", data: { what: "creates", ok: true } });
  assert.equal((rows()["Down > is up"].observations![0].data as any).error, "ECONNREFUSED");
});

test("newman report: a request that hit --timeout-request fails its assertions as timeouts", () => {
  const doc = { collection: { item: [{ id: "a", name: "hang" }] }, run: { executions: [{ item: { id: "a", name: "hang" }, request: { method: "GET", url: { protocol: "http", host: ["127", "0", "0", "1"], port: "9", path: ["api", "hang"] } }, requestError: { code: "ESOCKETTIMEDOUT" }, assertions: [{ assertion: "hangs", skipped: false, error: { name: "AssertionError", message: "expected response to have property 'code'" } }] }] } };
  const [c] = parseReportText(JSON.stringify(doc)).cases;
  assert.equal(newman.id(c), "hang > hangs");
  assert.deepEqual([c.status, c.statusDetail], ["failed", "timeout"]);
  assert.match(c.message!, /^request timed out \(ESOCKETTIMEDOUT\)/);
  assert.equal((c.observations![0].data as any).url, "http://127.0.0.1:9/api/hang");
});

test("newman listing: read from the collection, folder and collection tests included, --folder narrows", () => {
  const doc = JSON.parse(fs.readFileSync(COLLECTION, "utf8"));
  const all = newmanListFromCollection(doc);
  assert.deepEqual(all.filter((i) => i.startsWith("Orders / Create order")), ["Orders / Create order > responds", "Orders / Create order > is JSON", "Orders / Create order > creates", 'Orders / Create order > legacy "quoted" name']);
  assert.ok(all.includes("Health > responds") && all.includes("Down > is up") && all.includes("Orders / Admin / Purge > never runs"));
  assert.ok(!all.some((i) => /commented out|made/.test(i)), "comments and names built at run time are left out");
  assert.deepEqual(newmanListFromCollection(doc, ["Admin"]), ["Orders / Admin / Purge > responds", "Orders / Admin / Purge > is JSON", "Orders / Admin / Purge > never runs"]);
  assert.deepEqual(newmanTestNames(`pm.test('a', f); pm.test.skip("b", f); tests['c'] = 1; pm.test(name, f);`), ["a", "b", "c"]);
});

test("newman listing through the adapter: finds the collection in npx, compound and quoted commands", () => {
  const cwd = path.dirname(COLLECTION);
  const n = newmanListFromCollection(JSON.parse(fs.readFileSync(COLLECTION, "utf8"))).length;
  assert.equal(newman.list!.read!("npx -p newman -p newman-reporter-htmlextra newman run shop.postman_collection.json -e env.json", cwd)?.length, n);
  assert.equal(newman.list!.read!(`cd . && node_modules/.bin/newman run "shop.postman_collection.json" --env-var "x=\${Y:-0}" && echo done`, cwd)?.length, n);
  assert.equal(newman.list!.read!("npx newman run https://example.com/c.json", cwd), null);
  assert.equal(newman.list!.read!("npx newman run missing.json", cwd), null);
});

test("newman select: each id's request as --folder, replacing the suite's own --folder", () => {
  assert.equal(newmanRequestOf("Orders / Admin / Purge > never runs"), "Purge");
  assert.equal(newmanRequestOf("Health > responds"), "Health");
  const ids = ["Orders / Create order > creates", "Orders / Create order > responds", "Health > responds"];
  assert.equal(selectCommand(newman, "npx newman run c.json --folder Orders -e e.json", ids), "npx newman run c.json -e e.json --folder 'Create order' --folder Health");
  assert.equal(selectCommand(newman, "npx newman run c.json ${WITNESS_SELECT} && echo ok", ["Health > responds"]), "npx newman run c.json --folder Health && echo ok");
});

test("newman report args: the json reporter added to the suite's own reporters (Newman keeps only the last -r)", () => {
  const dir = path.join(os.tmpdir(), "r");
  assert.equal(newman.reportArgs!(dir, ".", "newman run c.json"), `-r cli,json --reporter-json-export ${shq(path.join(dir, "newman.json"))}`);
  assert.match(newman.reportArgs!(dir, ".", "newman run c.json --reporters cli,htmlextra --reporter-htmlextra-export r.html"), /^-r cli,htmlextra,json /);
  assert.equal(newman.reportMarker!.test("newman run c.json -r json --reporter-json-export out.json"), true);
  assert.equal(newman.perTestTimeout!(3000, ".", ""), "--timeout-request 3000");
});

test("newman evidence: the report's observations land in the test's evidence.jsonl and leave the record", () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "witness-newman-"));
  const c = rows()["Orders / Create order > creates"];
  const t = toRecord(c, newman, "api", "/repo");
  writeObservations(out, [t]);
  assert.equal(t.observations, undefined);
  const file = path.join(out, "artifacts", "newman_Orders_Create_order_creates", "evidence.jsonl");
  const ev = readEvidence(file);
  assert.deepEqual(ev.problems, []);
  assert.deepEqual(ev.observations.map((o) => o.kind), ["http", "check", "http", "check"], "one pair per iteration");
});
