import * as fs from "node:fs";
import * as path from "node:path";
import { type Config, type Dependency, type InRepo, type Service, substitute, topoOrder, urlEnvName, type Vars } from "./config.ts";
import { type Cause, type Diagnosis, diagnose, type Stage } from "./diagnosis.ts";
import type { Progress } from "./output.ts";
import { allocatePort, childEnv, groupAlive, httpProbe, killGroup, portAnswers, type Proc, runCapture, signalPid, spawnGroup } from "./proc.ts";
import type { RunDir } from "./rundir.ts";
import { fmtDuration, git, pidAlive, readJson, sha, sleep, writeJson } from "./util.ts";

export class Failure extends Error {
  diagnosis: Diagnosis;
  constructor(d: Diagnosis) {
    super(`${d.cause}${d.evidence ? `: ${d.evidence}` : ""}`);
    this.diagnosis = d;
  }
}

export interface LiveService {
  name: string;
  svc: Service;
  port?: number;
  url: string;
  proc?: Proc;
  pgid?: number;
  pid?: number;
  log: string;
  ownedByUs: boolean;
  probeFailures: number;
  lastProbe: number;
}

export interface UpState {
  pid: number;
  started_at: string;
  root: string;
  services: Record<string, { pgid?: number; pid?: number; port?: number; url: string; log: string; external?: boolean }>;
  deps_started: string[];
}

export interface StackOpts {
  cfg: Config;
  root: string;
  baseEnv: Record<string, string>;
  /** Per listed repo: the base environment of its services, dependencies and suites. */
  repoEnvs?: Record<string, Record<string, string>>;
  logDir: string;
  progress: Progress;
  run?: RunDir;
  noSetup: boolean;
  setupCacheDir: string | null;
  runDirPath?: string;
  abort: { aborted: boolean };
  reuse?: UpState | null;
}

const SETUP_TIMEOUT = 30 * 60_000;

export const upFile = (root: string) => path.join(root, ".witness", "up.json");

export function readUp(root: string): UpState | null {
  return readJson<UpState | null>(upFile(root), null);
}

/** Dependency checks, service boot with readiness, watching and teardown for one checkout. */
export class Stack {
  o: StackOpts;
  live = new Map<string, LiveService>();
  depsStarted: Dependency[] = [];
  taken = new Set<number>();
  constructor(o: StackOpts) {
    this.o = o;
  }

  envOf(repo?: string): Record<string, string> {
    return (repo && this.o.repoEnvs?.[repo]) || this.o.baseEnv;
  }

  rootOf(x?: InRepo): string {
    return x?.root ?? this.o.root;
  }

  /** A service's folder as diagnoses show it: relative to this checkout. */
  shownCwd(svc: Service): string {
    return svc.root ? path.relative(this.o.root, path.resolve(svc.root, svc.cwd)) || "." : svc.cwd;
  }

  /** `${...}` values for a command of `owner` (a service, dependency or suite; default `self`'s service). */
  vars(self?: LiveService, owner: InRepo | undefined = self?.svc): Vars {
    const v: Vars = { ...this.envOf(owner?.repo), CHECKOUT: this.rootOf(owner) };
    if (this.o.runDirPath) v.WITNESS_RUN_DIR = this.o.runDirPath;
    for (const [n, l] of this.live) v[`${n}.url`] = l.url;
    if (self) {
      v["self.url"] = self.url;
      if (self.port) v.PORT = String(self.port);
    }
    return v;
  }

  /** `WITNESS_<SERVICE>_URL` for every live service; a listed repo's own commands also get its services under their names there. */
  serviceUrlEnv(repo?: string): Record<string, string> {
    const e: Record<string, string> = {};
    for (const [n, l] of this.live) e[urlEnvName(n)] = l.url;
    if (repo) for (const l of this.live.values()) if (l.svc.repo === repo && l.svc.local) e[urlEnvName(l.svc.local)] = l.url;
    return e;
  }

  private fail(stage: Stage, cause: Cause, extra: Partial<Parameters<typeof diagnose>[0]> = {}): never {
    throw new Failure(diagnose({ stage, cause, ...extra }));
  }

  async checkDep(d: Dependency): Promise<{ ok: boolean; detail: string }> {
    if (d.checkHttp) return httpProbe(substitute(d.checkHttp, this.vars(undefined, d)), undefined, 5000);
    const r = await runCapture(substitute(d.check!, this.vars(undefined, d)), { cwd: this.rootOf(d), env: childEnv(this.envOf(d.repo)), timeoutMs: 15_000 });
    const last = r.out.trim().split("\n").pop() ?? "";
    return { ok: r.code === 0, detail: r.timedOut ? "check timed out" : last || `exit code ${r.code}` };
  }

