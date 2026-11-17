import type { ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { type Contract, type Service, subst } from "./contract.ts";
import { parseJUnit, type TestResult } from "./junit.ts";
import { type Exchange, RecordingProxy } from "./proxy.ts";
import { fmtMs, freePort, killTree, parseDuration, runShell, say, sleep, startShell, tail } from "./util.ts";

const cleanups = new Set<() => void | Promise<void>>();

/** Register work to undo if the run is interrupted; returns the unregister function. */
export function registerCleanup(fn: () => void | Promise<void>): () => void {
  cleanups.add(fn);
  return () => cleanups.delete(fn);
}

export async function runCleanups() {
  for (const fn of [...cleanups].reverse()) {
    try {
      await fn();
    } catch {
      /* best effort */
    }
  }
  cleanups.clear();
}

export class Mistrial extends Error {
  remedy: string;
  logTail: string;
  constructor(msg: string, remedy: string, logTail = "") {
    super(msg);
    this.remedy = remedy;
    this.logTail = logTail;
  }
}

interface Running {
  svc: Service;
  port: number;
  child: ChildProcess;
  proxy?: RecordingProxy;
}

/** One booted copy of the app (head, base or origin) with recording proxies on its surfaces. */
export class Side {
  running: Running[] = [];
  bootMs = 0;

  name: string;
  contract: Contract;
  checkout: string;
  logDir: string;
  services: Service[];
  rewrite?: (url: string) => string;

  constructor(name: string, contract: Contract, checkout: string, logDir: string, opts: { services?: Service[]; rewrite?: (url: string) => string } = {}) {
    this.name = name;
    this.contract = contract;
    this.checkout = checkout;
    this.logDir = logDir;
    this.services = opts.services ?? contract.services;
    this.rewrite = opts.rewrite;
  }

  private vars(svc: Service, port: number): Record<string, string> {
    const v: Record<string, string> = {
      PORT: String(port),
      CHECKOUT: this.checkout,
      WITNESS_HOME: this.contract.home,
      WITNESS_SIDE: this.name,
      "self.url": `http://127.0.0.1:${port}`,
    };
    for (const r of this.running) v[`${r.svc.name}.url`] = `http://127.0.0.1:${r.port}`;
    return v;
  }

  private unregister?: () => void;

  async boot() {
    const t0 = Date.now();
    this.unregister = registerCleanup(() => this.shutdown());
    for (const svc of this.services) {
      const port = await freePort();
      const vars = this.vars(svc, port);
      const env = { ...vars, ...Object.fromEntries(Object.entries(svc.env ?? {}).map(([k, v]) => [k, subst(v, vars)])) };
      delete (env as Record<string, string>)["self.url"];
      const log = path.join(this.logDir, `${this.name}-${svc.name}.log`);
      if (svc.setup) {
        say("calling witnesses", `${this.name}/${svc.name}: setup`);
        const r = await runShell(subst(svc.setup, vars), { cwd: this.checkout, env, log, timeoutMs: 20 * 60_000 });
        if (r.code !== 0)
          throw new Mistrial(`${this.name}/${svc.name} setup failed (exit ${r.code})`, `Fix the setup command in witness.toml, or run it by hand in ${this.checkout}.`, tail(log));
      }
      say("calling witnesses", `${this.name}/${svc.name}: starting on :${port}`);
      const child = startShell(subst(svc.start, vars), { cwd: this.checkout, env, log });
      const run: Running = { svc, port, child };
      this.running.push(run);
      await this.waitReady(run, vars, log);
    }
    for (const [surface, s] of Object.entries(this.contract.surfaces)) {
      const run = this.running.find((r) => r.svc.name === s.service)!;
      run.proxy = new RecordingProxy({ host: "127.0.0.1", port: run.port }, this.name, this.rewrite);
      await run.proxy.listen();
      say("calling witnesses", `${this.name}: surface ${surface} recorded via :${run.proxy.port}`);
    }
    this.bootMs = Date.now() - t0;
  }

  private async waitReady(run: Running, vars: Record<string, string>, log: string) {
    const ready = run.svc.ready;
    const timeout = parseDuration(ready?.timeout, 120_000);
    const url = ready ? subst(ready.http, vars) : vars["self.url"];
    const want = ready?.status;
    const t0 = Date.now();
    let exited: number | null = null;
    run.child.on("exit", (c) => (exited = c ?? 1));
    let last = "";
    while (Date.now() - t0 < timeout) {
      if (exited !== null)
        throw new Mistrial(`${this.name}/${run.svc.name} exited (code ${exited}) before it was ready`, `Check the start command; it must stay in the foreground and listen on $PORT.`, tail(log));
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
        if (want ? res.status === want : res.status < 500) {
          say("calling witnesses", `${this.name}/${run.svc.name}: ready in ${fmtMs(Date.now() - t0)}`);
          return;
        }
        last = `HTTP ${res.status}`;
      } catch (e) {
        last = (e as Error).message;
      }
      await sleep(1000);
    }
    throw new Mistrial(
      `${this.name}/${run.svc.name} never became ready at ${url} within ${fmtMs(timeout)} (last: ${last})`,
      `Raise ready.timeout or fix ready.http in witness.toml.`,
      tail(log),
    );
  }

  surfaceEnv(): Record<string, string> {
    const env: Record<string, string> = {};
    for (const [surface, s] of Object.entries(this.contract.surfaces)) {
      const run = this.running.find((r) => r.svc.name === s.service)!;
      env[`WITNESS_${surface.toUpperCase()}_URL`] = `http://localhost:${run.proxy!.port}`;
    }
    return env;
  }

  exchanges(): Exchange[] {
    return this.running.flatMap((r) => r.proxy?.exchanges ?? []);
  }

  setRun(label: string) {
    for (const r of this.running) if (r.proxy) r.proxy.run = label;
  }

  async shutdown() {
    for (const r of [...this.running].reverse()) {
      await r.proxy?.close();
      killTree(r.child, "SIGTERM");
    }
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline && this.running.some((r) => r.child.exitCode === null && r.child.signalCode === null)) await sleep(200);
    for (const r of this.running) killTree(r.child, "SIGKILL");
    this.running = [];
    this.unregister?.();
  }
}

