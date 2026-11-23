import * as fs from "node:fs";
import * as path from "node:path";
import { parse as parseYaml } from "yaml";
import type { AdapterName } from "./adapters.ts";
import { type Config, ConfigError, type Kind, loadConfig, parseEnvFile } from "./config.ts";
import { type Confidence, type GuessedService, guess } from "./init.ts";
import { isTestPath } from "./lint.ts";
import { globFiles } from "./util.ts";

export interface Fact {
  confidence: Confidence;
  /** `file:line`, a file, or a manifest. */
  evidence: string[];
}

export interface TestProjectFact extends Fact {
  path: string;
  adapter: AdapterName;
  status: "functional" | "needs-filter" | "excluded";
  kind?: Kind;
  reason: string;
  suite?: { name: string; cwd: string; cmd: string; hostsApp: boolean; filtered: boolean };
  /** The existing config's suite that runs it, or "comment" when only a comment there names it (a recorded choice). */
  configured?: string;
}

export type CommandRole = "setup" | "build" | "start" | "test" | "migrate" | "seed";
export type CommandSource = "ci" | "package" | "make" | "procfile" | "dockerfile" | "compose" | "readme" | "agent-docs";

export interface CommandFact extends Fact {
  role: CommandRole;
  cmd: string;
  cwd: string;
  source: CommandSource;
  /** What a package script or make target runs. */
  runs?: string;
}

export interface InfraFact extends Fact {
  name: string;
  type: string;
  source: "compose" | "env" | "appsettings" | "ci" | "dependency";
  image?: string;
  ports?: string[];
  host?: string;
  /** Candidate [[dependency]] commands. */
  start?: string;
  stop?: string;
  check?: string;
  configured?: string;
}

export interface ContainerFact extends Fact {
  name: string;
  file: string;
  build?: string;
  ports: string[];
  dependsOn: string[];
  start: string;
}

export interface EnvFact extends Fact {
  name: string;
  /** The environment variable form, when the name is a .NET or Spring config key. */
  envName?: string;
  secret: boolean;
  readBy: ("app" | "tests" | "ci" | "compose" | "example")[];
  /** Looks like a test user's login or password. */
  testUser?: boolean;
  /** An example file gives it a value (values are never printed). */
  exampleValue?: boolean;
  /** Where the existing config gives it: "required", "env file", "env" (a service's or suite's), or "comment". */
  configured?: string;
}

export interface DataFact extends Fact {
  kind: "seed" | "fixtures" | "migrations" | "sql-init" | "user";
  path: string;
  /** For kind "user": the login (an email) a seed or a test uses. */
  login?: string;
}

export interface FrameworkFact extends Fact {
  name: string;
  role: "app" | "test" | "toolchain";
  version?: string;
}

export interface UrlFact extends Fact {
  url: string;
  for?: string;
}

export interface ConfigFact {
  file: string;
  /** Morph rendered it from the project's lifecycle config. */
  rendered: boolean;
  error?: string;
  suites: string[];
  services: string[];
  dependencies: string[];
  required: string[];
  /** What the scan found that the config does not cover yet. */
  missing: { testProjects: string[]; infrastructure: string[]; secrets: string[] };
  /** Config entries the scan cannot tie to anything in the repo (renamed or removed?). */
  unmatched: { suites: string[]; dependencies: string[] };
}

export interface ScanResult {
  version: 1;
  root: string;
  testProjects: TestProjectFact[];
  services: (GuessedService & { configured?: string })[];
  commands: CommandFact[];
  containers: ContainerFact[];
  infrastructure: InfraFact[];
  urls: UrlFact[];
  /** Witness adapters of the test projects that are or could be suites. */
  adapters: AdapterName[];
  /** Health or readiness routes in the app's code, with the guessed service whose folder holds them. */
  health: (Fact & { path: string; for?: string })[];
  env: EnvFact[];
  data: DataFact[];
  frameworks: FrameworkFact[];
  config: ConfigFact | null;
}

const SKIP = new Set([".git", "node_modules", ".witness", ".venv", "venv", "bin", "obj", "target", "build", "dist", "vendor", ".gradle", "__pycache__", ".next", ".nuxt", "coverage", ".tox", ".mypy_cache", ".pytest_cache", ".ruff_cache", "out", ".turbo", ".cache", "site-packages"]);
const KEEP_DOT_DIRS = new Set([".github", ".devcontainer", ".circleci", ".gitlab", ".config", ".cursor"]);
const MAX_SOURCES = 6000;
const MAX_BYTES = 256 * 1024;

const read = (f: string) => {
  try {
    const st = fs.statSync(f);
    return st.size > MAX_BYTES * 4 ? "" : fs.readFileSync(f, "utf8");
  } catch {
    return "";
  }
};
const lineAt = (text: string, i: number) => (i < 0 ? 0 : text.slice(0, i).split("\n").length);
/** 1-based line of the first line matching `re` (or containing the string), 0 when absent. */
const lineOf = (text: string, needle: string | RegExp, from = 0) => {
  const lines = text.split("\n");
  for (let i = from; i < lines.length; i++) if (typeof needle === "string" ? lines[i].includes(needle) : needle.test(lines[i])) return i + 1;
  return 0;
};
const at = (file: string, line: number) => (line ? `${file}:${line}` : file);
const dirOf = (f: string) => path.posix.dirname(f) || ".";

