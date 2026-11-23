import * as fs from "node:fs";
import * as path from "node:path";
import { LineCounter, parseDocument } from "yaml";
import { ADAPTERS, type AdapterName } from "./adapters.ts";
import { closest, type Config, loadEnv, substitute, type Suite } from "./config.ts";
import { childEnv, runCapture } from "./proc.ts";

export type PlanKind = "new" | "changed" | "parity";

export interface PlanItem {
  id: string;
  behavior: string;
  expect: string;
  kind: PlanKind;
  tests: string[];
  line?: number;
}

export interface Plan {
  version: 1;
  source: string;
  items: PlanItem[];
}

export interface Problem {
  level: "error" | "warning";
  where: string;
  message: string;
  line?: number;
}

const KINDS: PlanKind[] = ["new", "changed", "parity"];
const TOP_KEYS = ["version", "source", "items"];
const ITEM_KEYS = ["id", "behavior", "expect", "kind", "tests"];

/** Parse and validate a plan file; problems carry the YAML path (items[0].kind) and line. */
export function parsePlan(text: string, opts: { draft?: boolean } = {}): { plan?: Plan; problems: Problem[] } {
  const problems: Problem[] = [];
  const lc = new LineCounter();
  const doc = parseDocument(text, { lineCounter: lc, uniqueKeys: true });
  for (const e of doc.errors) problems.push({ level: "error", where: "yaml", message: e.message.split("\n")[0], line: e.linePos?.[0]?.line });
  if (problems.length) return { problems };
  const lineOf = (p: (string | number)[]) => {
    const node = doc.getIn(p, true) as { range?: [number, number] } | undefined;
    return node?.range ? lc.linePos(node.range[0]).line : undefined;
  };
  const err = (where: string, message: string, p: (string | number)[] = []) => problems.push({ level: "error", where, message, line: lineOf(p) });
  const warn = (where: string, message: string, p: (string | number)[] = []) => problems.push({ level: "warning", where, message, line: lineOf(p) });
  const raw = doc.toJS() as unknown;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    err("plan", "expected a mapping with version, source and items");
    return { problems };
  }
  const top = raw as Record<string, unknown>;
  unknownKeys(top, TOP_KEYS, "", err);
  if (top.version !== 1) err("version", `must be 1, got ${JSON.stringify(top.version)}`, ["version"]);
  if (typeof top.source !== "string" || !top.source.trim()) err("source", "required: say where the expectations came from (request, PR description, issue, spec)", ["source"]);
  const items: PlanItem[] = [];
  if (!Array.isArray(top.items) || !top.items.length) {
    err("items", "required: a non-empty list of expected behaviors", ["items"]);
    return { problems };
  }
  const seen = new Map<string, string>();
  top.items.forEach((it: unknown, i: number) => {
    const w = `items[${i}]`;
    if (!it || typeof it !== "object" || Array.isArray(it)) return err(w, "expected a mapping", ["items", i]);
    const o = it as Record<string, unknown>;
    unknownKeys(o, ITEM_KEYS, w, err, ["items", i]);
    const id = typeof o.id === "string" || typeof o.id === "number" ? String(o.id).trim() : "";
    if (!id) err(`${w}.id`, "required, e.g. P1", ["items", i]);
    else if (!/^[A-Za-z0-9][\w.-]*$/.test(id)) err(`${w}.id`, `"${id}": use letters, digits, '.', '_' or '-'`, ["items", i, "id"]);
    else if (seen.has(id)) err(`${w}.id`, `"${id}" is already used by ${seen.get(id)}`, ["items", i, "id"]);
    else seen.set(id, w);
    for (const k of ["behavior", "expect"] as const)
      if (typeof o[k] !== "string" || !(o[k] as string).trim()) err(`${w}.${k}`, k === "behavior" ? "required: the behavior in one sentence" : "required: the observable result a test checks", ["items", i]);
    if (!KINDS.includes(o.kind as PlanKind)) err(`${w}.kind`, `must be one of ${KINDS.join(", ")}, got ${JSON.stringify(o.kind)}`, ["items", i, "kind"]);
    let tests: string[] = [];
    if (o.tests !== undefined && (!Array.isArray(o.tests) || o.tests.some((t) => typeof t !== "string"))) err(`${w}.tests`, "expected a list of test ids", ["items", i, "tests"]);
    else tests = ((o.tests as string[] | undefined) ?? []).map((t) => t.trim());
    const dup = tests.find((t, j) => tests.indexOf(t) !== j);
    if (dup) err(`${w}.tests`, `"${dup}" is listed twice`, ["items", i, "tests"]);
    tests.forEach((t, j) => {
      const colon = t.indexOf(":");
      const ad = colon > 0 ? t.slice(0, colon) : "";
      if (!(ad in ADAPTERS)) {
        const hint = ad ? closest(ad, Object.keys(ADAPTERS)) : undefined;
        err(`${w}.tests[${j}]`, `"${t}" must look like <adapter>:<id>${ad ? `; unknown adapter "${ad}"${hint ? ` (did you mean "${hint}"?)` : ""}` : ""}`, ["items", i, "tests", j]);
      } else if (!t.slice(colon + 1).trim()) err(`${w}.tests[${j}]`, `"${t}" has no test id after the adapter`, ["items", i, "tests", j]);
    });
    if (!tests.length) (opts.draft ? warn : err)(`${w}.tests`, `${id || w} names no test yet`, ["items", i]);
    items.push({ id, behavior: String(o.behavior ?? ""), expect: String(o.expect ?? ""), kind: o.kind as PlanKind, tests, line: lineOf(["items", i]) });
  });
  if (problems.some((p) => p.level === "error")) return { problems };
  return { plan: { version: 1, source: top.source as string, items }, problems };
}

