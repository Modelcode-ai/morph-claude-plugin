import * as fs from "node:fs";
import * as path from "node:path";
import type { Config } from "../config.ts";
import { changedTestFiles, type Finding, isTestPath, langOf, lintSource, planFiles } from "../lint.ts";
import { type Plan, parsePlan } from "../plan.ts";
import { mergeBase } from "../repos.ts";
import { git, gitInfo, writeJson } from "../util.ts";

export type FileRole = "app" | "test" | "witness" | "other";

export interface ChangedFile {
  path: string;
  added: number;
  deleted: number;
  role: FileRole;
}

export interface Commit {
  sha: string;
  subject: string;
  body: string;
}

/** What the report needs besides the run's own results: the change, the plan's tests' lint, how the run was scoped. */
export interface RunContext {
  selected: boolean;
  change?: { base: string; baseLabel: string; commits: Commit[]; files: ChangedFile[] };
  lint?: { files: string[]; tests: number; findings: Finding[] };
  /** Each listed repo's checkout and its change since the base it was compared with (or its merge base). */
  repos?: RepoContext[];
}

export interface RepoContext {
  name: string;
  path: string;
  commit: string;
  branch: string;
  dirty: boolean;
  change?: { base: string; baseLabel: string; commits: number; files: number };
}

const OTHER = /(^|\/)(README|CHANGELOG|LICENSE|NOTES)[^/]*$|\.(md|txt|rst|adoc)$|(^|\/)docs?\//i;

export function roleOf(file: string, isTest: (f: string) => boolean): FileRole {
  if (file.startsWith(".witness/") || file.includes("/.witness/")) return "witness";
  if (isTest(file)) return "test";
  if (OTHER.test(file)) return "other";
  return "app";
}

/** The commit the change is measured from: the --against ref, else where the branch left the default branch. */
export function changeBase(root: string, against?: string): { sha: string; label: string } | undefined {
  const rev = (r: string) => {
    const x = git(root, ["rev-parse", "--verify", "--quiet", `${r}^{commit}`]);
    return x.ok && x.out ? x.out.trim() : undefined;
  };
  if (against && against !== "reference") {
    const sha = rev(against);
    if (sha) return { sha, label: against };
  }
  const head = rev("HEAD");
  if (!head) return undefined;
  const remoteHead = git(root, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"]);
  for (const b of [remoteHead.ok ? remoteHead.out.trim() : "", "origin/main", "main", "origin/master", "master"].filter(Boolean)) {
    if (!rev(b)) continue;
    const mb = git(root, ["merge-base", "HEAD", b]);
    if (!mb.ok) continue;
    const sha = mb.out.trim();
    if (sha !== head) return { sha, label: b };
    const parent = rev("HEAD~1");
    return parent ? { sha: parent, label: "the last commit" } : undefined;
  }
  return undefined;
}

export function collectChange(root: string, base: { sha: string; label: string }): RunContext["change"] {
  const log = git(root, ["log", "--reverse", "--no-merges", "--format=%h%x1f%s%x1f%b%x1e", `${base.sha}..HEAD`]);
  const commits = (log.ok ? log.out : "").split("\x1e").map((r) => r.trim()).filter(Boolean).map((r) => {
    const [sha, subject, body] = r.split("\x1f");
    return { sha, subject: subject ?? "", body: (body ?? "").trim() };
  });
  const top = git(root, ["rev-parse", "--show-toplevel"]);
  const cwd = top.ok ? top.out.trim() : root;
  const files: ChangedFile[] = [];
  const num = git(cwd, ["diff", "--numstat", base.sha]);
  for (const line of (num.ok ? num.out : "").split("\n")) {
    const m = /^(\d+|-)\t(\d+|-)\t(.+)$/.exec(line.trim());
    if (!m) continue;
    const p = m[3].replace(/^.*\{(.*) => (.*)\}(.*)$/, (_a, _from, to, rest) => to + rest).replace(/^.* => /, "");
    files.push({ path: p, added: m[1] === "-" ? 0 : Number(m[1]), deleted: m[2] === "-" ? 0 : Number(m[2]), role: roleOf(p, isTestPath) });
  }
  for (const f of git(cwd, ["ls-files", "--others", "--exclude-standard"]).out.split("\n").map((s) => s.trim()).filter(Boolean)) {
    if (files.some((x) => x.path === f)) continue;
    let lines = 0;
    try {
      lines = fs.readFileSync(path.join(cwd, f), "utf8").split("\n").length;
    } catch {
      /* binary or gone */
    }
    files.push({ path: f, added: lines, deleted: 0, role: roleOf(f, isTestPath) });
  }
  return { base: base.sha, baseLabel: base.label, commits, files };
}

export function lintForReport(cfg: Config, plan: Plan | undefined): RunContext["lint"] {
  const files = [...new Set([...changedTestFiles(cfg.root), ...(plan ? planFiles(plan, cfg.root, cfg.suites.map((s) => s.cwd)) : [])])].filter((f) => langOf(f));
  if (!files.length) return undefined;
  const out: NonNullable<RunContext["lint"]> = { files: [], tests: 0, findings: [] };
  for (const f of files) {
    let raw: string;
    try {
      raw = fs.readFileSync(f, "utf8");
    } catch {
      continue;
    }
    const rel = path.relative(cfg.root, f);
    const r = lintSource(f, raw, { plan, rel });
    out.files.push(rel);
    out.tests += r.tests.length;
    out.findings.push(...r.findings);
  }
  return out;
}

export function readPlanSnapshot(runDir: string): Plan | undefined {
  const f = path.join(runDir, "plan.yaml");
  if (!fs.existsSync(f)) return undefined;
  return parsePlan(fs.readFileSync(f, "utf8"), { draft: true }).plan;
}

/** Copy the plan as it is when the run starts, so the report shows the plan these results answer. */
export function snapshotPlan(cfg: Config, runDir: string) {
  const f = path.join(cfg.root, ".witness", "plan.yaml");
  if (fs.existsSync(f)) fs.copyFileSync(f, path.join(runDir, "plan.yaml"));
}

type RepoAgainst = Record<string, { ref: string; commit?: string }>;
type RepoStates = Record<string, { commit: string; branch: string; dirty: boolean }>;

/** `states`: what the run recorded when it started; read now when absent. */
export function repoContexts(cfg: Config, against?: RepoAgainst, states?: RepoStates): RepoContext[] | undefined {
  if (!cfg.repos.length) return undefined;
  return cfg.repos.map((r) => {
    const a = against?.[r.name];
    const base = a?.commit ? { sha: a.commit, label: a.ref } : mergeBase(r.root);
    const ch = base ? collectChange(r.root, base) : undefined;
    const g = states?.[r.name] ?? gitInfo(r.root);
    return { name: r.name, path: r.path, commit: g.commit, branch: g.branch, dirty: g.dirty, ...(ch ? { change: { base: ch.base, baseLabel: ch.baseLabel, commits: ch.commits.length, files: ch.files.length } } : {}) };
  });
}

export function writeContext(cfg: Config, runDir: string, o: { against?: string; selected: boolean; againstRepos?: RepoAgainst; repos?: RepoStates }) {
  const base = changeBase(cfg.root, o.against === "reference" ? cfg.reference?.ref : o.against);
  const repos = repoContexts(cfg, o.againstRepos, o.repos);
  const ctx: RunContext = { selected: o.selected, change: base ? collectChange(cfg.root, base) : undefined, lint: lintForReport(cfg, readPlanSnapshot(runDir)), ...(repos ? { repos } : {}) };
  writeJson(path.join(runDir, "context.json"), ctx);
}
