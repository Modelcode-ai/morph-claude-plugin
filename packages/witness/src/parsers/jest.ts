import { failureSummary, type RawCase, ReportError, type TestStatus } from "./types.ts";

interface JestAssertion {
  ancestorTitles?: string[];
  title?: string;
  status?: string;
  duration?: number | null;
  failureMessages?: string[];
  invocations?: number;
}
interface JestFile {
  name?: string;
  status?: string;
  message?: string;
  assertionResults?: JestAssertion[];
}

const MAP: Record<string, TestStatus> = { passed: "passed", failed: "failed", pending: "skipped", skipped: "skipped", disabled: "skipped", todo: "pending", focused: "passed" };
const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

/** Jest's --json output. */
export function parseJestJson(json: unknown, cwd?: string): RawCase[] {
  const doc = json as { testResults?: JestFile[] };
  if (!doc || typeof doc !== "object" || !Array.isArray(doc.testResults)) throw new ReportError("not a Jest JSON report (no testResults)");
  const out: RawCase[] = [];
  for (const f of doc.testResults) {
    const file = f.name && cwd && f.name.startsWith(cwd + "/") ? f.name.slice(cwd.length + 1) : f.name;
    const asserts = f.assertionResults ?? [];
    if (!asserts.length && f.status === "failed") {
      out.push({ name: "(test file failed to run)", file, titles: ["(test file failed to run)"], status: "failed", statusDetail: "error", durationMs: 0, message: stripAnsi(f.message ?? "").split("\n").map((l) => l.trim()).find((l) => l && !l.startsWith("●")), trace: stripAnsi(f.message ?? "").slice(0, 20000) });
      continue;
    }
    for (const a of asserts) {
      const fail = (a.failureMessages ?? []).map(stripAnsi).join("\n");
      out.push({
        name: a.title ?? "(unnamed)",
        file,
        titles: [...(a.ancestorTitles ?? []), a.title ?? "(unnamed)"],
        status: MAP[a.status ?? ""] ?? "other",
        durationMs: a.duration ?? 0,
        message: failureSummary(fail),
        trace: fail ? fail.slice(0, 20000) : undefined,
        retries: a.invocations && a.invocations > 1 ? a.invocations - 1 : undefined,
        flaky: a.invocations && a.invocations > 1 && a.status === "passed" ? true : undefined,
      });
    }
  }
  return out;
}