  async checkDeps(deps = this.o.cfg.dependencies): Promise<void> {
    for (const d of deps) {
      const t0 = Date.now();
      let r = await this.checkDep(d);
      if (r.ok) {
        this.o.progress.line(`deps   ${d.name} · ok`);
        continue;
      }
      const log = path.join(this.o.logDir, `dep-${d.name}.log`);
      if (d.start && !this.o.reuse?.deps_started.includes(d.name)) {
        this.o.progress.line(`deps   ${d.name} · not reachable (${r.detail}); starting it`);
        const s = await runCapture(substitute(d.start, this.vars(undefined, d)), { cwd: this.rootOf(d), env: childEnv(this.envOf(d.repo)), timeoutMs: d.timeoutMs, log, abort: this.o.abort, track: this.o.run?.tracker("dependency", d.name) });
        if (this.o.abort.aborted) return;
        if (s.code !== 0) this.fail("deps", "dependency_unreachable", { command: d.start, log, evidence: s.out.trim().split("\n").pop() });
        this.depsStarted.push(d);
        const until = Date.now() + d.timeoutMs;
        while (Date.now() < until && !this.o.abort.aborted) {
          r = await this.checkDep(d);
          if (r.ok) break;
          await sleep(1000);
        }
      }
      if (!r.ok) this.fail("deps", "dependency_unreachable", { command: d.check ?? `curl ${d.checkHttp}`, evidence: `${d.name}: ${r.detail}`, log: fs.existsSync(log) ? log : undefined });
      this.o.progress.line(`deps   ${d.name} · ok (${fmtDuration(Date.now() - t0)})`);
    }
  }

  /** Boot `names` and what they depend on. `as` maps a booted service to the name suites see. */
  async boot(names: string[], as: Map<string, string> = new Map()): Promise<void> {
    for (const svc of topoOrder(this.o.cfg.services, names)) {
      if (this.o.abort.aborted) return;
      const alias = as.get(svc.name) ?? svc.name;
      if (this.live.has(alias)) continue;
      await this.bootOne(svc, alias);
    }
  }

  private async bootOne(svc: Service, alias: string) {
    const t0 = Date.now();
    const cwd = path.resolve(this.rootOf(svc), svc.cwd);
    const log = path.join(this.o.logDir, `${svc.name}.log`);
    const prev = this.o.reuse?.services[svc.name];
    if (prev && this.o.reuse?.root === this.o.root && (prev.external || (prev.pgid && groupAlive(prev.pgid)) || (prev.pid && pidAlive(prev.pid)))) {
      const ls: LiveService = { name: alias, svc, port: prev.port, url: prev.url, pgid: prev.pgid, pid: prev.pid, log: prev.log, ownedByUs: false, probeFailures: 0, lastProbe: 0 };
      if ((await this.probe(ls)).ok) {
        this.live.set(alias, ls);
        if (prev.port) this.taken.add(prev.port);
        this.o.progress.line(`boot   ${svc.name} · reusing the service from \`witness up\` at ${ls.url}`);
        return;
      }
    }
    if (svc.external) {
      const ls: LiveService = { name: alias, svc, url: svc.external.replace(/\/$/, ""), log, ownedByUs: false, probeFailures: 0, lastProbe: 0 };
      await this.waitReady(ls, cwd, true);
      this.live.set(alias, ls);
      this.o.progress.line(`boot   ${svc.name} · external ${ls.url} is ready`);
      return;
    }
    const alloc = await allocatePort(svc.ports, this.taken);
    if (!alloc.port) this.fail("boot", "port_in_use", { service: svc.name, evidence: alloc.tried, port: svc.ports?.[0] });
    this.taken.add(alloc.port!);
    this.o.run?.state && (this.o.run.state.ports[svc.name] = alloc.port!);
    const ls: LiveService = { name: alias, svc, port: alloc.port, url: `http://127.0.0.1:${alloc.port}`, log, ownedByUs: true, probeFailures: 0, lastProbe: 0 };
    const vars = this.vars(ls);
    const env = childEnv(this.envOf(svc.repo), { PORT: String(alloc.port), ...this.serviceUrlEnv(svc.repo), ...mapValues(svc.env, (v) => substitute(v, vars)) });

    if (svc.setup) await this.setup(svc, cwd, env, vars, log);
    if (this.o.abort.aborted) return;

    const readyUrl = svc.ready?.http ? substitute(svc.ready.http, vars) : undefined;
    const held = readyUrl ? await heldReadyPort(readyUrl, alloc.port!) : undefined;
    if (held) this.fail("boot", "port_in_use", { service: svc.name, port: held, url: readyUrl, evidence: `port ${held} (in ready.http ${readyUrl}) already accepts connections before ${svc.name} started: another process holds it, so the readiness check would talk to that process` });
    const cmd = substitute(svc.start!, vars);
    const proc = spawnGroup(cmd, { name: svc.name, cwd, env, log });
    ls.proc = proc;
    ls.pgid = proc.pgid;
    this.live.set(alias, ls);
    this.o.run?.track({ kind: "service", name: svc.name, pid: proc.pid, pgid: proc.pgid, pidfile: svc.pidfile ? path.resolve(cwd, substitute(svc.pidfile, vars)) : undefined, stop: svc.stop ? substitute(svc.stop, vars) : undefined, cwd });
    this.o.run?.event("service_started", { service: svc.name, pid: proc.pid, port: alloc.port, cmd }, `starting ${svc.name}`);
    this.o.progress.line(`boot   ${svc.name} · starting (PORT=${alloc.port}${readyUrl ? `, ready check ${readyUrl}` : ""})`);
    try {
      await this.waitReady(ls, cwd, false, cmd);
    } catch (e) {
      this.live.delete(alias);
      await this.stopOne(ls);
      throw e;
    }
    if (this.o.abort.aborted) return;
    this.o.run?.event("service_ready", { service: svc.name, url: ls.url, ms: Date.now() - t0 }, `${svc.name} ready`);
    this.o.progress.line(`boot   ${svc.name} · ready at ${ls.url} (${fmtDuration(Date.now() - t0)})`);
  }

