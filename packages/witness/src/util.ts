import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export const sha = (s: string | Buffer) => createHash("sha256").update(s).digest("hex").slice(0, 16);

export const arr = <T>(x: T | T[] | undefined | null): T[] => (x == null ? [] : Array.isArray(x) ? x : [x]);

export const randHex = (n: number) => randomBytes(Math.ceil(n / 2)).toString("hex").slice(0, n);

/** Parse "90s", "5m", "1h", "250ms" or a number of seconds into milliseconds; null when malformed. */
export function parseDuration(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v) && v >= 0) return v * 1000;
  if (typeof v !== "string") return null;
  const m = /^(\d+(?:\.\d+)?)\s*(ms|s|m|h)?$/.exec(v.trim());
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2] ?? "s";
  return Math.round(unit === "ms" ? n : unit === "s" ? n * 1000 : unit === "m" ? n * 60_000 : n * 3_600_000);
}

export function fmtDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m${String(s % 60).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}m`;
}

export function fmtClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}

export function readJson<T>(file: string, dflt: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return dflt;
  }
}

/** Write JSON atomically so a concurrent reader never sees half a file. */
export function writeJson(file: string, data: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n");
  fs.renameSync(tmp, file);
}

export function tailLines(file: string, lines = 80, maxBytes = 256 * 1024): string[] {
  try {
    const st = fs.statSync(file);
    const fd = fs.openSync(file, "r");
    const len = Math.min(st.size, maxBytes);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, st.size - len);
    fs.closeSync(fd);
    return buf.toString("utf8").split(/\r?\n/).filter((l) => l.trim() !== "").slice(-lines);
  } catch {
    return [];
  }
}

export function fileSize(file: string): number {
  try {
    return fs.statSync(file).size;
  } catch {
    return 0;
  }
}

export function pidAlive(pid: number | undefined | null): boolean {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** `p` with forward slashes on Windows, which bash and Windows programs both read. */
export const slashPath = (p: string, platform: NodeJS.Platform = process.platform) => (platform === "win32" ? p.replace(/\\/g, "/") : p);

/** The canonical path; native, so Windows 8.3 short names (RUNNER~1) expand as they do in the paths git prints. */
export function realPath(p: string): string {
  try {
    return fs.realpathSync.native(p);
  } catch {
    return p;
  }
}

export function git(cwd: string, args: string[]): { ok: boolean; out: string; err: string } {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  return { ok: r.status === 0, out: (r.stdout ?? "").trim(), err: (r.stderr ?? "").trim() };
}

export function gitInfo(cwd: string): { commit: string; branch: string; dirty: boolean } {
  const commit = git(cwd, ["rev-parse", "HEAD"]);
  const branch = git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const status = git(cwd, ["status", "--porcelain", "--untracked-files=normal", "--", ".", ":(exclude).witness"]);
  return { commit: commit.ok ? commit.out : "", branch: branch.ok ? branch.out : "", dirty: status.ok ? status.out !== "" : false };
}

/** Minimal glob: supports **, *, ? and {a,b}; matched against "/"-separated relative paths. */
export function globToRegExp(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        i++;
        if (glob[i + 1] === "/") {
          i++;
          re += "(?:.*/)?";
        } else re += ".*";
      } else re += "[^/]*";
    } else if (c === "?") re += "[^/]";
    else if (c === "{") {
      const end = glob.indexOf("}", i);
      if (end < 0) re += "\\{";
      else {
        re += "(?:" + glob.slice(i + 1, end).split(",").map((s) => s.replace(/[.+^$()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*")).join("|") + ")";
        i = end;
      }
    } else re += c.replace(/[.+^$()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

const SKIP_DIRS = new Set([".git", "node_modules", ".witness", ".venv", "venv", "__pycache__", ".gradle", ".idea"]);

/** Files under base matching any of the globs (relative paths), skipping VCS and dependency folders. */
export function globFiles(base: string, globs: string[], opts: { maxDepth?: number; skipDirs?: Set<string> } = {}): string[] {
  const res = globs.map(globToRegExp);
  const skip = opts.skipDirs ?? SKIP_DIRS;
  const maxDepth = opts.maxDepth ?? 12;
  const out: string[] = [];
  const walk = (dir: string, rel: string, depth: number) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (!skip.has(e.name) && depth < maxDepth) walk(path.join(dir, e.name), r, depth + 1);
      } else if (res.some((x) => x.test(r))) out.push(r);
    }
  };
  walk(base, "", 0);
  return out.sort();
}

/** Split a simple shell command into words; null when it uses operators we can't safely rewrite. */
export function shellWords(cmd: string): string[] | null {
  const out: string[] = [];
  let cur = "";
  let has = false;
  let q: string | null = null;
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (q) {
      if (c === q) q = null;
      else if (c === "\\" && q === '"' && i + 1 < cmd.length) cur += cmd[++i];
      else cur += c;
    } else if (c === "'" || c === '"') {
      q = c;
      has = true;
    } else if (c === "\\" && i + 1 < cmd.length) {
      cur += cmd[++i];
      has = true;
    } else if (/\s/.test(c)) {
      if (has || cur) out.push(cur);
      cur = "";
      has = false;
    } else if ("|&;<>()`$".includes(c)) return null;
    else cur += c;
  }
  if (q) return null;
  if (has || cur) out.push(cur);
  return out;
}

let quoteStyle: "posix" | "cmd" = "posix";

/** How shq quotes from now on; follows the shell commands run under (proc.ts useShell). */
export function setQuoteStyle(style: "posix" | "cmd") {
  quoteStyle = style;
}

/** Quote a word for the shell commands run under: bash, or cmd.exe on Windows without Git Bash. */
export const shq = (s: string) => (quoteStyle === "cmd" ? cmdq(s) : posixq(s));

export const posixq = (s: string) => (/^[\w@%+=:,./-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`);

/** Quote a word for cmd.exe and the MSVC argument parser most Windows programs use. */
export const cmdq = (s: string) => (/^[\w@+=:,./\\-]+$/.test(s) ? s : `"${s.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, "$1$1")}"`);

export const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
