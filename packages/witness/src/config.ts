import * as fs from "node:fs";
import * as path from "node:path";
import { parse as parseToml } from "smol-toml";
import { ADAPTERS, type AdapterName } from "./adapters.ts";
import { parseDuration } from "./util.ts";

export interface Ready {
  http?: string;
  cmd?: string;
  status?: number;
  timeoutMs: number;
}

export interface Dependency {
  name: string;
  check?: string;
  checkHttp?: string;
  start?: string;
  stop?: string;
  timeoutMs: number;
}

export interface Service {
  name: string;
  cwd: string;
  setup?: string;
  start?: string;
  stop?: string;
  pidfile?: string;
  ports?: [number, number];
  ready?: Ready;
  env: Record<string, string>;
  dependsOn: string[];
  external?: string;
  role: "target" | "origin";
  originFor?: string;
}

export const KINDS = ["api", "ui", "cli", "desktop", "mobile"] as const;
export type Kind = (typeof KINDS)[number];

export const KIND_HELP = 'set kind = "api" for tests that drive the app over HTTP (in the test process or at its URL), "ui" for tests that drive it in a browser, "cli" for tests that run its built binary or command and check the output, exit code or files, "desktop" for a desktop app driven through its window (Electron, WinAppDriver, pywinauto, TestFX), or "mobile" for an app on a device or emulator (Appium, Detox, Espresso, XCUITest, Maestro, Flutter integration_test). Unit and integration tests don\'t belong in Witness: the project\'s own build and test scripts run them';

export interface Suite {
  name: string;
  kind: Kind;
  /** undefined: every target service must be up. */
  services?: string[];
  adapter: AdapterName;
  cwd: string;
  cmd: string;
  timeoutMs: number;
  perTestTimeoutMs?: number;
  /** Runner args for the per-test timeout when the adapter has no flag: `{s}` seconds, `{ms}` milliseconds. */
  perTestTimeoutArg?: string;
  report?: string;
  select?: string;
  list?: ListTemplate;
  env: Record<string, string>;
}

export type ListFormat = "lines" | "report" | "adapter";

export interface ListTemplate {
  cmd: string;
  /** lines: one id per line; report: the command writes a report (to $WITNESS_REPORT_DIR or `report`); adapter: the adapter's own list parser. */
  format: ListFormat;
  report?: string;
}

export type ServiceOverride = Partial<Pick<Service, "cwd" | "setup" | "start" | "stop" | "pidfile" | "ports" | "ready" | "env" | "dependsOn" | "external">>;

/** How to get the app that `--against` compares with: this repo at another ref, or another repo. */
export interface Reference {
  ref?: string;
  /** A path (relative to the config root) or a git URL; unset: this repo. */
  repo?: string;
  /** Runs once in the reference checkout before its services. */
  setup?: string;
  setupTimeoutMs: number;
  /** Where the suites' test code comes from: the reference checkout, or this checkout pointed at the reference services. */
  tests: "reference" | "target";
  /** Per target service; unset keys come from the target's service. `env` is merged. */
  services: Record<string, ServiceOverride>;
}

export interface Config {
  version: 1;
  root: string;
  file: string;
  envFile?: string;
  required: string[];
  dependencies: Dependency[];
  services: Service[];
  suites: Suite[];
  reference?: Reference;
  run: { stallMs: number; heartbeatMs: number; keepRuns: number; graceMs: number };
}

export class ConfigError extends Error {
  key: string;
  constructor(key: string, message: string) {
    super(key ? `${key}: ${message}` : message);
    this.key = key;
  }
}

const NAME = /^[A-Za-z][\w-]*$/;

const KEYS = {
  top: ["version", "env", "dependency", "service", "suite", "reference", "run"],
  reference: ["ref", "repo", "setup", "setup_timeout", "tests", "service"],
  override: ["cwd", "setup", "start", "stop", "pidfile", "ports", "ready", "env", "depends_on", "external"],
  env: ["file", "required"],
  dependency: ["name", "check", "check_http", "start", "stop", "timeout"],
  service: ["name", "cwd", "setup", "start", "stop", "pidfile", "ports", "ready", "env", "depends_on", "external", "role", "origin_for"],
  ready: ["http", "cmd", "status", "timeout"],
  suite: ["name", "kind", "service", "adapter", "cwd", "cmd", "timeout", "per_test_timeout", "per_test_timeout_arg", "report", "select", "list", "env"],
  list: ["cmd", "format", "report"],
  run: ["stall_timeout", "heartbeat", "keep_runs", "kill_grace"],
};

