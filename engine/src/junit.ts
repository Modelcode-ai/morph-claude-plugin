import { XMLParser } from "fast-xml-parser";
import { normalizeTestId } from "./claims.ts";

export type TestStatus = "passed" | "failed" | "skipped";

export interface TestResult {
  id: string;
  classname: string;
  name: string;
  status: TestStatus;
  message?: string;
  ms: number;
}

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "", textNodeName: "#text", htmlEntities: true, processEntities: true });

const decode = (s: string) => s.replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_m, n) => String.fromCharCode(parseInt(n, 16)));

const arr = <T>(x: T | T[] | undefined): T[] => (x == null ? [] : Array.isArray(x) ? x : [x]);

function text(node: unknown): string {
  if (node == null) return "";
  if (typeof node === "string") return node;
  const n = node as Record<string, unknown>;
  const body = typeof n["#text"] === "string" ? n["#text"] : "";
  const msg = typeof n.message === "string" ? decode(n.message) : "";
  return decode(body || msg).trim();
}

/** Parse JUnit XML (surefire, pytest, go-junit-report, Playwright junit reporter). */
export function parseJUnit(xml: string): TestResult[] {
  const doc = parser.parse(xml);
  const suites = [...arr(doc.testsuites?.testsuite), ...arr(doc.testsuite)];
  const out: TestResult[] = [];
  const walk = (suite: Record<string, unknown>) => {
    for (const tc of arr(suite.testcase as Record<string, unknown>[])) {
      const classname = String(tc.classname ?? suite.name ?? "");
      const name = String(tc.name ?? "");
      const failure = tc.failure ?? tc.error;
      const skipped = tc.skipped !== undefined;
      out.push({
        id: normalizeTestId(`${classname}#${name}`),
        classname,
        name,
        status: failure !== undefined ? "failed" : skipped ? "skipped" : "passed",
        message: failure !== undefined ? text(Array.isArray(failure) ? failure[0] : failure).slice(0, 4000) : undefined,
        ms: Math.round(Number(tc.time ?? 0) * 1000),
      });
    }
    for (const s of arr(suite.testsuite as Record<string, unknown>[])) walk(s);
  };
  suites.forEach(walk);
  return out;
}
