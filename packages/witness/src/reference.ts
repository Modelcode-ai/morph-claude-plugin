import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { type Config, type Reference, referenceServices, substitute } from "./config.ts";
import { type Diagnosis, diagnose } from "./diagnosis.ts";
import { childEnv, runCapture } from "./proc.ts";
import type { RunDir } from "./rundir.ts";
import { atRepoSides, releaseRepoSides, type RepoSide, resolveRepoSides } from "./repos.ts";
import { git } from "./util.ts";

/** Where and how `--against` runs the app it compares with. */
export interface ReferenceSide {
  /** The reference services' working root (their `cwd` and `${CHECKOUT}`). */
  root: string;
  /** Where the suites run from: the reference checkout, or this checkout when `tests = "target"`. */
  suiteRoot: string;
  cfg: Config;
  /** What the logs and status call it, e.g. `main` or `../legacy@v2`. */
  label: string;
  sha?: string;
  worktree?: string;
  /** The repo the worktree belongs to, for removing it. */
  repoDir?: string;
  copied: boolean;
  setupCacheDir: string | null;
  setup?: string;
  setupTimeoutMs: number;
  /** The listed repos on the reference side. */
  repos: RepoSide[];
}

export const NO_REF = '--against reference: [reference] has no ref, repo or service override, so there is nothing to compare with: set ref = "<base branch>" in [reference], or pass --against <base branch>';

const isUrl = (s: string) => /^(https?|ssh|git|file):\/\//.test(s) || /^[\w.-]+@[\w.-]+:/.test(s);

/** The configured [reference], or this repo at `against` when there is none; `against` other than "reference" overrides its ref. Listed repos go to `repoRefs`, else their merge base. */
export function resolveReference(cfg: Config, against: string, repoRefs: Record<string, string> = {}): ReferenceSide | { diagnosis: Diagnosis } {
  const side = resolvePrimary(cfg, against);
  if ("diagnosis" in side || !cfg.repos.length) return side;
  const repos = resolveRepoSides(cfg, repoRefs);
  if ("diagnosis" in repos) {
    releaseReference(side);
    return repos;
  }
  const fresh = repos.some((r) => r.worktree);
  return { ...side, repos, cfg: atRepoSides(side.cfg, repos, side.suiteRoot === side.root), setupCacheDir: fresh ? null : side.setupCacheDir };
}

function resolvePrimary(cfg: Config, against: string): ReferenceSide | { diagnosis: Diagnosis } {
  const bad = (evidence: string) => ({ diagnosis: diagnose({ stage: "config", cause: "bad_config", evidence }) });
  if (against === "reference" && !cfg.reference) return bad('--against reference: the config has no [reference] section (add one, or pass a branch, tag or commit)');
  const r: Reference = cfg.reference ?? { services: {}, setupTimeoutMs: 0, repos: {} };
  if (against === "reference" && !r.ref && !r.repo && !Object.keys(r.services).length) return bad(NO_REF);
  let ref = against === "reference" ? r.ref : against;
  let repoDir = gitTop(cfg.root);
  const sameRepo = !r.repo;
  if (r.repo && isUrl(r.repo)) {
    const c = cloneOrFetch(cfg, r.repo);
    if ("diagnosis" in c) return c;
    repoDir = c.dir;
    ref ??= "origin/HEAD";
  } else if (r.repo) {
    repoDir = path.resolve(cfg.root, r.repo);
    if (!fs.existsSync(repoDir)) return bad(`[reference] repo = "${r.repo}": ${repoDir} does not exist`);
  }
  // decided after --against <ref> fills in the ref: a ref of this repo has its own tests
  const tests = r.tests ?? (r.repo || !ref ? "target" : "reference");
  const label = `${r.repo ? `${r.repo}${ref ? "@" : ""}` : ""}${ref ?? (r.repo ? "" : "this checkout")}`;
  const cfgRef: Config = cfg.reference ? { ...cfg, services: referenceServices(cfg) } : cfg;
  const base = { cfg: cfgRef, label, setup: r.setup, setupTimeoutMs: r.setupTimeoutMs, repos: [] };
  if (!ref) {
    const root = sameRepo ? cfg.root : repoDir;
    return { ...base, root, suiteRoot: tests === "target" ? cfg.root : root, copied: false, setupCacheDir: path.join(cfg.root, ".witness", "cache", sameRepo ? "setup-reference" : "setup-reference-repo") };
  }
  let resolved = git(repoDir, ["rev-parse", "--verify", `${ref}^{commit}`]);
  if (!resolved.ok && !sameRepo) resolved = git(repoDir, ["rev-parse", "--verify", `origin/${ref}^{commit}`]);
  if (!resolved.ok) return bad(`--against ${label}: not a commit in ${sameRepo ? "this repo" : repoDir} (${resolved.err || "unknown revision"}; try a branch, tag or sha from \`git log\`)`);
  const wt = fs.mkdtempSync(path.join(os.tmpdir(), "witness-against-"));
  const add = git(repoDir, ["worktree", "add", "--detach", wt, resolved.out]);
  if (!add.ok) {
    fs.rmSync(wt, { recursive: true, force: true });
    return bad(`git worktree add failed: ${add.err}`);
  }
  const root = sameRepo ? path.join(wt, path.relative(repoDir, fs.realpathSync(cfg.root))) : wt;
  const copied = sameRepo && copyWitnessDir(path.join(cfg.root, ".witness"), path.join(root, ".witness"));
  return { ...base, root, suiteRoot: tests === "target" ? cfg.root : root, sha: resolved.out, worktree: wt, repoDir, copied, setupCacheDir: null };
}

