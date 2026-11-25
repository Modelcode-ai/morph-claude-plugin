import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { VERSION } from "../ctrf.ts";
import type { Diagnosis } from "../diagnosis.ts";
import type { Finding } from "../lint.ts";
import { idMatches, type Plan, type PlanKind, splitId } from "../plan.ts";
import type { Outcome } from "../reconcile.ts";
import type { Status } from "../rundir.ts";
import { readJson } from "../util.ts";
import { EVIDENCE_FILE, type EvidenceProblem, type Observation, readEvidence } from "../evidence/contract.ts";
import { CAPTURE_FIX, gapLine, type VisualGap, visualGaps } from "../evidence/visuals.ts";
import { type ChangedFile, type Commit, readPlanSnapshot, type RunContext } from "./context.ts";

export interface TestEvidence {
  observations: Observation[];
  files: { file: string; type: string }[];
  problems: EvidenceProblem[];
  source: string;
}

export interface TestRow {
  id: string;
  suite: string;
  status: string;
  ms: number;
  parity?: string;
  originStatus?: string;
  obtained?: string;
  message?: string;
  detail?: string;
}

export type ItemState = "proven" | "failed" | "missing" | "skipped" | "not-run";

export interface PlanItemView {
  id: string;
  kind: PlanKind;
  behavior: string;
  expect: string;
  state: ItemState;
  base: "new" | "same" | "differs" | "none";
  tests: { ref: string; found?: TestRow; running: boolean }[];
}

export type Signal = "y" | "p" | "n";
export interface StrengthSignal {
  key: string;
  label: string;
  state: Signal;
  detail: string;
}

export type StepTone = "fix" | "do" | "low" | "ok";
export interface NextStep {
  tone: StepTone;
  title: string;
  detail: string;
  prompt?: string;
}

export interface SuiteView {
  name: string;
  kind: string;
  state: string;
  services: string[];
  mode: "in-process" | "running-app" | "not-run";
  passed: number;
  failed: number;
  skipped: number;
  error: number;
  missing: number;
  total: number;
  ms?: number;
  reruns: number;
  note?: string;
  cause?: string;
  url?: string;
}

export interface Segment {
  label: string;
  start: number;
  end: number;
  type: "boot" | "build" | "suite";
  state?: string;
}

export interface ReportModel {
  version: string;
  run: { id: string; label?: string; outcome: Outcome | "running"; branch: string; commit: string; dirty: boolean; startedAt: string; finishedAt?: string; ms?: number; selected: boolean; hash?: string; dir: string };
  headline: string;
  change?: { baseLabel: string; base: string; commits: Commit[]; files: ChangedFile[] };
  plan?: { source: string; items: PlanItemView[] };
  totals: { tests: number; passed: number; failed: number; skipped: number; other: number };
  against?: { ref: string; outcome?: string; parity: Record<string, number>; diagnosis?: Diagnosis; newTests: { id: string; item?: string }[]; differs: TestRow[] };
  suites: SuiteView[];
  services: { name: string; url?: string; readyMs?: number }[];
  diagnosis?: Diagnosis;
  signals: StrengthSignal[];
  steps: NextStep[];
  timeline: { total: number; rows: { label: string; segments: Segment[] }[] };
  tests: TestRow[];
  lint?: { files: string[]; tests: number; errors: number; warnings: number; findings: Finding[] };
  artifacts: { file: string; test_id: string | null; artifact_type: string }[];
  /** Per test id: what the test recorded on this branch and, with --against, on the base. */
  evidence: Record<string, { here?: TestEvidence; base?: TestEvidence }>;
  /** Per ui, mobile and desktop suite: passing tests that left no screenshot or video. */
  visuals: VisualGap[];
}

interface Ctrf {
  results?: { tests: { name: string; status: string; duration?: number; message?: string; suite?: string; extra?: { witness?: { id: string; suite?: string; parity?: string; origin_status?: string; obtained?: string; status_detail?: string } } }[] };
}