function unknownKeys(o: Record<string, unknown>, allowed: string[], where: string, err: (w: string, m: string, p?: (string | number)[]) => void, p: (string | number)[] = []) {
  for (const k of Object.keys(o)) {
    if (allowed.includes(k)) continue;
    const hint = closest(k, allowed);
    err(where ? `${where}.${k}` : k, `unknown key${hint ? ` (did you mean "${hint}"?)` : ""}`, [...p, k]);
  }
}

export type TestState = "found" | "missing" | "unverified";

export interface TestCheck {
  item: string;
  test: string;
  state: TestState;
  suites: string[];
  detail?: string;
}

export interface Listing {
  suite: string;
  adapter: AdapterName;
  ids?: string[];
  error?: string;
  log?: string;
}

export const splitId = (t: string): [AdapterName, string] => {
  const i = t.indexOf(":");
  return [t.slice(0, i) as AdapterName, t.slice(i + 1).trim()];
};

const norm = (s: string) => s.replace(/\s+/g, " ").trim();

/** A listed id matches the plan's id exactly, or as a parametrized case of it. */
export function idMatches(listed: string, wanted: string): boolean {
  const a = norm(listed);
  const b = norm(wanted);
  return a === b || a.startsWith(`${b}[`) || a.startsWith(`${b}(`);
}