export function releaseReference(side: ReferenceSide) {
  releaseRepoSides(side.repos);
  if (!side.worktree || !side.repoDir) return;
  removeWorktree(side.repoDir, side.worktree);
}

export function removeWorktree(repoDir: string, wt: string) {
  git(repoDir, ["worktree", "remove", "--force", wt]);
  fs.rmSync(wt, { recursive: true, force: true });
  git(repoDir, ["worktree", "prune"]);
}

/** `[reference] setup`, once per run in the reference root; null when it passed or there is none. */
export async function referenceSetup(side: ReferenceSide, o: { cfg: Config; baseEnv: Record<string, string>; logDir: string; abort: { aborted: boolean }; run?: RunDir }): Promise<Diagnosis | null> {
  if (!side.setup) return null;
  const vars = { ...o.baseEnv, CHECKOUT: side.root, TARGET_CHECKOUT: o.cfg.root };
  const cmd = substitute(side.setup, vars);
  const log = path.join(o.logDir, "reference-setup.log");
  fs.mkdirSync(o.logDir, { recursive: true });
  const r = await runCapture(cmd, { cwd: side.root, env: childEnv(o.baseEnv, { TARGET_CHECKOUT: o.cfg.root }), timeoutMs: side.setupTimeoutMs, log, abort: o.abort, track: o.run?.tracker("setup", "reference") });
  if (r.code === 0) return null;
  const tail = r.out.trim().split(/\r?\n/).slice(-1)[0] ?? "";
  return diagnose({ stage: "boot", cause: "setup_failed", command: cmd, log, evidence: `[reference] setup ${r.timedOut ? "timed out" : `exited ${r.code}`}${tail ? `: ${tail}` : ""}` });
}

const NOT_COPIED = new Set(["runs", "check", "cache", "up", "up.json", "run.lock", "scratch"]);

/** The worktree runs the target's config, so it needs the target's helper files next to it, not the ref's. */
export function copyWitnessDir(src: string, dst: string): boolean {
  if (!fs.existsSync(src)) return false;
  fs.cpSync(src, dst, { recursive: true, force: true, filter: (p) => !NOT_COPIED.has(path.relative(src, p).split(path.sep)[0]) });
  return true;
}

function cloneOrFetch(cfg: Config, url: string): { dir: string } | { diagnosis: Diagnosis } {
  const dir = path.join(cfg.root, ".witness", "cache", "reference", url.replace(/^\w+:\/\//, "").replace(/[^\w.-]+/g, "_").slice(-80));
  const r = fs.existsSync(path.join(dir, ".git")) || fs.existsSync(path.join(dir, "HEAD")) ? git(dir, ["fetch", "--quiet", "--tags", "origin"]) : git(cfg.root, ["clone", "--quiet", "--no-checkout", url, dir]);
  if (!r.ok) return { diagnosis: diagnose({ stage: "config", cause: "bad_config", evidence: `[reference] repo = "${url}": ${r.err.split("\n")[0]}` }) };
  return { dir };
}

export function gitTop(dir: string): string {
  const r = git(dir, ["rev-parse", "--show-toplevel"]);
  return r.ok ? fs.realpathSync(r.out) : dir;
}
