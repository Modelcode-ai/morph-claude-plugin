import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { type Claim, loadClaims, parseClaimFile } from "./claims.ts";
import { type Contract, type Equivalence, mapRoute, parseEquivalence } from "./contract.ts";
import { coverage, judge, reviewProofs, type Source } from "./judge.ts";
import type { TestResult } from "./junit.ts";
import { compareExchanges, type ParityResult } from "./parity.ts";
import type { Exchange } from "./proxy.ts";
import { writeRecord } from "./record.ts";
import { Mistrial, registerCleanup, runSuites, Side, type SuiteRun } from "./session.ts";
import { applyJudge, assessClaim, type ClaimResult, counts, overall, type Verdict } from "./verdict.ts";
import { fmtMs, git, hashFiles, readJson, say, sha, tryGit, worktreeHash, worktreeTree, writeJson } from "./util.ts";
import { lint } from "./lint.ts";
import { buildSurface, readIfFile, type SurfaceMap, loadOperations, matchOp } from "./surface.ts";
import { collectArtifacts, compareScreens, copyArtifacts, type ScreenCompare, type TestArtifacts } from "./ui.ts";

export interface VerifyOpts {
  level: "medium" | "high";
  base?: string | null;
  judge: boolean;
  sources: string[];
  /** Sources a human vouches for; only these (and base-revision docs) may justify an overturn. */
  trustedSources: string[];
  why?: string;
  rerun: boolean;
  fresh: boolean;
}

interface SideCapture {
  runs: SuiteRun[];
  reruns: SuiteRun[];
  exchanges: Exchange[];
  bootMs: number;
  artifacts?: Record<string, TestArtifacts>;
}

export interface Bundle {
  schema: "witness.record/v0";
  level: string;
  verdict: Verdict;
  mistrial?: { message: string; remedy: string; logTail: string };
  repo: string;
  head: { tree: string; sha: string | null; branch: string | null; dirty: boolean };
  base?: { ref: string; sha: string };
  startedAt: string;
  ms: number;
  counts: Record<string, number>;
  claims: ClaimResult[];
  regressions: TestResult[];
  otherTests: TestResult[];
  exchanges: Exchange[];
  layers: Record<string, { key: string; reused: boolean; ms?: number; note?: string }>;
  warnings: string[];
  sources: { name: string; canOverturn: boolean; path?: string; sha?: string }[];
  logs: string[];
  judgeCalls: number;
  declarations?: Declarations;
  coverage?: { checked: boolean; note: string; error?: string };
  originSide?: "base" | "origin";
  screens?: ScreenCompare[];
  uiFiles?: Record<string, string[]>;
  surface?: SurfaceMap;
  origin?: { kind: "evolve" | "migrate"; repo: string; sha: string | null };
}

export interface Declarations {
  /** Lines added/removed in equivalence.toml relative to the base commit. */
  rules: { added: string[]; removed: string[] };
  added: string[];
  changed: string[];
  removed: string[];
  retired: string[];
  /** Files that decide how the app is booted or tested, changed in this PR. */
  harness: string[];
}

/** What this PR changed in the rules of the game: claims and equivalence rules, relative to the base commit. */
function declarations(root: string, base: { sha: string } | null, headClaims: Claim[], headRetired: Claim[], changed: string[]): Declarations | undefined {
  if (!base) return undefined;
  const list = tryGit(root, ["ls-tree", "--name-only", base.sha, ".witness/claims/"]) ?? "";
  const baseClaims = list
    .split("\n")
    .filter((f) => f.endsWith(".md"))
    .flatMap((f) => parseClaimFile(f, tryGit(root, ["show", `${base.sha}:${f}`]) ?? "").claims)
    .filter((c) => !c.retired);
  const sig = (c: Claim) => JSON.stringify([c.text, c.tags, c.proof, c.expectDiff, c.surfaces]);
  const byId = new Map(baseClaims.map((c) => [c.id, c]));
  const headIds = new Set([...headClaims, ...headRetired].map((c) => c.id));
  const lines = (t: string | null) => (t ?? "").split("\n").map((l) => l.split("#")[0].trim()).filter(Boolean);
  const baseEq = lines(tryGit(root, ["show", `${base.sha}:.witness/equivalence.toml`]));
  const headEqFile = path.join(root, ".witness", "equivalence.toml");
  const headEq = lines(fs.existsSync(headEqFile) ? fs.readFileSync(headEqFile, "utf8") : null);
  return {
    rules: { added: headEq.filter((l) => !baseEq.includes(l)), removed: baseEq.filter((l) => !headEq.includes(l)) },
    added: headClaims.filter((c) => !byId.has(c.id)).map((c) => c.id),
    changed: headClaims.filter((c) => byId.has(c.id) && sig(byId.get(c.id)!) !== sig(c)).map((c) => c.id),
    removed: baseClaims.filter((c) => !headIds.has(c.id)).map((c) => c.id),
    retired: headRetired.filter((c) => byId.has(c.id)).map((c) => c.id),
    harness: changed.filter((f) => /^\.witness\/(witness\.toml|bin\/|origin\/)/.test(f)),
  };
}