  private async setup(svc: Service, cwd: string, env: Record<string, string>, vars: Vars, log: string) {
    const cmd = substitute(svc.setup!, vars);
    if (this.o.noSetup) {
      this.o.progress.line(`setup  ${svc.name} · skipped (--no-setup)`);
      return;
    }
    const hash = this.o.setupCacheDir ? setupInputsHash(cwd, cmd) : null;
    const cacheFile = this.o.setupCacheDir ? path.join(this.o.setupCacheDir, `${svc.name}.json`) : null;
    if (hash && cacheFile && readJson<{ hash?: string }>(cacheFile, {}).hash === hash) {
      this.o.progress.line(`setup  ${svc.name} · skipped (inputs unchanged since the last successful setup)`);
      return;
    }
    const t0 = Date.now();
    this.o.progress.line(`setup  ${svc.name} · ${cmd}`);
    this.o.run?.event("setup_started", { service: svc.name, cmd }, `setup ${svc.name}`);
    const proc = spawnGroup(cmd, { name: `setup-${svc.name}`, cwd, env, log });
    this.o.run?.track({ kind: "setup", name: svc.name, pid: proc.pid, pgid: proc.pgid });
    const timer = setTimeout(() => void killGroup(proc.pgid, this.o.cfg.run.graceMs), SETUP_TIMEOUT);
    const abortPoll = setInterval(() => this.o.abort.aborted && void killGroup(proc.pgid, this.o.cfg.run.graceMs), 200);
    const { code } = await proc.exit;
    clearTimeout(timer);
    clearInterval(abortPoll);
    this.o.run?.untrack(proc.pgid);
    if (this.o.abort.aborted) return;
    if (code !== 0) this.fail("boot", "setup_failed", { service: svc.name, command: cmd, log, cwd: this.shownCwd(svc) });
    if (hash && cacheFile) writeJson(cacheFile, { hash, at: new Date().toISOString() });
    this.o.progress.line(`setup  ${svc.name} · done (${fmtDuration(Date.now() - t0)})`);
  }

