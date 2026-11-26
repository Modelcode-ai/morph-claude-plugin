import { type ChildProcess, spawn, spawnSync, type StdioOptions } from "node:child_process";
import * as fs from "node:fs";
import * as net from "node:net";
import * as path from "node:path";
import { type QuoteStyle, setQuoteStyle, sleep, withQuoteStyle } from "./util.ts";

/** The OS facts process handling depends on; tests pass a fake one to exercise the Windows branches anywhere. */
export interface Host {
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
  isFile: (p: string) => boolean;
  /** process.kill, including its ESRCH/EPERM errors. */
  kill: (pid: number, signal: NodeJS.Signals | 0) => void;
  /** `taskkill /T [/F] /PID pid`; returns its exit status. */
  taskkill: (pid: number, force: boolean) => number | null;
}

export const HOST: Host = {
  platform: process.platform,
  env: process.env,
  isFile: (p) => {
    try {
      return fs.statSync(p).isFile();
    } catch {
      return false;
    }
  },
  kill: (pid, signal) => void process.kill(pid, signal),
  taskkill: (pid, force) => {
    const exe = process.env.SystemRoot ? path.join(process.env.SystemRoot, "System32", "taskkill.exe") : "taskkill";
    return spawnSync(exe, ["/T", ...(force ? ["/F"] : []), "/PID", String(pid)], { stdio: "ignore", windowsHide: true, timeout: 15_000 }).status;
  },
};

/** An environment variable by name; case-insensitive on Windows, where `Path` and `PATH` are the same variable. */
export function envGet(env: NodeJS.ProcessEnv, name: string, platform: NodeJS.Platform = process.platform): string | undefined {
  if (env[name] !== undefined || platform !== "win32") return env[name];
  const k = Object.keys(env).find((x) => x.toUpperCase() === name.toUpperCase());
  return k === undefined ? undefined : env[k];
}

const SCRUB = ["ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN", "OPENAI_API_KEY"];

export function childEnv(base: Record<string, string>, extra: Record<string, string> = {}, platform: NodeJS.Platform = process.platform): Record<string, string> {
  const norm = (k: string) => (platform === "win32" ? k.toUpperCase() : k);
  const set = new Map(Object.keys(extra).map((k) => [norm(k), k]));
  const env = { ...base, ...extra };
  // a spread env is case-sensitive even on Windows: drop base `Path` when extra sets `PATH`, or the child gets both
  for (const k of Object.keys(base)) if (set.has(norm(k)) && set.get(norm(k)) !== k) delete env[k];
  for (const k of Object.keys(env)) if (SCRUB.includes(norm(k)) && !set.has(norm(k))) delete env[k];
  return env;
}

export type ShellPref = "auto" | "bash" | "pwsh" | "powershell" | "cmd";
export const SHELL_PREFS: ShellPref[] = ["auto", "bash", "pwsh", "powershell", "cmd"];

export interface Shell {
  kind: "bash" | "pwsh" | "powershell" | "cmd";
  file: string;
}

export class ShellError extends Error {}

export const isPowerShell = (sh: Shell) => sh.kind === "pwsh" || sh.kind === "powershell";

export const quoteStyleOf = (sh: Shell): QuoteStyle => (sh.kind === "bash" ? "posix" : sh.kind === "cmd" ? "cmd" : "pwsh");

/** The shell witness.toml commands run under: bash on macOS/Linux (pwsh when asked); on Windows pwsh, then Windows PowerShell, then cmd.exe, and bash only when asked. */
export function resolveShell(pref: ShellPref = "auto", host: Host = HOST): Shell {
  if (host.platform !== "win32") {
    if (pref !== "pwsh") return { kind: "bash", file: "bash" };
    if ((envGet(host.env, "PATH", host.platform) ?? "").split(":").some((d) => d && host.isFile(path.posix.join(d, "pwsh")))) return { kind: "pwsh", file: "pwsh" };
    throw new ShellError('shell = "pwsh" but pwsh is not on PATH (install PowerShell 7)');
  }
  if (pref === "bash") {
    const bash = findWindowsBash(host);
    if (bash) return { kind: "bash", file: bash };
    throw new ShellError('shell = "bash" but no bash.exe was found (install Git for Windows, or put its bin folder on PATH); WSL\'s bash can\'t run Windows commands');
  }
  if (pref === "auto" || pref === "pwsh") {
    const pwsh = findPwsh(host);
    if (pwsh) return { kind: "pwsh", file: pwsh };
    if (pref === "pwsh") throw new ShellError('shell = "pwsh" but no pwsh.exe was found (install PowerShell 7, or set "powershell" for Windows PowerShell 5.1)');
  }
  if (pref === "auto" || pref === "powershell") {
    const ps = findWindowsPowerShell(host);
    if (ps) return { kind: "powershell", file: ps };
    if (pref === "powershell") throw new ShellError('shell = "powershell" but powershell.exe was not found');
  }
  return { kind: "cmd", file: envGet(host.env, "ComSpec", "win32") || "cmd.exe" };
}

