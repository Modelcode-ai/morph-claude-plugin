import { arr } from "../util.ts";
import { attr, parseXml, textOf } from "./junit.ts";
import { type RawCase, ReportError, type TestStatus } from "./types.ts";

type Node = Record<string, unknown>;

function durMs(v: string | undefined): number {
  const m = /^(\d+):(\d+):(\d+(?:\.\d+)?)$/.exec(v ?? "");
  return m ? Math.round((Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])) * 1000) : 0;
}

const OUTCOME: Record<string, [TestStatus, RawCase["statusDetail"]?]> = {
  passed: ["passed"],
  passedbutrunaborted: ["passed"],
  warning: ["passed"],
  failed: ["failed"],
  error: ["failed", "error"],
  aborted: ["failed", "error"],
  timeout: ["failed", "timeout"],
  notexecuted: ["skipped"],
  notrunnable: ["skipped"],
  inconclusive: ["other"],
  pending: ["pending"],
  inprogress: ["other"],
  disconnected: ["other", "error"],
  completed: ["passed"],
};

function one(n: unknown): Node | undefined {
  const a = arr(n as Node | Node[]);
  return a[0] && typeof a[0] === "object" ? a[0] : undefined;
}

/** Visual Studio TRX (dotnet test --logger trx, Microsoft.Testing.Platform --report-trx). */
export function parseTrx(xml: string): RawCase[] {
  const doc = parseXml(xml);
  const run = one(doc.TestRun);
  if (!run) throw new ReportError("not a TRX report (no <TestRun>)");
  const classes = new Map<string, string>();
  for (const ut of arr(one(run.TestDefinitions)?.UnitTest as Node[])) {
    const tm = one(ut.TestMethod);
    const cls = attr(tm, "className");
    if (cls) classes.set(attr(ut, "id") ?? "", cls.split(",")[0].trim());
  }
  const out: RawCase[] = [];
  const add = (r: Node) => {
    const inner = arr(one(r.InnerResults)?.UnitTestResult as Node[]);
    if (inner.length) {
      inner.forEach(add);
      return;
    }
    const [status, detail] = OUTCOME[(attr(r, "outcome") ?? "").toLowerCase()] ?? ["other"];
    const info = one(one(r.Output)?.ErrorInfo);
    const message = textOf(one(info?.Message) ?? info?.Message).trim();
    const trace = textOf(one(info?.StackTrace) ?? info?.StackTrace).trim();
    out.push({
      name: attr(r, "testName") ?? "(unnamed)",
      classname: classes.get(attr(r, "testId") ?? ""),
      status,
      statusDetail: detail,
      durationMs: durMs(attr(r, "duration")),
      message: message ? message.slice(0, 2000) : undefined,
      trace: trace ? trace.slice(0, 20000) : undefined,
    });
  };
  for (const r of arr(one(run.Results)?.UnitTestResult as Node[])) add(r);
  return out;
}
