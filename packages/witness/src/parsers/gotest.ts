import { type RawCase, ReportError } from "./types.ts";

interface GoEvent {
  Action?: string;
  Package?: string;
  Test?: string;
  Elapsed?: number;
  Output?: string;
}

export const NEVER_FINISHED = "test started but never finished (binary crashed, timed out or was killed)";

/** `go test -json` events; non-JSON lines (build output) are ignored. `info.cut` is set when a JSON line is cut off. */
export function parseGoJson(text: string, info: { cut?: string } = {}): RawCase[] {
  const tests = new Map<string, RawCase & { out: string[]; done: boolean }>();
  const pkgOut = new Map<string, string[]>();
  const pkgEnd = new Map<string, string>();
  let events = 0;
  for (const [n, line] of text.split(/\r?\n/).entries()) {
    const l = line.trim();
    if (!l.startsWith("{")) continue;
    let e: GoEvent;
    try {
      e = JSON.parse(l) as GoEvent;
    } catch {
      if (/^\{"(Time|Action)"/.test(l)) info.cut = `go test -json output cut off at line ${n + 1}`;
      continue;
    }
    if (!e.Action) continue;
    events++;
    const pkg = e.Package ?? "";
    if (!e.Test) {
      if (e.Action === "output") (pkgOut.get(pkg) ?? pkgOut.set(pkg, []).get(pkg)!).push(e.Output ?? "");
      else if (["pass", "fail", "skip"].includes(e.Action)) pkgEnd.set(pkg, e.Action);
      continue;
    }
    const key = `${pkg}#${e.Test}`;
    let t = tests.get(key);
    if (!t) {
      t = { name: e.Test, classname: pkg, status: "other", durationMs: 0, out: [], done: false };
      tests.set(key, t);
    }
    if (e.Action === "output") t.out.push(e.Output ?? "");
    else if (e.Action === "pass" || e.Action === "fail" || e.Action === "skip") {
      t.status = e.Action === "pass" ? "passed" : e.Action === "fail" ? "failed" : "skipped";
      t.durationMs = Math.round((e.Elapsed ?? 0) * 1000);
      t.done = true;
    }
  }
  if (events === 0) throw new ReportError("no go test -json events found");
  const out: RawCase[] = [];
  for (const t of tests.values()) {
    const { out: lines, done, ...c } = t;
    if (!done) {
      c.status = "failed";
      c.statusDetail = /panic: test timed out/.test([...lines, ...(pkgOut.get(c.classname!) ?? [])].join("")) ? "timeout" : "error";
      c.message = c.statusDetail === "timeout" ? (lines.find((x) => /panic: test timed out/.test(x))?.trim() ?? NEVER_FINISHED) : NEVER_FINISHED;
    }
    if (c.status === "failed") {
      const body = lines.filter((x) => !/^(=== |--- |\s*$)/.test(x)).join("");
      c.message = c.message ?? (body.trim().split("\n")[0]?.trim().slice(0, 2000) || undefined);
      if (body.trim()) c.trace = body.slice(0, 20000);
    }
    out.push(c);
  }
  for (const [pkg, end] of pkgEnd) {
    const has = out.some((c) => c.classname === pkg);
    if (end === "fail" && !out.some((c) => c.classname === pkg && c.status === "failed")) {
      const body = (pkgOut.get(pkg) ?? []).join("");
      out.push({ name: "(package)", classname: pkg, status: "failed", statusDetail: "error", durationMs: 0, message: has ? "package failed outside any test" : "package failed to build or run", trace: body.slice(0, 20000) || undefined });
    }
  }
  return out;
}
