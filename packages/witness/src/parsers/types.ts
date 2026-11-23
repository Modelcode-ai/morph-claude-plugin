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
}

export type ReportFormat = "junit" | "trx" | "playwright-json" | "jest-json" | "go-json";

export interface ParsedFile {
  file: string;
  format?: ReportFormat;
  cases: RawCase[];
  error?: string;
}

export class ReportError extends Error {}
