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

export type Kind = "api" | "ui";

export const KIND_HELP = 'set kind = "api" for tests that drive the app over HTTP (in the test process or at its URL), or kind = "ui" for tests that drive it in a browser. Unit and integration tests don\'t belong in Witness: the project\'s own build and test scripts run them';

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
  report?: string;
  select?: string;
  env: Record<string, string>;
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
  top: ["version", "env", "dependency", "service", "suite", "run"],
  env: ["file", "required"],
  dependency: ["name", "check", "check_http", "start", "stop", "timeout"],
  service: ["name", "cwd", "setup", "start", "stop", "pidfile", "ports", "ready", "env", "depends_on", "external", "role", "origin_for"],
  ready: ["http", "cmd", "status", "timeout"],
  suite: ["name", "kind", "service", "adapter", "cwd", "cmd", "timeout", "per_test_timeout", "report", "select", "env"],
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
    let ready: Ready | undefined;
    if (s.ready !== undefined) {
      if (!isObj(s.ready)) throw new ConfigError(`${where}.ready`, "expected { http = ... } or { cmd = ... }");
      checkKeys(s.ready, KEYS.ready, `${where}.ready`);
      const r = s.ready;
      ready = {
        http: str(r, "http", `${where}.ready`),
        cmd: str(r, "cmd", `${where}.ready`),
        status: typeof r.status === "number" ? r.status : undefined,
        timeoutMs: dur(r, "timeout", `${where}.ready`, 120_000)!,
      };
      if (!ready.http === !ready.cmd) throw new ConfigError(`${where}.ready`, "set exactly one of http or cmd");
      if (r.status !== undefined && typeof r.status !== "number") throw new ConfigError(`${where}.ready.status`, "expected a number");
    }
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
    if (kind !== "api" && kind !== "ui") throw new ConfigError(`${where}.kind`, `${kind === undefined ? "is required" : `expected "api" or "ui", got ${JSON.stringify(kind)}`}: ${KIND_HELP}`);
    return {
      name,
      kind,
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
