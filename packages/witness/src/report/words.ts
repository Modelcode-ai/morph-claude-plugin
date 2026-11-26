import type { ItemState, ReportModel } from "./model.ts";

export interface Take {
  pre: string;
  hl: string;
  post: string;
  tone: "ok" | "bad" | "warn" | "plain";
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const join = (t: Take) => [t.pre, t.hl, t.post].filter(Boolean).join(" ");

export function fmtMs(ms: number): string {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

export const outcomeLabel = (o: string) => ({ passed: "Passed", failed: "Failed", error: "Error", mistrial: "Mistrial", stalled: "Stalled", interrupted: "Interrupted", running: "Running" })[o] ?? o;

export const itemLabel = (s: ItemState) => ({ proven: "passes", failed: "fails", missing: "no result", skipped: "skipped", "not-run": "not run" })[s];

export function takes(m: ReportModel): { ch1: Take; ch2: Take; ch3: Take } {
  const items = m.plan?.items ?? [];
  const failed = items.filter((i) => i.state === "failed");
  const missing = items.filter((i) => i.state === "missing" || i.state === "not-run");
  const changed = items.filter((i) => i.kind !== "parity").length;
  let ch1: Take;
  if (!m.plan) ch1 = { pre: "There is no test plan,", hl: "so this report can't say which behaviors are proven.", post: "", tone: "warn" };
  else if (failed.length) ch1 = { pre: "", hl: `${failed.length} of ${items.length} planned behaviors fail:`, post: failed.map((i) => i.id).join(", ") + ".", tone: "bad" };
  else if (missing.length) ch1 = { pre: "", hl: `${missing.length} of ${items.length} planned behaviors have no result`, post: `(${missing.map((i) => i.id).join(", ")}).`, tone: "warn" };
  else ch1 = { pre: "", hl: `All ${plural(items.length, "planned behavior")} pass.`, post: `${changed} changed or new, ${items.length - changed} kept as they were.`, tone: "ok" };

  let ch2: Take;
  const a = m.against;
  if (!a) ch2 = { pre: "Not compared with a base,", hl: "so this report can't show what changed against it.", post: "", tone: "warn" };
  else {
    const differs = a.parity.differs ?? 0;
    const regress = a.differs.filter((t) => t.originStatus === "passed").length;
    const fromPlan = a.newTests.filter((n) => n.item).length;
    if (a.outcome !== "passed" && a.outcome !== "failed") ch2 = { pre: "", hl: `The base side ended ${a.outcome},`, post: `so the comparison is incomplete${a.diagnosis ? ` (${a.diagnosis.cause}${a.diagnosis.suite ? ` in ${a.diagnosis.suite}` : ""})` : ""}.`, tone: "warn" };
    else if (regress) ch2 = { pre: "", hl: `${plural(regress, "test")} that pass on the base fail here.`, post: differs > regress ? `${differs - regress} more differ.` : "", tone: "bad" };
    else if (differs) ch2 = { pre: "", hl: `${plural(differs, "test")} differ from the base,`, post: "none of them a test that passed there.", tone: "warn" };
    else ch2 = { pre: "Nothing that passed on the base breaks here.", hl: a.newTests.length ? `${plural(a.newTests.length, "new test")}${fromPlan ? `, ${fromPlan === a.newTests.length ? "all" : fromPlan} from the plan` : ""}.` : "No new tests.", post: "", tone: "ok" };
  }

  const ran = m.suites.filter((s) => s.mode !== "not-run");
  const ranTests = (s: (typeof ran)[number]) => s.total - s.skipped;
  const inProc = ran.filter((s) => s.mode === "in-process").reduce((n, s) => n + ranTests(s), 0);
  const live = ran.filter((s) => s.mode === "running-app").reduce((n, s) => n + ranTests(s), 0);
  const notRun = m.suites.filter((s) => s.mode === "not-run");
  let ch3: Take;
  if (!ran.length) ch3 = { pre: "", hl: "No suite ran.", post: notRun[0]?.note ?? "", tone: "bad" };
  else if (!live) ch3 = { pre: `All ${plural(inProc, "test")} ran the app inside the test process;`, hl: "none reached the app Witness started.", post: "", tone: "warn" };
  else if (!inProc) ch3 = { pre: "", hl: `All ${plural(live, "test")} drove the running app.`, post: "", tone: "ok" };
  else ch3 = { pre: `${plural(inProc, "test")} ran the app inside the test process.`, hl: `${live} drove the running app.`, post: "", tone: "ok" };
  if (notRun.length && ran.length) ch3.post = `${ch3.post} ${plural(notRun.length, "suite")} did not run.`.trim();
  return { ch1, ch2, ch3 };
}

export function takeaways(m: ReportModel) {
  const t = takes(m);
  const items = m.plan?.items ?? [];
  const a = m.against;
  return {
    ch1: join(t.ch1),
    ch2: join(t.ch2),
    ch3: join(t.ch3),
    planCard: `${items.filter((i) => i.state === "proven").length} of ${items.length} behaviors pass`,
    baseCard: !a ? "not compared" : `${a.parity.differs ?? 0} differ · ${a.parity.same ?? 0} same · ${a.parity.target_only ?? 0} new${a.parity.origin_only ? ` · ${a.parity.origin_only} only on the base` : ""}`,
  };
}