const cacheDir = (c: Contract, layer: string, key: string) => path.join(c.home, "cache", layer, key);

function resolveBase(root: string, base: string | null | undefined): { ref: string; sha: string } | null {
  if (base === null) return null;
  const candidates = base ? [base] : ["origin/main", "main", "origin/master", "master"];
  for (const ref of candidates) {
    const s = tryGit(root, ["merge-base", "HEAD", ref]);
    if (s) {
      const head = tryGit(root, ["rev-parse", "HEAD"]);
      if (!base && s === head && worktreeHash(root) === tryGit(root, ["rev-parse", "HEAD^{tree}"])?.slice(0, 16)) continue;
      return { ref, sha: s };
    }
  }
  if (base) throw new Error(`Can't resolve base "${base}" (git merge-base HEAD ${base} failed).`);
  return null;
}

async function capture(contract: Contract, side: Side, logDir: string, rerun: boolean, only?: string[]): Promise<SideCapture> {
  await side.boot();
  const artDir = path.join(logDir, "..", "artifacts-tmp", side.name);
  fs.rmSync(artDir, { recursive: true, force: true });
  try {
    const runs = await runSuites(contract, side, { logDir, only, artifacts: artDir });
    const reruns: SuiteRun[] = [];
    const failed = runs.flatMap((r) => r.results.filter((t) => t.status === "failed").map((t) => t.id));
    if (rerun && failed.length && failed.length <= 10) {
      say("testimony", `${side.name}: re-examining ${failed.length} failed test(s) to rule out an unreliable witness`);
      reruns.push(...(await runSuites(contract, side, { logDir, only: failed, run: "rerun" })));
    }
    return { runs, reruns, exchanges: side.exchanges(), bootMs: side.bootMs, artifacts: collectArtifacts(artDir) };
  } finally {
    await side.shutdown();
  }
}

