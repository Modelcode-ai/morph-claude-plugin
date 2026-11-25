import type { Observation } from "../evidence/contract.ts";

export type TestStatus = "passed" | "failed" | "skipped" | "pending" | "other";
export type StatusDetail = "error" | "missing" | "timeout";

export interface Attachment {
  name: string;
  path: string;
  contentType: string;
}

/** One test case as a report states it, before the adapter turns it into a stable id. */
export interface RawCase {
  name: string;
  classname?: string;
  file?: string;
  titles?: string[];
  project?: string;
  line?: number;
  status: TestStatus;
  statusDetail?: StatusDetail;
  durationMs: number;
  message?: string;
  trace?: string;
  retries?: number;
  flaky?: boolean;
  attachments?: Attachment[];
  /** Evidence the report itself holds (a request and its response); witness writes it to the test's evidence.jsonl. */
  observations?: Observation[];
}

export type ReportFormat = "junit" | "trx" | "playwright-json" | "jest-json" | "go-json" | "newman-json";

export interface ParsedFile {
  file: string;
  format?: ReportFormat;
  cases: RawCase[];
  error?: string;
  /** Readable up to a point (a cut stream): its cases count, tests it does not finish are rerun. */
  partial?: string;
}

export class ReportError extends Error {}

/** The first lines of a failure (assertion, expected/received), without colours, stack frames or call logs. */
export function failureSummary(text: string | undefined, maxLines = 6): string | undefined {
  if (!text) return undefined;
  const out: string[] = [];
  for (const raw of text.replace(/\x1b\[[0-9;]*m/g, "").split(/\r?\n/)) {
    if (/^\s*Call log:/.test(raw)) break;
    if (!raw.trim() || /^\s+at\s|^\s*at .+:\d+:\d+\)?$/.test(raw)) continue;
    out.push(raw.trimEnd());
    if (out.length >= maxLines) break;
  }
  return out.join("\n").slice(0, 2000) || undefined;
}
