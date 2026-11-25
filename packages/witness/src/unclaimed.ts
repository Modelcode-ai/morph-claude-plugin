import * as fs from "node:fs";
import * as path from "node:path";
import type { AdapterName } from "./adapters.ts";
import { fLangOf } from "./functional.ts";
import type { Confidence } from "./init.ts";

/** A test signal that no proposed, excluded or configured suite accounts for. */
export interface UnclaimedFact {
  /** The folder or file the tests live in. */
  path?: string;
  /** The command CI or a package script runs, and the folder it runs in. */
  cmd?: string;
  cwd?: string;
  /** The tool it looks like (newman, jmeter, k6, ...), when known. */
  tool?: string;
  why: string;
  confidence: Confidence;
  evidence: string[];
  /** With an existing config: the suite that covers it, or "comment" when a comment names it (a decision made). */
  configured?: string;
}

export interface CiStep {
  file: string;
  line: number;
  cwd: string;
  cmds: { cmd: string; line: number }[];
  /** `file:line` of an earlier step in the same job that starts the app or waits on its URL. */
  afterStart?: string;
}

export interface PackageScript {
  file: string;
  line: number;
  dir: string;
  name: string;
  /** How it is run (`npm test`, `yarn e2e`). */
  cmd: string;
  body: string;
}

/** The test projects a scan found, with the folders they cover. */
export interface Claim {
  adapter: AdapterName;
  dirs: string[];
  /** Files or folders a suite command names (a collection). */
  paths: string[];
}

const RUNNERS: [RegExp, string, AdapterName?][] = [
  [/(^|[\s/])newman(@\S+)?\s+run\b/, "newman", "newman"],
  [/(^|[\s/])k6\s+(run|cloud)\b/, "k6"],
  [/(^|[\s/])jmeter(\.sh|\.bat)?\s+-|jmeter-maven-plugin|\bjmeter:jmeter\b/, "jmeter"],
  [/\bkarate(\.jar)?\b|com\.intuit\.karate/, "karate"],
  [/(^|[\s/])(robot|pabot)\s+(-|\S*\.robot\b|\S+\/)/, "robot"],
  [/(^|[\s/])hurl\s+(--test|\S+\.hurl)/, "hurl"],
  [/(^|[\s/])bru\s+run\b|@usebruno\/cli/, "bruno"],
  [/(^|[\s/])artillery\s+run\b/, "artillery"],
  [/(^|[\s/])locust\b/, "locust"],
  [/\bgatling(:test|\.sh)?\b/, "gatling"],
  [/(^|[\s/])(schemathesis|st)\s+run\b/, "schemathesis"],
  [/(^|[\s/])dredd\b/, "dredd"],
  [/(^|[\s/])(behave)\b/, "behave"],
  [/(^|[\s/])cucumber(-js)?\b/, "cucumber"],
  [/(^|[\s/])ng\s+e2e\b|\bprotractor\b/, "protractor"],
  [/(^|[\s/])ng\s+test\b|(^|[\s/])karma\s+start\b/, "karma"],
  [/(^|[\s/])cypress\s+run\b/, "cypress", "generic"],
  [/(^|[\s/])playwright\s+test\b/, "playwright", "playwright"],
  [/(^|[\s/])(py\.test|pytest)\b/, "pytest", "pytest"],
  [/(^|[\s/])jest\b/, "jest", "jest"],
  [/(^|[\s/])vitest\b/, "vitest", "vitest"],
  [/(^|[\s/])mocha\b/, "mocha", "mocha"],
  [/(^|[\s/])(\.\/)?mvnw?\b.*\b(test|verify|integration-test)\b/, "maven", "junit-maven"],
  [/(^|[\s/])(\.\/)?gradlew?\b.*\b(test|check|\w*Test)\b/, "gradle", "junit-gradle"],
  [/(^|[\s/])dotnet\s+test\b/, "dotnet test", "dotnet"],
  [/(^|[\s/])go\s+test\b/, "go test", "go"],
  [/(^|[\s/])rspec\b/, "rspec", "rspec"],
  [/(^|[\s/])phpunit\b/, "phpunit", "phpunit"],
  [/(^|[\s/])bats\b/, "bats", "bats"],
];