/** Add UI checkpoint text changes to an exchange comparison; visual-only changes are evidence, not failures. */
function withScreens(p: ParityResult, sc: ScreenCompare[], expectDiff: string[]): ParityResult {
  const diffs = [...p.diffs];
  for (const s of sc.filter((x) => x.status === "text")) for (const t of s.textChanges.slice(0, 5)) diffs.push({ field: `screen.${s.name}.text`, origin: t.origin || "(absent)", target: t.target || "(absent)" });
  if (diffs.length === p.diffs.length) return p;
  const explained = diffs.every((d) => expectDiff.some((e) => d.field.replace(/^#\d+ /, "").startsWith(e)));
  return { ...p, diffs, status: explained ? "intended" : "unexplained" };
}

/** Capture origin observations per test, booting the origin only for tests not already on record. */
async function captureOrigin(
  contract: Contract,
  o: NonNullable<Contract["origin"]>,
  tests: string[],
  testsKey: string,
  contractHash: string,
  logDir: string,
  fresh: boolean,
  bundle: Bundle,
): Promise<SideCapture> {
  const originSha = tryGit(o.repoPath!, ["rev-parse", "HEAD"]) ?? "untracked";
  let originTree = originSha;
  try {
    originTree = worktreeHash(o.repoPath!);
  } catch {
    /* not a git checkout */
  }
  const oKey = sha(`${originTree}|${testsKey}|${contractHash}`);
  const dir = cacheDir(contract, "origin", oKey);
  const file = (t: string) => path.join(dir, `${t.replace(/[^\w.-]+/g, "_")}.json`);
  const missing = tests.filter((t) => fresh || !fs.existsSync(file(t)));
  const t1 = Date.now();
  if (missing.length) {
    say("subpoena", `booting origin ${o.repo}@${originSha.slice(0, 7)} for ${missing.length} test(s) not yet on record`);
    const side = new Side("origin", contract, o.repoPath!, logDir, { services: o.services, rewrite: (u) => mapRoute(o.routes ?? [], u) });
    const cap = await capture(contract, side, logDir, false, missing);
    const results = byId(cap.runs);
    const arts = copyArtifacts(cap.artifacts ?? {}, path.join(dir, "artifacts"));
    for (const t of missing) writeJson(file(t), { result: results.get(t) ?? null, exchanges: cap.exchanges.filter((e) => e.test === t), artifacts: arts[t] });
  } else say("subpoena", `origin ${o.repo}@${originSha.slice(0, 7)}: all ${tests.length} test(s) already on record`);
  const per = tests.map((t) => readJson<{ result: TestResult | null; exchanges: Exchange[]; artifacts?: TestArtifacts }>(file(t), { result: null, exchanges: [] }));
  bundle.layers.origin = { key: oKey, reused: missing.length === 0, ms: missing.length ? Date.now() - t1 : undefined, note: `${tests.length - missing.length} reused, ${missing.length} captured` };
  return {
    runs: [{ suite: "origin", side: "origin", run: "primary", code: 0, ms: 0, log: "", results: per.map((p) => p.result).filter((r): r is TestResult => !!r) }],
    reruns: [],
    exchanges: per.flatMap((p) => p.exchanges),
    bootMs: 0,
    artifacts: Object.fromEntries(tests.map((t, i) => [t, per[i].artifacts]).filter(([, a]) => a)),
  };
}

function byId(runs: SuiteRun[]): Map<string, TestResult> {
  const m = new Map<string, TestResult>();
  for (const r of runs) for (const t of r.results) m.set(t.id, t);
  return m;
}

let suiteGlobs: string[] = [];

function testSource(root: string, id: string): ClaimResult["source"] {
  const [cls, method] = id.split("#");
  const named = fs.globSync(path.join(root, "**", `${cls}.*`)).filter((f) => !f.includes("node_modules") && !f.includes("/target/") && !f.includes("/.witness/"));
  const fromSuites = suiteGlobs.flatMap((g) => fs.globSync(path.join(root, g)));
  const escM = method.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const f of [...named, ...fromSuites]) {
    const lines = fs.readFileSync(f, "utf8").split("\n");
    const i = lines.findIndex((l) => new RegExp(`\\b${escM}\\s*\\(`).test(l) || new RegExp(`(test|it)\\(\\s*['"\`]${escM}['"\`]`).test(l));
    if (i >= 0) {
      let start = i;
      while (start > 0 && /^\s*@/.test(lines[start - 1])) start--;
      let depth = 0;
      let end = i;
      for (let j = i; j < lines.length; j++) {
        depth += (lines[j].match(/{/g) ?? []).length - (lines[j].match(/}/g) ?? []).length;
        end = j;
        if (j > i && depth <= 0) break;
      }
      return { file: path.relative(root, f), line: start + 1, snippet: lines.slice(start, Math.min(end + 1, start + 60)).join("\n") };
    }
  }
  return undefined;
}

function loadSources(root: string, home: string, base: { sha: string } | null, extra: string[], trusted: string[], why?: string): Source[] {
  const out: Source[] = [];
  const atBase = (rel: string) => (base ? tryGit(root, ["show", `${base.sha}:${rel}`]) : null);
  const verify = atBase("VERIFY.md");
  if (verify) out.push({ name: "VERIFY.md@base", text: verify, canOverturn: true });
  if (base) {
    const list = tryGit(root, ["ls-tree", "--name-only", base.sha, ".witness/sources/"]);
    for (const f of (list ?? "").split("\n").filter(Boolean)) {
      const t = atBase(f);
      if (t) out.push({ name: `${f}@base`, text: t, canOverturn: true });
    }
  }
  const realRoot = fs.realpathSync(root);
  for (const [f, vouched] of [...extra.map((f) => [f, false] as const), ...trusted.map((f) => [f, true] as const)]) {
    const abs = fs.realpathSync(path.resolve(f));
    const inside = abs.startsWith(realRoot + path.sep);
    const text = fs.readFileSync(abs, "utf8");
    out.push({ name: path.basename(f), text, canOverturn: vouched && !inside, path: abs, sha: sha(text) });
  }
  for (const f of fs.existsSync(path.join(home, "claims")) ? fs.readdirSync(path.join(home, "claims")) : [])
    out.push({ name: `claims/${f}`, text: fs.readFileSync(path.join(home, "claims", f), "utf8"), canOverturn: false });
  const local = path.join(root, "VERIFY.md");
  if (fs.existsSync(local) && !verify) out.push({ name: "VERIFY.md", text: fs.readFileSync(local, "utf8"), canOverturn: false });
  if (base) {
    const log = tryGit(root, ["log", "--format=%s%n%b", `${base.sha}..HEAD`]);
    if (log) out.push({ name: "commit-messages", text: log, canOverturn: false });
  }
  if (why) out.push({ name: "change-description", text: why, canOverturn: false });
  return out;
}

function exchangeText(ex: Exchange[]): string {
  return ex
    .map((e) => `[${e.side}] ${e.method} ${e.path}${e.reqBody ? `\n  request: ${e.reqBody.slice(0, 800)}` : ""}\n  -> ${e.status} ${e.resBody.slice(0, 1500)}`)
    .join("\n");
}

export async function verify(contract: Contract, opts: VerifyOpts): Promise<{ bundle: Bundle; dir: string }> {
  const t0 = Date.now();
  const root = contract.root;
  const recordId = new Date().toISOString().replace(/[:.]/g, "-").replace(/Z$/, "Z");
  const dir = path.join(contract.home, "records", recordId);
  const logDir = path.join(dir, "logs");
  fs.mkdirSync(logDir, { recursive: true });
  const gi = path.join(contract.home, ".gitignore");
  const giText = fs.existsSync(gi) ? fs.readFileSync(gi, "utf8") : "";
  for (const line of ["records/", "cache/"]) if (!giText.split("\n").includes(line)) fs.appendFileSync(gi, (giText && !giText.endsWith("\n") ? "\n" : "") + line + "\n");

  suiteGlobs = contract.suites.map((x) => x.tests).filter((x): x is string => !!x);
  const tree = worktreeHash(root);
  const headSha = tryGit(root, ["rev-parse", "HEAD"]);
  const branch = tryGit(root, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const dirty = tree !== (tryGit(root, ["rev-parse", "HEAD^{tree}"]) ?? "").slice(0, 16);
  const base = resolveBase(root, opts.base);
  const changedPaths = base ? (tryGit(root, ["diff", "--name-only", base.sha, worktreeTree(root)]) ?? "").split("\n").filter(Boolean) : [];
  const files = loadClaims(contract.home);
  const claims: Claim[] = files.flatMap((f) => f.claims).filter((c) => !c.retired);
  const retiredClaims: Claim[] = files.flatMap((f) => f.claims).filter((c) => c.retired);
  const migrate = !!contract.origin?.repo;
  const contractHash = sha(contract.raw);
  const warnings = lint(contract, files).filter((w) => w.level !== "error").map((w) => w.message);

  say("court in session", `level ${opts.level} · this change: ${branch ?? "?"}@${(headSha ?? "").slice(0, 7)}${dirty ? " + uncommitted edits" : ""} · compared with: ${base ? `${base.ref}@${base.sha.slice(0, 7)}` : "nothing (no base commit)"}${migrate ? ` and the legacy app ${contract.origin!.repo}` : ""} · ${claims.length} claims`);

  const bundle: Bundle = {
    schema: "witness.record/v0",
    level: opts.level,
    verdict: "mistrial",
    repo: root,
    head: { tree, sha: headSha, branch, dirty },
    base: base ?? undefined,
    startedAt: new Date(t0).toISOString(),
    ms: 0,
    counts: {},
    claims: [],
    regressions: [],
    otherTests: [],
    exchanges: [],
    layers: {},
    warnings,
    sources: [],
    logs: [],
    judgeCalls: 0,
  };

  try {
    const errors = lint(contract, files).filter((w) => w.level === "error");
    if (errors.length) throw new Mistrial(`The claims don't hold together: ${errors.map((e) => e.message).join("; ")}`, "Fix the claims files (see `witness lint`).");

    // Target layer: head app + head tests.
    // Claims, equivalence rules and docs don't change what the app returns, so they don't key captures.
    const captureTree = worktreeHash(root, [".witness/claims", ".witness/equivalence.toml", ".witness/sources", "VERIFY.md"]);
    const outside = contract.suites.flatMap((x) => (x.tests ? fs.globSync(path.join(root, x.tests)) : [])).filter((f) => !path.resolve(f).startsWith(root + path.sep));
    const tKey = sha(`${captureTree}|${contractHash}|${hashFiles(outside)}`);
    const tFile = path.join(cacheDir(contract, "target", tKey), "capture.json");
    let target = opts.fresh ? null : readJson<SideCapture | null>(tFile, null);
    if (target) say("record", "this change is already on record (same code and tests); reused");
    else {
      const t1 = Date.now();
      target = await capture(contract, new Side("head", contract, root, logDir), logDir, opts.rerun);
      target.artifacts = copyArtifacts(target.artifacts ?? {}, path.join(path.dirname(tFile), "artifacts"));
      writeJson(tFile, target);
      bundle.layers.target = { key: tKey, reused: false, ms: Date.now() - t1 };
    }
    bundle.layers.target ??= { key: tKey, reused: true };

    // Base layer: the base commit's app, for the bite check (and Evolve parity).
    let baseCap: SideCapture | null = null;
    const testGlobs = contract.suites.map((s) => s.tests);
    const harnessFiles = fs.globSync(path.join(contract.home, "**", "*")).filter((f) => !/\/\.witness\/(claims|sources|records|cache)\/|equivalence\.toml$/.test(f) && fs.statSync(f).isFile());
    const proofFiles = claims.map((c) => (c.proof ? testSource(root, c.proof)?.file : undefined)).filter((f): f is string => !!f).map((f) => path.join(root, f));
    const testsKey = testGlobs.every(Boolean) ? hashFiles([...new Set([...testGlobs.flatMap((g) => fs.globSync(path.join(root, g!))), ...harnessFiles, ...proofFiles])]) : captureTree;
    const needsBite = claims.some((c) => c.proof && !c.tags.includes("parity") && !c.tags.includes("judged") && !(migrate && c.tags.includes("changed")));
    const needBase = !!base && (needsBite || (opts.level === "high" && !migrate));
    if (base && !needBase) say("subpoena", `skipping ${base.ref}: no claim needs the bite check${migrate ? " (the origin is the legacy app)" : ""}`);
    if (base && needBase) {
      const bKey = sha(`${base.sha}|${testsKey}|${contractHash}`);
      const bFile = path.join(cacheDir(contract, "base", bKey), "capture.json");
      baseCap = opts.fresh ? null : readJson<SideCapture | null>(bFile, null);
      if (baseCap) {
        say("subpoena", `${base.ref}@${base.sha.slice(0, 7)} already on record; reused`);
        bundle.layers.base = { key: bKey, reused: true };
      } else {
        const t1 = Date.now();
        say("subpoena", `booting ${base.ref}@${base.sha.slice(0, 7)} (the base commit) in a temporary worktree`);
        const wt = path.join(os.tmpdir(), `witness-base-${base.sha.slice(0, 12)}-${process.pid}`);
        git(root, ["worktree", "add", "--detach", "-f", wt, base.sha]);
        const unregister = registerCleanup(() => void tryGit(root, ["worktree", "remove", "--force", wt]));
        try {
          baseCap = await capture(contract, new Side("base", contract, wt, logDir), logDir, false);
        } finally {
          tryGit(root, ["worktree", "remove", "--force", wt]);
          unregister();
        }
        baseCap.artifacts = copyArtifacts(baseCap.artifacts ?? {}, path.join(path.dirname(bFile), "artifacts"));
        writeJson(bFile, baseCap);
        bundle.layers.base = { key: bKey, reused: false, ms: Date.now() - t1 };
      }
    }

    const head = byId(target.runs);
    const rerun = byId(target.reruns);
    const baseRes = baseCap ? byId(baseCap.runs) : undefined;
    const primary = (caps: SideCapture | null, test: string) => (caps?.exchanges ?? []).filter((e) => e.run === "primary" && e.test === test).sort((a, b) => a.seq - b.seq);
    // Static files (scripts, styles, images, the HTML shell) say nothing about behavior and vary with browser caching.
    const STATIC = /\.(js|mjs|css|png|jpe?g|gif|svg|ico|woff2?|ttf|map|webp)(\?|$)/i;
    const observed = (caps: SideCapture | null, test: string) => primary(caps, test).filter((e) => !STATIC.test(e.path) && !/text\/html/.test(e.resHeaders["content-type"] ?? ""));
    const parityClaims = claims.filter((c) => c.proof && (c.tags.includes("parity") || c.tags.includes("changed")));
    const uiOut = path.join(dir, "ui");

    // Origin layer (High): the base commit (Evolve) or a separate legacy checkout (Migrate).
    let originCap: SideCapture | null = null;
    if (opts.level === "high") {
      const o = contract.origin;
      if (o?.repo) {
        originCap = await captureOrigin(contract, o, parityClaims.map((c) => c.proof!), testsKey, contractHash, logDir, opts.fresh, bundle);
        bundle.originSide = "origin";
        bundle.origin = { kind: "migrate", repo: o.repo, sha: tryGit(o.repoPath!, ["rev-parse", "HEAD"]) };
      } else if (baseCap) {
        originCap = baseCap;
        bundle.originSide = "base";
        bundle.origin = { kind: "evolve", repo: ".", sha: base!.sha };
        bundle.layers.origin = { key: bundle.layers.base!.key, reused: true, note: "same as the base layer" };
      }
    }

    // Medium: if main was booted anyway, point out existing tests whose responses changed (High turns them into E claims).
    if (opts.level !== "high" && baseCap) {
      const claimedTests = new Set(claims.map((c) => c.proof).filter(Boolean));
      const eqHint = base ? parseEquivalence(tryGit(root, ["show", `${base.sha}:.witness/equivalence.toml`])) : contract.equivalence;
      const drift = target.runs.flatMap((r) => r.results).filter((t) => !claimedTests.has(t.id) && t.status === "passed" && primary(baseCap, t.id).length && compareExchanges(primary(baseCap, t.id), primary(target, t.id), eqHint, []).status !== "equal");
      if (drift.length) bundle.warnings.unshift(`${drift.length} existing test(s) get different responses than on ${base!.ref} (${drift.map((t) => t.id).join(", ")}). Run with --level high to judge whether that's a regression.`);
    }

    // UI evidence: compare each test's checkpoints with the origin (or the base commit) when both exist.
    const screenOrigin = (opts.level === "high" ? originCap : null) ?? baseCap;
    const screens: ScreenCompare[] = Object.keys(target.artifacts ?? {}).flatMap((t) =>
      compareScreens(t, screenOrigin?.artifacts?.[t], target.artifacts?.[t], { outDir: path.join(uiOut, "diff"), threshold: contract.equivalence.ui.pixel_threshold, ignoreText: contract.equivalence.ui.ignore_text }),
    );
    const screensFor = (t: string) => screens.filter((x) => x.test === t);

    // Parity layer (High): pure comparison over stored observations.
    // Rules come from the base commit, so a PR can't loosen them to pass itself; head rules only mark what awaits approval.
    if (!base) bundle.warnings.unshift("No base commit was found (tried origin/main, main, origin/master, master), so new tests could not be checked to fail without the change. Pass --base <branch>.");
    const decl = declarations(root, base, claims, retiredClaims, changedPaths);
    bundle.declarations = decl;
    const baseEqText = base ? tryGit(root, ["show", `${base.sha}:.witness/equivalence.toml`]) : null;
    const rulesChanged = !!decl && (decl.rules.added.length > 0 || decl.rules.removed.length > 0);
    const eqBase: Equivalence = base ? parseEquivalence(baseEqText) : contract.equivalence;
    const parity = new Map<string, ParityResult>();
    const parityHeadRules = new Map<string, ParityResult>();
    const existing: { test: string; parity: ParityResult }[] = [];
    if (opts.level === "high") {
      if (!originCap) bundle.warnings.push("High level needs an origin: a base commit or an [origin] repo in witness.toml. None was found, so nothing was compared.");
      else {
        const pKey = sha(`${bundle.layers.target.key}|${bundle.layers.origin!.key}|${JSON.stringify(eqBase)}|${JSON.stringify(contract.equivalence)}`);
        say("cross-examination", `comparing ${migrate ? "the legacy app" : base?.ref ?? "the origin"} with this change for ${parityClaims.length} claim(s)`);
        for (const c of parityClaims) {
          parity.set(c.id, withScreens(compareExchanges(observed(originCap, c.proof!), observed(target, c.proof!), eqBase, c.expectDiff), screensFor(c.proof!), c.expectDiff));
          if (rulesChanged) parityHeadRules.set(c.id, withScreens(compareExchanges(observed(originCap, c.proof!), observed(target, c.proof!), contract.equivalence, c.expectDiff), screensFor(c.proof!), c.expectDiff));
        }
        // Existing tests no claim mentions still guard behavior: compare their traffic with main too.
        if (!migrate) {
          const claimedTests = new Set(claims.map((c) => c.proof).filter(Boolean));
          for (const t of target.runs.flatMap((r) => r.results)) {
            if (claimedTests.has(t.id) || t.status !== "passed") continue;
            const o = observed(originCap, t.id);
            if (!o.length && !originCap.artifacts?.[t.id]) continue;
            const p = withScreens(compareExchanges(o, observed(target, t.id), eqBase, []), screensFor(t.id), []);
            if (p.status !== "equal") existing.push({ test: t.id, parity: p });
          }
        }
        bundle.layers.parity = { key: pKey, reused: false, note: `${parity.size} claim(s) and ${existing.length} unclaimed difference(s)` };
      }
    }

    const results = claims.map((c) => {
      const src = c.proof ? testSource(root, c.proof) : undefined;
      const r = assessClaim(c, {
        head, base: baseRes, rerun, parity: parity.get(c.id), level: opts.level, migrate,
        observed: c.proof ? primary(target, c.proof).length : undefined,
        testChanged: !!src && changedPaths.includes(src.file),
        noBase: !base,
      });
      r.source = src;
      return r;
    });
    existing.forEach(({ test, parity: p }, i) => {
      const r = assessClaim(
        { id: `E${i + 1}`, text: `${test} gets the same responses as on ${base?.ref ?? "main"}`, surfaces: ["api"], tags: ["parity"], proof: test, expectDiff: [], feature: "Existing behavior (no claim)", file: "(none)", line: 0 },
        { head, base: baseRes, rerun, parity: p, level: opts.level, migrate },
      );
      r.synthetic = "existing";
      r.reasons.unshift(`No claim covers this test, but its responses changed compared with ${base?.ref ?? "main"}. Fix the regression, or add a claim tagged changed.`);
      r.source = testSource(root, test);
      results.push(r);
    });

    // T2: judge.
    const sources = loadSources(root, contract.home, base, opts.sources, opts.trustedSources, opts.why);
    bundle.sources = sources.map((s) => ({ name: s.name, canOverturn: s.canOverturn, path: s.path, sha: s.sha }));
    const toJudge = results.filter((r) => (r.tags.includes("judged") && r.status === "cant_tell") || (r.parity?.status === "unexplained" && r.status === "failed"));
    if (toJudge.length && opts.judge) {
      say("deliberation", `the judge reviews ${toJudge.length} item(s)`);
      for (const r of toJudge) {
        const kind = r.parity?.status === "unexplained" ? "parity" : "judged";
        const ex = r.testId ? [...(kind === "parity" ? primary(originCap, r.testId) : []), ...primary(target, r.testId)] : [];
        const evidence =
          kind === "parity"
            ? `Differences (origin -> target):\n${r.parity!.diffs.map((d) => `- ${d.field}: ${d.origin} -> ${d.target}`).join("\n")}\n\nExchanges:\n${exchangeText(ex)}`
            : `${r.evidence ? `Evidence hint: ${r.evidence}\n` : ""}Exchanges:\n${exchangeText(ex.length ? ex : target.exchanges.filter((e) => !r.evidence || e.path.includes(r.evidence.split(" ").pop() ?? "")).slice(0, 12))}`;
        const question =
          kind === "parity"
            ? "Is this difference between origin and target justified by a source that may justify an overturn? If yes, answer overturn with the verbatim quote; otherwise fail or cant_tell."
            : "Does the evidence show the claim holds? Answer pass, fail or cant_tell, and flag any ambiguity between the claim, the change description and the behavior.";
        const j = judge({ kind, claim: `${r.id}: ${r.text}`, question, evidence }, sources, path.join(contract.home, "cache", "judge"));
        if (!j.cached) bundle.judgeCalls++;
        say("deliberation", `${r.id}: ${j.accepted}${j.error ? ` (${j.error.slice(0, 80)})` : ""}${j.cached ? " (ruling on record, reused)" : ` in ${fmtMs(j.ms)}`}`);
        applyJudge(r, j, kind);
      }
    } else if (toJudge.length) {
      for (const r of toJudge) if (r.tags.includes("judged")) r.reasons.push("Judge skipped (--no-judge).");
    }

    for (const r of results) {
      const hp = parityHeadRules.get(r.id);
      if (r.status === "failed" && r.parity?.status === "unexplained" && hp && hp.status !== "unexplained") {
        r.status = "cant_tell";
        r.reasons.push(`It matches only under the equivalence rules this PR changes (${[...decl!.rules.added.map((l) => "+ " + l), ...decl!.rules.removed.map((l) => "- " + l)].join("; ")}). A reviewer has to approve the rule change; it counts once merged.`);
      }
    }

    // Intent: does any requirement in the request lack a claim?
    const request = [opts.why ?? "", ...sources.filter((s) => s.path).map((s) => s.text)].join("\n\n").trim();
    if (request && opts.judge) {
      say("deliberation", "checking that the claims cover the request");
      const list = claims.map((c) => `${c.id} [${[...c.surfaces, ...c.tags].join(", ")}] ${c.text}`).join("\n");
      const cov = coverage(request, list, path.join(contract.home, "cache", "judge"));
      if (!cov.cached && !cov.error) bundle.judgeCalls++;
      bundle.coverage = { checked: !cov.error, note: cov.note, error: cov.error };
      cov.uncovered.forEach((u, i) => {
        results.push({
          id: `U${i + 1}`, text: u.requirement, surfaces: [], tags: [], expectDiff: [], feature: "Not covered by a claim", file: "(request)", line: 0,
          status: "not_tested", bite: null, synthetic: "uncovered",
          reasons: [`The request asks for this, but no claim covers it: “${u.quote}”. Add a claim, or tell the reviewer why it's out of scope.`],
        });
      });
    }

    // Proof review: do tests changed in this PR assert what their claims say?
    const toReview = results.filter((r) => !r.synthetic && r.status === "proven" && r.source && changedPaths.includes(r.source.file));
    if (toReview.length && opts.judge) {
      say("deliberation", `checking that ${toReview.length} new or changed test(s) assert what their claims say`);
      const pr = reviewProofs(toReview.map((r) => ({ id: r.id, claim: r.text, test: r.source!.snippet })), path.join(contract.home, "cache", "judge"));
      if (!pr.cached && !pr.error) bundle.judgeCalls++;
      for (const m of pr.mismatches) {
        const r = results.find((x) => x.id === m.id)!;
        r.status = "cant_tell";
        r.reasons.push(`The judge thinks the test doesn't check what the claim says: ${m.reason}`);
      }
    }

    const suiteMismatch = [...target.runs, ...(baseCap?.runs ?? [])].filter((r) => r.code !== 0 && !r.results.some((t) => t.status === "failed"));
    for (const r of suiteMismatch) bundle.warnings.unshift(`Suite ${r.suite} on ${r.side} exited with code ${r.code} but its JUnit report shows no failure. The report can't be trusted; see ${path.basename(r.log)}.`);
    if (decl?.harness.length) bundle.warnings.unshift(`This PR changes how the app is booted or tested (${decl.harness.join(", ")}). A reviewer must approve that before this verdict can be trusted.`);
    const problems = (decl?.removed.length ?? 0) + (decl?.harness.length ?? 0) + suiteMismatch.length + results.filter((r) => r.synthetic === "uncovered").length;
    const pending = !!decl && (decl.added.length + decl.changed.length + decl.retired.length > 0);
    if (decl?.removed.length) bundle.warnings.unshift(`Claims deleted in this PR without a retired: reason: ${decl.removed.join(", ")}. Keep them and add "retired: <why>" so the reviewer sees it.`);

    const claimed = new Set(results.map((r) => r.testId).filter(Boolean));
    const all = [...head.values()];
    bundle.regressions = all.filter((t) => !claimed.has(t.id) && t.status === "failed" && rerun.get(t.id)?.status !== "passed");
    bundle.otherTests = all.filter((t) => !claimed.has(t.id));
    if (!all.length) throw new Mistrial("No test results were found after the suites ran.", "Check the suite command and its junit path in witness.toml; see the suite log.", "");
    // UI evidence into the record (paths relative to the record folder).
    const rel = (f: string | undefined, sub: string) => {
      if (!f) return undefined;
      if (f.startsWith(dir)) return path.relative(dir, f);
      const d = path.join(dir, "ui", sub, path.basename(path.dirname(f)), path.basename(f));
      fs.mkdirSync(path.dirname(d), { recursive: true });
      fs.copyFileSync(f, d);
      return path.relative(dir, d);
    };
    bundle.screens = screens.map((x) => ({ ...x, head: rel(x.head, "head"), origin: rel(x.origin, "origin"), diff: rel(x.diff, "diff") }));
    bundle.uiFiles = Object.fromEntries(Object.entries(target.artifacts ?? {}).filter(([, a]) => a.files.length).map(([t, a]) => [t, a.files.map((f) => rel(f, "files")!)]));
    fs.rmSync(path.join(dir, "artifacts-tmp"), { recursive: true, force: true });

    // Surface map: every operation in the API spec, what this change touched, and what proved it.
    const schemaSurface = Object.values(contract.surfaces).find((x) => x.schema);
    if (schemaSurface?.schema) {
      const headText = readIfFile(path.join(root, schemaSurface.schema));
      if (headText) {
        const baseText = base ? tryGit(root, ["show", `${base.sha}:${schemaSurface.schema}`]) : null;
        const { ops } = loadOperations(headText);
        const behaviorChanged = new Set<string>();
        for (const r of results) {
          if (!r.testId || !r.parity || r.parity.status === "equal") continue;
          for (const e of primary(target, r.testId)) {
            const op = matchOp(ops, e.method, e.path);
            if (op) behaviorChanged.add(op.key);
          }
        }
        bundle.surface = buildSurface(schemaSurface.schema, {
          headText,
          baseText,
          exchanges: target.exchanges,
          claims: results.map((r) => ({ id: r.id, status: r.status, testId: r.testId, synthetic: r.synthetic, parityChanged: !!r.parity && r.parity.status !== "equal", tags: r.tags })),
          behaviorChanged,
        });
        const claimByTest = new Map(results.filter((r) => r.testId).map((r) => [r.testId!, r.status]));
        bundle.surface.screens = screens.map((x) => ({ test: x.test, name: x.name, status: claimByTest.get(x.test) ?? "exercised", changed: x.status !== "same" && x.status !== "missing" }));
      }
    }
    bundle.claims = results;
    bundle.exchanges = [...(baseCap?.exchanges ?? []), ...(originCap && originCap !== baseCap ? originCap.exchanges : []), ...target.exchanges].filter((e) => e.run === "primary" || e.run === "rerun");
    bundle.verdict = overall(results, bundle.regressions, problems, pending);
    bundle.counts = counts(results);
  } catch (e) {
    if (e instanceof Mistrial) {
      bundle.verdict = "mistrial";
      bundle.mistrial = { message: e.message, remedy: e.remedy, logTail: e.logTail };
    } else throw e;
  } finally {
    bundle.ms = Date.now() - t0;
    bundle.logs = fs.existsSync(logDir) ? fs.readdirSync(logDir) : [];
  }
  writeRecord(dir, bundle);
  return { bundle, dir };
}
