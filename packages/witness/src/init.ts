import * as fs from "node:fs";
import * as path from "node:path";
import type { AdapterName } from "./adapters.ts";
import { globFiles } from "./util.ts";

export interface Guess {
  suites: { name: string; adapter: AdapterName; cwd: string; cmd: string; why: string }[];
  services: { name: string; cwd: string; setup?: string; start: string; ready: string; why: string }[];
}

const read = (f: string) => {
  try {
    return fs.readFileSync(f, "utf8");
  } catch {
    return "";
  }
};

const SKIP = new Set([".git", "node_modules", ".witness", ".venv", "venv", "bin", "obj", "target", "build", "dist", "vendor", ".gradle"]);

/** Guess suites (and, where obvious, services) from the files in a repo. */
export function guess(root: string): Guess {
  const files = globFiles(root, ["**/*"], { maxDepth: 4, skipDirs: SKIP });
  const has = (re: RegExp) => files.filter((f) => re.test(f));
  const g: Guess = { suites: [], services: [] };
  const name = (base: string) => {
    let n = base.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "tests";
    if (!/^[a-z]/.test(n)) n = `t-${n}`;
    let k = n;
    for (let i = 2; g.suites.some((s) => s.name === k) || g.services.some((s) => s.name === k); i++) k = `${n}-${i}`;
    return k;
  };
  const dirOf = (f: string) => path.dirname(f) || ".";

  const py = has(/(^|\/)(pytest\.ini|conftest\.py|pyproject\.toml|setup\.cfg|tox\.ini)$/).filter((f) => /pytest\.ini|conftest\.py/.test(f) || /\[tool\.pytest|\[tool:pytest\]|\[pytest\]|pytest/.test(read(path.join(root, f))));
  const pyDirs = [...new Set(py.map(dirOf))].filter((d, _i, a) => !a.some((o) => o !== d && (d.startsWith(`${o}/`) || o === ".")) || d === ".");
  for (const d of pyDirs.slice(0, 3)) g.suites.push({ name: name(d === "." ? "pytest" : `${path.basename(d)}-pytest`), adapter: "pytest", cwd: d, cmd: "python -m pytest", why: `found ${py.find((f) => dirOf(f) === d)}` });

  const pom = has(/(^|\/)pom\.xml$/).sort((a, b) => a.length - b.length)[0];
  if (pom) {
    g.suites.push({ name: name("maven-tests"), adapter: "junit-maven", cwd: dirOf(pom), cmd: "mvn -B verify", why: `found ${pom}` });
    if (/spring-boot/.test(read(path.join(root, pom)))) g.services.push({ name: name("app"), cwd: dirOf(pom), setup: "mvn -B -DskipTests package", start: "mvn -B spring-boot:run -Dspring-boot.run.arguments=--server.port=${PORT}", ready: "${self.url}/actuator/health", why: "spring-boot in pom.xml" });
  }
  const gradle = has(/(^|\/)build\.gradle(\.kts)?$/).sort((a, b) => a.length - b.length)[0];
  if (gradle) g.suites.push({ name: name("gradle-tests"), adapter: "junit-gradle", cwd: dirOf(gradle), cmd: fs.existsSync(path.join(root, dirOf(gradle), "gradlew")) ? "./gradlew test" : "gradle test", why: `found ${gradle}` });

  const csproj = has(/\.csproj$/);
  const testProjects = csproj.filter((f) => /Microsoft\.NET\.Test\.Sdk|xunit|NUnit|MSTest/i.test(read(path.join(root, f))));
  const sln = has(/\.(sln|slnx)$/).sort((a, b) => a.length - b.length)[0];
  if (testProjects.length && testProjects.length <= 6) {
    for (const f of testProjects) g.suites.push({ name: name(path.basename(f, ".csproj")), adapter: "dotnet", cwd: ".", cmd: `dotnet test ${f}`, why: `test project ${f}` });
  } else if (testProjects.length || sln) g.suites.push({ name: name("dotnet-tests"), adapter: "dotnet", cwd: sln ? dirOf(sln) : ".", cmd: sln ? `dotnet test ${path.basename(sln)}` : "dotnet test", why: sln ? `found ${sln}` : "test projects found" });
  for (const f of csproj.filter((f) => /Sdk="Microsoft\.NET\.Sdk\.Web"/.test(read(path.join(root, f)))).slice(0, 3)) {
    g.services.push({ name: name(path.basename(f, ".csproj")), cwd: ".", setup: `dotnet build ${f}`, start: `dotnet run --no-build --project ${f} --urls http://127.0.0.1:\${PORT}`, ready: "${self.url}/", why: `web project ${f}` });
  }

  for (const pj of has(/(^|\/)package\.json$/).filter((f) => f.split("/").length <= 3)) {
    let doc: { scripts?: Record<string, string>; dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    try {
      doc = JSON.parse(read(path.join(root, pj)));
    } catch {
      continue;
    }
    const deps = { ...doc.dependencies, ...doc.devDependencies };
    const d = dirOf(pj);
    const base = d === "." ? "" : `${path.basename(d)}-`;
    if (deps["@playwright/test"]) g.suites.push({ name: name(`${base}playwright`), adapter: "playwright", cwd: d, cmd: "npx playwright test", why: `@playwright/test in ${pj}` });
    if (deps.vitest) g.suites.push({ name: name(`${base}vitest`), adapter: "vitest", cwd: d, cmd: "npx vitest run", why: `vitest in ${pj}` });
    if (deps.jest) g.suites.push({ name: name(`${base}jest`), adapter: "jest", cwd: d, cmd: "npx jest", why: `jest in ${pj}` });
    if (deps.mocha) g.suites.push({ name: name(`${base}mocha`), adapter: "mocha", cwd: d, cmd: "npx mocha", why: `mocha in ${pj}` });
    if (doc.scripts?.start) g.services.push({ name: name(`${base}web`.replace(/-$/, "")), cwd: d, setup: fs.existsSync(path.join(root, d, "package-lock.json")) ? "npm ci" : "npm install", start: "npm start", ready: "${self.url}/", why: `start script in ${pj}` });
  }
  const gomod = has(/(^|\/)go\.mod$/).sort((a, b) => a.length - b.length)[0];
  if (gomod) g.suites.push({ name: name("go-tests"), adapter: "go", cwd: dirOf(gomod), cmd: "go test ./...", why: `found ${gomod}` });
  const gem = has(/(^|\/)Gemfile$/).find((f) => /rspec/.test(read(path.join(root, f))));
  if (gem) g.suites.push({ name: name("rspec"), adapter: "rspec", cwd: dirOf(gem), cmd: "bundle exec rspec", why: `rspec in ${gem}` });
  const php = has(/(^|\/)phpunit\.xml(\.dist)?$/)[0];
  if (php) g.suites.push({ name: name("phpunit"), adapter: "phpunit", cwd: dirOf(php), cmd: "vendor/bin/phpunit", why: `found ${php}` });
  if (fs.existsSync(path.join(root, "manage.py"))) g.services.push({ name: name("django"), cwd: ".", setup: "pip install -r requirements.txt", start: "python manage.py runserver 127.0.0.1:${PORT} --noreload", ready: "${self.url}/", why: "manage.py" });
  return g;
}

const q = (s: string) => JSON.stringify(s);

export function renderExample(g: Guess): string {
  const out: string[] = [
    "# Witness config (version 1). Generated by `witness init` from the files in this repo: review it,",
    "# then save it as .witness/witness.toml. Run `witness check` to try it.",
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
  for (const s of g.services) {
    out.push(`# ${s.why}`, "[[service]]", `name = ${q(s.name)}`, `cwd = ${q(s.cwd)}`);
    if (s.setup) out.push(`setup = ${q(s.setup)}`);
    out.push(`start = ${q(s.start)}`, `ready = { http = ${q(s.ready)}, timeout = "180s" }`, "");
  }
  if (!g.services.length) out.push("# [[service]]", '# name = "api"', '# start = "npm start -- --port ${PORT}"', '# ready = { http = "${self.url}/health", timeout = "120s" }', "");
  for (const s of g.suites) {
    out.push(`# ${s.why}`, "[[suite]]", `name = ${q(s.name)}`, `adapter = ${q(s.adapter)}`, `cwd = ${q(s.cwd)}`, `cmd = ${q(s.cmd)}`);
    if (g.services.length) out.push("service = []                 # services this suite needs up; omit for all");
    out.push('timeout = "20m"', "");
  }
  if (!g.suites.length) out.push("# No test framework detected.", "# [[suite]]", '# name = "tests"', '# adapter = "generic"', '# cmd = "./run-tests.sh"', '# report = "reports/*.xml"', "");
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
  if (!fs.existsSync(gi)) fs.writeFileSync(gi, "runs/\ncheck/\ncache/\nup/\nup.json\nrun.lock\n.env\n");
  if (json) process.stdout.write(JSON.stringify({ example, gitignore: gi, ...g }, null, 2) + "\n");
  else {
    process.stderr.write(`witness  wrote ${example}\n`);
    for (const s of g.suites) process.stderr.write(`witness    suite ${s.name} (${s.adapter}): ${s.why}\n`);
    for (const s of g.services) process.stderr.write(`witness    service ${s.name}: ${s.why}\n`);
    if (!fs.existsSync(path.join(dir, "witness.toml"))) process.stderr.write(`witness  review it, then: mv ${example} ${path.join(dir, "witness.toml")}\n`);
  }
  return 0;
}