const ROLE: [CommandRole, RegExp][] = [
  ["setup", /\b(npm (ci|install|i)|pnpm (i|install)|yarn install|bun install|pip3? install|poetry install|uv (sync|pip)|pipenv install|bundle install|composer install|dotnet (restore|tool restore)|go mod download|playwright\S* install|dev-certs|apt-get|brew install|corepack)\b|^yarn$/i],
  ["test", /(^|\s)(test|e2e|test:\S+|e2e:\S+|verify)(\s|$)|\b(pytest|jest|vitest|mocha|rspec|phpunit|cypress run|playwright test)\b/i],
  ["migrate", /^(?!.*(migrations add|makemigrations|migration:(create|generate))).*(\bmigrat)|\bdatabase update\b|alembic upgrade|prisma (migrate|db push)|flyway|liquibase|db:(migrate|setup|prepare)/i],
  ["seed", /\bseed|loaddata|\bfixtures?\b/i],
  ["build", /\b(build|compile|publish|package|tsc|webpack|assemble|bundle exec rake assets)\b/i],
  ["start", /(^|\s)(start|serve|server|runserver|dev|up|start:\S+|dev:\S+)(\s|$)|\bdocker run\b|\b(uvicorn|gunicorn|hypercorn|flask run|rails s|dotnet run|spring-boot:run|bootRun|quarkus:dev|php artisan serve|go run|cargo run)\b|^node \S+\.[cm]?js\b/i],
];
const NOT_A_COMMAND = /^(echo|printf|cat|if|then|else|elif|fi|for|while|do|done|case|esac|export|set|cd|source|test|\[|\[\[|exit|return|true|false|sleep|mkdir|rm|cp|mv|ln|chmod|grep|sed|awk|jq|tee|curl|wget|gh|git|ls|find|xargs|read|local|trap|wait|unset|shift|eval|pre-commit|ruff|eslint|prettier|pylint|pyright|mypy|black|isort|flake8|out=)\b|^[^\w./$]|^\.\s|^(npm|pnpm|yarn|bun) (run )?(lint|format|check-format|typecheck|prepare)\b/;
const roleOf = (cmd: string): CommandRole | undefined => (NOT_A_COMMAND.test(cmd) ? undefined : ROLE.find(([, re]) => re.test(cmd))?.[0]);

const SECRET_HI = /SECRET|PASSWORD|PASSWD|TOKEN|API_?KEY|APIKEY|PRIVATE_?KEY|CREDENTIAL|ACCESS_?KEY|CLIENT_?SECRET/i;
const SECRET_MID = /(^|_)KEY$|AUTH|DSN$|CONNECTION_?STRING|ConnectionStrings|(^|_)PASS$|SALT|SIGNING|LICENSE/i;
const NOT_SECRET = /(_|:)(URL|URI|HOST|PORT|PATH|ENDPOINT|ENABLED|TTL|TIMEOUT|EXPIRY|EXPIRES|NAME|ID|FILE|DIR|TYPE|MODE|LENGTH|HEADER|PREFIX|BACKEND|PROVIDER|REGION|GROUP|ARN|KID|BUNDLE|VERSION|SCOPES?|MS|SECONDS|MINUTES|HOURS|DAYS|COUNT|SIZE|LIMIT|MAX|MIN|EMAIL|USER|USERNAME|TENANT|HINT)$|^(SECRET|AUTH)_(BACKEND|PROVIDER|MODE|TYPE)$|^(ENABLE|DISABLE|USE|IS|HAS)_|PUBLIC/i;
const TEST_USER = /(USER|LOGIN|ACCOUNT|ADMIN|TESTER)\w*_(EMAIL|USERNAME|LOGIN|PASSWORD|PASS)$|^(TEST|E2E|QA)_\w*(EMAIL|USERNAME|PASSWORD)$/i;
const ENV_NOISE = /^(NODE_ENV|HOME|PATH|PWD|USER|SHELL|TERM|TMPDIR|TEMP|TMP|HOSTNAME|LANG|LC_\w+|CI|GITHUB_\w+|RUNNER_\w+|WITNESS_\w+|ASPNETCORE_ENVIRONMENT|DOTNET_\w+|JAVA_HOME|PYTHONPATH|VIRTUAL_ENV|npm_\w+|INIT_CWD)$/;

function secretness(name: string): Confidence | undefined {
  if (SECRET_HI.test(name)) return NOT_SECRET.test(name) ? "low" : "high";
  if (SECRET_MID.test(name) && !NOT_SECRET.test(name)) return "medium";
  return undefined;
}

const ENV_READS: { exts: RegExp; re: RegExp; config?: boolean }[] = [
  { exts: /\.[cm]?[jt]sx?$|\.vue$|\.svelte$/, re: /\bprocess\.env\.([A-Za-z_]\w*)|\bprocess\.env\[\s*["'`]([A-Za-z_]\w*)|\bimport\.meta\.env\.([A-Za-z_]\w*)|\bDeno\.env\.get\(\s*["']([A-Za-z_]\w*)|\bBun\.env\.([A-Za-z_]\w*)/g },
  { exts: /\.py$/, re: /\bos\.environ\s*\[\s*["']([A-Za-z_]\w*)|\b(?:os\.)?environ\.get\(\s*["']([A-Za-z_]\w*)|\bos\.getenv\(\s*["']([A-Za-z_]\w*)|\benv(?:\.str|\.int|\.bool|\.url)?\(\s*["']([A-Z_][A-Z0-9_]*)["']/g },
  { exts: /\.cs$/, re: /\bGetEnvironmentVariable\(\s*"([A-Za-z_]\w*)"/g },
  { exts: /\.cs$/, re: /\b[Cc]onfiguration\s*\[\s*"([^"]+)"\s*\]|\bGetValue<[\w?]+>\(\s*"([^"]+)"|\bGetConnectionString\(\s*"([^"]+)"/g, config: true },
  { exts: /\.(java|kt|scala)$/, re: /\bSystem\.getenv\(\s*"([A-Za-z_]\w*)"/g },
  { exts: /\.(java|kt)$/, re: /@Value\(\s*"\$\{([\w.-]+)/g, config: true },
  { exts: /\.go$/, re: /\bos\.(?:Getenv|LookupEnv)\(\s*"([A-Za-z_]\w*)"|\bviper\.Get\w*\(\s*"([\w.]+)"/g },
  { exts: /\.rb$|\.erb$/, re: /\bENV\s*\[\s*["']([A-Za-z_]\w*)|\bENV\.fetch\(\s*["']([A-Za-z_]\w*)/g },
  { exts: /\.php$/, re: /\bgetenv\(\s*["']([A-Za-z_]\w*)|\benv\(\s*["']([A-Za-z_]\w*)|\$_ENV\s*\[\s*["']([A-Za-z_]\w*)/g },
  { exts: /\.rs$/, re: /\benv::var(?:_os)?\(\s*"([A-Za-z_]\w*)"|\benv!\(\s*"([A-Za-z_]\w*)"/g },
  { exts: /application[\w-]*\.(ya?ml|properties)$/, re: /\$\{([A-Z_][A-Z0-9_]*)(?::[^}]*)?\}/g },
];
const SOURCE_EXT = /\.([cm]?[jt]sx?|vue|svelte|py|cs|java|kt|scala|go|rb|erb|php|rs)$|application[\w-]*\.(ya?ml|properties)$/;
const EXAMPLE_ENV = /(^|\/)(\.env\.(example|sample|template|dist|defaults|local\.example|test\.example|development\.example)|example\.env|env\.example|\.env\.\w+\.example|sample\.env)$/;

const INFRA_IMAGES: [RegExp, string][] = [
  [/postgres|postgis|timescale/i, "postgres"],
  [/mysql|mariadb|percona/i, "mysql"],
  [/mssql|sqlserver|azure-sql-edge/i, "sqlserver"],
  [/(^|\/)(redis|valkey|keydb)/i, "redis"],
  [/(^|\/)mongo/i, "mongodb"],
  [/rabbitmq/i, "rabbitmq"],
  [/kafka|redpanda/i, "kafka"],
  [/zookeeper/i, "zookeeper"],
  [/elasticsearch|opensearch/i, "elasticsearch"],
  [/localstack/i, "aws (localstack)"],
  [/minio/i, "s3 (minio)"],
  [/azurite/i, "azure storage (azurite)"],
  [/mailhog|mailpit|maildev|smtp4dev/i, "smtp"],
  [/(^|\/)nats/i, "nats"],
  [/memcached/i, "memcached"],
  [/keycloak/i, "keycloak"],
  [/clickhouse/i, "clickhouse"],
  [/cassandra|scylla/i, "cassandra"],
  [/neo4j/i, "neo4j"],
  [/temporal/i, "temporal"],
  [/dynamodb/i, "dynamodb"],
  [/(^|\/)(seq|jaeger|otel|grafana|prometheus|zipkin|signoz)/i, "telemetry"],
];
const URL_SCHEMES: [RegExp, string][] = [
  [/^postgres(ql)?(\+\w+)?:\/\//i, "postgres"],
  [/^(mysql|mariadb)(\+\w+)?:\/\//i, "mysql"],
  [/^(sqlserver|mssql)(\+\w+)?:\/\//i, "sqlserver"],
  [/^mongodb(\+srv)?:\/\//i, "mongodb"],
  [/^rediss?:\/\//i, "redis"],
  [/^amqps?:\/\//i, "rabbitmq"],
  [/^(kafka|nats):\/\//i, "kafka"],
  [/^sqlite:/i, "sqlite"],
  [/^(Server|Data Source)=.*(Database|Initial Catalog)=/i, "sqlserver"],
  [/^Host=.*Database=/i, "postgres"],
];

const FRAMEWORKS: [RegExp, string, FrameworkFact["role"], string?][] = [
  [/^(express|fastify|koa|@nestjs\/core|hono|@hapi\/hapi|next|nuxt|@remix-run\/\w+|@sveltejs\/kit|astro|vite|react-scripts|@angular\/core)$/, "", "app"],
  [/^(jest|vitest|mocha|@playwright\/test|cypress|supertest|detox|webdriverio|puppeteer|@testing-library\/\w+)$/, "", "test"],
  [/^(fastapi|django|flask|starlette|aiohttp|litestar|sanic|tornado)$/i, "", "app"],
  [/^(pytest|pytest-playwright|playwright|selenium|requests-mock|responses|factory[-_]boy|pytest-django)$/i, "", "test"],
  [/^(xunit(\.v3)?|NUnit|MSTest(\.TestFramework)?|Microsoft\.Playwright(\.\w+)?|Microsoft\.AspNetCore\.Mvc\.Testing|Testcontainers(\.\w+)?|Selenium\.WebDriver)$/, "", "test"],
  [/^(Aspire\.Hosting(\.(?!Testing)\w+)?|Microsoft\.EntityFrameworkCore\.(SqlServer|InMemory|Sqlite|Cosmos))$/, "", "app"],
  [/^(rails|sinatra|hanami)$/, "", "app"],
  [/^(rspec(-rails)?|capybara|cuprite|selenium-webdriver|factory_bot(_rails)?)$/, "", "test"],
  [/^(laravel\/framework|symfony\/framework-bundle|slim\/slim)$/, "", "app"],
  [/^(phpunit\/phpunit|laravel\/dusk|symfony\/panther|pestphp\/pest)$/, "", "test"],
  [/(gin-gonic\/gin|labstack\/echo|gofiber\/fiber|go-chi\/chi|gorilla\/mux)/, "", "app"],
  [/^(axum|actix-web|rocket|warp)$/, "", "app"],
];
const DB_DRIVERS: [RegExp, string][] = [
  [/^(pg|postgres|psycopg2?(-binary)?|psycopg|asyncpg|Npgsql(\.\w+)*|org\.postgresql|github\.com\/(jackc\/pgx|lib\/pq))$/i, "postgres"],
  [/^(mysql2?|pymysql|mysqlclient|aiomysql|MySql\.Data|Pomelo\.EntityFrameworkCore\.MySql|mysql-connector-\w+)$/i, "mysql"],
  [/^(mssql|tedious|pyodbc|Microsoft\.EntityFrameworkCore\.SqlServer|Microsoft\.Data\.SqlClient)$/i, "sqlserver"],
  [/^(mongodb|mongoose|pymongo|motor|MongoDB\.Driver)$/i, "mongodb"],
  [/^(redis|ioredis|StackExchange\.Redis|aioredis)$/i, "redis"],
  [/^(amqplib|pika|aio-pika|RabbitMQ\.Client|bunny)$/i, "rabbitmq"],
  [/^(kafkajs|confluent-kafka|aiokafka|Confluent\.Kafka)$/i, "kafka"],
];

interface Walk {
  files: string[];
}

/** Facts about how the repo builds, runs and tests, each with a confidence and its evidence. Writes nothing. */
export function scan(root: string): ScanResult {
  const files = globFiles(root, ["**/*"], { maxDepth: 8, skipDirs: SKIP }).filter((f) => !f.split("/").slice(0, -1).some((d) => d.startsWith(".") && !KEEP_DOT_DIRS.has(d)));
  const w: Walk = { files };
  const g = guess(root);
  const out: ScanResult = {
    version: 1,
    root,
    testProjects: [],
    services: g.services,
    commands: [],
    containers: [],
    infrastructure: [],
    urls: [],
    adapters: [],
    health: [],
    env: [],
    data: [],
    frameworks: [],
    config: null,
  };
  for (const s of g.suites) out.testProjects.push({ path: s.project ?? s.cwd, adapter: s.adapter, status: "functional", kind: s.kind, reason: s.why.replace(/^[^:]*: /, ""), suite: { name: s.name, cwd: s.cwd, cmd: s.cmd, hostsApp: s.hostsApp, filtered: !!s.filtered }, confidence: s.confidence ?? "medium", evidence: s.evidence ?? [] });
  for (const n of g.needsFilter) out.testProjects.push({ path: n.path, adapter: n.adapter, status: "needs-filter", kind: n.kind, reason: n.reason, suite: { name: n.name, cwd: n.cwd, cmd: n.cmd, hostsApp: false, filtered: false }, confidence: n.confidence ?? "low", evidence: n.evidence ?? [] });
  for (const e of g.excluded) out.testProjects.push({ path: e.path, adapter: e.adapter, status: "excluded", reason: e.reason, confidence: e.confidence ?? "medium", evidence: e.evidence ?? [] });

  scanCi(root, w, out);
  scanPackages(root, w, out);
  scanMake(root, w, out);
  scanDocker(root, w, out);
  scanCompose(root, w, out);
  scanReadme(root, w, out);
  scanAgentDocs(root, w, out);
  scanEnvExamples(root, w, out);
  scanAppSettings(root, w, out);
  scanSources(root, w, out);
  scanData(root, w, out);
  scanManifests(root, w, out);
  dedupe(out);
  out.config = existingConfig(root, out);
  return out;
}

function addCommand(out: ScanResult, c: Omit<CommandFact, "role"> & { role?: CommandRole }) {
  const cmd = c.cmd.trim().replace(/\s+/g, " ");
  const role = c.role ?? roleOf(cmd);
  if (!role || !cmd || cmd.length > 300 || (cmd.match(/'/g)?.length ?? 0) % 2) return;
  const same = out.commands.find((x) => x.cmd === cmd && x.cwd === c.cwd);
  if (same) {
    for (const e of c.evidence) if (!same.evidence.includes(e)) same.evidence.push(e);
    if (c.runs && !same.runs) same.runs = c.runs;
    if (rank(c.confidence) > rank(same.confidence)) same.confidence = c.confidence;
    return;
  }
  out.commands.push({ role, cmd, cwd: c.cwd, source: c.source, ...(c.runs ? { runs: c.runs } : {}), confidence: c.confidence, evidence: c.evidence });
}
const rank = (c: Confidence) => ({ low: 0, medium: 1, high: 2 })[c];

/** Shell lines of a `run:` block: comments and heredoc bodies dropped, `\` continuations joined. */
function shellLines(script: string): string[] {
  const out: string[] = [];
  let heredoc: string | undefined;
  for (const raw of script.replace(/\\\r?\n\s*/g, " ").split(/\r?\n/)) {
    const l = raw.trim();
    if (heredoc) {
      if (l === heredoc) heredoc = undefined;
      continue;
    }
    heredoc = /<<-?\s*["']?(\w+)["']?/.exec(l)?.[1];
    if (l && !l.startsWith("#")) out.push(l);
  }
  return out;
}

function scanCi(root: string, w: Walk, out: ScanResult) {
  for (const f of w.files.filter((x) => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(x))) {
    const text = read(path.join(root, f));
    let doc: any;
    try {
      doc = parseYaml(text);
    } catch {
      continue;
    }
    for (const m of text.matchAll(/\$\{\{\s*secrets\.([A-Za-z_]\w*)\s*\}\}/g)) if (m[1] !== "GITHUB_TOKEN") addEnv(out, m[1], "ci", at(f, lineAt(text, m.index!)), true);
    for (const m of text.matchAll(/\$\{\{\s*vars\.([A-Za-z_]\w*)\s*\}\}/g)) addEnv(out, m[1], "ci", at(f, lineAt(text, m.index!)));
    for (const [jobName, job] of Object.entries<any>(doc?.jobs ?? {})) {
      const env = { ...(doc?.env ?? {}), ...(job?.env ?? {}) };
      for (const [svc, def] of Object.entries<any>(job?.services ?? {})) {
        const image = typeof def === "string" ? def : def?.image;
        const type = typeof image === "string" ? INFRA_IMAGES.find(([re]) => re.test(image))?.[1] : undefined;
        if (type) out.infrastructure.push({ name: svc, type, source: "ci", image, ports: (def?.ports ?? []).map(String), confidence: "medium", evidence: [at(f, lineOf(text, new RegExp(`^\\s+${svc}:\\s*$`)))] });
      }
      let from = lineOf(text, new RegExp(`^\\s+${jobName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:\\s*$`));
      for (const step of job?.steps ?? []) {
        const withs = step?.with ?? {};
        const setupTool = /^actions\/setup-(\w+)@/.exec(String(step?.uses ?? ""));
        if (setupTool) {
          const v = Object.entries<any>(withs).find(([k]) => /-version$/.test(k))?.[1];
          const line = lineOf(text, String(step.uses), from);
          addFramework(out, { name: setupTool[1], role: "toolchain", version: v === undefined ? undefined : String(v), confidence: "high", evidence: [at(f, line)] });
        }
        if (typeof step?.run !== "string") continue;
        const stepEnv = { ...env, ...(step?.env ?? {}) };
        const cwd = typeof step["working-directory"] === "string" ? step["working-directory"].replace(/^\.\//, "") || "." : ".";
        for (const raw of shellLines(step.run)) {
          const line = lineOf(text, raw.slice(0, 40), from) || lineOf(text, raw.slice(0, 40));
          if (line) from = line - 1;
          const cmd = raw.replace(/\$\{\{\s*env\.(\w+)\s*\}\}/g, (m, k) => (stepEnv[k] !== undefined ? String(stepEnv[k]) : m)).replace(/\s+2>&1|\s*\|\s*tee\s+\S+|\s*&$/g, "");
          if (/\$\{\{/.test(cmd) && !/\$\{\{\s*(matrix|inputs)\./.test(cmd)) continue;
          const role = roleOf(cmd);
          addCommand(out, { cmd, cwd, source: "ci", role, confidence: role === "start" ? "medium" : "high", evidence: [at(f, line)] });
        }
      }
    }
  }
  const gl = w.files.find((x) => x === ".gitlab-ci.yml");
  if (gl) {
    const text = read(path.join(root, gl));
    let doc: any;
    try {
      doc = parseYaml(text);
    } catch {
      return;
    }
    for (const job of Object.values<any>(doc ?? {})) {
      for (const key of ["before_script", "script"]) {
        for (const s of Array.isArray(job?.[key]) ? job[key] : []) {
          if (typeof s !== "string") continue;
          for (const l of shellLines(s)) addCommand(out, { cmd: l, cwd: ".", source: "ci", confidence: "high", evidence: [at(gl, lineOf(text, l.slice(0, 40)))] });
        }
      }
    }
  }
}

function packageManager(root: string, dir: string): { run: string; install: string } {
  const has = (f: string) => fs.existsSync(path.join(root, dir, f)) || fs.existsSync(path.join(root, f));
  if (has("pnpm-lock.yaml")) return { run: "pnpm", install: "pnpm install --frozen-lockfile" };
  if (has("yarn.lock")) return { run: "yarn", install: "yarn install --frozen-lockfile" };
  if (has("bun.lockb") || has("bun.lock")) return { run: "bun run", install: "bun install --frozen-lockfile" };
  return { run: "npm run", install: has("package-lock.json") ? "npm ci" : "npm install" };
}

const SCRIPT_ROLE: [RegExp, CommandRole, Confidence][] = [
  [/^start$/, "start", "high"],
  [/^(dev|serve|start:\w+|preview)$/, "start", "medium"],
  [/^(build|build:\w+|compile)$/, "build", "high"],
  [/^(test|test:\w+|e2e|e2e:\w+|integration)$/, "test", "high"],
  [/^(migrate|db:migrate|migration:run|typeorm:migrate|prisma:migrate)$/, "migrate", "high"],
  [/^(seed|db:seed|seed:\w+|fixtures)$/, "seed", "high"],
  [/^(setup|bootstrap|postinstall|prepare)$/, "setup", "medium"],
];

function scanPackages(root: string, w: Walk, out: ScanResult) {
  for (const pj of w.files.filter((f) => /(^|\/)package\.json$/.test(f) && f.split("/").length <= 4)) {
    const text = read(path.join(root, pj));
    let doc: any;
    try {
      doc = JSON.parse(text);
    } catch {
      continue;
    }
    const d = dirOf(pj);
    const pm = packageManager(root, d);
    const scripts = Object.entries<any>(doc.scripts ?? {});
    if (scripts.length) addCommand(out, { role: "setup", cmd: pm.install, cwd: d, source: "package", confidence: "high", evidence: [pj] });
    for (const [name, body] of scripts) {
      const r = SCRIPT_ROLE.find(([re]) => re.test(name));
      if (!r) continue;
      const cmd = name === "start" || name === "test" ? `${pm.run === "npm run" ? "npm" : pm.run} ${name}` : `${pm.run} ${name}`;
      addCommand(out, { role: r[1], cmd, runs: String(body).slice(0, 280), cwd: d, source: "package", confidence: r[2], evidence: [at(pj, lineOf(text, `"${name}"`))] });
    }
  }
}

function scanMake(root: string, w: Walk, out: ScanResult) {
  for (const mk of w.files.filter((f) => /(^|\/)(Makefile|makefile|GNUmakefile|justfile|Justfile)$/.test(f) && f.split("/").length <= 2)) {
    const text = read(path.join(root, mk));
    const tool = /justfile$/i.test(mk) ? "just" : "make";
    for (const m of text.matchAll(/^([A-Za-z][\w.-]*)(?:\s+[^:=\n]*)?:(?!=)/gm)) {
      const target = m[1];
      const r = SCRIPT_ROLE.find(([re]) => re.test(target)) ?? (roleOf(target) ? ([/./, roleOf(target)!, "medium"] as const) : undefined);
      if (!r) continue;
      addCommand(out, { role: r[1], cmd: `${tool} ${target}`, cwd: dirOf(mk), source: "make", confidence: "medium", evidence: [at(mk, lineAt(text, m.index!))] });
    }
  }
  const proc = w.files.find((f) => f === "Procfile");
  if (proc) {
    const text = read(path.join(root, proc));
    for (const m of text.matchAll(/^(\w+):\s*(.+)$/gm)) addCommand(out, { role: m[1] === "release" ? "migrate" : "start", cmd: m[2], cwd: ".", source: "procfile", confidence: m[1] === "web" ? "high" : "medium", evidence: [at(proc, lineAt(text, m.index!))] });
  }
}

function scanDocker(root: string, w: Walk, out: ScanResult) {
  for (const df of w.files.filter((f) => /(^|\/)(Dockerfile|[\w.-]+\.Dockerfile|Dockerfile\.[\w.-]+)$/.test(f)).slice(0, 20)) {
    const raw = read(path.join(root, df));
    const text = raw.replace(/\\(\r?\n)/g, (m) => " ".repeat(m.length));
    const last: Record<string, { body: string; ev: string[] }> = {};
    for (const m of text.matchAll(/^\s*(RUN|CMD|ENTRYPOINT|EXPOSE)\s+(.+)$/gim)) {
      const verb = m[1].toUpperCase();
      let body = m[2].trim();
      if (/^\[/.test(body)) {
        try {
          body = (JSON.parse(body) as string[]).join(" ");
        } catch {
          /* shell form */
        }
      }
      const ev = [at(df, lineAt(raw, m.index! + m[0].search(/\S/)))];
      if (verb === "RUN") for (const part of body.split(/\s*(?:&&|;)\s*/)) addCommand(out, { cmd: part, cwd: ".", source: "dockerfile", confidence: "medium", evidence: ev });
      else if (verb !== "EXPOSE") last[verb] = { body, ev };
    }
    const { ENTRYPOINT: ep, CMD: cmd } = last;
    const start = ep && cmd ? `${ep.body} ${cmd.body}` : (ep ?? cmd)?.body;
    if (start) addCommand(out, { role: "start", cmd: start, cwd: ".", source: "dockerfile", confidence: "medium", evidence: (ep ?? cmd)!.ev });
  }
}

function composeCmd(file: string, verb: string, svc: string): string {
  const dflt = /^(docker-)?compose\.ya?ml$/.test(file);
  return `docker compose ${dflt ? "" : `-f ${file} `}${verb} ${svc}`;
}

/** The published host port of a compose `ports` entry ("8080:80", "127.0.0.1:8080:80"); a bare port publishes none. */
function hostPort(ports: string[]): number | undefined {
  for (const p of ports) {
    const parts = p.replace(/\$\{\w+:?-(\d+)\}/g, "$1").replace(/^"|"$|\/\w+$/g, "").split(":");
    const host = parts.length === 3 ? parts[1] : parts.length === 2 ? parts[0] : undefined;
    if (host && /^\d+$/.test(host)) return Number(host);
  }
  return undefined;
}

const IN_CONTAINER: Record<string, string> = { postgres: "pg_isready", mysql: "mysqladmin ping --silent", redis: "redis-cli ping", mongodb: "mongosh --quiet --eval 'db.runCommand({ping:1})'" };

/** A readiness check: the compose healthcheck run inside the container, the type's own probe, or the published port. */
function checkFor(type: string, port: number | undefined, file: string, svc: string, health: unknown): string {
  const test = Array.isArray(health) ? health : typeof health === "string" ? ["CMD-SHELL", health] : undefined;
  if (test && test[0] !== "NONE") {
    const cmd = test[0] === "CMD-SHELL" ? String(test[1]) : test.slice(test[0] === "CMD" ? 1 : 0).join(" ");
    if (!/\$\$|\|\|/.test(cmd)) return composeCmd(file, "exec -T", `${svc} ${cmd}`);
  }
  if (IN_CONTAINER[type]) return composeCmd(file, "exec -T", `${svc} ${IN_CONTAINER[type]}`);
  if (port) return `nc -z 127.0.0.1 ${port}`;
  return composeCmd(file, "exec -T", `${svc} true`);
}

function scanCompose(root: string, w: Walk, out: ScanResult) {
  const files = w.files.filter((f) => /(^|\/)(docker-)?compose[\w.-]*\.ya?ml$/.test(f) && f.split("/").length <= 3);
  const seen = new Map<string, InfraFact | ContainerFact>();
  const bases = new Map<InfraFact, { base: string; health: unknown }>();
  for (const f of files.sort((a, b) => a.length - b.length)) {
    const text = read(path.join(root, f));
    let doc: any;
    try {
      doc = parseYaml(text);
    } catch {
      continue;
    }
    const base = files.find((x) => dirOf(x) === dirOf(f) && /(^|\/)(docker-)?compose\.ya?ml$/.test(x)) ?? f;
    for (const [svc, def] of Object.entries<any>(doc?.services ?? {})) {
      const line = lineOf(text, new RegExp(`^\\s+["']?${svc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']?:\\s*$`));
      const ev = at(f, line);
      const ports = (def?.ports ?? []).map((p: unknown) => (typeof p === "object" && p ? `${(p as any).published}:${(p as any).target}` : String(p)));
      const envs = Array.isArray(def?.environment) ? def.environment.map((e: string) => String(e).split("=")[0]) : Object.keys(def?.environment ?? {});
      for (const e of envs) addEnv(out, e, "compose", ev);
      for (const m of JSON.stringify(def ?? {}).matchAll(/\$\{([A-Za-z_]\w*)/g)) if (m[1] !== "DOCKER_REGISTRY") addEnv(out, m[1], "compose", ev);
      if (Array.isArray(def?.volumes) && def.volumes.some((v: unknown) => /docker-entrypoint-initdb\.d/.test(String(typeof v === "object" ? (v as any)?.target : v))))
        out.data.push({ kind: "sql-init", path: String(def.volumes.find((v: unknown) => /docker-entrypoint-initdb\.d/.test(String(typeof v === "object" ? (v as any)?.target : v)))).split(":")[0], confidence: "high", evidence: [ev] });
      const prev = seen.get(svc);
      if (prev) {
        prev.evidence.push(ev);
        for (const p of ports) if (!prev.ports?.includes(p)) prev.ports?.push(p);
        continue;
      }
      const image = typeof def?.image === "string" ? def.image : undefined;
      if (def?.build) {
        const build = typeof def.build === "string" ? def.build : [def.build.context, def.build.dockerfile].filter(Boolean).join(" ");
        const c: ContainerFact = { name: svc, file: base, build, ports, dependsOn: Array.isArray(def.depends_on) ? def.depends_on : Object.keys(def.depends_on ?? {}), start: composeCmd(base, "up --build", svc), confidence: "medium", evidence: [ev] };
        out.containers.push(c);
        seen.set(svc, c);
        if (typeof def.command === "string") addCommand(out, { role: "start", cmd: def.command, cwd: ".", source: "compose", confidence: "medium", evidence: [ev] });
        continue;
      }
      const type = image ? (INFRA_IMAGES.find(([re]) => re.test(image))?.[1] ?? "other") : "other";
      const inf: InfraFact = { name: svc, type, source: "compose", image, ports, start: composeCmd(base, "up -d", svc), stop: composeCmd(base, "stop", svc), check: "", confidence: type === "other" ? "low" : "high", evidence: [ev] };
      out.infrastructure.push(inf);
      seen.set(svc, inf);
      bases.set(inf, { base, health: def?.healthcheck?.test });
    }
  }
  for (const [i, b] of bases) i.check = checkFor(i.type, hostPort(i.ports ?? []), b.base, i.name, b.health);
  for (const c of out.containers) {
    const p = hostPort(c.ports);
    if (p) out.urls.push({ url: `http://localhost:${p}`, for: `compose service ${c.name}`, confidence: "medium", evidence: c.evidence.slice(-1) });
  }
}

const DOC_CMD = /^(npm|pnpm|yarn|bun|npx|pip|poetry|uv|python3?|dotnet|docker|docker-compose|make|go|cargo|mvn|\.\/mvnw|gradle|\.\/gradlew|bundle|rails|php|composer|flask|uvicorn|pytest|ruff|\.?venv\/bin\/\S+|\.\/\S+|scripts\/\S+)(\s|$)/;
const AGENT_DOC = /(^|\/)(CLAUDE|AGENTS|GEMINI)\.md$|^\.github\/copilot-instructions\.md$|^\.(cursorrules|windsurfrules)$|^\.cursor\/rules\/[^/]+\.mdc?$/;

function docCommands(out: ScanResult, f: string, text: string, o: { source: CommandSource; confidence: Confidence; cwd: string; inline: boolean }) {
  let inBlock = false;
  text.split("\n").forEach((l, i) => {
    if (/^\s*(```|~~~)/.test(l)) {
      inBlock = !inBlock;
      return;
    }
    const found = inBlock ? [l.replace(/^\s*[$>]\s*/, "").replace(/\s+#\s.*$/, "").trim()] : o.inline ? [...l.matchAll(/`([^`]+)`/g)].map((m) => m[1].trim()) : [];
    for (const cmd of found) if (DOC_CMD.test(cmd)) addCommand(out, { cmd, cwd: o.cwd, source: o.source, confidence: o.confidence, evidence: [at(f, i + 1)] });
  });
}

function scanReadme(root: string, w: Walk, out: ScanResult) {
  for (const f of w.files.filter((x) => /^(README|CONTRIBUTING|DEVELOPMENT)\.(md|rst)$|^docs\/development\.md$/i.test(x))) {
    const text = read(path.join(root, f));
    if (text) docCommands(out, f, text, { source: "readme", confidence: "low", cwd: ".", inline: false });
  }
}

/** Instruction files written for coding agents (CLAUDE.md, AGENTS.md, ...): usually the most current run and test commands. */
function scanAgentDocs(root: string, w: Walk, out: ScanResult) {
  for (const f of w.files.filter((x) => AGENT_DOC.test(x))) {
    const text = read(path.join(root, f));
    const dir = path.dirname(f);
    if (text) docCommands(out, f, text, { source: "agent-docs", confidence: "medium", cwd: /^\.(github|cursor)/.test(dir) ? "." : dir, inline: true });
  }
}

function addEnv(out: ScanResult, name: string, by: EnvFact["readBy"][number], ev: string, secret = false, envName?: string) {
  if (!name || ENV_NOISE.test(name)) return;
  let e = out.env.find((x) => x.name === name);
  if (!e) {
    const s = secret ? "high" : secretness(name);
    e = { name, envName, secret: !!s && s !== "low", readBy: [], confidence: s ?? "high", evidence: [], ...(TEST_USER.test(name) ? { testUser: true } : {}) };
    out.env.push(e);
  }
  if (secret && !e.secret) {
    e.secret = true;
    e.confidence = "high";
  }
  if (!e.readBy.includes(by)) e.readBy.push(by);
  if (e.evidence.length < 4 && !e.evidence.includes(ev)) e.evidence.push(ev);
}

function infraFromValue(value: string): string | undefined {
  const v = value.trim().replace(/^["']|["']$/g, "");
  return URL_SCHEMES.find(([re]) => re.test(v))?.[1];
}

function hostOf(value: string): string | undefined {
  const v = value.trim().replace(/^["']|["']$/g, "");
  const m = /^\w[\w+.-]*:\/\/(?:[^@/]*@)?([^/:?,]+)(?::(\d+))?/.exec(v) ?? /(?:Server|Host|Data Source)=(?:tcp:)?([^;,]+)(?:,(\d+))?/i.exec(v);
  return m ? `${m[1]}${m[2] ? `:${m[2]}` : ""}` : undefined;
}
const isLocal = (h: string | undefined) => !h || /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\(localdb\)|\.|db|postgres|mysql|redis|mongo\w*|sqlserver|host\.docker\.internal)(\\|:|$)/i.test(h);

function scanEnvExamples(root: string, w: Walk, out: ScanResult) {
  for (const f of w.files.filter((x) => EXAMPLE_ENV.test(x))) {
    const text = read(path.join(root, f));
    text.split("\n").forEach((l, i) => {
      const m = /^\s*(?:export\s+)?([A-Za-z_][\w.]*)\s*=\s*(.*)$/.exec(l);
      if (!m) return;
      const ev = at(f, i + 1);
      addEnv(out, m[1], "example", ev);
      const e = out.env.find((x) => x.name === m[1]);
      const value = m[2].replace(/\s+#.*$/, "").trim();
      if (e && value && !/^["']?(changeme|change_me|your[-_\w]*|xxx+|<[^>]*>|\.\.\.|todo|replace[-_\w]*)["']?$/i.test(value)) e.exampleValue = true;
      const type = infraFromValue(value);
      if (type) {
        const host = hostOf(value);
        out.infrastructure.push({ name: m[1], type, source: "env", host, confidence: isLocal(host) ? "high" : "medium", evidence: [ev] });
      }
    });
  }
}

function scanAppSettings(root: string, w: Walk, out: ScanResult) {
  for (const f of w.files.filter((x) => /(^|\/)appsettings(\.[\w-]+)?\.json$/.test(x) && !isTestPath(x.replace(/\.json$/, ".cs")))) {
    const text = read(path.join(root, f)).replace(/^\uFEFF/, "");
    let doc: any;
    try {
      doc = JSON.parse(text);
    } catch {
      continue;
    }
    for (const [k, v] of Object.entries<any>(doc?.ConnectionStrings ?? {})) {
      const type = typeof v === "string" ? (infraFromValue(v) ?? (/Initial Catalog|Database=/i.test(v) ? "sqlserver" : undefined)) : undefined;
      const ev = at(f, lineOf(text, `"${k}"`));
      addEnv(out, `ConnectionStrings:${k}`, "app", ev, false, `ConnectionStrings__${k}`);
      if (type) out.infrastructure.push({ name: `ConnectionStrings:${k}`, type, source: "appsettings", host: hostOf(v), confidence: "medium", evidence: [ev] });
    }
  }
  for (const f of w.files.filter((x) => /(^|\/)Properties\/launchSettings\.json$/.test(x))) {
    const text = read(path.join(root, f)).replace(/^\uFEFF/, "");
    let doc: any;
    try {
      doc = JSON.parse(text);
    } catch {
      continue;
    }
    const project = f.split("/").slice(-3, -2)[0] ?? f;
    for (const [name, p] of Object.entries<any>(doc?.profiles ?? {})) {
      if (p?.commandName !== "Project" || typeof p.applicationUrl !== "string") continue;
      for (const url of p.applicationUrl.split(";")) out.urls.push({ url, for: `${project} (launch profile ${name})`, confidence: "medium", evidence: [at(f, lineOf(text, `"${name}"`))] });
    }
  }
}

const HEALTH_ROUTE = /\bMapHealthChecks\(\s*"([^"]+)"|(?:@\w+\.|\b(?:app|router|server|api|fastify|r|mux|e|g)\.)(?:get|route|api_route|MapGet|HandleFunc|Handle|GET|add_api_route)\(\s*["'](\/?[\w/-]+)["']|\bMapGet\(\s*"(\/?[\w/-]+)"|@(?:Get|Request)Mapping\(\s*(?:value\s*=\s*)?"(\/?[\w/-]+)"/g;
const HEALTH_PATH = /(^|\/|_)(health\w*|ready\w*|livez?|alive|ping)$/i;
const USER_NAME = /(user|admin|login|account|manager|tester)\w*\s*[:=]/i;
const EMAIL = /["'`]([\w.+-]+@[\w-]+(?:\.[\w-]+)+)["'`]/g;
const SEED_PATH = /(^|\/)(seeds?|seeders|seeding)(\/|$)|(^|\/)[\w.-]*seed[\w.-]*\.\w+$/i;

function scanSources(root: string, w: Walk, out: ScanResult) {
  const dirs = out.testProjects
    .filter((t) => t.status !== "excluded")
    .flatMap((t) => {
      const p = t.path.replace(/ \(.*\)$/, "");
      return p !== "." && !/\.\w+$/.test(p) ? [p] : t.evidence.slice(1).map((e) => dirOf(e.replace(/:\d+.*$/, "")));
    });
  const functionalDir = (f: string) => !/(^|\/)unit(s|tests?)?\//i.test(f) && dirs.some((d) => d === "." || f.startsWith(`${d}/`));
  const sources = w.files.filter((f) => SOURCE_EXT.test(f) && !/\.min\.js$|\.d\.ts$|(^|\/)(migrations?|wwwroot|static|public|assets)\//i.test(f)).slice(0, MAX_SOURCES);
  for (const f of sources) {
    const text = read(path.join(root, f));
    if (!text || text.length > MAX_BYTES) continue;
    const test = isTestPath(f) || /(^|\/)(tests?|e2e|spec|__tests__|testing)\//i.test(f);
    for (const r of ENV_READS) {
      if (!r.exts.test(f)) continue;
      for (const m of text.matchAll(r.re)) {
        const lineStart = text.lastIndexOf("\n", m.index!) + 1;
        if (/^\s*(\/\/|#|\*|--)/.test(text.slice(lineStart, m.index!))) continue;
        let name = m.slice(1).find(Boolean)!;
        let envName: string | undefined;
        if (r.config) {
          if (/GetConnectionString/.test(m[0])) name = `ConnectionStrings:${name}`;
          envName = name.includes(":") || name.includes(".") ? name.replace(/[:.]/g, "__") : undefined;
          if (/\.java$|\.kt$/.test(f)) envName = name.replace(/[.-]/g, "_").toUpperCase();
        }
        addEnv(out, name, test ? "tests" : "app", at(f, lineAt(text, m.index!)), false, envName);
      }
    }
    if (!test) {
      for (const m of text.matchAll(HEALTH_ROUTE)) {
        const p = `/${(m[1] ?? m[2] ?? m[3] ?? m[4]).replace(/^\//, "")}`;
        if (!HEALTH_PATH.test(p)) continue;
        if (!out.health.some((h) => h.path === p)) out.health.push({ path: p, confidence: "high", evidence: [at(f, lineAt(text, m.index!))] });
      }
    }
    const seed = SEED_PATH.test(f) && !test;
    const lines = text.split("\n");
    for (const m of text.matchAll(EMAIL)) {
      const ln = lineAt(text, m.index!);
      const line = lines[ln - 1] ?? "";
      if (/^\s*(\/\/|#|\*|--)/.test(line)) continue;
      const named = USER_NAME.test(line);
      const near = lines.slice(Math.max(0, ln - 4), ln + 3).some((l) => /password|log\s?in|sign\s?in|credential/i.test(l));
      const confidence: Confidence | undefined = seed ? "high" : !test && named ? "medium" : test && functionalDir(f) && (named || near) ? "low" : undefined;
      if (!confidence || out.data.some((d) => d.kind === "user" && d.login === m[1])) continue;
      if (out.data.filter((d) => d.kind === "user").length >= 12) break;
      out.data.push({ kind: "user", path: f, login: m[1], confidence, evidence: [at(f, ln)] });
    }
  }
}

function scanData(root: string, w: Walk, out: ScanResult) {
  const dirs = new Map<string, { kind: DataFact["kind"]; n: number; first: string }>();
  for (const f of w.files) {
    if (/(^|\/)node_modules\//.test(f)) continue;
    let kind: DataFact["kind"] | undefined;
    let key = "";
    const mig = /^(.*?(?:^|\/)(?:migrations|alembic\/versions|db\/migrate|Migrations))\//i.exec(f);
    const fix = /^(.*?(?:^|\/)(?:fixtures|testdata\/fixtures|test-data|seed-data))\//i.exec(f);
    if (mig) [kind, key] = ["migrations", mig[1]];
    else if (fix) [kind, key] = ["fixtures", fix[1]];
    else if (SEED_PATH.test(f) && /\.(\w+)$/.test(f) && !/\.(md|txt|lock)$/.test(f) && !isTestPath(f)) [kind, key] = ["seed", f];
    if (!kind) continue;
    const d = dirs.get(key) ?? dirs.set(key, { kind, n: 0, first: f }).get(key)!;
    d.n++;
  }
  for (const [p, d] of [...dirs].slice(0, 25)) out.data.push({ kind: d.kind, path: p, confidence: d.kind === "seed" ? "medium" : "high", evidence: [d.n > 1 ? `${p}/ (${d.n} files)` : d.first] });
}

function addFramework(out: ScanResult, f: FrameworkFact) {
  const same = out.frameworks.find((x) => x.name === f.name && x.role === f.role);
  if (same) {
    if (same.evidence.length < 3 && !same.evidence.includes(f.evidence[0])) same.evidence.push(f.evidence[0]);
    return;
  }
  out.frameworks.push(f);
}

function dep(out: ScanResult, name: string, ev: string, version?: string) {
  const fw = FRAMEWORKS.find(([re]) => re.test(name));
  if (fw) addFramework(out, { name, role: fw[2], version, confidence: "high", evidence: [ev] });
  const db = DB_DRIVERS.find(([re]) => re.test(name));
  if (db && !out.infrastructure.some((i) => i.source === "dependency" && i.type === db[1])) out.infrastructure.push({ name: db[1], type: db[1], source: "dependency", confidence: "low", evidence: [`${ev} ${name}`] });
}

function scanManifests(root: string, w: Walk, out: ScanResult) {
  for (const f of w.files) {
    const base = path.posix.basename(f);
    if (base === "package.json" && f.split("/").length <= 4) {
      const text = read(path.join(root, f));
      try {
        const doc = JSON.parse(text);
        for (const [n, v] of Object.entries<any>({ ...doc.dependencies, ...doc.devDependencies })) dep(out, n, at(f, lineOf(text, `"${n}"`)), String(v));
        if (doc.engines?.node) addFramework(out, { name: "node", role: "toolchain", version: String(doc.engines.node), confidence: "high", evidence: [at(f, lineOf(text, '"node"'))] });
      } catch {
        /* unreadable package.json */
      }
    } else if (/^requirements[\w.-]*\.txt$|^pyproject\.toml$|^Pipfile$|^setup\.cfg$/.test(base)) {
      const text = read(path.join(root, f));
      text.split("\n").forEach((l, i) => {
        const m = /^\s*["']?([A-Za-z][\w.-]*)(?:\[[\w,]+\])?\s*(?:[=<>~!]=?|["',]|$)/.exec(l);
        if (m && !/^(name|version|description|requires|python|readme|license|authors?|dependencies|packages)$/i.test(m[1])) dep(out, m[1].toLowerCase(), at(f, i + 1));
      });
      const py = /requires-python\s*=\s*["']([^"']+)/.exec(text);
      if (py) addFramework(out, { name: "python", role: "toolchain", version: py[1], confidence: "high", evidence: [at(f, lineOf(text, "requires-python"))] });
    } else if (/\.(csproj|fsproj)$/.test(base)) {
      const text = read(path.join(root, f));
      const sdk = /Sdk="(Microsoft\.NET\.Sdk\.\w+|Aspire\.AppHost\.Sdk[^"]*)"/.exec(text);
      if (sdk) addFramework(out, { name: sdk[1].replace(/\/.*$/, ""), role: "app", confidence: "high", evidence: [at(f, lineAt(text, sdk.index))] });
      for (const m of text.matchAll(/<PackageReference\s+Include="([^"]+)"/g)) dep(out, m[1], at(f, lineAt(text, m.index!)));
    } else if (base === "global.json") {
      const text = read(path.join(root, f));
      const v = /"version"\s*:\s*"([^"]+)"/.exec(text);
      if (v) addFramework(out, { name: "dotnet", role: "toolchain", version: v[1], confidence: "high", evidence: [at(f, lineAt(text, v.index))] });
    } else if (base === "pom.xml" || /^build\.gradle(\.kts)?$/.test(base)) {
      const text = read(path.join(root, f));
      for (const [re, n, role] of [[/spring-boot/, "spring-boot", "app"], [/quarkus/, "quarkus", "app"], [/micronaut/, "micronaut", "app"], [/junit-jupiter|junit/, "junit", "test"], [/testcontainers/, "testcontainers", "test"], [/rest-assured/, "rest-assured", "test"], [/selenium/, "selenium", "test"], [/postgresql/, "org.postgresql", ""], [/mysql-connector/, "mysql-connector-j", ""]] as const) {
        const i = text.search(re);
        if (i < 0) continue;
        if (role) addFramework(out, { name: n, role, confidence: "high", evidence: [at(f, lineAt(text, i))] });
        else dep(out, n, at(f, lineAt(text, i)));
      }
    } else if (base === "Gemfile" || base === "composer.json" || base === "go.mod" || base === "Cargo.toml") {
      const text = read(path.join(root, f));
      const re = base === "Gemfile" ? /^\s*gem\s+["']([\w-]+)/gm : base === "composer.json" ? /"([\w-]+\/[\w-]+)"\s*:/g : base === "go.mod" ? /^\s*(?:require\s+)?([\w.-]+\/[\w./-]+)\s+v/gm : /^([\w-]+)\s*=/gm;
      for (const m of text.matchAll(re)) dep(out, m[1], at(f, lineAt(text, m.index!)));
    }
  }
}

function dedupe(out: ScanResult) {
  const seen = new Set<string>();
  const infra: InfraFact[] = [];
  for (const i of out.infrastructure) {
    if (i.source === "dependency" && out.infrastructure.some((o) => o.source !== "dependency" && o.type === i.type)) continue;
    const same = infra.find((o) => o.source === i.source && o.name === i.name && o.type === i.type);
    if (same) same.evidence.push(...i.evidence.filter((e) => !same.evidence.includes(e)));
    else infra.push(i);
  }
  out.infrastructure = infra;
  for (const h of out.health) {
    const file = h.evidence[0].replace(/:\d+$/, "");
    const svc = out.services.find((s) => s.evidence?.[0] && file.startsWith(`${dirOf(s.evidence[0])}/`));
    if (svc) h.for = svc.name;
  }
  out.adapters = [...new Set(out.testProjects.filter((t) => t.status !== "excluded").map((t) => t.adapter))];
  out.urls = out.urls.filter((u) => !seen.has(u.url) && seen.add(u.url));
  out.env.sort((a, b) => Number(b.secret) - Number(a.secret) || a.name.localeCompare(b.name));
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** What an existing .witness/witness.toml covers of the scan, marking each covered fact with its config entry. */
function existingConfig(root: string, out: ScanResult): ConfigFact | null {
  const file = path.join(root, ".witness", "witness.toml");
  if (!fs.existsSync(file)) return null;
  const text = read(file);
  const rel = path.relative(root, file);
  const rendered = /^#.*\bmorph\b/i.test(text.split("\n")[0] ?? "");
  let cfg: Config;
  try {
    cfg = loadConfig(file);
  } catch (e) {
    if (!(e instanceof ConfigError)) throw e;
    const all = out.testProjects.filter((t) => t.status !== "excluded").map((t) => t.path);
    return { file: rel, rendered, error: e.message, suites: [], services: [], dependencies: [], required: [], missing: { testProjects: all, infrastructure: out.infrastructure.map((i) => i.name), secrets: out.env.filter((x) => x.secret).map((x) => x.name) }, unmatched: { suites: [], dependencies: [] } };
  }
  const comments = text.split("\n").map((l) => /(?:^|\s)#(.*)$/.exec(l)?.[1] ?? "").join("\n");
  const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const named = (x: string) => new RegExp(`(^|[^\\w:./-])${esc(x)}($|[^\\w/-])`, "m").test(comments);
  const matched = new Set<string>();
  for (const t of out.testProjects) {
    if (t.status === "excluded") continue;
    const proj = t.evidence[0]?.replace(/:\d+.*$/, "");
    const s = cfg.suites.find((x) => (proj && x.cmd.includes(proj)) || (x.adapter === t.adapter && path.posix.normalize(x.cwd) === path.posix.normalize(t.suite?.cwd ?? ".") && (x.cmd.includes(t.path) || t.suite?.cwd !== "." || cfg.suites.filter((y) => y.adapter === t.adapter).length === 1)));
    if (s) {
      t.configured = s.name;
      matched.add(s.name);
    } else if (named(t.path)) t.configured = "comment";
  }
  for (const svc of out.services) {
    const s = cfg.services.find((x) => norm(x.name) === norm(svc.name) || (svc.evidence?.[0] && (x.start ?? "").includes(svc.evidence[0])));
    if (s) svc.configured = s.name;
  }
  const depMatched = new Set<string>();
  for (const i of out.infrastructure) {
    const d = cfg.dependencies.find((x) => norm(x.name) === norm(i.name) || norm(x.name) === norm(i.type) || [x.start, x.check].some((c) => c && new RegExp(`\\b${i.name.replace(/[.*+?^${}()|[\]\\:]/g, "\\$&")}\\b`).test(c)));
    if (d) {
      i.configured = d.name;
      depMatched.add(d.name);
    } else if (named(i.name)) i.configured = "comment";
  }
  const envFile = cfg.envFile ? parseEnvFile(read(path.resolve(root, cfg.envFile))) : {};
  const given: [string, Set<string>][] = [
    ["required", new Set(cfg.required)],
    ["env file", new Set(Object.keys(envFile))],
    ["env", new Set([...cfg.services.flatMap((s) => Object.keys(s.env)), ...cfg.suites.flatMap((s) => Object.keys(s.env))])],
  ];
  for (const e of out.env) {
    const names = [e.name, e.envName].filter(Boolean) as string[];
    e.configured = given.find(([, set]) => names.some((n) => set.has(n)))?.[0] ?? (names.some(named) ? "comment" : undefined);
  }
  const decided = (i: InfraFact) => !!i.configured || ((i.source === "env" || i.source === "appsettings") && out.infrastructure.some((o) => o.configured && o.type === i.type));
  const missingInfra = out.infrastructure.filter((i) => !decided(i) && i.source !== "dependency" && i.source !== "ci" && i.type !== "telemetry");
  const coveredStore = (name: string) => out.infrastructure.some((i) => i.name === name && decided(i));
  return {
    file: rel,
    rendered,
    suites: cfg.suites.map((s) => s.name),
    services: cfg.services.map((s) => s.name),
    dependencies: cfg.dependencies.map((d) => d.name),
    required: cfg.required,
    missing: {
      testProjects: out.testProjects.filter((t) => t.status !== "excluded" && !t.configured).map((t) => t.path),
      infrastructure: missingInfra.map((i) => i.name),
      secrets: out.env.filter((e) => e.secret && !e.configured && e.readBy.some((r) => r !== "ci") && !coveredStore(e.name)).map((e) => e.name),
    },
    unmatched: { suites: cfg.suites.filter((s) => !matched.has(s.name)).map((s) => s.name), dependencies: cfg.dependencies.filter((d) => !depMatched.has(d.name)).map((d) => d.name) },
  };
}

/** `witness init --scan`: print the facts as JSON on stdout and a one-line summary on stderr. */
export function scanCommand(root: string): number {
  const r = scan(root);
  process.stdout.write(JSON.stringify(r, null, 2) + "\n");
  const n = (xs: unknown[]) => xs.length;
  const fn = r.testProjects.filter((t) => t.status === "functional").length;
  process.stderr.write(
    `witness  scan: ${fn} functional test project(s), ${r.testProjects.filter((t) => t.status === "needs-filter").length} needing a filter, ${r.testProjects.filter((t) => t.status === "excluded").length} excluded; ${n(r.commands)} command(s), ${n(r.infrastructure)} infrastructure, ${r.env.filter((e) => e.secret).length} secret(s) of ${n(r.env)} env name(s)${r.config ? `; config ${r.config.file}${r.config.error ? " (invalid)" : ""}` : "; no config yet"}. Nothing written.\n`,
  );
  return 0;
}
