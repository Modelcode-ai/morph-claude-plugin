import * as fs from "node:fs";
import * as path from "node:path";
import { type AdapterName, dotnetMode } from "./adapters.ts";
import type { Kind } from "./config.ts";
import { classify, describeFilter, type Entries, type FileScan, fLangOf, filteredCmd, projectEntries, scanFile, type Verdict } from "./functional.ts";
import { isTestPath } from "./lint.ts";
import { globFiles } from "./util.ts";

export type Confidence = "high" | "medium" | "low";

/** How sure a guess is, and the files (with lines where known) it rests on. */
export interface Grounds {
  confidence: Confidence;
  evidence: string[];
}

export interface ProposedSuite extends Partial<Grounds> {
  name: string;
  adapter: AdapterName;
  kind: Kind;
  cwd: string;
  cmd: string;
  why: string;
  hostsApp: boolean;
  report?: string;
  /** A line for the config, such as what the tests need besides witness's services. */
  note?: string;
  project?: string;
  filtered?: boolean;
}

export interface NotProposed extends Partial<Grounds> {
  path: string;
  adapter: AdapterName;
  reason: string;
}

export interface NeedsFilter extends NotProposed {
  name: string;
  kind: Kind;
  cwd: string;
  cmd: string;
  functionalFiles: string[];
}

export interface GuessedService extends Partial<Grounds> {
  name: string;
  cwd: string;
  setup?: string;
  start: string;
  ready: string;
  why: string;
}

export interface Guess {
  suites: ProposedSuite[];
  services: GuessedService[];
  excluded: NotProposed[];
  needsFilter: NeedsFilter[];
}

const read = (f: string) => {
  try {
    return fs.readFileSync(f, "utf8");
  } catch {
    return "";
  }
};

const SKIP = new Set([".git", "node_modules", ".witness", ".venv", "venv", "bin", "obj", "target", "build", "dist", "vendor", ".gradle", "__pycache__", ".next"]);
const MAX_FILES = 4000;

interface Project {
  label: string;
  adapter: AdapterName;
  cwd: string;
  /** Folder the files are scanned in, relative to the repo root. */
  dir: string;
  /** The file that makes this a test project (csproj, package.json, pytest.ini, ...). */
  manifest?: string;
  cmd: string;
  nameBase: string;
  isTest?: (rel: string) => boolean;
  include?: (rel: string) => boolean;
  /** Non-test files to scan for setup (fixtures, configs) besides those under test folders. */
  helper?: (rel: string) => boolean;
  defaultKind?: Kind;
  xunitMtp?: boolean;
  report?: string;
  note?: string;
  /** The command narrowed to the functional files, when the adapter's own filter doesn't fit this project. */
  filter?: (v: Verdict) => string | undefined;
}

const PY_TEST = /(^|\/)(test_[^/]*|[^/]*_test)\.py$/;
const JS_TEST = /[._-](test|spec)\.[cm]?[jt]sx?$|(^|\/)__tests__\/.*\.[cm]?[jt]sx?$/;
const MOCHA_TEST = /(^|\/)tests?\/.*\.[cm]?[jt]s$/;

function scanProject(root: string, p: Project, entries: Entries): FileScan[] {
  const base = path.join(root, p.dir);
  const out: FileScan[] = [];
  for (const rel of globFiles(base, ["**/*"], { maxDepth: 12, skipDirs: SKIP })) {
    if (out.length >= MAX_FILES) break;
    if (!fLangOf(rel)) continue;
    const test = p.isTest?.(rel);
    if (test === false && !isTestPath(path.join(path.basename(base), rel)) && path.basename(rel) !== "conftest.py" && !p.helper?.(rel)) continue;
    if (p.include && !p.include(rel)) continue;
    const f = scanFile(base, rel, test, entries);
    if (f) out.push(f);
  }
  return out;
}