export function closest(word: string, options: string[]): string | undefined {
  let best: string | undefined;
  let bestD = 3;
  for (const o of options) {
    const d = editDistance(word, o);
    if (d < bestD) {
      bestD = d;
      best = o;
    }
  }
  return best;
}

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

type Obj = Record<string, unknown>;

function checkKeys(obj: Obj, allowed: string[], where: string) {
  for (const k of Object.keys(obj)) {
    if (!allowed.includes(k)) {
      const hint = closest(k, allowed);
      throw new ConfigError(where ? `${where}.${k}` : k, `unknown key${hint ? ` (did you mean "${hint}"?)` : ""}`);
    }
  }
}

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v) && !(v instanceof Date);

function str(o: Obj, k: string, where: string, required = false): string | undefined {
  const v = o[k];
  if (v === undefined || v === "") {
    if (required) throw new ConfigError(`${where}.${k}`, "is required");
    return undefined;
  }
  if (typeof v !== "string") throw new ConfigError(`${where}.${k}`, `expected a string, got ${typeof v}`);
  return v;
}

function dur(o: Obj, k: string, where: string, dflt?: number): number | undefined {
  const v = o[k];
  if (v === undefined) return dflt;
  const ms = parseDuration(v);
  if (ms == null) throw new ConfigError(`${where}.${k}`, `expected a duration like "30s", "5m" or "250ms", got ${JSON.stringify(v)}`);
  return ms;
}

function strMap(o: Obj, k: string, where: string): Record<string, string> {
  const v = o[k];
  if (v === undefined) return {};
  if (!isObj(v)) throw new ConfigError(`${where}.${k}`, "expected a table of strings");
  const out: Record<string, string> = {};
  for (const [kk, vv] of Object.entries(v)) {
    if (typeof vv === "string") out[kk] = vv;
    else if (typeof vv === "number" || typeof vv === "boolean") out[kk] = String(vv);
    else throw new ConfigError(`${where}.${k}.${kk}`, "expected a string");
  }
  return out;
}

function strList(o: Obj, k: string, where: string): string[] {
  const v = o[k];
  if (v === undefined || v === "") return [];
  if (typeof v === "string") return [v];
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) throw new ConfigError(`${where}.${k}`, "expected a list of strings");
  return v as string[];
}

function tables(doc: Obj, k: string): Obj[] {
  const v = doc[k];
  if (v === undefined) return [];
  if (!Array.isArray(v)) throw new ConfigError(k, `expected [[${k}]] tables`);
  return v.map((x, i) => {
    if (!isObj(x)) throw new ConfigError(`${k}[${i}]`, "expected a table");
    return x;
  });
}

function parseReady(r: unknown, where: string): Ready | undefined {
  if (r === undefined) return undefined;
  if (!isObj(r)) throw new ConfigError(where, "expected { http = ... } or { cmd = ... }");
  checkKeys(r, KEYS.ready, where);
  const ready: Ready = { http: str(r, "http", where), cmd: str(r, "cmd", where), status: typeof r.status === "number" ? r.status : undefined, timeoutMs: dur(r, "timeout", where, 120_000)! };
  if (!ready.http === !ready.cmd) throw new ConfigError(where, "set exactly one of http or cmd");
  if (r.status !== undefined && typeof r.status !== "number") throw new ConfigError(`${where}.status`, "expected a number");
  return ready;
}

