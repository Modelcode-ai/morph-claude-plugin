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

/** Run a command to completion (group-killed on timeout); output is captured and optionally logged. */
export async function runCapture(cmd: string, opts: { cwd: string; env: Record<string, string>; timeoutMs: number; log?: string }): Promise<{ code: number | null; out: string; timedOut: boolean }> {
  const child = spawn("bash", ["-c", cmd], { cwd: opts.cwd, env: opts.env, stdio: ["ignore", "pipe", "pipe"], detached: true });
  const chunks: Buffer[] = [];
  child.stdout?.on("data", (d: Buffer) => chunks.push(d));
  child.stderr?.on("data", (d: Buffer) => chunks.push(d));
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    if (child.pid) void killGroup(child.pid, 2000);
  }, opts.timeoutMs);
  const code = await new Promise<number | null>((resolve) => {
    child.on("error", () => resolve(127));
    child.on("close", (c) => resolve(c));
  });
  clearTimeout(timer);
  const out = Buffer.concat(chunks).toString("utf8");
  if (opts.log) {
    fs.mkdirSync(path.dirname(opts.log), { recursive: true });
    fs.appendFileSync(opts.log, `$ ${cmd}\n${out}${out.endsWith("\n") || !out ? "" : "\n"}`);
  }
  return { code: timedOut ? null : code, out, timedOut };
}

export async function httpProbe(url: string, status?: number, timeoutMs = 3000): Promise<{ ok: boolean; detail: string }> {
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