  private async waitReady(ls: LiveService, cwd: string, external: boolean, cmd?: string) {
    const svc = ls.svc;
    const timeoutMs = svc.ready?.timeoutMs ?? 120_000;
    const until = Date.now() + timeoutMs;
    const pidfile = svc.pidfile ? path.resolve(cwd, substitute(svc.pidfile, this.vars(ls))) : undefined;
    let delay = 200;
    let last = "";
    let steady: { status: number; since: number } | undefined;
    const steadyAfter = Math.min(30_000, timeoutMs / 2);
    const exitedFail = () => this.fail("boot", "exited_before_ready", { service: svc.name, command: cmd, log: ls.log, cwd: this.shownCwd(svc), port: ls.port, evidence: undefined });
    for (;;) {
      if (this.o.abort.aborted) return;
      if (pidfile && !ls.pid && fs.existsSync(pidfile)) {
        const pid = Number(fs.readFileSync(pidfile, "utf8").trim());
        if (pid > 0) ls.pid = pid;
      }
      if (!external) {
        if (pidfile) {
          if (ls.pid && !pidAlive(ls.pid)) exitedFail();
          if (!ls.pid && ls.proc?.exited && ls.proc.code !== 0) exitedFail();
        } else if (ls.proc?.exited) exitedFail();
      }
      const r = await this.probe(ls);
      if (r.ok) return;
      last = r.detail;
      const http4xx = /^HTTP (4\d\d)$/.exec(r.detail);
      const now = Date.now();
      if (!http4xx) steady = undefined;
      else if (steady?.status !== Number(http4xx[1])) steady = { status: Number(http4xx[1]), since: now };
      const stuck = steady && now - steady.since >= steadyAfter;
      if (now > until || stuck) {
        const url = svc.ready?.http ? substitute(svc.ready.http, this.vars(ls)) : external ? ls.url : undefined;
        const evidence = stuck ? `${url ?? "the ready URL"} answered HTTP ${steady!.status} for ${fmtDuration(now - steady!.since)}: the app is up but this URL is not its health check` : `not ready after ${fmtDuration(timeoutMs)}: ${last}`;
        this.fail("boot", "ready_timeout", { service: svc.name, command: svc.ready?.cmd ?? cmd, log: external ? undefined : ls.log, url, port: ls.port, evidence, cwd: this.shownCwd(svc), steadyStatus: stuck ? steady!.status : undefined });
      }
      await sleep(delay);
      delay = Math.min(delay * 1.5, 1000);
    }
  }

  async probe(ls: LiveService): Promise<{ ok: boolean; detail: string }> {
    const r = ls.svc.ready;
    if (!r) {
      if (!ls.svc.external) return { ok: false, detail: "no readiness check configured" };
      const h = await httpProbe(ls.url);
      return /^HTTP [1-4]\d\d$/.test(h.detail) ? { ok: true, detail: h.detail } : h;
    }
    const vars = this.vars(ls);
    if (r.http) {
      const url = substitute(r.http, vars);
      const res = await httpProbe(url, r.status);
      const v4 = `//127.0.0.1:${ls.port}`;
      if (res.ok || !ls.ownedByUs || !ls.port || !url.includes(v4) || ls.url !== `http:${v4}` || /^HTTP/.test(res.detail)) return res;
      const r6 = await httpProbe(url.replace(v4, `//[::1]:${ls.port}`), r.status);
      if (!r6.ok) return res;
      ls.url = `http://[::1]:${ls.port}`;
      this.o.progress.line(`boot   ${ls.svc.name} · answers on ::1 (IPv6 loopback) only, not on 127.0.0.1; its URL is ${ls.url}`);
      return r6;
    }
    const env = childEnv(this.envOf(ls.svc.repo), { PORT: String(ls.port ?? ""), ...this.serviceUrlEnv(ls.svc.repo), ...mapValues(ls.svc.env, (v) => substitute(v, vars)) });
    const res = await runCapture(substitute(r.cmd!, vars), { cwd: path.resolve(this.rootOf(ls.svc), ls.svc.cwd), env, timeoutMs: 10_000 });
    return { ok: res.code === 0, detail: res.timedOut ? "ready cmd timed out" : res.out.trim().split("\n").pop() || `exit code ${res.code}` };
  }

  /** Called while suites run: a service that exits or keeps failing its probe is dead. `names` limits it to those services and their dependencies. */
  async watch(names?: string[]): Promise<Diagnosis | null> {
    const now = Date.now();
    const only = names && new Set([...names, ...topoOrder(this.o.cfg.services, names.filter((n) => this.o.cfg.services.some((x) => x.name === n))).map((x) => x.name)]);
    for (const ls of this.live.values()) {
      if (only && !only.has(ls.name) && !only.has(ls.svc.name)) continue;
      let dead = "";
      if (ls.ownedByUs && ls.proc && !ls.svc.pidfile && ls.proc.exited) dead = `exited with code ${ls.proc.code}`;
      else if (ls.pid && !pidAlive(ls.pid)) dead = `pid ${ls.pid} is gone`;
      else if (!ls.ownedByUs && ls.pgid && !groupAlive(ls.pgid)) dead = "process group is gone";
      if (!dead && (ls.svc.ready || ls.svc.external) && now - ls.lastProbe >= 5000) {
        ls.lastProbe = now;
        const r = await this.probe(ls);
        ls.probeFailures = r.ok ? 0 : ls.probeFailures + 1;
        if (ls.probeFailures >= 3) dead = `readiness check failed 3 times in a row (${r.detail})`;
      }
      if (dead) {
        const d = diagnose({ stage: "suite", cause: "service_died", service: ls.svc.name, log: fs.existsSync(ls.log) ? ls.log : undefined, cwd: this.shownCwd(ls.svc) });
        if (!d.evidence || d.cause === "service_died") d.evidence = d.evidence ? `${dead}; last log line: ${d.evidence}` : dead;
        return d;
      }
    }
    return null;
  }