function parseReference(v: unknown): Reference | undefined {
  if (v === undefined) return undefined;
  if (!isObj(v)) throw new ConfigError("reference", "expected a table");
  checkKeys(v, KEYS.reference, "reference");
  const svcT = v.service ?? {};
  if (!isObj(svcT)) throw new ConfigError("reference.service", "expected [reference.service.<name>] tables");
  const services: Record<string, ServiceOverride> = {};
  for (const [name, o] of Object.entries(svcT)) {
    const where = `reference.service.${name}`;
    if (!isObj(o)) throw new ConfigError(where, "expected a table");
    checkKeys(o, KEYS.override, where);
    const ov: ServiceOverride = {};
    for (const k of ["cwd", "setup", "start", "stop", "pidfile", "external"] as const) if (o[k] !== undefined) ov[k] = str(o, k, where);
    if (o.ports !== undefined) ov.ports = parsePorts(o.ports, where);
    if (o.ready !== undefined) ov.ready = parseReady(o.ready, `${where}.ready`);
    if (o.env !== undefined) ov.env = strMap(o, "env", where);
    if (o.depends_on !== undefined) ov.dependsOn = strList(o, "depends_on", where);
    if (ov.external && !/^https?:\/\//.test(ov.external)) throw new ConfigError(`${where}.external`, "expected an http(s) URL");
    services[name] = ov;
  }
  const ref = str(v, "ref", "reference");
  const repo = str(v, "repo", "reference");
  const tests = str(v, "tests", "reference") ?? (repo || !ref ? "target" : "reference");
  if (tests !== "reference" && tests !== "target") throw new ConfigError("reference.tests", `expected "reference" (the reference checkout's tests) or "target" (this checkout's tests, run against the reference services), got "${tests}"`);
  if (!ref && !repo && !Object.keys(services).length) throw new ConfigError("reference", "needs ref (a branch, tag or commit), repo (another repo's path or git URL), or a [reference.service.<name>] override");
  return { ref, repo, setup: str(v, "setup", "reference"), setupTimeoutMs: dur(v, "setup_timeout", "reference", 30 * 60_000)!, tests, services };
}

function parsePorts(v: unknown, where: string): [number, number] | undefined {
  if (v === undefined || v === "") return undefined;
  const s = typeof v === "number" ? String(v) : v;
  const m = typeof s === "string" ? /^(\d+)(?:\s*-\s*(\d+))?$/.exec(s.trim()) : null;
  if (!m) throw new ConfigError(`${where}.ports`, `expected a port or range like "3000-3005", got ${JSON.stringify(v)}`);
  const lo = Number(m[1]);
  const hi = Number(m[2] ?? m[1]);
  if (lo < 1 || hi > 65535 || lo > hi) throw new ConfigError(`${where}.ports`, `invalid port range ${lo}-${hi}`);
  return [lo, hi];
}

/** Find `.witness/witness.toml` in dir or a parent. */
export function findConfig(start: string): string | null {
  let dir = path.resolve(start);
  for (;;) {
    const f = path.join(dir, ".witness", "witness.toml");
    if (fs.existsSync(f)) return f;
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

export function rootFor(configFile: string): string {
  const d = path.dirname(path.resolve(configFile));
  return path.basename(d) === ".witness" ? path.dirname(d) : d;
}

export function loadConfig(file: string): Config {
  if (!fs.existsSync(file)) throw new ConfigError("", `config not found: ${file} (run \`witness init\`)`);
  let doc: Obj;
  try {
    doc = parseToml(fs.readFileSync(file, "utf8")) as Obj;
  } catch (e) {
    const err = e as Error & { line?: number; column?: number };
    throw new ConfigError("", `${path.basename(file)} is not valid TOML${err.line ? ` (line ${err.line}, column ${err.column})` : ""}: ${err.message.split("\n")[0]}`);
  }
  return parseConfig(doc, file);
}

export function parseConfig(doc: Obj, file: string): Config {
  checkKeys(doc, KEYS.top, "");
  if (doc.version === undefined) throw new ConfigError("version", "is required (version = 1)");
  if (doc.version !== 1) throw new ConfigError("version", `unsupported version ${JSON.stringify(doc.version)}; this witness reads version 1`);
  const root = rootFor(file);

  const envT = doc.env === undefined ? {} : doc.env;
  if (!isObj(envT)) throw new ConfigError("env", "expected a table");
  checkKeys(envT, KEYS.env, "env");

  const dependencies: Dependency[] = tables(doc, "dependency").map((d, i) => {
    const where = `dependency[${i}]`;
    checkKeys(d, KEYS.dependency, where);
    const name = str(d, "name", where, true)!;
    const dep: Dependency = {
      name,
      check: str(d, "check", where),
      checkHttp: str(d, "check_http", where),
      start: str(d, "start", where),
      stop: str(d, "stop", where),
      timeoutMs: dur(d, "timeout", where, 60_000)!,
    };
    if (!dep.check && !dep.checkHttp) throw new ConfigError(`dependency[${i}]`, `"${name}" needs check or check_http`);
    return dep;
  });

  const services: Service[] = tables(doc, "service").map((s, i) => {
    let where = `service[${i}]`;
    checkKeys(s, KEYS.service, where);
    const name = str(s, "name", where, true)!;
    if (!NAME.test(name)) throw new ConfigError(`${where}.name`, `"${name}" must start with a letter and use only letters, digits, - and _`);
    where = `service.${name}`;
    const ready = parseReady(s.ready, `${where}.ready`);
    const role = str(s, "role", where) ?? "target";
    if (role !== "target" && role !== "origin") throw new ConfigError(`${where}.role`, `expected "target" or "origin", got "${role}"`);
    const svc: Service = {
      name,
      cwd: str(s, "cwd", where) ?? ".",
      setup: str(s, "setup", where),
      start: str(s, "start", where),
      stop: str(s, "stop", where),
      pidfile: str(s, "pidfile", where),
      ports: parsePorts(s.ports, where),
      ready,
      env: strMap(s, "env", where),
      dependsOn: strList(s, "depends_on", where),
      external: str(s, "external", where),
      role,
      originFor: str(s, "origin_for", where),
    };
    if (!svc.start && !svc.external) throw new ConfigError(where, "needs start (a command) or external (a URL)");
    if (svc.external && !/^https?:\/\//.test(svc.external)) throw new ConfigError(`${where}.external`, "expected an http(s) URL");
    if (!svc.ready && !svc.external) throw new ConfigError(`${where}.ready`, 'is required: a service counts as up only after its readiness check passes; set ready = { http = "${self.url}/health" } or ready = { cmd = "..." } (ready = { cmd = "true" } for a worker with nothing to probe)');
    return svc;
  });

  const suites: Suite[] = tables(doc, "suite").map((s, i) => {
    let where = `suite[${i}]`;
    checkKeys(s, KEYS.suite, where);
    const name = str(s, "name", where, true)!;
    if (!NAME.test(name)) throw new ConfigError(`${where}.name`, `"${name}" must start with a letter and use only letters, digits, - and _`);
    where = `suite.${name}`;
    const adapter = str(s, "adapter", where) ?? "generic";
    if (!(adapter in ADAPTERS)) throw new ConfigError(`${where}.adapter`, `unknown adapter "${adapter}"; one of ${Object.keys(ADAPTERS).join(", ")}`);
    const kind = str(s, "kind", where);
    if (!KINDS.includes(kind as Kind)) throw new ConfigError(`${where}.kind`, `${kind === undefined ? "is required" : `expected one of ${KINDS.map((k) => `"${k}"`).join(", ")}, got ${JSON.stringify(kind)}`}: ${KIND_HELP}`);
    const pttArg = str(s, "per_test_timeout_arg", where);
    if (pttArg && !/\{s\}|\{ms\}/.test(pttArg)) throw new ConfigError(`${where}.per_test_timeout_arg`, 'needs {s} or {ms} where the timeout goes, e.g. "-timeout {s}s"');
    return {
      name,
      kind: kind as Kind,
      perTestTimeoutArg: pttArg,
      list: parseList(s.list, `${where}.list`, adapter as AdapterName),
      services: s.service === undefined ? undefined : strList(s, "service", where),
      adapter: adapter as AdapterName,
      cwd: str(s, "cwd", where) ?? ".",
      cmd: str(s, "cmd", where, true)!,
      timeoutMs: dur(s, "timeout", where, 30 * 60_000)!,
      perTestTimeoutMs: dur(s, "per_test_timeout", where),
      report: str(s, "report", where),
      select: str(s, "select", where),
      env: strMap(s, "env", where),
    };
  });

  const runT = doc.run === undefined ? {} : doc.run;
  if (!isObj(runT)) throw new ConfigError("run", "expected a table");
  checkKeys(runT, KEYS.run, "run");
  const keepRuns = runT.keep_runs ?? 10;
  if (typeof keepRuns !== "number" || keepRuns < 1) throw new ConfigError("run.keep_runs", "expected a positive number");

  const cfg: Config = {
    version: 1,
    root,
    file: path.resolve(file),
    envFile: str(envT, "file", "env"),
    required: strList(envT, "required", "env"),
    dependencies,
    services,
    suites,
    reference: parseReference(doc.reference),
    run: {
      stallMs: dur(runT, "stall_timeout", "run", 5 * 60_000)!,
      heartbeatMs: dur(runT, "heartbeat", "run", 60_000)!,
      keepRuns,
      graceMs: dur(runT, "kill_grace", "run", 5_000)!,
    },
  };
  validateRefs(cfg);
  return cfg;
}

function parseList(v: unknown, where: string, adapter: AdapterName): ListTemplate | undefined {
  if (v === undefined || v === "") return undefined;
  const native = ADAPTERS[adapter].list?.parse ? "adapter" : "lines";
  if (typeof v === "string") return { cmd: v, format: native };
  if (!isObj(v)) throw new ConfigError(where, 'expected a command, or { cmd = "...", format = "lines" | "report" | "adapter" }');
  checkKeys(v, KEYS.list, where);
  const cmd = str(v, "cmd", where, true)!;
  const raw = str(v, "format", where) ?? native;
  const format = raw === "junit" ? "report" : raw;
  if (format !== "lines" && format !== "report" && format !== "adapter") throw new ConfigError(`${where}.format`, `expected "lines", "report" or "adapter", got "${raw}"`);
  if (format === "adapter" && !ADAPTERS[adapter].list?.parse) throw new ConfigError(`${where}.format`, `the ${adapter} adapter has no list parser; use "lines" (one id per line) or "report"`);
  return { cmd, format, report: str(v, "report", where) };
}

function validateRefs(cfg: Config) {
  const names = new Set<string>();
  for (const s of cfg.services) {
    if (names.has(s.name)) throw new ConfigError(`service.${s.name}`, "duplicate service name");
    names.add(s.name);
  }
  for (const s of cfg.services) {
    for (const d of s.dependsOn) if (!names.has(d)) throw new ConfigError(`service.${s.name}.depends_on`, `unknown service "${d}"`);
    if (s.originFor && !names.has(s.originFor)) throw new ConfigError(`service.${s.name}.origin_for`, `unknown service "${s.originFor}"`);
  }
  topoOrder(cfg.services, cfg.services.map((s) => s.name));
  if (cfg.reference) {
    if (cfg.services.some((s) => s.role === "origin")) throw new ConfigError("reference", 'use [reference] or role = "origin" services, not both');
    for (const [n, o] of Object.entries(cfg.reference.services)) {
      if (!cfg.services.some((s) => s.name === n && s.role === "target")) throw new ConfigError(`reference.service.${n}`, `no target service "${n}" to override${closest(n, cfg.services.map((s) => s.name)) ? ` (did you mean "${closest(n, cfg.services.map((s) => s.name))}"?)` : ""}`);
      for (const d of o.dependsOn ?? []) if (!names.has(d)) throw new ConfigError(`reference.service.${n}.depends_on`, `unknown service "${d}"`);
    }
    for (const s of referenceServices(cfg)) {
      if (!s.start && !s.external) throw new ConfigError(`reference.service.${s.name}`, "leaves the service without start or external");
      if (!s.ready && !s.external) throw new ConfigError(`reference.service.${s.name}.ready`, "leaves the service without a readiness check");
    }
  }
  const suites = new Set<string>();
  for (const s of cfg.suites) {
    if (suites.has(s.name)) throw new ConfigError(`suite.${s.name}`, "duplicate suite name");
    suites.add(s.name);
    for (const svc of s.services ?? []) if (!names.has(svc)) throw new ConfigError(`suite.${s.name}.service`, `unknown service "${svc}"`);
  }
  const refs = (where: string, text: string | undefined) => {
    for (const m of (text ?? "").matchAll(/\$\{([A-Za-z][\w-]*)\.url\}/g)) {
      if (m[1] !== "self" && !names.has(m[1])) throw new ConfigError(where, `\${${m[1]}.url} refers to an unknown service`);
    }
  };
  for (const s of cfg.services) {
    refs(`service.${s.name}.start`, s.start);
    refs(`service.${s.name}.setup`, s.setup);
    refs(`service.${s.name}.ready`, s.ready?.http ?? s.ready?.cmd);
    for (const [k, v] of Object.entries(s.env)) refs(`service.${s.name}.env.${k}`, v);
  }
  for (const s of cfg.suites) {
    refs(`suite.${s.name}.cmd`, s.cmd);
    refs(`suite.${s.name}.list`, s.list?.cmd);
    for (const [k, v] of Object.entries(s.env)) refs(`suite.${s.name}.env.${k}`, v);
  }
}

/** Services named plus everything they depend on, dependencies first. */
export function topoOrder(services: Service[], wanted: string[]): Service[] {
  const byName = new Map(services.map((s) => [s.name, s]));
  const out: Service[] = [];
  const state = new Map<string, "visiting" | "done">();
  const visit = (n: string, chain: string[]) => {
    const st = state.get(n);
    if (st === "done") return;
    if (st === "visiting") throw new ConfigError(`service.${n}.depends_on`, `dependency cycle: ${[...chain, n].join(" -> ")}`);
    state.set(n, "visiting");
    const s = byName.get(n);
    if (!s) throw new ConfigError("", `unknown service "${n}"`);
    for (const d of s.dependsOn) visit(d, [...chain, n]);
    state.set(n, "done");
    out.push(s);
  };
  for (const w of wanted) visit(w, []);
  return out;
}

/** Parse a KEY=VALUE env file (comments, `export`, quotes). */
export function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = /^(?:export\s+)?([A-Za-z_][\w.]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"') && v.length >= 2) || (v.startsWith("'") && v.endsWith("'") && v.length >= 2)) {
      const dq = v[0] === '"';
      v = v.slice(1, -1);
      if (dq) v = v.replace(/\\n/g, "\n").replace(/\\"/g, '"');
    } else v = v.replace(/\s+#.*$/, "");
    out[m[1]] = v;
  }
  return out;
}

/** The base environment for every child: the env file under the process env (process env wins). */
export function loadEnv(cfg: Config): { env: Record<string, string>; missing: string[]; fileUsed?: string } {
  const env: Record<string, string> = {};
  let fileUsed: string | undefined;
  if (cfg.envFile) {
    const f = path.resolve(cfg.root, cfg.envFile);
    if (fs.existsSync(f)) {
      Object.assign(env, parseEnvFile(fs.readFileSync(f, "utf8")));
      fileUsed = f;
    }
  }
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v;
  const missing = cfg.required.filter((k) => !env[k]);
  return { env, missing, fileUsed };
}

export type Vars = Record<string, string | undefined>;

/** Replace ${NAME} and ${svc.url}; unknown names are left for the shell. */
export function substitute(text: string, vars: Vars): string {
  return text.replace(/\$\{([A-Za-z_][\w.-]*)\}/g, (m, name: string) => {
    const v = vars[name];
    return v === undefined ? m : v;
  });
}

/** The target services as the reference side runs them: each with its [reference.service] override applied. */
export function referenceServices(cfg: Config): Service[] {
  return cfg.services
    .filter((s) => s.role === "target")
    .map((s) => {
      const o = cfg.reference?.services[s.name] ?? {};
      return { ...s, ...o, env: { ...s.env, ...(o.env ?? {}) }, dependsOn: o.dependsOn ?? s.dependsOn };
    });
}
