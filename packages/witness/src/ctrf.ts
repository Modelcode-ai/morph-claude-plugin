import type { Diagnosis } from "./diagnosis.ts";
import type { Outcome, Parity, TestRecord } from "./reconcile.ts";

export const SCHEMA = "witness.run/v1";
export const VERSION = "1.0.0-mvp";

export interface RunMeta {
  runId: string;
  outcome: Outcome;
  commit: string;
  branch: string;
  dirty: boolean;
  label?: string;
  startedAt: number;
  finishedAt: number;
  diagnosis?: Diagnosis;
  against?: { ref: string; outcome: Outcome; parity?: Record<Parity, number> };
  adapters: string[];
}

export function runSource(): "local" | "ci" | "morph" {
  const s = process.env.WITNESS_SOURCE;
  if (s === "morph" || s === "ci" || s === "local") return s;
  return process.env.CI && process.env.CI !== "false" ? "ci" : "local";
}

/** CTRF document with witness provenance in results.extra.witness and tests[].extra.witness. */
export function buildCtrf(meta: RunMeta, tests: TestRecord[]) {
  const summary = { tests: tests.length, passed: 0, failed: 0, skipped: 0, pending: 0, other: 0, start: meta.startedAt, stop: meta.finishedAt };
  for (const t of tests) summary[t.status]++;
  const witness: Record<string, unknown> = {
    schema: SCHEMA,
    version: VERSION,
    run_id: meta.runId,
    outcome: meta.outcome,
    commit: meta.commit,
    branch: meta.branch,
    dirty: meta.dirty,
    source: runSource(),
    started_at: new Date(meta.startedAt).toISOString(),
    finished_at: new Date(meta.finishedAt).toISOString(),
  };
  if (meta.label) witness.label = meta.label;
  if (meta.against) witness.against = meta.against;
  if (meta.diagnosis) witness.diagnosis = meta.diagnosis;
  return {
    reportFormat: "CTRF",
    specVersion: "0.0.0",
    results: {
      tool: { name: "witness", version: VERSION, extra: { adapters: meta.adapters } },
      summary,
      tests: tests.map((t) => {
        const w: Record<string, unknown> = { id: t.id, suite: t.suite, adapter: t.adapter, obtained: t.obtained };
        if (t.statusDetail) w.status_detail = t.statusDetail;
        if (t.parity) w.parity = t.parity;
        if (t.originStatus) w.origin_status = t.originStatus;
        const o: Record<string, unknown> = { name: t.name, status: t.status, duration: t.durationMs };
        if (t.message) o.message = t.message;
        if (t.trace) o.trace = t.trace;
        if (t.filePath) o.filePath = t.filePath;
        o.suite = t.suite;
        if (t.retries) o.retries = t.retries;
        if (t.flaky) o.flaky = true;
        o.extra = { witness: w };
        return o;
      }),
      extra: { witness },
    },
  };
}