const FILE_TYPES: [RegExp, string, string][] = [
  [/\.postman_collection\.json$/i, "newman", "Postman collection"],
  [/\.jmx$/i, "jmeter", "JMeter test plan"],
  [/\.feature$/i, "gherkin", "Gherkin feature file"],
  [/\.robot$/i, "robot", "Robot Framework suite"],
  [/\.hurl$/i, "hurl", "Hurl file"],
  [/\.bru$/i, "bruno", "Bruno request"],
  [/\.side$/i, "selenium-ide", "Selenium IDE project"],
];
const K6_IMPORT = /\bfrom\s+["']k6(\/[\w-]+)?["']|\brequire\(\s*["']k6(\/[\w-]+)?["']\s*\)/;
const GHERKIN_RUNNER = /cucumber|karate|behave|pytest-bdd|playwright-bdd|specflow|reqnroll|godog|jest-cucumber|lettuce/i;

/** Words that name a kind of test, matched as whole tokens of a name (postman-tests.sh, smoke_api). */
const TEST_WORD = /(^|[^a-z0-9])(tests?|testing|smoke|e2e|newman|postman|k6|jmeter|karate|robot|hurl|bruno|regression|acceptance|load|perf|performance|stress|soak)([^a-z0-9]|$)/i;
const TEST_ROOT = /(^|\/)(src\/(test|it|e2e|integrationTest|functionalTest|testFixtures)|tests?|e2e|specs?|__tests__|qa)$/;
/** Folders of test data and helpers, not tests. */
const NOT_TESTS = /^(resources|fixtures?|data|testdata|test-data|mocks?|__mocks__|__snapshots__|snapshots?|helpers?|utils?|support|common|shared|assets|files|samples?|golden|stubs?|config|reports?|results?|screenshots?|output|tmp|temp|lib)$/i;
const ADAPTER_LANG: Partial<Record<AdapterName, RegExp>> = {
  pytest: /\.py$/,
  "junit-maven": /\.(java|kt|groovy|scala)$/,
  "junit-gradle": /\.(java|kt|groovy|scala)$/,
  dotnet: /\.(cs|fs|vb)$/,
  jest: /\.[cm]?[jt]sx?$/,
  vitest: /\.[cm]?[jt]sx?$/,
  mocha: /\.[cm]?[jt]sx?$/,
  playwright: /\.[cm]?[jt]sx?$/,
  go: /\.go$/,
  rspec: /\.rb$/,
  phpunit: /\.php$/,
  bats: /\.bats$/,
};
const SCRIPT_CALL = /^(?:(?:ba|z|da)?sh|pwsh|powershell)\s+(?:-\w+\s+)*([\w./-]+\.(?:sh|bash|zsh|ps1))\b|^(\.{1,2}\/[\w./-]+?)(?:\s|$)|^([\w-][\w./-]*\.(?:sh|bash|zsh))(?:\s|$)/;

const at = (file: string, line: number) => (line ? `${file}:${line}` : file);
const under = (f: string, dir: string) => dir === "." || f === dir || f.startsWith(`${dir}/`);
const read = (f: string, max = 256 * 1024) => {
  try {
    return fs.statSync(f).size > max ? "" : fs.readFileSync(f, "utf8");
  } catch {
    return "";
  }
};
const runnerOf = (cmd: string) => RUNNERS.find(([re]) => re.test(cmd));

/** Test signals nothing proposed or excluded accounts for: CI steps after the app starts, scripts CI calls, test file types, test folders and names. */
export function findUnclaimed(root: string, files: string[], claims: Claim[], ci: CiStep[], scripts: PackageScript[]): UnclaimedFact[] {
  const out: UnclaimedFact[] = [];
  const adapters = new Set(claims.map((c) => c.adapter));
  const claimedPath = (p: string) => claims.some((c) => c.paths.some((x) => under(x, p) || under(p, x)) || c.dirs.some((d) => d !== "." && under(p, d)));
  const claimedFile = (f: string) => claims.some((c) => c.paths.some((x) => under(f, x)) || c.dirs.some((d) => under(f, d) && (c.adapter === "generic" || ADAPTER_LANG[c.adapter]?.test(f))));
  const add = (u: UnclaimedFact) => {
    // commands that run the same unknown tool in the same folder are one suite (npm test, npm run test:ci)
    const same = out.find((x) => (u.path && x.path === u.path) || (u.cmd && x.cmd === u.cmd && x.cwd === u.cwd) || (u.tool && !u.path && !x.path && x.tool === u.tool && x.cwd === u.cwd));
    if (!same) return void out.push(u);
    for (const e of u.evidence) if (!same.evidence.includes(e)) same.evidence.push(e);
    if (rank(u.confidence) > rank(same.confidence)) same.confidence = u.confidence;
    same.why = [...new Set([...same.why.split("; "), ...u.why.split("; ")])].join("; ");
    same.tool ??= u.tool;
  };

  /** What a command runs: a known runner in it, or in the script it calls (read one level deep). */
  const inspect = (cmd: string, cwd: string, depth = 0): { tool?: string; adapter?: AdapterName; script?: string; ev?: string; names: string[] } => {
    const pkg = /^(?:npm|pnpm|yarn|bun)(?:\s+run)?\s+([\w:.-]+)/.exec(cmd);
    const body = pkg && scripts.find((x) => x.dir === cwd && x.name === pkg[1])?.body;
    if (body && depth < 2) return inspect(body, cwd, depth + 1);
    const direct = runnerOf(cmd);
    if (direct) {
      const named = pathsIn(cmd, cwd, files);
      return { tool: direct[1], adapter: direct[2], names: named, ...(named[0] ? { script: path.posix.dirname(named[0]) === "." ? named[0] : path.posix.dirname(named[0]) } : {}) };
    }
    const m = SCRIPT_CALL.exec(cmd);
    const rel = m && path.posix.normalize(path.posix.join(cwd, m[1] ?? m[2] ?? m[3]));
    if (!rel || rel.startsWith("..") || !files.includes(rel)) return { names: [] };
    const lines = read(path.join(root, rel)).split(/\r?\n/);
    const names = lines.flatMap((l) => [...l.matchAll(/[\w./-]+\.(?:postman_collection\.json|jmx|feature|robot|hurl|bru|js)\b/g)].map((x) => x[0].replace(/^\.\//, "")));
    for (const [i, l] of lines.entries()) {
      if (/^\s*#/.test(l)) continue;
      const r = runnerOf(l);
      if (r) return { tool: r[1], adapter: r[2], script: rel, ev: at(rel, i + 1), names };
    }
    return { script: rel, names };
  };
  const coveredByNames = (names: string[]) => names.length > 0 && names.every((n) => claimedPath(n) || claimedPath(path.posix.dirname(n)));

  const command = (cmd: string, cwd: string, ev: string, origin: string, afterStart?: string) => {
    const r = inspect(cmd, cwd);
    if (r.adapter && adapters.has(r.adapter) && (r.adapter !== "newman" || !r.names.length || coveredByNames(r.names))) return;
    if (!r.tool && r.script && coveredByNames(r.names)) return;
    if (!r.tool && !TEST_WORD.test(r.script ?? "") && !TEST_WORD.test(cmd)) return;
    const why = [r.tool ? `runs ${r.tool}${r.ev ? ` (${r.ev})` : ""}` : `its name says test`, `${origin}${afterStart ? ` after the step that starts the app (${afterStart})` : ""}`].join("; ");
    const confidence: Confidence = r.tool ? (r.adapter && !adapters.has(r.adapter) ? "medium" : "high") : afterStart ? "medium" : "low";
    add({ cmd, cwd, ...(r.script ? { path: r.script } : {}), ...(r.tool ? { tool: r.tool } : {}), why, confidence, evidence: [ev, ...(r.ev ? [r.ev] : [])] });
  };

  for (const s of ci) for (const c of s.cmds) command(c.cmd, s.cwd, at(s.file, c.line), "CI runs it", s.afterStart);
  for (const p of scripts) {
    const role = /^(test|e2e|integration|smoke|load|perf)([:_-]|$)/i.test(p.name);
    if (!role && !TEST_WORD.test(p.name)) continue;
    command(p.cmd, p.dir, at(p.file, p.line), `package script "${p.name}"`);
  }

  const byDir = new Map<string, { tool: string; what: string; files: string[] }>();
  const gherkin = files.filter((f) => /(^|\/)(package\.json|pom\.xml|build\.gradle(\.kts)?|requirements[\w.-]*\.txt|pyproject\.toml|[^/]+\.csproj|go\.mod|Gemfile)$/.test(f) && GHERKIN_RUNNER.test(read(path.join(root, f)))).map((f) => path.posix.dirname(f));
  for (const f of files) {
    let t: [string, string] | undefined;
    const ft = FILE_TYPES.find(([re]) => re.test(f));
    if (ft) t = [ft[1], ft[2]];
    else if (/\.[cm]?[jt]s$/.test(f) && !/\.d\.ts$|\.min\.js$/.test(f) && K6_IMPORT.test(read(path.join(root, f), 64 * 1024).slice(0, 4000))) t = ["k6", "k6 script"];
    // a root project of the same language (jest at ".") doesn't run k6 scripts: only a suite naming them claims them
    if (!t || (t[0] === "k6" ? claims.some((c) => c.paths.some((x) => under(f, x))) : claimedPath(f))) continue;
    if (t[0] === "gherkin" && gherkin.some((d) => under(f, d))) continue;
    const d = path.posix.dirname(f);
    const e = byDir.get(d) ?? byDir.set(d, { tool: t[0], what: t[1], files: [] }).get(d)!;
    e.files.push(f);
  }
  for (const [d, e] of byDir) {
    const p = d === "." && e.files.length === 1 ? e.files[0] : d;
    add({ path: p, tool: e.tool, why: `${e.files.length > 1 ? `${e.files.length} ${e.what}s` : `a ${e.what}`} (${path.posix.basename(e.files[0])})`, confidence: "high", evidence: e.files.slice(0, 3) });
  }

  const roots = new Set(files.map((f) => f.split("/").slice(0, -1)).flatMap((parts) => parts.map((_, i) => parts.slice(0, i + 1).join("/"))).filter((d) => TEST_ROOT.test(d)));
  for (const r of roots) {
    const children = new Set(files.filter((f) => f.startsWith(`${r}/`)).map((f) => f.slice(r.length + 1).split("/")).filter((p) => p.length > 1).map((p) => p[0]));
    for (const c of children) {
      const dir = `${r}/${c}`;
      if (NOT_TESTS.test(c) || TEST_ROOT.test(dir) || claimedPath(dir) || out.some((u) => u.path && under(u.path, dir))) continue;
      const inside = files.filter((f) => f.startsWith(`${dir}/`));
      const code = inside.filter((f) => fLangOf(f));
      const loose = code.filter((f) => !claimedFile(f));
      if (code.length ? loose.length === code.length : TEST_WORD.test(c)) {
        const why = code.length ? `${code.length} source file(s) under ${r} that no test project covers` : `a folder under ${r} named like tests, that no test project covers`;
        add({ path: dir, why, confidence: code.length ? "medium" : "low", evidence: (loose.length ? loose : inside).slice(0, 3) });
      }
    }
  }
  return out.sort((a, b) => rank(b.confidence) - rank(a.confidence));
}

const rank = (c: Confidence) => ({ low: 0, medium: 1, high: 2 })[c];

/** What a configured or proposed suite covers: its folder (unless the repo root) and the paths its command names. */
export function claimOf(s: { adapter: AdapterName; cwd: string; cmd: string }, files: string[], dirs: string[] = []): Claim {
  const cwd = path.posix.normalize(s.cwd.replace(/\\/g, "/"));
  return { adapter: s.adapter, dirs: [...new Set([...dirs, ...(cwd !== "." ? [cwd] : [])])], paths: pathsIn(s.cmd, cwd, files) };
}

/** The suite that covers `u`, or "comment" when a comment in the config names it; undefined while undecided. */
export function decision(u: UnclaimedFact, suites: { name: string; claim: Claim }[], named: (x: string) => boolean): string | undefined {
  const p = u.path;
  const hit = suites.find(({ claim: c }) => (p && (c.paths.some((x) => under(x, p) || under(p, x)) || c.dirs.some((d) => d !== "." && under(p, d)))) || (u.cmd && c.paths.length && pathsIn(u.cmd, ".", c.paths).length));
  if (hit) return hit.name;
  // a one-word folder ("load", "api") counts only as `load:` or `load/`, not as a word in a sentence
  const names = (x: string) => (/[/.\s]/.test(x) ? named(x) : named(`${x}:`) || named(`${x}/`));
  return [p, u.cmd].some((x) => x && names(x)) ? "comment" : undefined;
}

/** A test for whether a config's comments name a path, project or variable: the way a decision to leave something out is recorded. */
export function commentNamer(configText: string): (x: string) => boolean {
  const comments = configText.split("\n").map((l) => /(?:^|\s)#(.*)$/.exec(l)?.[1] ?? "").join("\n");
  const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (x: string) => new RegExp(`(^|[^\\w:./-])${esc(x)}($|[^\\w/-])`, "m").test(comments);
}

/** The paths a suite command names, relative to the repo: a collection, a script, a test folder. */
export function pathsIn(cmd: string, cwd: string, files: string[]): string[] {
  const out: string[] = [];
  for (const w of cmd.match(/[\w./@-]+/g) ?? []) {
    const p = path.posix.normalize(path.posix.join(cwd, w.replace(/^\.\//, "")));
    if (p !== "." && !p.startsWith("..") && files.some((f) => f === p || f.startsWith(`${p}/`))) out.push(p);
  }
  return [...new Set(out)];
}