const lastSegment = (id: string) => norm(id.split(/::|#| > /).pop() ?? id).replace(/[[(].*$/, "");

/** List the tests of every suite whose adapter the plan references. */
export async function listSuites(cfg: Config, adapters: Set<AdapterName>, logDir: string, onStart?: (s: Suite) => void): Promise<Listing[]> {
  const { env } = loadEnv(cfg);
  const out: Listing[] = [];
  for (const s of cfg.suites.filter((x) => adapters.has(x.adapter))) {
    const ad = ADAPTERS[s.adapter];
    const cmd = ad.list?.cmd(substitute(s.cmd, { ...env, CHECKOUT: cfg.root }));
    if (!cmd) {
      out.push({ suite: s.name, adapter: s.adapter, error: `the ${s.adapter} adapter can't list tests` });
      continue;
    }
    onStart?.(s);
    const log = path.join(logDir, `${s.name}.list.log`);
    const r = await runCapture(cmd, { cwd: path.resolve(cfg.root, s.cwd), env: childEnv(env), timeoutMs: 5 * 60_000, log });
    const ids = r.code === 0 ? ad.list!.parse(r.out) : [];
    if (r.code !== 0 || !ids.length) out.push({ suite: s.name, adapter: s.adapter, error: r.timedOut ? "listing timed out" : `listing failed (exit ${r.code}${r.code === 0 ? ", no tests in the output" : ""})`, log });
    else out.push({ suite: s.name, adapter: s.adapter, ids, log });
  }
  return out;
}

/** Decide for each referenced test whether a suite's listing contains it. */
export function matchTests(plan: Plan, cfg: Config | undefined, listings: Listing[], draft: boolean): { checks: TestCheck[]; problems: Problem[] } {
  const checks: TestCheck[] = [];
  const problems: Problem[] = [];
  for (const item of plan.items) {
    for (const t of item.tests) {
      const [ad, id] = splitId(t);
      const where = `${item.id} ${t}`;
      if (!cfg) {
        checks.push({ item: item.id, test: t, state: "unverified", suites: [], detail: "no witness.toml" });
        continue;
      }
      const owners = cfg.suites.filter((s) => s.adapter === ad);
      if (!owners.length) {
        checks.push({ item: item.id, test: t, state: "missing", suites: [] });
        problems.push({ level: "error", where, message: `no suite uses the ${ad} adapter (suites: ${cfg.suites.map((s) => `${s.name}/${s.adapter}`).join(", ") || "none"})`, line: item.line });
        continue;
      }
      const ls = listings.filter((l) => l.adapter === ad);
      const listed = ls.filter((l) => l.ids);
      const hits = listed.filter((l) => l.ids!.some((x) => idMatches(x, id))).map((l) => l.suite);
      if (hits.length) {
        checks.push({ item: item.id, test: t, state: "found", suites: hits });
        continue;
      }
      if (!listed.length) {
        const why = ls.map((l) => `${l.suite}: ${l.error}`).join("; ");
        checks.push({ item: item.id, test: t, state: "unverified", suites: owners.map((s) => s.name), detail: why });
        problems.push({ level: "warning", where, message: `can't confirm it exists (${why})`, line: item.line });
        continue;
      }
      const seg = lastSegment(id);
      const near = listed.flatMap((l) => l.ids!.filter((x) => lastSegment(x) === seg).map((x) => `${ad}:${x}`)).slice(0, 3);
      const n = listed.reduce((a, l) => a + l.ids!.length, 0);
      checks.push({ item: item.id, test: t, state: "missing", suites: [] });
      problems.push({
        level: draft ? "warning" : "error",
        where,
        message: `${draft ? "not written yet: " : ""}not in the test listing of ${listed.map((l) => l.suite).join(", ")} (${n} tests)${near.length ? `; did you mean ${near.map((x) => `"${x}"`).join(" or ")}?` : ""}`,
        line: item.line,
      });
    }
  }
  return { checks, problems };
}

export function readPlanFile(file: string): string {
  if (!fs.existsSync(file)) throw new Error(`${file} does not exist`);
  return fs.readFileSync(file, "utf8");
}

/** `witness plan check`: schema, unique ids, and referenced tests present in the suites' listings. */
export async function planCheckCommand(file: string, cfg: Config | undefined, o: { draft: boolean; list: boolean; json: boolean; log: (s: string) => void }): Promise<number> {
  let text: string;
  try {
    text = readPlanFile(file);
  } catch (e) {
    o.log(`plan  ${(e as Error).message}`);
    if (o.json) process.stdout.write(JSON.stringify({ ok: false, file, problems: [{ level: "error", where: "file", message: (e as Error).message }] }, null, 2) + "\n");
    return 2;
  }
  const rel = path.relative(process.cwd(), file) || file;
  const { plan, problems } = parsePlan(text, { draft: o.draft });
  let checks: TestCheck[] = [];
  if (plan) {
    const adapters = new Set(plan.items.flatMap((i) => i.tests.map((t) => splitId(t)[0])));
    let listings: Listing[] = [];
    if (cfg && o.list && adapters.size) {
      listings = await listSuites(cfg, adapters, path.join(cfg.root, ".witness", "check", "plan"), (s) => o.log(`plan  listing tests of suite ${s.name} (${s.adapter}) ...`));
    } else if (cfg && !o.list) {
      listings = cfg.suites.filter((s) => adapters.has(s.adapter)).map((s) => ({ suite: s.name, adapter: s.adapter, error: "listing skipped (--no-list)" }));
    }
    const m = matchTests(plan, cfg, listings, o.draft);
    checks = m.checks;
    problems.push(...m.problems);
    if (!cfg) problems.push({ level: "warning", where: "config", message: "no .witness/witness.toml found, so referenced tests were not checked" });
  }
  const errors = problems.filter((p) => p.level === "error");
  for (const p of problems) o.log(`plan  ${p.level === "error" ? "ERROR" : "warn "} ${rel}${p.line ? `:${p.line}` : ""} ${p.where}: ${p.message}`);
  if (plan) {
    for (const c of checks.filter((c) => c.state === "found")) o.log(`plan  ok    ${c.item} ${c.test} (suite ${c.suites.join(", ")})`);
    for (const i of plan.items.filter((i) => !i.tests.length)) o.log(`plan  todo  ${i.id} ${i.behavior}`);
  }
  const count = (s: TestState) => checks.filter((c) => c.state === s).length;
  const summary = plan ? `${plan.items.length} item(s), ${checks.length} test ref(s): ${count("found")} found, ${count("missing")} missing, ${count("unverified")} unverified` : `${errors.length} error(s)`;
  o.log(`PLAN ${errors.length ? "invalid" : "ok"} · ${summary}`);
  if (o.json) process.stdout.write(JSON.stringify({ ok: !errors.length, file, items: plan?.items ?? [], tests: checks, problems }, null, 2) + "\n");
  return errors.length ? 1 : 0;
}
