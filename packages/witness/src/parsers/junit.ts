import { XMLParser, XMLValidator } from "fast-xml-parser";
import { arr } from "../util.ts";
import { type Attachment, failureSummary, type RawCase, ReportError } from "./types.ts";

const ARRAYS = new Set(["testsuite", "testcase", "failure", "error", "skipped", "flakyFailure", "flakyError", "rerunFailure", "rerunError", "property", "system-out"]);

export const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  processEntities: true,
  htmlEntities: true,
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: false,
  isArray: (name) => ARRAYS.has(name),
});

type Node = Record<string, unknown>;

export function parseXml(xml: string): Node {
  const body = xml.replace(/^﻿/, "").trim();
  if (!body) throw new ReportError("empty report");
  const v = XMLValidator.validate(body);
  if (v !== true) {
    const open = /^Invalid '\[(.*)\]' found/s.exec(v.err.msg);
    const what = open ? `truncated: unclosed ${open[1].replace(/\s+/g, "").replace(/"/g, "").split(",").map((t) => `<${t}>`).join(" ")}` : v.err.msg;
    throw new ReportError(`invalid XML at line ${v.err.line}: ${what}`);
  }
  return xmlParser.parse(body) as Node;
}

export function attr(n: unknown, k: string): string | undefined {
  if (!n || typeof n !== "object") return undefined;
  const v = (n as Node)[`@_${k}`];
  return v == null ? undefined : String(v);
}

export function textOf(n: unknown): string {
  if (n == null) return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  const t = (n as Node)["#text"];
  return t == null ? "" : String(t);
}

const secToMs = (v: string | undefined) => {
  const n = Number(String(v ?? "0").replace(/,/g, ""));
  return Number.isFinite(n) ? Math.round(n * 1000) : 0;
};

function attachmentsFrom(out: string): Attachment[] {
  const res: Attachment[] = [];
  for (const m of out.matchAll(/\[\[ATTACHMENT\|([^\]]+)\]\]/g)) res.push({ name: m[1].split(/[\\/]/).pop()!, path: m[1].trim(), contentType: "" });
  return res;
}

function caseFrom(tc: Node, suite: Node): RawCase {
  const failures = arr(tc.failure as unknown[]);
  const errors = arr(tc.error as unknown[]);
  const skipped = arr(tc.skipped as unknown[]);
  const flaky = [...arr(tc.flakyFailure as unknown[]), ...arr(tc.flakyError as unknown[])];
  const reruns = [...arr(tc.rerunFailure as unknown[]), ...arr(tc.rerunError as unknown[])];
  const out = arr(tc["system-out"] as unknown[]).map(textOf).join("\n");
  const c: RawCase = {
    name: attr(tc, "name") ?? "(unnamed)",
    classname: attr(tc, "class") ?? attr(tc, "classname") ?? attr(suite, "name"),
    file: attr(tc, "file") ?? attr(suite, "file"),
    line: attr(tc, "line") ? Number(attr(tc, "line")) : undefined,
    status: "passed",
    durationMs: secToMs(attr(tc, "time")),
  };
  const bad = failures[0] ?? errors[0];
  if (bad !== undefined) {
    c.status = "failed";
    if (failures.length === 0) c.statusDetail = "error";
    c.message = (attr(bad, "message") ?? failureSummary(textOf(bad)) ?? "").slice(0, 2000) || undefined;
    const trace = textOf(bad).trim();
    if (trace) c.trace = trace.slice(0, 20000);
    if (/Timeout/.test(attr(bad, "type") ?? "") || /timed out|timeout of \d+|timeout \d+ ?ms exceeded/i.test(c.message ?? "")) c.statusDetail = "timeout";
    if (reruns.length) c.retries = reruns.length;
  } else if (skipped.length) {
    c.status = "skipped";
    c.message = attr(skipped[0], "message") ?? (textOf(skipped[0]).trim() || undefined);
  } else if (flaky.length) {
    c.flaky = true;
    c.retries = flaky.length;
    c.message = attr(flaky[0], "message");
  }
  const atts = attachmentsFrom(out);
  if (atts.length) c.attachments = atts;
  return c;
}

/** JUnit XML from any of the common producers: nested suites, error vs failure, surefire reruns. */
export function parseJUnit(xml: string): RawCase[] {
  const doc = parseXml(xml);
  if (!("testsuites" in doc) && !("testsuite" in doc) && !("testcase" in doc)) throw new ReportError("not a JUnit report (no <testsuites>, <testsuite> or <testcase>)");
  const out: RawCase[] = [];
  const walk = (suite: Node) => {
    for (const tc of arr(suite.testcase as Node[])) out.push(caseFrom(typeof tc === "object" && tc ? tc : {}, suite));
    for (const s of arr(suite.testsuite as Node[])) if (s && typeof s === "object") walk(s);
  };
  const roots = doc.testsuites;
  for (const r of arr(roots as Node[] | Node)) if (r && typeof r === "object") walk(r as Node);
  walk(doc);
  return out;
}