const winPath = (host: Host) => (envGet(host.env, "PATH", "win32") ?? "").split(";").filter(Boolean);

/** pwsh.exe (PowerShell 7) on PATH, else in its default install folder. */
function findPwsh(host: Host): string | undefined {
  const w = path.win32;
  for (const d of winPath(host)) if (host.isFile(w.join(d, "pwsh.exe"))) return w.join(d, "pwsh.exe");
  const bases = [envGet(host.env, "ProgramFiles", "win32"), envGet(host.env, "ProgramW6432", "win32")];
  return bases.map((b) => b && w.join(b, "PowerShell", "7", "pwsh.exe")).find((f) => f && host.isFile(f)) || undefined;
}

/** Windows PowerShell 5.1, which every Windows has in System32. */
function findWindowsPowerShell(host: Host): string | undefined {
  const w = path.win32;
  const sys = w.join(envGet(host.env, "SystemRoot", "win32") ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  if (host.isFile(sys)) return sys;
  for (const d of winPath(host)) if (host.isFile(w.join(d, "powershell.exe"))) return w.join(d, "powershell.exe");
}

/** bash.exe on PATH (not WSL's launcher, which runs commands inside Linux), else the one next to git.exe, else Git's default install. */
export function findWindowsBash(host: Host): string | undefined {
  const w = path.win32;
  const sysRoot = (envGet(host.env, "SystemRoot", "win32") ?? "C:\\Windows").toLowerCase();
  const dirs = winPath(host);
  const wsl = (d: string) => w.resolve(d).toLowerCase().startsWith(w.join(sysRoot, "system32")) || /\\windowsapps\\?$/i.test(d);
  for (const d of dirs) if (!wsl(d) && host.isFile(w.join(d, "bash.exe"))) return w.join(d, "bash.exe");
  for (const d of dirs) {
    if (!host.isFile(w.join(d, "git.exe"))) continue;
    const root = /\\(mingw64\\bin|cmd|bin)\\?$/i.test(d) ? d.replace(/\\(mingw64\\bin|cmd|bin)\\?$/i, "") : w.dirname(d);
    if (host.isFile(w.join(root, "bin", "bash.exe"))) return w.join(root, "bin", "bash.exe");
  }
  const local = envGet(host.env, "LOCALAPPDATA", "win32");
  const installs = [envGet(host.env, "ProgramFiles", "win32"), envGet(host.env, "ProgramW6432", "win32"), local && w.join(local, "Programs")];
  return installs.map((base) => base && w.join(base, "Git", "bin", "bash.exe")).find((f) => f && host.isFile(f)) || undefined;
}

// Fail fast like bash -e, keep a native command's exit code, and pass arguments the same way on 5.1 and 7 (shq relies on it).
const PS_PRELUDE = [
  "$ErrorActionPreference = 'Stop'",
  "$PSNativeCommandUseErrorActionPreference = $true",
  "$PSNativeCommandArgumentPassing = 'Legacy'",
  "$ProgressPreference = 'SilentlyContinue'",
  "$OutputEncoding = New-Object System.Text.UTF8Encoding $false",
  "try { [Console]::OutputEncoding = $OutputEncoding } catch {}",
  "try {",
].join("\n");
const PS_EPILOGUE = [
  "} catch {",
  "  if ($_.Exception.GetType().Name -ne 'NativeCommandExitException') { [Console]::Error.WriteLine(\"$_\") }",
  "  if ($_.FullyQualifiedErrorId -like 'CommandNotFoundException*') { exit 127 }",
  "  if ($LASTEXITCODE) { exit $LASTEXITCODE }",
  "  exit 1",
  "}",
  "exit $LASTEXITCODE",
].join("\n");

/** The script PowerShell runs for `cmd`. */
export const psScript = (cmd: string) => `${PS_PRELUDE}\n${cmd}\n${PS_EPILOGUE}`;

/** How to start `cmd` under `shell`; cmd.exe gets Node's own `shell: true` command line, PowerShell an encoded script (no quoting layer). */
export function shellArgv(shell: Shell, cmd: string): { file: string; args: string[]; windowsVerbatimArguments?: boolean } {
  if (shell.kind === "cmd") return { file: shell.file, args: ["/d", "/s", "/c", `"${cmd}"`], windowsVerbatimArguments: true };
  if (shell.kind === "bash") return { file: shell.file, args: ["-c", cmd] };
  const script = psScript(cmd);
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  const flags = ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass"];
  // Windows PowerShell writes CLIXML progress to stderr for an encoded command; a command line holds 32767 characters
  if (shell.kind === "powershell" || encoded.length >= 30_000) return { file: shell.file, args: [...flags, "-Command", script] };
  return { file: shell.file, args: [...flags, "-EncodedCommand", encoded] };
}

const PLAIN = /^[\w+=:./\\-]+(?:[ \t]+[\w+=:./\\-]+)*$/;

/** On Windows, a command of plain words (no quotes, variables or operators) whose program is an .exe: started directly, without PowerShell's startup. */
export function directArgv(cmd: string, cwd: string, env: NodeJS.ProcessEnv, host: Host = HOST): { file: string; args: string[] } | null {
  if (host.platform !== "win32" || !PLAIN.test(cmd.trim())) return null;
  const [prog, ...args] = cmd.trim().split(/[ \t]+/);
  const w = path.win32;
  const exts = [".ps1", ...(envGet(env, "PATHEXT", "win32") ?? ".COM;.EXE;.BAT;.CMD").toLowerCase().split(";").filter(Boolean)];
  const dirs = /[\\/]/.test(prog) ? [w.resolve(cwd, w.dirname(prog))] : (envGet(env, "PATH", "win32") ?? "").split(";").filter(Boolean);
  const name = w.basename(prog);
  // the first match is what PowerShell would run; only an .exe or .com starts without a shell
  for (const d of dirs) {
    for (const f of /\.\w+$/.test(name) ? [name] : exts.map((e) => name + e)) {
      if (host.isFile(w.join(d, f))) return /\.(exe|com)$/i.test(f) ? { file: w.join(d, f), args } : null;
    }
  }
  return null;
}

/** How to start `cmd` under `sh`, directly when directArgv allows it. */
function commandArgv(sh: Shell, cmd: string, cwd: string, env: NodeJS.ProcessEnv): { file: string; args: string[]; windowsVerbatimArguments?: boolean } {
  return (isPowerShell(sh) && directArgv(cmd, cwd, env)) || shellArgv(sh, cmd);
}

let runPref: ShellPref = "auto";
let shellHost: Host = HOST;
const resolved = new Map<ShellPref, Shell>();

/** Pick `[run] shell` for this process; shq quotes for it from then on. */
export function useShell(pref: ShellPref = "auto", host: Host = HOST): Shell {
  runPref = pref;
  shellHost = host;
  resolved.clear();
  const sh = shellFor();
  setQuoteStyle(quoteStyleOf(sh));
  return sh;
}

/** The shell for a service's or suite's own `shell`; unset, `[run] shell`. */
export function shellFor(pref?: ShellPref): Shell {
  const p = pref ?? runPref;
  let sh = resolved.get(p);
  if (!sh) {
    sh = resolveShell(p, shellHost);
    resolved.set(p, sh);
  }
  return sh;
}

export const activeShell = () => shellFor();

/** Run `fn` (synchronous) with shq quoting for the shell `pref` resolves to. */
export const quotedFor = <T>(pref: ShellPref | undefined, fn: () => T): T => withQuoteStyle(quoteStyleOf(shellFor(pref)), fn);

/** Starts its arguments attached and exits with their exit code. */
const PS_HOST = `const c = require("child_process").spawn(process.argv[1], process.argv.slice(2), { stdio: "inherit", windowsHide: true }); c.on("error", () => process.exit(127)); c.on("exit", (code) => process.exit(code ?? 1));`;

/** Start `cmd` in its own process group (POSIX) or as the root of its own process tree (Windows). */
function spawnShell(cmd: string, o: { cwd: string; env: Record<string, string>; stdio: StdioOptions; shell?: ShellPref }): ChildProcess {
  const shell = shellFor(o.shell);
  let sh = commandArgv(shell, cmd, o.cwd, o.env);
  // PowerShell started detached (no console) exits 0 having run nothing, and attached it would die with witness: a detached node hosts it
  if (process.platform === "win32" && isPowerShell(shell) && sh.file === shell.file) sh = { file: process.execPath, args: ["-e", PS_HOST, "--", sh.file, ...sh.args] };
  return spawn(sh.file, sh.args, { cwd: o.cwd, env: o.env, stdio: o.stdio, detached: true, windowsHide: true, windowsVerbatimArguments: sh.windowsVerbatimArguments });
}

/** Run `cmd` to completion under its shell, ignoring its output (stop commands during cleanup). */
export function runShellSync(cmd: string, o: { cwd?: string; timeoutMs: number; shell?: ShellPref }) {
  const sh = commandArgv(shellFor(o.shell), cmd, o.cwd ?? process.cwd(), process.env);
  return spawnSync(sh.file, sh.args, { cwd: o.cwd, stdio: "ignore", timeout: o.timeoutMs, windowsHide: true, windowsVerbatimArguments: sh.windowsVerbatimArguments });
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

/** A log fd for a child to append to. On Windows an "a" handle lacks FILE_WRITE_DATA and Git Bash's writes to it fail, so open it read-write and read to the end. */
function openLogForChild(log: string, platform: NodeJS.Platform = process.platform): number {
  if (platform !== "win32") return fs.openSync(log, "a");
  const fd = fs.openSync(log, fs.existsSync(log) ? "r+" : "w+");
  const buf = Buffer.alloc(1 << 16);
  while (fs.readSync(fd, buf, 0, buf.length, null) > 0);
  return fd;
}

/** Start `cmd` under the shell in its own process group (tree, on Windows), appending output to `log`. */
export function spawnGroup(cmd: string, opts: { name: string; cwd: string; env: Record<string, string>; log: string; shell?: ShellPref }): Proc {
  fs.mkdirSync(path.dirname(opts.log), { recursive: true });
  const fd = openLogForChild(opts.log);
  fs.writeSync(fd, `$ ${cmd}\n`);
  const child = spawnShell(cmd, { cwd: opts.cwd, env: opts.env, stdio: ["ignore", fd, fd], shell: opts.shell });
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

/** The pid in a pidfile (0 if none yet), UTF-16 too (Windows PowerShell's `>`); under Git Bash, `$!` is an MSYS pid, mapped to its Windows pid through /proc. */
export function pidFromFile(file: string, shell?: ShellPref, host: Host = HOST): number {
  let pid = 0;
  try {
    const buf = fs.readFileSync(file);
    const text = buf[0] === 0xff && buf[1] === 0xfe ? buf.subarray(2).toString("utf16le") : buf.toString("utf8");
    pid = Number(text.replace(/^\uFEFF/, "").trim()) || 0;
  } catch {
    return 0;
  }
  const sh = shellFor(shell);
  if (pid <= 0 || host.platform !== "win32" || sh.kind !== "bash") return pid;
  const r = spawnSync(sh.file, ["-c", `cat /proc/${pid}/winpid 2>/dev/null`], { encoding: "utf8", windowsHide: true, timeout: 10_000 });
  return Number(r.stdout?.trim()) || pid;
}

/** On Windows `pgid` is the tree's root pid: the tree counts as alive while its root is. */
export function groupAlive(pgid: number, host: Host = HOST): boolean {
  if (!pgid || pgid <= 1) return false;
  try {
    host.kill(host.platform === "win32" ? pgid : -pgid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** SIGTERM (or SIGKILL) a process group; on Windows taskkill its tree, forced when it won't close politely (console programs never do). */
function signalTree(pgid: number, force: boolean, host: Host) {
  if (host.platform !== "win32") return host.kill(-pgid, force ? "SIGKILL" : "SIGTERM");
  if (force || host.taskkill(pgid, false) !== 0) host.taskkill(pgid, true);
}

/** SIGTERM (or SIGKILL) one process, e.g. a pidfile daemon; on Windows it is stopped with its tree, as signalTree does. */
export function signalPid(pid: number, force: boolean, host: Host = HOST) {
  if (host.platform === "win32") return signalTree(pid, force, host);
  host.kill(pid, force ? "SIGKILL" : "SIGTERM");
}

/** SIGTERM the whole group, wait up to graceMs, then SIGKILL whatever is left (taskkill /T, then /T /F, on Windows). */
export async function killGroup(pgid: number, graceMs: number, host: Host = HOST): Promise<"gone" | "terminated" | "killed"> {
  if (!groupAlive(pgid, host)) return "gone";
  try {
    signalTree(pgid, false, host);
  } catch {
    return "gone";
  }
  const until = Date.now() + graceMs;
  while (Date.now() < until) {
    await sleep(100);
    if (!groupAlive(pgid, host)) return "terminated";
  }
  try {
    signalTree(pgid, true, host);
  } catch {
    /* gone between checks */
  }
  for (let i = 0; i < 20 && groupAlive(pgid, host); i++) await sleep(50);
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
  /** The service's or suite's `shell`; unset, `[run] shell`. */
  shell?: ShellPref;
}

/** Run a command to completion (group-killed on timeout or abort); output is captured and optionally logged. */
export async function runCapture(cmd: string, opts: CaptureOpts): Promise<{ code: number | null; out: string; timedOut: boolean }> {
  const child = spawnShell(cmd, { cwd: opts.cwd, env: opts.env, stdio: ["ignore", "pipe", "pipe"], shell: opts.shell });
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