  async stopOne(ls: LiveService) {
    if (!ls.ownedByUs) return;
    const grace = this.o.cfg.run.graceMs;
    if (ls.svc.stop) {
      const cwd = path.resolve(this.rootOf(ls.svc), ls.svc.cwd);
      const r = await runCapture(substitute(ls.svc.stop, this.vars(ls)), { cwd, env: childEnv(this.envOf(ls.svc.repo), { PORT: String(ls.port ?? "") }), timeoutMs: 60_000, log: ls.log });
      if (r.code !== 0) this.o.progress.line(`stop   ${ls.svc.name} · stop command failed (exit ${r.code ?? "timeout"}); killing its processes; see ${ls.log}`);
    }
    if (ls.pid && pidAlive(ls.pid)) {
      try {
        signalPid(ls.pid, false);
      } catch {
        /* gone */
      }
      const until = Date.now() + grace;
      while (pidAlive(ls.pid) && Date.now() < until) await sleep(100);
      if (pidAlive(ls.pid)) {
        try {
          signalPid(ls.pid, true);
        } catch {
          /* gone */
        }
      }
    }
    if (ls.pgid) {
      await killGroup(ls.pgid, grace);
      this.o.run?.untrack(ls.pgid);
    }
  }

  async teardown(opts: { keepDeps?: boolean } = {}) {
    for (const ls of [...this.live.values()].reverse()) await this.stopOne(ls);
    this.live.clear();
    if (opts.keepDeps) return;
    for (const d of this.depsStarted.reverse()) {
      if (!d.stop) continue;
      this.o.progress.line(`deps   ${d.name} · stopping`);
      const log = path.join(this.o.logDir, `dep-${d.name}.log`);
      const r = await runCapture(substitute(d.stop, this.vars(undefined, d)), { cwd: this.rootOf(d), env: childEnv(this.envOf(d.repo)), timeoutMs: 120_000, log });
      if (r.code !== 0) this.o.progress.line(`deps   ${d.name} · stop command failed (exit ${r.code ?? "timeout"}); it may still be running; see ${log}`);
    }
    this.depsStarted = [];
  }
}

const LOCAL = new Set(["127.0.0.1", "localhost", "0.0.0.0", "[::1]", "::1"]);

/** A local port in the ready URL, other than the one witness allocated, that something already listens on. */
async function heldReadyPort(url: string, allocated: number): Promise<number | undefined> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return undefined;
  }
  const port = Number(u.port || (u.protocol === "https:" ? 443 : 80));
  if (port === allocated || !LOCAL.has(u.hostname)) return undefined;
  const hosts = u.hostname === "localhost" ? ["127.0.0.1", "::1"] : u.hostname === "0.0.0.0" ? ["127.0.0.1"] : [u.hostname.replace(/^\[|\]$/g, "")];
  for (const h of hosts) if (await portAnswers(h, port)) return port;
  return undefined;
}

function mapValues(o: Record<string, string>, f: (v: string) => string): Record<string, string> {
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, f(v)]));
}

/** Hash of what a setup step depends on: the command and the checkout state under cwd. */
export function setupInputsHash(cwd: string, cmd: string): string | null {
  const top = git(cwd, ["rev-parse", "--show-toplevel"]);
  if (!top.ok) return null;
  const head = git(cwd, ["rev-parse", "HEAD:./"]);
  const diff = git(cwd, ["diff", "HEAD", "--", ".", ":(exclude).witness"]);
  const untracked = git(cwd, ["ls-files", "--others", "--exclude-standard", "--", ".", ":(exclude).witness"]);
  if (!head.ok || !diff.ok || !untracked.ok) return null;
  const stamps = untracked.out
    .split("\n")
    .filter(Boolean)
    .slice(0, 5000)
    .map((f) => {
      try {
        const p = path.join(cwd, f);
        const st = fs.statSync(p);
        return st.size < 1024 * 1024 ? `${f}:${sha(fs.readFileSync(p))}` : `${f}:${st.size}`;
      } catch {
        return f;
      }
    })
    .join("\n");
  return sha([cmd, head.out, diff.out, stamps].join("\0"));
}