interface Ev {
  t: string;
  type: string;
  service?: string;
  suite?: string;
  url?: string;
  ms?: number;
  phase?: string;
  state?: string;
  origin?: boolean;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const shortTest = (id: string) => {
  const s = id.slice(id.indexOf(":") + 1);
  const cls = s.includes("#") ? s.split("#")[0].split(".").pop() + "#" + s.split("#").slice(1).join("#") : s;
  return cls.length > 90 ? `…${cls.slice(-88)}` : cls;
};

function matchRef(ref: string, rows: TestRow[]): TestRow | undefined {
  const [adapter, id] = splitId(ref);
  const cand = rows.filter((r) => r.id.startsWith(`${adapter}:`) && idMatches(r.id.slice(adapter.length + 1), id));
  if (!cand.length) return undefined;
  return cand.find((r) => r.status !== "passed") ?? cand[0];
}

function itemState(found: (TestRow | undefined)[], selected: boolean): ItemState {
  if (!found.length || found.every((f) => !f)) return selected ? "not-run" : "missing";
  if (found.some((f) => f && (f.status === "failed" || f.status === "other"))) return "failed";
  if (found.some((f) => !f)) return selected ? "not-run" : "missing";
  if (found.every((f) => f!.status === "skipped")) return "skipped";
  return "proven";
}

function timeline(events: Ev[]): ReportModel["timeline"] {
  if (!events.length) return { total: 0, rows: [] };
  const t0 = Date.parse(events[0].t);
  const at = (e: Ev) => (Date.parse(e.t) - t0) / 1000;
  const rows = [{ label: "This branch", segments: [] as Segment[] }, { label: "Base", segments: [] as Segment[] }];
  let side = 0;
  const open = new Map<string, Ev>();
  for (const e of events) {
    if (e.type === "phase" && e.phase === "against") side = 1;
    const key = `${side}:${e.type.split("_")[0]}:${e.service ?? e.suite}`;
    if (e.type === "setup_started" || e.type === "service_started" || e.type === "suite_started") open.set(key, e);
    if (e.type === "service_started") {
      const s = open.get(`${side}:setup:${e.service}`);
      if (s) rows[side].segments.push({ label: "build", start: at(s), end: at(e), type: "build" });
    }
    if (e.type === "service_ready") {
      const s = open.get(`${side}:service:${e.service}`);
      if (s) rows[side].segments.push({ label: e.service ?? "", start: at(s), end: at(e), type: "boot" });
    }
    if (e.type === "suite_finished") {
      const s = open.get(`${side}:suite:${e.suite}`);
      if (s) rows[side].segments.push({ label: e.suite ?? "", start: at(s), end: at(e), type: "suite", state: e.state });
    }
  }
  const end = at(events[events.length - 1]);
  return { total: Math.max(end, 1), rows: rows.filter((r) => r.segments.length) };
}

function readEvents(dir: string): Ev[] {
  const f = path.join(dir, "events.jsonl");
  if (!fs.existsSync(f)) return [];
  return fs.readFileSync(f, "utf8").split("\n").filter(Boolean).flatMap((l) => {
    try {
      return [JSON.parse(l) as Ev];
    } catch {
      return [];
    }
  });
}

export function buildModel(dir: string): ReportModel {
  const st = readJson<Status>(path.join(dir, "status.json"), null as unknown as Status);
  const ctrf = readJson<Ctrf | null>(path.join(dir, "results.ctrf.json"), null);
  const ctx = readJson<RunContext | null>(path.join(dir, "context.json"), null) ?? { selected: false };
  const plan: Plan | undefined = readPlanSnapshot(dir);
  const artifacts = readJson<ReportModel["artifacts"]>(path.join(dir, "artifacts.json"), []);
  const hashFile = path.join(dir, "SHA256SUMS");
  const hash = fs.existsSync(hashFile) ? sha256(fs.readFileSync(hashFile)) : undefined;
  const events = readEvents(dir);
  const outcome = st.outcome ?? "running";

  const tests: TestRow[] = (ctrf?.results?.tests ?? []).map((t) => ({
    id: t.extra?.witness?.id ?? t.name,
    suite: t.extra?.witness?.suite ?? t.suite ?? "",
    status: t.status,
    ms: t.duration ?? 0,
    parity: t.extra?.witness?.parity,
    originStatus: t.extra?.witness?.origin_status,
    obtained: t.extra?.witness?.obtained,
    message: t.message?.split("\n")[0].slice(0, 300),
    detail: t.extra?.witness?.status_detail,
  }));
  const suiteOf = new Map(st.suites.map((s) => [s.name, s]));
  const runningSuite = (name: string) => (suiteOf.get(name)?.services?.length ?? 0) > 0;

  const items: PlanItemView[] | undefined = plan?.items.map((it) => {
    const tv = it.tests.map((ref) => {
      const found = matchRef(ref, tests);
      return { ref, found, running: found ? runningSuite(found.suite) : false };
    });
    const found = tv.map((t) => t.found);
    const parities = found.filter(Boolean).map((f) => f!.parity);
    const base: PlanItemView["base"] = !st.against ? "none" : parities.includes("differs") ? "differs" : parities.length && parities.every((p) => p === "target_only") ? "new" : parities.includes("same") ? "same" : parities.includes("target_only") ? "new" : "none";
    return { id: it.id, kind: it.kind, behavior: it.behavior, expect: it.expect, state: itemState(found, ctx.selected), base, tests: tv };
  });

  const itemOfTest = new Map<string, string>();
  for (const it of items ?? []) for (const t of it.tests) if (t.found) itemOfTest.set(t.found.id, it.id);

  const readyEv = new Map<string, Ev>();
  let originPhase = false;
  for (const e of events) {
    if (e.type === "phase" && e.phase === "against") originPhase = true;
    if (!originPhase && e.type === "service_ready" && e.service) readyEv.set(e.service, e);
  }
  const suiteMs = new Map<string, number>();
  for (const e of events) if (e.type === "suite_finished" && !suiteMs.has(e.suite!)) suiteMs.set(e.suite!, e.ms ?? 0);

  const suites: SuiteView[] = st.suites.map((s) => {
    const services = s.services ?? [];
    const rows = tests.filter((t) => t.suite === s.name);
    return {
      name: s.name,
      kind: s.kind ?? "",
      state: s.state,
      services,
      mode: s.state === "skipped" && !rows.length ? "not-run" : services.length ? "running-app" : "in-process",
      passed: s.passed,
      failed: s.failed,
      skipped: s.skipped,
      error: s.error,
      missing: s.missing,
      total: rows.length,
      ms: suiteMs.get(s.name),
      reruns: rows.filter((r) => r.obtained === "per-test-rerun").length,
      note: s.note,
      cause: s.cause,
      url: services.map((n) => readyEv.get(n)?.url).filter(Boolean)[0],
    };
  });

  const sum = st.summary ?? { tests: tests.length, passed: 0, failed: 0, skipped: 0, pending: 0, other: 0 };
  const totals = { tests: sum.tests, passed: sum.passed, failed: sum.failed, skipped: sum.skipped, other: sum.other };

  const against = st.against
    ? {
        ref: st.against.ref,
        outcome: st.against.outcome,
        parity: (st.against.parity ?? {}) as Record<string, number>,
        diagnosis: st.against.diagnosis,
        newTests: tests.filter((t) => t.parity === "target_only").map((t) => ({ id: t.id, item: itemOfTest.get(t.id) })),
        differs: tests.filter((t) => t.parity === "differs"),
      }
    : undefined;

  const lint = ctx.lint ? { ...ctx.lint, errors: ctx.lint.findings.filter((f) => f.level === "error").length, warnings: ctx.lint.findings.filter((f) => f.level !== "error").length } : undefined;

  const headline = headlineOf(ctx, plan, st);
  const m: ReportModel = {
    version: VERSION,
    run: { id: st.run_id, label: st.label, outcome, branch: st.branch, commit: st.commit, dirty: st.dirty, startedAt: st.started_at, finishedAt: st.finished_at, ms: st.finished_at ? Date.parse(st.finished_at) - Date.parse(st.started_at) : undefined, selected: ctx.selected, hash, dir },
    headline,
    change: ctx.change,
    plan: plan && items ? { source: plan.source, items } : undefined,
    totals,
    against,
    suites,
    services: [...readyEv.values()].map((e) => ({ name: e.service!, url: e.url, readyMs: e.ms })),
    diagnosis: st.diagnosis,
    signals: [],
    steps: [],
    timeline: timeline(events),
    tests,
    lint,
    artifacts,
    evidence: collectEvidence(dir, artifacts),
    visuals: visualGaps(suites, tests, artifacts),
  };
  m.signals = signals(m);
  m.steps = steps(m);
  return m;
}

function collectEvidence(dir: string, artifacts: ReportModel["artifacts"]): ReportModel["evidence"] {
  const out: ReportModel["evidence"] = {};
  for (const a of artifacts) {
    if (!a.test_id) continue;
    const side = a.file.startsWith("against/") ? "base" : "here";
    const slot = (out[a.test_id] ??= {});
    const ev = (slot[side] ??= { observations: [], files: [], problems: [], source: path.dirname(a.file) });
    if (a.artifact_type === "evidence" && path.basename(a.file) === EVIDENCE_FILE) {
      const folder = path.join(dir, path.dirname(a.file));
      const names = new Set(fs.readdirSync(folder));
      const r = readEvidence(path.join(dir, a.file), names);
      ev.observations.push(...r.observations);
      ev.problems.push(...r.problems);
    } else ev.files.push({ file: a.file, type: a.artifact_type });
  }
  return out;
}

function headlineOf(ctx: RunContext, plan: Plan | undefined, st: Status): string {
  const commits = ctx.change?.commits ?? [];
  if (commits.length) return commits[0].subject;
  if (plan?.items.length) return plan.items[0].behavior;
  return st.label ? `Run ${st.label}` : `Run on ${st.branch || "this checkout"}`;
}

const changedItems = (m: ReportModel) => (m.plan?.items ?? []).filter((i) => i.kind !== "parity");

export function signals(m: ReportModel): StrengthSignal[] {
  const items = m.plan?.items ?? [];
  const proven = items.filter((i) => i.state === "proven").length;
  const a = m.against;
  const differs = a?.parity.differs ?? 0;
  const originOk = a && (a.outcome === "passed" || a.outcome === "failed");
  const changed = changedItems(m);
  const anyRunning = m.suites.some((s) => s.mode === "running-app" && s.total > 0);
  const changedRunning = changed.filter((i) => i.tests.some((t) => t.found && t.running));
  const planTests = items.flatMap((i) => i.tests.map((t) => t.found?.id)).filter(Boolean) as string[];
  const withEvidence = planTests.filter((id) => m.evidence[id]?.here && (m.evidence[id].here!.observations.length || m.evidence[id].here!.files.length));
  const planState: Signal = !planTests.length ? (m.artifacts.length ? "p" : "n") : withEvidence.length === planTests.length ? "y" : withEvidence.length ? "p" : "n";
  const uiPassed = m.visuals.reduce((n, g) => n + g.passed, 0);
  const uiBare = m.visuals.reduce((n, g) => n + g.bare.length, 0);
  const parts: Signal[] = [planState, ...(uiPassed ? [uiBare === 0 ? "y" : uiBare === uiPassed ? "n" : "p"] as Signal[] : [])];
  const evidenceState: Signal = parts.every((x) => x === "y") ? "y" : parts.every((x) => x === "n") ? "n" : "p";
  return [
    {
      key: "plan",
      label: "Every planned behavior has a passing test",
      state: !items.length ? "n" : proven === items.length ? "y" : proven ? "p" : "n",
      detail: !items.length ? "No test plan for this run" : `${proven} of ${items.length} behaviors pass`,
    },
    {
      key: "base",
      label: "Nothing broke against the base",
      state: !a ? "n" : differs ? "n" : originOk ? "y" : "p",
      detail: !a ? "Not compared with a base" : differs ? `${plural(differs, "test")} differ from the base` : originOk ? "Same results as the base" : `The base side ended ${a.outcome}`,
    },
    {
      key: "old-code",
      label: "New tests fail without the change",
      state: "n",
      detail: "Not checked by this version of Witness",
    },
    {
      key: "running",
      label: "Changed behavior tested on the running app",
      state: !changed.length ? (anyRunning ? "p" : "n") : changedRunning.length === changed.length ? "y" : changedRunning.length || anyRunning ? "p" : "n",
      detail: !changed.length ? "No changed behavior in the plan" : `${changedRunning.length} of ${changed.length} changed behaviors reach the running app`,
    },
    {
      key: "evidence",
      label: "Requests and screens recorded",
      state: evidenceState,
      detail: `${withEvidence.length} of ${planTests.length} planned tests have recorded evidence${uiPassed ? `; ${uiPassed - uiBare} of ${uiPassed} passing UI tests have a screenshot or video` : ""}`,
    },
  ];
}

const ids = (rows: TestRow[], n = 3) => rows.slice(0, n).map((r) => shortTest(r.id)).join(", ") + (rows.length > n ? ` and ${rows.length - n} more` : "");

export function steps(m: ReportModel): NextStep[] {
  const out: NextStep[] = [];
  const run = m.run.id;
  const o = m.run.outcome;
  if (m.diagnosis && (o === "mistrial" || o === "error" || o === "stalled")) {
    const d = m.diagnosis;
    const where = d.service ? ` in ${d.service}` : d.suite ? ` in ${d.suite}` : "";
    out.push({ tone: "fix", title: `Fix the setup: ${d.cause.replace(/_/g, " ")}${where}`, detail: d.evidence ?? "The tests could not give an answer; this is not a test failure.", prompt: `Use witness to triage run ${run}: it ended ${o} with cause ${d.cause}${where}${d.evidence ? ` (${d.evidence})` : ""}. Follow the triage skill, fix the cause, and run witness check, then witness run.` });
  }
  if (o === "interrupted") out.push({ tone: "fix", title: "Run the suites to the end", detail: "This run was interrupted, so its results are incomplete." });
  const bad = m.tests.filter((t) => t.status === "failed" || t.status === "other");
  if (bad.length)
    out.push({ tone: "fix", title: `Fix ${plural(bad.length, "failing test")}`, detail: ids(bad), prompt: `Use witness: in run ${run} these tests fail: ${bad.slice(0, 20).map((t) => t.id).join(", ")}. For each, find out whether the code or the test is wrong from its message and the logs, fix the cause without weakening the test, and rerun them with witness run --select.` });
  const regress = m.against?.differs.filter((t) => t.originStatus === "passed") ?? [];
  if (regress.length) out.push({ tone: "fix", title: `${plural(regress.length, "test")} that pass on the base fail here`, detail: ids(regress), prompt: `Use witness: these tests pass on ${m.against!.ref} but fail on this branch: ${regress.slice(0, 20).map((t) => t.id).join(", ")}. Find what in the change broke them and fix it.` });
  const unproven = (m.plan?.items ?? []).filter((i) => i.state === "missing");
  if (unproven.length) out.push({ tone: "fix", title: `${plural(unproven.length, "planned behavior")} with no test result`, detail: unproven.map((i) => `${i.id}: ${i.behavior}`).join(" · "), prompt: `Use witness: plan items ${unproven.map((i) => i.id).join(", ")} in .witness/plan.yaml have no test result in run ${run}. Write or fix their tests so witness plan check finds them, then run the suites.` });
  if (m.run.selected) out.push({ tone: "do", title: "Run the full suites", detail: "This run selected some tests only. A verdict on the change needs a full run.", prompt: "Use witness to run all suites (witness run, without --select) and report the VERDICT." });
  if (m.lint?.errors) out.push({ tone: "fix", title: `Fix ${plural(m.lint.errors, "lint finding")} in the tests`, detail: m.lint.findings.filter((f) => f.level === "error").slice(0, 2).map((f) => `${f.file}:${f.line} ${f.rule}`).join(" · "), prompt: `Run witness lint --plan .witness/plan.yaml and fix each error it reports in the test files, without weakening the tests.` });
  if (m.against && m.against.outcome !== "passed" && m.against.outcome !== "failed") {
    const d = m.against.diagnosis;
    out.push({ tone: "do", title: "Make the base comparable", detail: `The base side ended ${m.against.outcome}${d ? ` (${d.cause}${d.suite ? ` in ${d.suite}` : ""})` : ""}, so part of the comparison is missing.`, prompt: `Use witness: the base side of run ${run} ended ${m.against.outcome}${d ? ` with ${d.cause}` : ""}. If the base lacks a setup step this branch has, add it as setup in [reference] in .witness/witness.toml with ref set to the base branch, then run witness run --against reference.` });
  }
  if (!m.plan) out.push({ tone: "do", title: "Write a test plan for this change", detail: "Without a plan, this report can't say which behaviors the tests prove.", prompt: "Use witness to create a test plan for this change in .witness/plan.yaml, then write its tests and run them with witness." });
  if (!m.against && m.change) out.push({ tone: "do", title: `Compare with ${m.change.baseLabel === "the last commit" ? "the base branch" : m.change.baseLabel}`, detail: "A comparison shows that nothing that worked before breaks.", prompt: `Use witness to run all suites against the base (witness run --against ${m.change.baseLabel === "the last commit" ? "<base branch>" : m.change.baseLabel}) and report what differs.` });
  const running = m.suites.find((s) => s.mode === "running-app" && s.total > 0);
  const inProcOnly = changedItems(m).filter((i) => i.state === "proven" && !i.tests.some((t) => t.running));
  if (running && inProcOnly.length) {
    const first = inProcOnly[0];
    out.push({ tone: "do", title: `Test ${inProcOnly.map((i) => i.id).join(", ")} on the running app`, detail: `${inProcOnly.length === 1 ? "This changed behavior is" : "These changed behaviors are"} only tested with the app inside the test process; the ${running.name} suite drives the running app.`, prompt: `Use witness to add a test to the ${running.name} suite (${running.kind}) for plan item ${first.id}: "${first.behavior}", expecting: ${first.expect}. Add it to ${first.id} in .witness/plan.yaml and run the ${running.name} suite.` });
  }
  const planTests = (m.plan?.items ?? []).flatMap((i) => i.tests.filter((t) => t.found).map((t) => ({ item: i.id, id: t.found!.id })));
  const bare = planTests.filter((t) => !m.evidence[t.id]?.here);
  if (planTests.length && bare.length) {
    const items = [...new Set(bare.map((b) => b.item))];
    out.push({ tone: "do", title: `Record evidence for ${items.join(", ")}`, detail: `${plural(bare.length, "planned test")} left no record of what ${bare.length === 1 ? "it" : "they"} sent and saw.`, prompt: `Use witness: make the tests of plan items ${items.join(", ")} record evidence while they run, following the evidence reference of the write skill (each test appends what it sends and sees to $WITNESS_ARTIFACTS/<test id>/evidence.jsonl, and browser tests keep screenshots). Then rerun them with witness run --select.` });
  }
  const gaps = m.visuals.filter((g) => g.bare.length);
  if (gaps.length) {
    const n = gaps.reduce((k, g) => k + g.bare.length, 0);
    const lines = gaps.map((g) => gapLine(g)!);
    out.push({ tone: "do", title: `Record screenshots and video for ${plural(n, "test")}`, detail: `${lines.join("; ")}.`, prompt: `Use witness: in run ${run}, ${lines.join("; ")}. Set up capture once for the whole suite: ${CAPTURE_FIX}. A test that never opens a screen (an API check in a UI suite) has nothing to record; leave it. Then run witness check and the suite again.` });
  }
  const broken = Object.entries(m.evidence).flatMap(([id, e]) => (e.here?.problems.length ? [{ id, n: e.here.problems.length, first: e.here.problems[0] }] : []));
  if (broken.length) out.push({ tone: "low", title: `Fix the evidence of ${plural(broken.length, "test")}`, detail: `${shortTest(broken[0].id)}: line ${broken[0].first.line}, ${broken[0].first.message}`, prompt: `Use witness: the evidence.jsonl files of these tests have problems: ${broken.slice(0, 10).map((b) => `${b.id} (line ${b.first.line}: ${b.first.message})`).join("; ")}. Fix the code that writes them so every line follows the evidence reference of the write skill.` });
  const skipped = m.tests.filter((t) => t.status === "skipped");
  if (skipped.length) out.push({ tone: "low", title: `Decide on ${plural(skipped.length, "skipped test")}`, detail: ids(skipped), prompt: `These tests were skipped in run ${run}: ${skipped.slice(0, 20).map((t) => t.id).join(", ")}. For each, find why it is skipped and either make it run or remove it.` });
  const blocking = out.some((s) => s.tone === "fix");
  if (o === "passed" && !blocking) out.unshift({ tone: "ok", title: "No blockers to merging", detail: m.plan ? "The planned behaviors pass and nothing regressed." : "Every suite passed." });
  return out;
}

export const sha256 = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");
