import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";

export const sha = (s: string | Buffer) => createHash("sha256").update(s).digest("hex").slice(0, 16);

export function hashFiles(files: string[]): string {
  const h = createHash("sha256");
  for (const f of [...files].sort()) {
    h.update(f);
    if (fs.existsSync(f)) h.update(fs.readFileSync(f));
  }
  return h.digest("hex").slice(0, 16);
}

export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address() as net.AddressInfo;
      srv.close(() => resolve(port));
    });
  });
}

export function git(cwd: string, args: string[], env: NodeJS.ProcessEnv = {}): string {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, ...env } });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr.trim()}`);
  return r.stdout.trim();
}

export function tryGit(cwd: string, args: string[]): string | null {
  try {
    return git(cwd, args);
  } catch {
    return null;
  }
}

/** Tree hash of the working directory including uncommitted and untracked (non-ignored) files. */
export function worktreeHash(repo: string, exclude: string[] = []): string {
  const idx = path.join(os.tmpdir(), `witness-idx-${process.pid}-${Date.now()}`);
  try {
    const env = { GIT_INDEX_FILE: idx };
    git(repo, ["read-tree", "HEAD"], env);
    const gi = path.join(repo, ".witness", ".gitignore");
    if (fs.existsSync(path.dirname(gi)) && !fs.existsSync(gi)) fs.writeFileSync(gi, "records/\ncache/\n");
    git(repo, ["add", "-A", "--", "."], env);
    if (exclude.length) git(repo, ["rm", "-r", "--cached", "-q", "--ignore-unmatch", "--", ...exclude], env);
    return git(repo, ["write-tree"], env).slice(0, 16);
  } finally {
    fs.rmSync(idx, { force: true });
  }
}

export interface RunResult {
  code: number;
  ms: number;
}

/** Run a shell command, streaming output to a log file. */
export function runShell(
  cmd: string,
  opts: { cwd: string; env: NodeJS.ProcessEnv; log: string; timeoutMs?: number },
): Promise<RunResult> {
  return new Promise((resolve) => {
    const t0 = Date.now();
    fs.mkdirSync(path.dirname(opts.log), { recursive: true });
    const out = fs.openSync(opts.log, "a");
    fs.writeSync(out, `\n$ ${cmd}\n`);
    const child = spawn("bash", ["-c", cmd], {
      cwd: opts.cwd,
      env: { ...process.env, ...opts.env },
      stdio: ["ignore", out, out],
      detached: true,
    });
    let timer: NodeJS.Timeout | undefined;
    if (opts.timeoutMs) timer = setTimeout(() => killTree(child), opts.timeoutMs);
    child.on("exit", (code) => {
      if (timer) clearTimeout(timer);
      fs.closeSync(out);
      resolve({ code: code ?? 1, ms: Date.now() - t0 });
    });
  });
}

export function startShell(cmd: string, opts: { cwd: string; env: NodeJS.ProcessEnv; log: string }): ChildProcess {
  fs.mkdirSync(path.dirname(opts.log), { recursive: true });
  const out = fs.openSync(opts.log, "a");
  fs.writeSync(out, `\n$ ${cmd}\n`);
  const child = spawn("bash", ["-c", cmd], {
    cwd: opts.cwd,
    env: { ...process.env, ...opts.env },
    stdio: ["ignore", out, out],
    detached: true,
  });
  child.on("exit", () => fs.closeSync(out));
  return child;
}

export function killTree(child: ChildProcess, signal: NodeJS.Signals = "SIGTERM") {
  if (child.pid == null || child.exitCode != null) return;
  try {
    process.kill(-child.pid, signal);
  } catch {
    /* already gone */
  }
}

export function tail(file: string, lines = 30): string {
  if (!fs.existsSync(file)) return "";
  const all = fs.readFileSync(file, "utf8").split("\n");
  return all.slice(-lines).join("\n");
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function fmtMs(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

export function parseDuration(s: string | number | undefined, dflt: number): number {
  if (s == null) return dflt;
  if (typeof s === "number") return s * 1000;
  const m = /^(\d+(?:\.\d+)?)(ms|s|m)?$/.exec(s.trim());
  if (!m) return dflt;
  const n = Number(m[1]);
  return m[2] === "ms" ? n : m[2] === "m" ? n * 60000 : n * 1000;
}

export function readJson<T>(file: string, dflt: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return dflt;
  }
}

export function writeJson(file: string, data: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code: string) => (s: string) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
export const color = { dim: c("2"), bold: c("1"), red: c("31"), green: c("32"), yellow: c("33"), blue: c("34") };

/** Courtroom-flavored progress line: `phase · message`. */
export function say(phase: string, msg: string) {
  process.stderr.write(`${color.dim(phase.padStart(18))} ${color.dim("·")} ${msg}\n`);
}