/** Guess functional suites (and, where obvious, services) from the files in a repo. */
export function guess(root: string): Guess {
  const files = globFiles(root, ["**/*"], { maxDepth: 5, skipDirs: SKIP });
  const has = (re: RegExp) => files.filter((f) => re.test(f));
  const g: Guess = { suites: [], services: [], excluded: [], needsFilter: [] };
  const taken = new Set<string>();
  const name = (b: string) => {
    let n = b.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "tests";
    if (!/^[a-z]/.test(n)) n = `t-${n}`;
    let k = n;
    for (let i = 2; taken.has(k); i++) k = `${n}-${i}`;
    taken.add(k);
    return k;
  };
  const dirOf = (f: string) => path.dirname(f) || ".";
  const projects: Project[] = [];

  const py = has(/(^|\/)(pytest\.ini|conftest\.py|pyproject\.toml|setup\.cfg|tox\.ini)$/).filter((f) => /pytest\.ini|conftest\.py/.test(f) || /\[tool\.pytest|\[tool:pytest\]|\[pytest\]|pytest/.test(read(path.join(root, f))));
  const pyDirs = [...new Set(py.map(dirOf))].filter((d, _i, a) => !a.some((o) => o !== d && (d.startsWith(`${o}/`) || o === ".")) || d === ".");
  for (const d of pyDirs.slice(0, 3)) projects.push({ label: d, adapter: "pytest", cwd: d, dir: d, manifest: py.find((f) => dirOf(f) === d), cmd: "python -m pytest", nameBase: d === "." ? "pytest" : `${path.basename(d)}-pytest`, isTest: (r) => PY_TEST.test(r) });

  const javaTest = (r: string) => /(^|\/)src\/test\/.*\.(java|kt)$/.test(r);
  const pom = has(/(^|\/)pom\.xml$/).sort((a, b) => a.length - b.length)[0];
  if (pom) {
    projects.push({ label: dirOf(pom), adapter: "junit-maven", cwd: dirOf(pom), dir: dirOf(pom), manifest: pom, cmd: "mvn -B verify", nameBase: "maven-tests", include: javaTest });
    if (/spring-boot/.test(read(path.join(root, pom)))) g.services.push({ name: name("app"), cwd: dirOf(pom), setup: "mvn -B -DskipTests package", start: "mvn -B spring-boot:run -Dspring-boot.run.arguments=--server.port=${PORT}", ready: "${self.url}/actuator/health", why: "spring-boot in pom.xml", confidence: "medium", evidence: [pom] });
  }
  const gradle = has(/(^|\/)build\.gradle(\.kts)?$/).sort((a, b) => a.length - b.length)[0];
  if (gradle) projects.push({ label: dirOf(gradle), adapter: "junit-gradle", cwd: dirOf(gradle), dir: dirOf(gradle), manifest: gradle, cmd: fs.existsSync(path.join(root, dirOf(gradle), "gradlew")) ? "./gradlew test" : "gradle test", nameBase: "gradle-tests", include: javaTest });

  const csproj = has(/\.csproj$/);
  for (const f of csproj.filter((f) => /Microsoft\.NET\.Test\.Sdk|xunit|NUnit|MSTest/i.test(read(path.join(root, f))))) {
    const mode = dotnetMode(root, `dotnet test ${f}`);
    const cmd = `dotnet test ${mode !== "vstest" ? "--project " : ""}${f}`;
    projects.push({ label: dirOf(f), adapter: "dotnet", cwd: ".", dir: dirOf(f), manifest: f, cmd, nameBase: path.basename(f, ".csproj"), xunitMtp: dotnetMode(root, cmd) === "mtp-xunit" });
  }
  for (const f of csproj.filter((f) => /Sdk="Microsoft\.NET\.Sdk\.Web"/.test(read(path.join(root, f)))).slice(0, 3)) {
    g.services.push({ name: name(path.basename(f, ".csproj")), cwd: ".", setup: `dotnet build ${f}`, start: `dotnet run --no-build --project ${f} --urls http://127.0.0.1:\${PORT}`, ready: "${self.url}/", why: `web project ${f}`, confidence: "medium", evidence: [f] });
  }

  const pkgs = has(/(^|\/)package\.json$/).filter((f) => f.split("/").length <= 3);
  const pkgDirs = pkgs.map(dirOf);
  for (const pj of pkgs) {
    let doc: { scripts?: Record<string, string>; dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    try {
      doc = JSON.parse(read(path.join(root, pj)));
    } catch {
      continue;
    }
    const deps = { ...doc.dependencies, ...doc.devDependencies };
    const d = dirOf(pj);
    const pre = d === "." ? "" : `${path.basename(d)}-`;
    const nested = pkgDirs.filter((o) => o !== d && (d === "." || o.startsWith(`${d}/`))).map((o) => (d === "." ? o : o.slice(d.length + 1)));
    const own = (r: string) => !nested.some((n) => r.startsWith(`${n}/`));
    const pwDirs: string[] = [];
    if (deps["@playwright/test"] || deps["playwright-bdd"]) {
      const configs = globFiles(path.join(root, d), ["**/playwright*.config.{ts,js,mjs,cjs}"], { maxDepth: 3, skipDirs: SKIP }).filter(own);
      for (const c of configs.length ? configs : ["playwright.config.ts"]) {
        const text = read(path.join(root, d, c));
        const td = /testDir\s*:\s*['"`]([^'"`]+)/.exec(text)?.[1];
        const testDir = path.posix.normalize(path.posix.join(path.posix.dirname(c), td ?? "."));
        pwDirs.push(testDir);
        const isDefault = /^playwright\.config\.[cm]?[jt]s$/.test(c);
        const ignore = configRegex(text, "testIgnore");
        const match = configRegex(text, "testMatch");
        const under = (r: string) => (testDir === "." || r.startsWith(`${testDir}/`)) && !ignore?.test(`/${r}`) && (!match || match.test(`/${r}`));
        projects.push({ label: `${d === "." ? "" : `${d}/`}${isDefault ? testDir : c}`.replace(/^\.\//, ""), adapter: "playwright", cwd: d, dir: d, manifest: path.posix.join(d, c), cmd: isDefault ? "npx playwright test" : `npx playwright test -c ${c}`, nameBase: `${pre}${pwName(c, isDefault)}`, isTest: (r) => JS_TEST.test(r) && under(r), include: (r) => own(r) && (r === c || (under(r) && !configs.includes(r))), helper: (r) => r === c, defaultKind: "ui" });
      }
    }
    const notPw = (r: string) => own(r) && !pwDirs.some((t) => t !== "." && r.startsWith(`${t}/`)) && !/@playwright\/test|playwright-bdd/.test(read(path.join(root, d, r)).slice(0, 4000));
    if (deps.vitest) projects.push({ label: d, adapter: "vitest", cwd: d, dir: d, manifest: pj, cmd: "npx vitest run", nameBase: `${pre}vitest`, isTest: (r) => JS_TEST.test(r), include: notPw });
    const detox = deps.detox ? detoxDir(path.join(root, d)) : undefined;
    const notDetox = (r: string) => !detox || !r.startsWith(`${detox}/`);
    if (detox) projects.push({ label: `${d === "." ? "" : `${d}/`}${detox}`, adapter: "jest", cwd: d, dir: d, manifest: pj, cmd: "npx detox test", nameBase: `${pre}detox`, isTest: (r) => JS_TEST.test(r), include: (r) => own(r) && !notDetox(r), defaultKind: "mobile" });
    if (deps.jest) projects.push({ label: d, adapter: "jest", cwd: d, dir: d, manifest: pj, cmd: "npx jest", nameBase: `${pre}jest`, isTest: (r) => JS_TEST.test(r), include: (r) => notPw(r) && notDetox(r) });
    if (deps.mocha) projects.push({ label: d, adapter: "mocha", cwd: d, dir: d, manifest: pj, cmd: "npx mocha", nameBase: `${pre}mocha`, isTest: (r) => JS_TEST.test(r) || MOCHA_TEST.test(r), include: notPw });
    if (deps.cypress) projects.push({ label: `${d === "." ? "" : `${d}/`}cypress`, adapter: "generic", cwd: d, dir: d, manifest: pj, cmd: 'npx cypress run --reporter junit --reporter-options "mochaFile=${WITNESS_REPORT_DIR}/cypress-[hash].xml"', nameBase: `${pre}cypress`, isTest: (r) => /\.cy\.[cm]?[jt]sx?$/.test(r), include: own, defaultKind: "ui", report: "${WITNESS_REPORT_DIR}/*.xml" });
    if (doc.scripts?.start) g.services.push({ name: name(`${pre}web`.replace(/-$/, "")), cwd: d, setup: fs.existsSync(path.join(root, d, "package-lock.json")) ? "npm ci" : "npm install", start: "npm start", ready: "${self.url}/", why: `start script in ${pj}`, confidence: "medium", evidence: [pj] });
  }
  const gomod = has(/(^|\/)go\.mod$/).sort((a, b) => a.length - b.length)[0];
  if (gomod) projects.push({ label: dirOf(gomod), adapter: "go", cwd: dirOf(gomod), dir: dirOf(gomod), manifest: gomod, cmd: "go test ./...", nameBase: "go-tests", isTest: (r) => /_test\.go$/.test(r) });
  const gem = has(/(^|\/)Gemfile$/).find((f) => /rspec/.test(read(path.join(root, f))));
  if (gem) projects.push({ label: dirOf(gem), adapter: "rspec", cwd: dirOf(gem), dir: dirOf(gem), manifest: gem, cmd: "bundle exec rspec", nameBase: "rspec", isTest: (r) => /_spec\.rb$/.test(r) });
  const php = has(/(^|\/)phpunit\.xml(\.dist)?$/)[0];
  if (php) projects.push({ label: dirOf(php), adapter: "phpunit", cwd: dirOf(php), dir: dirOf(php), manifest: php, cmd: "vendor/bin/phpunit", nameBase: "phpunit", isTest: (r) => /Test\.php$/.test(r) });
  const cargo = has(/(^|\/)Cargo\.toml$/).sort((a, b) => a.length - b.length)[0];
  if (cargo) {
    const d = dirOf(cargo);
    projects.push({ label: d, adapter: "generic", cwd: d, dir: d, manifest: cargo, cmd: "cargo test", nameBase: "cargo-tests", include: (r) => r.endsWith(".rs"), note: "cargo test writes no JUnit report, so witness records one row from the exit code; cargo-nextest's JUnit output gives per-test rows (docs/witness/APP-KINDS.md)", filter: cargoFilter });
  }
  const bats = has(/\.bats$/);
  if (bats.length) {
    const dirs = [...new Set(bats.map(dirOf))];
    const d = commonDir(dirs);
    const npx = pkgs.some((pj) => /"bats"\s*:/.test(read(path.join(root, pj))));
    const cmd = `${npx ? "npx bats" : "bats"}${dirs.some((x) => x !== d) ? " -r" : ""} ${d}`;
    projects.push({ label: d, adapter: "bats", cwd: ".", dir: d, cmd, nameBase: "bats", isTest: (r) => r.endsWith(".bats"), include: (r) => r.endsWith(".bats"), filter: (v) => batsFilter(cmd, d, v) });
  }
  const gradleRoot = gradle ? dirOf(gradle) : undefined;
  const androidTest = has(/(^|\/)build\.gradle(\.kts)?$/).map(dirOf).filter((d) => fs.existsSync(path.join(root, d, "src", "androidTest")));
  if (androidTest.length && gradleRoot) {
    const gw = fs.existsSync(path.join(root, gradleRoot, "gradlew")) ? "./gradlew" : "gradle";
    projects.push({ label: `${androidTest.join(", ")} (androidTest)`, adapter: "junit-gradle", cwd: gradleRoot, dir: gradleRoot, manifest: gradle, cmd: `${gw} connectedAndroidTest`, nameBase: "android-tests", include: (r) => /(^|\/)src\/androidTest\//.test(r), defaultKind: "mobile", report: "**/build/outputs/androidTest-results/connected/**/*.xml" });
  }
  for (const pub of has(/(^|\/)pubspec\.yaml$/).filter((f) => files.some((x) => x.startsWith(`${dirOf(f) === "." ? "" : `${dirOf(f)}/`}integration_test/`)))) {
    const d = dirOf(pub);
    projects.push({ label: `${d === "." ? "" : `${d}/`}integration_test`, adapter: "generic", cwd: d, dir: d, manifest: pub, cmd: "flutter test integration_test", nameBase: "flutter-integration", include: (r) => r.startsWith("integration_test/"), defaultKind: "mobile", note: "flutter test writes no JUnit report: one row from the exit code" });
  }
  for (const ui of [...new Set(has(/(^|\/)[^/]*UITests\/.*\.swift$/).map((f) => f.slice(0, f.search(/[^/]*UITests\//) + f.slice(f.search(/[^/]*UITests\//)).indexOf("/"))))]) {
    const d = dirOf(ui);
    const proj = files.find((f) => dirOf(f) === d && f.endsWith(".xcodeproj/project.pbxproj"));
    const scheme = proj ? path.basename(path.dirname(proj), ".xcodeproj") : path.basename(ui).replace(/UITests$/, "");
    projects.push({ label: ui, adapter: "generic", cwd: d, dir: d, manifest: proj, cmd: `xcodebuild test -scheme ${scheme} -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing:${path.basename(ui)}`, nameBase: "xcuitest", include: (r) => r.startsWith(`${path.basename(ui)}/`), defaultKind: "mobile", note: "xcodebuild writes an .xcresult, not JUnit: one row from the exit code unless a converter such as xcbeautify --report junit writes into $WITNESS_REPORT_DIR" });
  }
  const flows = has(/\.ya?ml$/).filter((f) => /(^|\/)\.maestro\//.test(f) || /^appId:/m.test(read(path.join(root, f)).slice(0, 2000)));
  const maestro = flows.filter((f) => /^\s*-\s*launchApp\b/m.test(read(path.join(root, f))));
  if (maestro.length) {
    const d = commonDir([...new Set(maestro.map(dirOf))]);
    g.suites.push({ name: name("maestro"), adapter: "generic", kind: "mobile", cwd: ".", cmd: `maestro test --format junit --output \${WITNESS_REPORT_DIR}/maestro.xml ${d}`, why: `${d}: ${maestro.length} Maestro flow(s) launch the app`, hostsApp: false, project: d, confidence: "high", evidence: maestro.slice(0, 3) });
  }
  if (fs.existsSync(path.join(root, "manage.py"))) g.services.push({ name: name("django"), cwd: ".", setup: "pip install -r requirements.txt", start: "python manage.py runserver 127.0.0.1:${PORT} --noreload", ready: "${self.url}/", why: "manage.py", confidence: "medium", evidence: ["manage.py"] });

  for (const p of projects) {
    if (p.label === ".") p.label = `. (${p.adapter})`;
    decide(g, p, classify(scanProject(root, p, projectEntries(root, p.dir)), p.label), name);
  }
  return g;
}

function commonDir(dirs: string[]): string {
  let parts = dirs[0].split("/");
  for (const d of dirs) {
    const q = d.split("/");
    let i = 0;
    while (i < parts.length && parts[i] === q[i]) i++;
    parts = parts.slice(0, i);
  }
  return parts.join("/") || ".";
}

/** Detox's test folder: the folder of the jest config its config names, else e2e. */
function detoxDir(dir: string): string {
  for (const f of [".detoxrc.js", ".detoxrc.json", ".detoxrc", "detox.config.js", ".detoxrc.cjs"]) {
    const m = /["']?config["']?\s*:\s*["'](?:\.\/)?([^"']+)\/[^/"']+["']/.exec(read(path.join(dir, f)));
    if (m) return m[1];
  }
  return "e2e";
}

/** Rust integration tests are files under tests/: run only the functional ones with --test. */
function cargoFilter(v: Verdict): string | undefined {
  const stems = v.functional.map((f) => /^tests\/([^/]+?)(?:\.rs|\/main\.rs)$/.exec(f.rel)?.[1]);
  return stems.every(Boolean) ? `cargo test ${stems.map((x) => `--test ${x}`).join(" ")}` : undefined;
}

function batsFilter(cmd: string, dir: string, v: Verdict): string | undefined {
  const base = cmd.replace(/\s+-r\s+\S+$|\s+\S+$/, "");
  const dirs = v.filter?.dirs;
  if (dirs) return `${base} -r ${dirs.map((d) => path.posix.join(dir, d)).join(" ")}`;
  return v.functional.length <= 8 ? `${base} ${v.functional.map((f) => path.posix.join(dir, f.rel)).join(" ")}` : undefined;
}

const pwName = (c: string, isDefault: boolean) => {
  const b = path.basename(c).replace(/\.config\.\w+$/, "");
  return isDefault ? "playwright" : b === "playwright" ? `playwright-${path.basename(path.dirname(c))}` : b.replace(/^playwright\.?/, "playwright-");
};

const RE_LIT = String.raw`\/(?:\\.|\[(?:\\.|[^\]\n])*\]|[^/\\\n\[])+\/[a-z]*`;

/** A config-wide `key: /regex/` (or `key: NAME` with `const NAME = /regex/`), before any `projects:`. */
function configRegex(text: string, key: string): RegExp | undefined {
  const top = text.slice(0, text.search(/\bprojects\s*:/) >>> 0);
  const m = new RegExp(String.raw`\b${key}\s*:\s*(${RE_LIT}|[A-Za-z_]\w*)`).exec(top);
  if (!m) return undefined;
  const lit = m[1].startsWith("/") ? m[1] : new RegExp(String.raw`\bconst\s+${m[1]}\s*=\s*(${RE_LIT})`).exec(text)?.[1];
  const r = lit && /^\/(.*)\/([a-z]*)$/.exec(lit);
  try {
    return r ? new RegExp(r[1], r[2]) : undefined;
  } catch {
    return undefined;
  }
}

/** Test files with the line of the signal that decided them, e.g. `tests/x.cs:12 WebApplicationFactory`. */
function fileEvidence(p: Project, files: FileScan[], n = 3): string[] {
  return files.slice(0, n).map((f) => {
    const [label, line] = [...(f.lines ?? [])].sort((a, b) => a[1] - b[1])[0] ?? [];
    const rel = path.posix.join(p.dir, f.rel);
    return label ? `${rel}:${line} ${label}` : rel;
  });
}

function decide(g: Guess, p: Project, v: Verdict, name: (b: string) => string) {
  const kind = v.kind ?? p.defaultKind;
  const ev = v.evidence ? ` (${v.evidence})` : "";
  const manifest = p.manifest ? [p.manifest] : [];
  const suite = (cmd: string, why: string, confidence: Confidence) =>
    g.suites.push({ name: name(p.nameBase), adapter: p.adapter, kind: kind!, cwd: p.cwd, cmd, why, hostsApp: v.hostsApp, report: p.report, note: p.note, project: p.label, filtered: cmd !== p.cmd, confidence: v.kind ? confidence : "medium", evidence: [...manifest, ...fileEvidence(p, v.functional)] });
  if (v.status === "functional") return suite(p.cmd, `${p.label}: ${v.reason}${ev}`, "high");
  if (v.status === "excluded") {
    const hosted = /found, but no test sends a request/.test(v.reason) || /integration/.test(v.reason);
    return g.excluded.push({ path: p.label, adapter: p.adapter, reason: v.reason, confidence: hosted ? "medium" : "high", evidence: [...manifest, ...fileEvidence(p, v.other, 2).map((e) => e.replace(/:\d+ .*$/, ""))] });
  }
  const own = p.filter?.(v);
  const filtered = own ?? filteredCmd(p.adapter, p.cmd, v, { xunitMtp: p.xunitMtp });
  if (filtered) {
    suite(filtered, `${p.label}: ${v.reason}; the command ${own && !v.filter?.dirs ? `runs only ${v.functional.map((f) => f.rel).join(", ")}` : describeFilter(v)}${ev}`, "medium");
    const why = "doesn't drive the app (no request, browser, run of its command, window or device)";
    if (v.other.length <= 5) for (const o of v.other) g.excluded.push({ path: path.posix.join(p.dir, o.rel), adapter: p.adapter, reason: why, confidence: "medium", evidence: [path.posix.join(p.dir, o.rel)] });
    else g.excluded.push({ path: `${p.label} (the other ${v.other.length} test files)`, adapter: p.adapter, reason: why, confidence: "medium", evidence: manifest });
    return;
  }
  g.needsFilter.push({
    confidence: "low",
    evidence: [...manifest, ...fileEvidence(p, v.functional)],
    path: p.label,
    adapter: p.adapter,
    name: name(p.nameBase),
    kind: kind!,
    cwd: p.cwd,
    cmd: p.cmd,
    reason: `${v.reason}, mixed with ${v.other.length} that don't, and no folder${p.adapter === "dotnet" || p.adapter === "pytest" || p.adapter === "rspec" || p.adapter === "phpunit" || p.adapter === "junit-maven" ? ", category or tag" : ""} separates them`,
    functionalFiles: v.functional.map((f) => f.rel),
  });
}

const q = (s: string) => JSON.stringify(s);
const svcEnv = (n: string) => `WITNESS_${n.toUpperCase().replace(/-/g, "_")}_URL`;

export function renderExample(g: Guess): string {
  const out: string[] = [
    "# Witness config (version 1). Generated by `witness init` from the files in this repo: review it,",
    "# then save it as .witness/witness.toml. Run `witness check` to try it.",
    "# Witness runs functional tests only: tests that drive the app over HTTP (kind = \"api\"), in a browser",
    "# (\"ui\"), through its built command (\"cli\"), its window (\"desktop\") or on a device (\"mobile\").",
    "# Unit and integration tests stay with the project's own build and test scripts.",
    "version = 1",
    "",
    "[env]",
    'file = ".witness/.env"        # KEY=VALUE lines, gitignored',
    "required = []                 # names that must be set, e.g. [\"DATABASE_URL\"]",
    "",
    "# [[dependency]]",
    '# name = "postgres"',
    '# check = "pg_isready -h localhost"',
    '# start = "docker compose up -d db"',
    '# timeout = "60s"',
    "",
  ];
  const device = (k: Kind) => k === "desktop" || k === "mobile";
  const noServices = (s: ProposedSuite) => s.hostsApp && !device(s.kind);
  const used = g.suites.some((s) => !noServices(s));
  for (const s of g.services) {
    const lines = [`name = ${q(s.name)}`, `cwd = ${q(s.cwd)}`, ...(s.setup ? [`setup = ${q(s.setup)}`] : []), `start = ${q(s.start)}`, `ready = { http = ${q(s.ready)}, timeout = "180s" }`];
    if (used) out.push(`# ${s.why}`, "[[service]]", ...lines, "");
    else out.push(`# ${s.why}; commented out: ${g.suites.length ? "every proposed suite starts the app itself" : "no suite is proposed"}, so nothing uses it`, "# [[service]]", ...lines.map((l) => `# ${l}`), "");
  }
  if (!g.services.length) out.push("# [[service]]", '# name = "api"', '# start = "npm start -- --port ${PORT}"', '# ready = { http = "${self.url}/health", timeout = "120s" }', "");
  for (const s of g.suites) {
    out.push(`# ${s.why}`, "[[suite]]", `name = ${q(s.name)}`, `kind = ${q(s.kind)}`, `adapter = ${q(s.adapter)}`, `cwd = ${q(s.cwd)}`, `cmd = ${q(s.cmd)}`);
    if (s.report) out.push(`report = ${q(s.report)}`);
    if (s.note) out.push(`# ${s.note}`);
    if (device(s.kind)) out.push(`# kind = "${s.kind}": model the ${s.kind === "mobile" ? "emulator or device and its driver (Appium server, adb)" : "driver (WinAppDriver, Appium)"} as a [[dependency]] or [[service]] with a ready check; see docs/witness/APP-KINDS.md`);
    else if (s.hostsApp) out.push(`service = []                 # the tests ${s.kind === "cli" ? "run the app's command" : "start the app"} themselves`);
    if (!noServices(s) && used && g.services.length) out.push(`# no service key: every service is started; the tests get ${g.services.map((x) => svcEnv(x.name)).join(", ")}`);
    out.push('timeout = "20m"', "");
  }
  if (!g.suites.length && !g.needsFilter.length) out.push("# No functional tests detected.", "# [[suite]]", '# name = "api"', '# kind = "api"', '# adapter = "generic"', '# cmd = "./run-api-tests.sh"', '# report = "reports/*.xml"', "");
  for (const n of g.needsFilter) {
    out.push(`# Needs a filter: ${n.path}: ${n.reason}.`, "# Narrow cmd to the functional tests (a folder, marker, category or tag), then uncomment. Functional files:");
    for (const f of n.functionalFiles.slice(0, 8)) out.push(`#   ${f}`);
    if (n.functionalFiles.length > 8) out.push(`#   ... ${n.functionalFiles.length - 8} more`);
    out.push("# [[suite]]", `# name = ${q(n.name)}`, `# kind = ${q(n.kind)}`, `# adapter = ${q(n.adapter)}`, `# cwd = ${q(n.cwd)}`, `# cmd = ${q(n.cmd)}`, "");
  }
  if (g.excluded.length) {
    out.push("# Not proposed: these test projects don't drive the app through its HTTP API, UI, command line, window or device.");
    for (const e of g.excluded) out.push(`#   ${e.path}: ${e.reason}`);
    out.push("");
  }
  out.push("[run]", 'stall_timeout = "5m"', 'heartbeat = "60s"', "keep_runs = 10", "");
  return out.join("\n");
}

export function initCommand(root: string, json: boolean): number {
  const g = guess(root);
  const dir = path.join(root, ".witness");
  fs.mkdirSync(dir, { recursive: true });
  const example = path.join(dir, "witness.example.toml");
  fs.writeFileSync(example, renderExample(g));
  const gi = path.join(dir, ".gitignore");
  if (!fs.existsSync(gi)) fs.writeFileSync(gi, "runs/\ncheck/\ncache/\nup/\nup.json\nrun.lock\nscratch/\n.env\n");
  else if (!/^scratch\/$/m.test(fs.readFileSync(gi, "utf8"))) fs.appendFileSync(gi, "scratch/\n");
  if (json) process.stdout.write(JSON.stringify({ example, gitignore: gi, ...g }, null, 2) + "\n");
  else {
    const w = (s: string) => process.stderr.write(`witness  ${s}\n`);
    w(`wrote ${example}`);
    for (const s of g.suites) w(`  suite ${s.name} (${s.adapter}, ${s.kind}${s.hostsApp ? ", starts the app itself" : ""}): ${s.why}`);
    for (const s of g.services) w(`  service ${s.name}: ${s.why}`);
    if (g.needsFilter.length) w("needs a filter (not proposed until you narrow the command):");
    for (const n of g.needsFilter) w(`  ${n.path}: ${n.reason}`);
    if (g.excluded.length) w("excluded (Witness runs functional tests only; unit and integration tests stay with the project's own build):");
    for (const e of g.excluded) w(`  ${e.path}: ${e.reason}`);
    if (!fs.existsSync(path.join(dir, "witness.toml"))) w(`review it, then: mv ${example} ${path.join(dir, "witness.toml")}`);
  }
  return 0;
}
