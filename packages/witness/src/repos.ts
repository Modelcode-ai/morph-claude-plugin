import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { type Config, type InRepo } from "./config.ts";
import { type Diagnosis, diagnose } from "./diagnosis.ts";
import { copyWitnessDir, gitTop, removeWorktree } from "./reference.ts";
import { git, gitInfo } from "./util.ts";

/** A listed repo's checkout as a run records it. */
export interface RepoState {
  path: string;
  root: string;
  commit: string;
  branch: string;
  dirty: boolean;
  via?: string;
}

export function repoStates(cfg: Config): Record<string, RepoState> | undefined {
  if (!cfg.repos.length) return undefined;
  return Object.fromEntries(cfg.repos.map((r) => [r.name, { path: r.path, root: r.root, ...gitInfo(r.root), ...(r.via ? { via: r.via } : {}) }]));
}

const DEFAULT_BRANCHES = ["origin/main", "main", "origin/master", "master"];

/** Where HEAD left the default branch; HEAD itself on the default branch. */
export function mergeBase(root: string): { sha: string; label: string } | undefined {
  const rev = (r: string) => {
    const x = git(root, ["rev-parse", "--verify", "--quiet", `${r}^{commit}`]);
    return x.ok && x.out ? x.out : undefined;
  };
  if (!rev("HEAD")) return undefined;
  const remoteHead = git(root, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"]);
  for (const b of [remoteHead.ok ? remoteHead.out : "", ...DEFAULT_BRANCHES].filter(Boolean)) {
    if (!rev(b)) continue;
    const mb = git(root, ["merge-base", "HEAD", b]);
    if (mb.ok && mb.out) return { sha: mb.out, label: `merge base with ${b}` };
  }
  return undefined;
}

/** `--against` values: one plain ref for this checkout, `<repo>=<ref>` for a listed repo. */
export function parseAgainst(cfg: Config, values: string[] | undefined): { against?: string; repos: Record<string, string> } | { error: string } {
  const out: { against?: string; repos: Record<string, string> } = { repos: {} };
  for (const v of values ?? []) {
    const eq = v.indexOf("=");
    const name = eq > 0 ? v.slice(0, eq) : "";
    if (name && cfg.repos.some((r) => r.name === name)) {
      if (out.repos[name]) return { error: `--against ${name}=...: given twice` };
      if (!v.slice(eq + 1)) return { error: `--against ${name}=: needs a ref after =` };
      out.repos[name] = v.slice(eq + 1);
      continue;
    }
    if (name && cfg.repos.length) return { error: `--against ${v}: no repo "${name}"; repos: ${cfg.repos.map((r) => r.name).join(", ")} (--against <ref> for this checkout, --against <repo>=<ref> for a listed repo)` };
    if (out.against) return { error: `--against ${out.against} and --against ${v}: one ref for this checkout${cfg.repos.length ? "; name the others as <repo>=<ref>" : ""}` };
    out.against = v;
  }
  return out;
}

/** The ref this checkout is compared with when only listed repos got one: [reference] when it says something, else the merge base. */
export function defaultAgainst(cfg: Config): string | undefined {
  const r = cfg.reference;
  if (r && (r.ref || r.repo || Object.keys(r.services).length)) return "reference";
  return mergeBase(cfg.root)?.sha.slice(0, 12);
}

/** A listed repo on the reference side: its checkout as it is, or a temporary worktree at the ref. */
export interface RepoSide {
  name: string;
  root: string;
  /** The ref as given, or how the default was picked. */
  label: string;
  sha?: string;
  worktree?: string;
  repoDir?: string;
}

/** Each listed repo at its ref: `--against <repo>=<ref>`, else `[reference] repos`, else its merge base. */
export function resolveRepoSides(cfg: Config, refs: Record<string, string> = {}): RepoSide[] | { diagnosis: Diagnosis } {
  const sides: RepoSide[] = [];
  const fail = (evidence: string) => {
    releaseRepoSides(sides);
    return { diagnosis: diagnose({ stage: "config", cause: "bad_config", evidence }) };
  };
  for (const r of cfg.repos) {
    const ref = refs[r.name] ?? cfg.reference?.repos[r.name];
    let sha: string | undefined;
    let label: string;
    if (ref) {
      const x = git(r.root, ["rev-parse", "--verify", `${ref}^{commit}`]);
      if (!x.ok) return fail(`--against ${r.name}=${ref}: not a commit in ${r.root} (${x.err || "unknown revision"})`);
      sha = x.out;
      label = ref;
    } else {
      const mb = mergeBase(r.root);
      sha = mb?.sha;
      label = mb?.label ?? "its checkout (no default branch to compare with)";
    }
    const g = gitInfo(r.root);
    if (!sha || (sha === g.commit && !g.dirty)) {
      sides.push({ name: r.name, root: r.root, label, sha: sha ?? (g.commit || undefined) });
      continue;
    }
    const repoDir = gitTop(r.root);
    const wt = fs.mkdtempSync(path.join(os.tmpdir(), `witness-against-${r.name}-`));
    const add = git(repoDir, ["worktree", "add", "--detach", wt, sha]);
    if (!add.ok) {
      fs.rmSync(wt, { recursive: true, force: true });
      return fail(`repo ${r.name}: git worktree add failed: ${add.err}`);
    }
    const root = path.join(wt, path.relative(repoDir, r.root));
    copyWitnessDir(path.join(r.root, ".witness"), path.join(root, ".witness"));
    sides.push({ name: r.name, root, label, sha, worktree: wt, repoDir });
  }
  return sides;
}

export function releaseRepoSides(sides: RepoSide[]) {
  for (const s of sides) if (s.worktree && s.repoDir) removeWorktree(s.repoDir, s.worktree);
}

/** The config with each listed repo's services and dependencies (and suites, with `suites`) moved to that repo's reference root. */
export function atRepoSides(cfg: Config, sides: RepoSide[], suites: boolean): Config {
  if (!sides.length) return cfg;
  const roots = Object.fromEntries(sides.map((s) => [s.name, s.root]));
  const at = <T extends InRepo>(x: T): T => (x.repo && roots[x.repo] ? { ...x, root: roots[x.repo] } : x);
  return { ...cfg, services: cfg.services.map(at), dependencies: cfg.dependencies.map(at), suites: suites ? cfg.suites.map(at) : cfg.suites };
}

export function describeRepoSide(s: RepoSide): string {
  return s.worktree ? `${s.label} · checked out ${s.sha!.slice(0, 10)} in ${s.worktree}` : `${s.label} · runs from its checkout${s.sha ? ` (already at ${s.sha.slice(0, 10)})` : ""}`;
}
