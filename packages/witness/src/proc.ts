import { type ChildProcess, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as net from "node:net";
import * as path from "node:path";
import { sleep } from "./util.ts";

const SCRUB = ["ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN", "OPENAI_API_KEY"];

export function childEnv(base: Record<string, string>, extra: Record<string, string> = {}): Record<string, string> {
  const env = { ...base, ...extra };
  for (const k of SCRUB) if (!(k in extra)) delete env[k];
  return env;
}

export interface Proc {
  name: string;
  pid: number;
  pgid: number;
  child: ChildProcess;
  log: string;
  exit: Promise<{ code: number | null; signal: string | null }>;
  exited: boolean;
  code: number | null;
}

/** Start `cmd` under bash in its own process group, appending output to `log`. */
export function spawnGroup(cmd: string, opts: { name: string; cwd: string; env: Record<string, string>; log: string }): Proc {
  fs.mkdirSync(path.dirname(opts.log), { recursive: true });
  const fd = fs.openSync(opts.log, "a");
  fs.writeSync(fd, `$ ${cmd}\n`);
  const child = spawn("bash", ["-c", cmd], { cwd: opts.cwd, env: opts.env, stdio: ["ignore", fd, fd], detached: true });
  fs.closeSync(fd);
  const p: Proc = {
    name: opts.name,
    pid: child.pid ?? -1,
    pgid: child.pid ?? -1,
    child,
    log: opts.log,
    exited: false,
    code: null,
    exit: new Promise((resolve) => {
      child.on("error", (e) => {
        fs.appendFileSync(opts.log, `witness: failed to start: ${e.message}\n`);
        p.exited = true;
        p.code = 127;
        resolve({ code: 127, signal: null });
      });
      child.on("exit", (code, signal) => {
        p.exited = true;
        p.code = code ?? (signal ? 128 : 1);
        resolve({ code: p.code, signal });
      });
    }),
  };
  return p;
}

export function groupAlive(pgid: number): boolean {
  if (!pgid || pgid <= 1) return false;
  try {
    process.kill(-pgid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** SIGTERM the whole group, wait up to graceMs, then SIGKILL whatever is left. */
export async function killGroup(pgid: number, graceMs: number): Promise<"gone" | "terminated" | "killed"> {
  if (!groupAlive(pgid)) return "gone";
  try {
    process.kill(-pgid, "SIGTERM");
  } catch {
    return "gone";
  }
  const until = Date.now() + graceMs;
  while (Date.now() < until) {
    await sleep(100);
    if (!groupAlive(pgid)) return "terminated";
  }
  try {
    process.kill(-pgid, "SIGKILL");
  } catch {
    /* gone between checks */
  }
  for (let i = 0; i < 20 && groupAlive(pgid); i++) await sleep(50);
  return "killed";
}

export interface CaptureOpts {
  cwd: string;
  env: Record<string, string>;
  timeoutMs: number;
  log?: string;
  /** Kill the group as soon as this flips (Ctrl-C during a long listing or dependency start). */
  abort?: { aborted: boolean };
  /** Called with the group id while it runs, so a crash leaves it in state.json for the reaper. */
  track?: (pgid: number, running: boolean) => void;
}

/** Run a command to completion (group-killed on timeout or abort); output is captured and optionally logged. */
export async function runCapture(cmd: string, opts: CaptureOpts): Promise<{ code: number | null; out: string; timedOut: boolean }> {
  const child = spawn("bash", ["-c", cmd], { cwd: opts.cwd, env: opts.env, stdio: ["ignore", "pipe", "pipe"], detached: true });
  if (child.pid) opts.track?.(child.pid, true);
  const chunks: Buffer[] = [];
  child.stdout?.on("data", (d: Buffer) => chunks.push(d));
  child.stderr?.on("data", (d: Buffer) => chunks.push(d));
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    if (child.pid) void killGroup(child.pid, 2000);
  }, opts.timeoutMs);
  const abortPoll = opts.abort ? setInterval(() => opts.abort!.aborted && child.pid && void killGroup(child.pid, 2000), 200) : undefined;
  const code = await new Promise<number | null>((resolve) => {
    child.on("error", () => resolve(127));
    child.on("close", (c) => resolve(c));
  });
  clearTimeout(timer);
  clearInterval(abortPoll);
  if (child.pid) opts.track?.(child.pid, false);
  const out = Buffer.concat(chunks).toString("utf8");
  if (opts.log) {
    fs.mkdirSync(path.dirname(opts.log), { recursive: true });
    fs.appendFileSync(opts.log, `$ ${cmd}\n${out}${out.endsWith("\n") || !out ? "" : "\n"}`);
  }
  return { code: timedOut ? null : code, out, timedOut };
}

/** Probe a URL; `localhost` is tried on 127.0.0.1 and on ::1, since a server may listen on only one of them. */
export async function httpProbe(url: string, status?: number, timeoutMs = 3000): Promise<{ ok: boolean; detail: string }> {
  let u: URL | undefined;
  try {
    u = new URL(url);
  } catch {
    u = undefined;
  }
  if (u?.hostname !== "localhost") return probeOnce(url, status, timeoutMs);
  const v4 = new URL(url);
  v4.hostname = "127.0.0.1";
  const a = await probeOnce(v4.href, status, timeoutMs);
  if (a.ok) return a;
  const v6 = new URL(url);
  v6.hostname = "[::1]";
  const b = await probeOnce(v6.href, status, timeoutMs);
  if (b.ok) return b;
  return /^HTTP/.test(a.detail) || !/^HTTP/.test(b.detail) ? a : b;
}

async function probeOnce(url: string, status?: number, timeoutMs = 3000): Promise<{ ok: boolean; detail: string }> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), redirect: "manual" });
    await r.body?.cancel().catch(() => {});
    const ok = status ? r.status === status : r.status < 400;
    return { ok, detail: `HTTP ${r.status}` };
  } catch (e) {
    const err = e as Error & { cause?: { code?: string; message?: string } };
    return { ok: false, detail: err.cause?.code ?? err.cause?.message ?? err.message };
  }
}

/** True when something already accepts TCP connections on host:port. */
export function portAnswers(host: string, port: number, timeoutMs = 1000): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = net.connect({ host, port });
    const done = (v: boolean) => {
      sock.destroy();
      resolve(v);
    };
    sock.setTimeout(timeoutMs, () => done(false));
    sock.once("connect", () => done(true));
    sock.once("error", () => done(false));
  });
}

export function portFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.unref();
    srv.once("error", () => resolve(false));
    srv.listen({ port, host: "0.0.0.0", exclusive: true }, () => {
      srv.close(() => {
        const s2 = net.createServer();
        s2.unref();
        s2.once("error", () => resolve(false));
        s2.listen({ port, host: "127.0.0.1", exclusive: true }, () => s2.close(() => resolve(true)));
      });
    });
  });
}

export function anyFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address() as net.AddressInfo;
      srv.close(() => resolve(port));
    });
  });
}

/** A free port from the pool (or any free port), avoiding ports already taken in this run. */
export async function allocatePort(pool: [number, number] | undefined, taken: Set<number>): Promise<{ port?: number; tried?: string }> {
  if (pool) {
    for (let p = pool[0]; p <= pool[1]; p++) if (!taken.has(p) && (await portFree(p))) return { port: p };
    return { tried: pool[0] === pool[1] ? `port ${pool[0]} is already in use` : `ports ${pool[0]}-${pool[1]} are all in use` };
  }
  for (let i = 0; i < 20; i++) {
    const p = await anyFreePort();
    if (!taken.has(p)) return { port: p };
  }
  return { tried: "no free port found" };
}