export interface SuiteRun {
  suite: string;
  side: string;
  run: string;
  code: number;
  ms: number;
  results: TestResult[];
  log: string;
}

/** Run every suite (from the head checkout) against a booted side. */
export async function runSuites(
  contract: Contract,
  side: Side,
  opts: { only?: string[]; run?: string; logDir: string },
): Promise<SuiteRun[]> {
  const out: SuiteRun[] = [];
  side.setRun(opts.run ?? "primary");
  for (const suite of contract.suites) {
    if (contract.fixtures.reset) {
      await runShell(contract.fixtures.reset, { cwd: side.checkout, env: { CHECKOUT: side.checkout, WITNESS_HOME: contract.home }, log: path.join(opts.logDir, `${side.name}-reset.log`) });
    }
    const pattern = path.join(contract.root, suite.junit);
    for (const f of fs.globSync(pattern)) fs.rmSync(f, { force: true });
    const log = path.join(opts.logDir, `${side.name}-suite-${suite.name}${opts.run && opts.run !== "primary" ? "-" + opts.run : ""}.log`);
    const env: Record<string, string> = { ...side.surfaceEnv(), WITNESS_HOME: contract.home, WITNESS_SIDE: side.name, CHECKOUT: contract.root };
    if (opts.only?.length) env.WITNESS_TESTS = opts.only.join(",");
    say("testimony", `${side.name}: suite ${suite.name}${opts.only ? ` (${opts.only.length} tests)` : ""}`);
    const r = await runShell(subst(suite.cmd, { WITNESS_HOME: contract.home, CHECKOUT: contract.root }), {
      cwd: contract.root,
      env,
      log,
      timeoutMs: parseDuration(suite.timeout, 15 * 60_000),
    });
    const results = fs.globSync(pattern).flatMap((f) => parseJUnit(fs.readFileSync(f, "utf8")));
    say("testimony", `${side.name}: ${results.filter((t) => t.status === "passed").length}/${results.length} passed in ${fmtMs(r.ms)}`);
    out.push({ suite: suite.name, side: side.name, run: opts.run ?? "primary", code: r.code, ms: r.ms, results, log });
  }
  return out;
}
