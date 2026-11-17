import * as fs from "node:fs";
import * as path from "node:path";
import { parse as parseToml } from "smol-toml";

export interface Ready {
  http: string;
  status?: number;
  timeout?: string | number;
}

export interface Service {
  name: string;
  setup?: string;
  start: string;
  ready?: Ready;
  env?: Record<string, string>;
}

export interface Suite {
  name: string;
  cmd: string;
  junit: string;
  timeout?: string | number;
  /** Glob (relative to the repo root) of this suite's test sources; narrows the origin cache key. */
  tests?: string;
}

export interface Surface {
  service: string;
}

export interface Equivalence {
  ignore_fields: string[];
  unordered: string[];
  headers: string[];
  compare_status: boolean;
  /** Fields the target adds that the origin never returned are compatible additions, not differences. */
  allow_added_fields: boolean;
}

export interface Contract {
  root: string;
  home: string;
  file: string;
  services: Service[];
  suites: Suite[];
  surfaces: Record<string, Surface>;
  fixtures: { reset?: string };
  origin?: OriginConfig;
  equivalence: Equivalence;
  raw: string;
}

export interface Route {
  target: string;
  origin: string;
  prefix?: boolean;
}

export interface OriginConfig {
  /** Evolve: compare with the base commit (default). */
  ref?: string;
  /** Migrate: path (relative to the repo root) of a separate origin checkout. */
  repo?: string;
  /** Contract (services only) that boots the origin; relative to the repo root. */
  contract?: string;
  /** Route map from target paths to origin paths; relative to the repo root. */
  map?: string;
  services?: Service[];
  routes?: Route[];
  repoPath?: string;
}

export class ContractError extends Error {}

/** Rewrite a target request path (with query) to the origin's route, first matching rule wins. */
export function mapRoute(routes: Route[], url: string): string {
  const [p, q] = url.split("?", 2);
  for (const r of routes) {
    if (!r.prefix && p === r.target) return r.origin + (q ? `?${q}` : "");
    if (r.prefix && p.startsWith(r.target)) return r.origin + p.slice(r.target.length) + (q ? `?${q}` : "");
  }
  return url;
}

const DEFAULT_EQ: Equivalence = {
  ignore_fields: [],
  unordered: [],
  headers: ["content-type"],
  compare_status: true,
  allow_added_fields: false,
};

export function findRoot(start: string): string | null {
  let dir = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(dir, ".witness", "witness.toml"))) return dir;
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

export function loadContract(root: string): Contract {
  const home = path.join(root, ".witness");
  const file = path.join(home, "witness.toml");
  if (!fs.existsSync(file)) throw new ContractError(`No contract at ${file}. Run \`witness init\` first.`);
  const raw = fs.readFileSync(file, "utf8");
  let doc: Record<string, any>;
  try {
    doc = parseToml(raw) as Record<string, any>;
  } catch (e) {
    throw new ContractError(`witness.toml does not parse: ${(e as Error).message}`);
  }
  const services: Service[] = (doc.service ?? []).map((s: any, i: number) => {
    if (!s.name) throw new ContractError(`service #${i + 1} has no name`);
    if (!s.start) throw new ContractError(`service "${s.name}" has no start command`);
    return s as Service;
  });
  if (services.length === 0) throw new ContractError("witness.toml declares no [[service]]");
  const suites: Suite[] = (doc.suite ?? []).map((s: any, i: number) => {
    if (!s.name || !s.cmd || !s.junit) throw new ContractError(`suite #${i + 1} needs name, cmd and junit`);
    return s as Suite;
  });
  if (suites.length === 0) throw new ContractError("witness.toml declares no [[suite]]");
  const surfaces: Record<string, Surface> = doc.surfaces ?? { api: { service: services[0].name } };
  for (const [k, v] of Object.entries(surfaces)) {
    if (!services.find((s) => s.name === v.service)) throw new ContractError(`surface "${k}" points at unknown service "${v.service}"`);
  }
  let equivalence = { ...DEFAULT_EQ };
  const eqFile = path.join(home, "equivalence.toml");
  if (fs.existsSync(eqFile)) {
    const eq = parseToml(fs.readFileSync(eqFile, "utf8")) as any;
    equivalence = { ...equivalence, ...(eq.http ?? eq) };
  }
  let origin: OriginConfig | undefined = doc.origin;
  let originRaw = "";
  if (origin?.repo) {
    const repoPath = path.resolve(root, origin.repo);
    if (!fs.existsSync(repoPath)) throw new ContractError(`origin.repo ${origin.repo} does not exist (resolved to ${repoPath})`);
    if (!origin.contract) throw new ContractError("origin.repo needs origin.contract: a toml file with the [[service]] entries that boot the origin");
    const oc = path.resolve(root, origin.contract);
    originRaw = fs.readFileSync(oc, "utf8");
    const odoc = parseToml(originRaw) as any;
    const oservices: Service[] = odoc.service ?? [];
    for (const surf of Object.values(surfaces))
      if (!oservices.find((x) => x.name === surf.service)) throw new ContractError(`origin contract must define a service named "${surf.service}" (same as the target's surface)`);
    let routes: Route[] = [];
    if (origin.map) {
      const mraw = fs.readFileSync(path.resolve(root, origin.map), "utf8");
      originRaw += mraw;
      routes = ((parseToml(mraw) as any).route ?? []) as Route[];
    }
    origin = { ...origin, services: oservices, routes, repoPath };
  }
  return {
    root,
    home,
    file,
    services,
    suites,
    surfaces,
    fixtures: doc.fixtures ?? {},
    origin,
    equivalence,
    raw: raw + originRaw,
  };
}

export function subst(s: string, vars: Record<string, string>): string {
  return s.replace(/\$\{([\w.]+)\}/g, (m, k) => (k in vars ? vars[k] : m));
}

export const TEMPLATE = `# Witness contract: how to boot this app and run its boundary tests.
# Docs: VERIFY.md. Variables: \${PORT} (assigned per service), \${self.url}, \${CHECKOUT} (checkout being booted),
# \${WITNESS_HOME} (this folder in the head checkout).

[[service]]
name  = "api"
# setup = "bash \${WITNESS_HOME}/bin/build.sh"     # optional, runs before start, should be idempotent
start = "bash \${WITNESS_HOME}/bin/start.sh"        # long-running, must listen on \$PORT
ready = { http = "\${self.url}/health", status = 200, timeout = "120s" }

[surfaces]
api = { service = "api" }        # tests receive WITNESS_API_URL pointing at a recording proxy for this service

[[suite]]
name  = "api"
cmd   = "bash \${WITNESS_HOME}/bin/test.sh"         # runs ONLY boundary tests; honours WITNESS_TESTS
junit = "target/surefire-reports/*.xml"             # JUnit XML, relative to the repo root

# [fixtures]
# reset = "..."                  # optional, runs before each suite invocation

# [origin]                       # High level compares with the base commit's app by default. For a migration:
# repo     = "../legacy-app"     # the origin checkout
# contract = ".witness/origin/witness.toml"   # [[service]] entries that boot it (same service names)
# map      = ".witness/origin/map.toml"       # [[route]] target = "/api/x", origin = "/x", prefix = true
`;
