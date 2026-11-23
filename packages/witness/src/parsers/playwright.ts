import { type Attachment, type RawCase, ReportError } from "./types.ts";

interface PwResult {
  status?: string;
  duration?: number;
  retry?: number;
  error?: { message?: string; stack?: string };
  errors?: { message?: string; stack?: string }[];
  attachments?: { name?: string; contentType?: string; path?: string }[];
}
interface PwTest {
  projectName?: string;
  expectedStatus?: string;
  status?: string;
  results?: PwResult[];
}
interface PwSpec {
  title?: string;
  file?: string;
  line?: number;
  tests?: PwTest[];
}
interface PwSuite {
  title?: string;
  file?: string;
  specs?: PwSpec[];
  suites?: PwSuite[];
}

const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

/** Playwright's JSON reporter output. */
export function parsePlaywright(json: unknown): RawCase[] {
  const doc = json as { suites?: PwSuite[]; config?: unknown };
  if (!doc || typeof doc !== "object" || !Array.isArray(doc.suites)) throw new ReportError("not a Playwright JSON report (no suites)");
  const rows: (RawCase & { _project: string })[] = [];
  const walk = (s: PwSuite, titles: string[], file: string | undefined) => {
    const f = s.file ?? file;
    const here = f && s.title === f && titles.length === 0 ? titles : s.title ? [...titles, s.title] : titles;
    for (const spec of s.specs ?? []) {
      for (const t of spec.tests ?? []) {
        const results = t.results ?? [];
        const last = results[results.length - 1];
        const st = t.status ?? "";
        const c: RawCase & { _project: string } = {
          name: spec.title ?? "(unnamed)",
          file: spec.file ?? f,
          titles: [...here, spec.title ?? "(unnamed)"],
          line: spec.line,
          status: "other",
          durationMs: results.reduce((a, r) => a + (r.duration ?? 0), 0),
          _project: t.projectName ?? "",
        };
        if (st === "skipped" || t.expectedStatus === "skipped" || last?.status === "skipped") c.status = "skipped";
        else if (st === "expected") c.status = "passed";
        else if (st === "flaky") {
          c.status = "passed";
          c.flaky = true;
        } else if (st === "unexpected") {
          c.status = "failed";
          if (last?.status === "timedOut") c.statusDetail = "timeout";
          else if (last?.status === "interrupted") c.statusDetail = "error";
        } else if (last?.status === "passed") c.status = "passed";
        else if (last?.status === "failed" || last?.status === "timedOut") c.status = "failed";
        if (results.length > 1) c.retries = results.length - 1;
        const err = [...results].reverse().find((r) => r.error || r.errors?.length);
        const e = err?.error ?? err?.errors?.[0];
        if (e && c.status !== "passed") {
          c.message = stripAnsi(e.message ?? "").split("\n")[0].slice(0, 2000) || undefined;
          if (e.stack || e.message) c.trace = stripAnsi(e.stack ?? e.message ?? "").slice(0, 20000);
        }
        const atts: Attachment[] = [];
        for (const r of results) for (const a of r.attachments ?? []) if (a.path) atts.push({ name: a.name ?? "", path: a.path, contentType: a.contentType ?? "" });
        if (atts.length) c.attachments = atts;
        rows.push(c);
      }
    }
    for (const sub of s.suites ?? []) walk(sub, here, f);
  };
  for (const s of doc.suites) walk(s, [], undefined);
  const multi = new Set(rows.map((r) => r._project)).size > 1;
  return rows.map(({ _project, ...c }) => (multi && _project ? { ...c, project: _project } : c));
}
