import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { Diagnosis } from "./diagnosis.ts";
import { groupAlive, killGroup } from "./proc.ts";
import type { Outcome, SuiteSummary } from "./reconcile.ts";
import { git, pidAlive, randHex, readJson, writeJson } from "./util.ts";

export type Phase = "starting" | "deps" | "boot" | "suite" | "against" | "report" | "finished";

export interface Status {
  run_id: string;
  phase: Phase;
  outcome?: Outcome;
  started_at: string;
  finished_at?: string;
  commit: string;
  branch: string;
  dirty: boolean;
  /** Each listed repo's checkout, by its [[repo]] name. */
  repos?: Record<string, { path: string; root: string; commit: string; branch: string; dirty: boolean; via?: string }>;
  label?: string;
  suites: SuiteSummary[];
  diagnosis?: Diagnosis;
  internal_error?: string;
  last_event: string;
  summary?: { tests: number; passed: number; failed: number; skipped: number; pending: number; other: number };
  against?: { ref: string; outcome?: Outcome; parity?: Record<string, number>; diagnosis?: Diagnosis; repos?: Record<string, { ref: string; commit?: string }> };
  pid: number;
}

export interface TrackedProc {
  kind: "service" | "suite" | "setup" | "dependency" | "list" | "rerun";
  name: string;
  pid: number;
  pgid: number;
  pidfile?: string;
  stop?: string;
  cwd?: string;
}

export interface RunState {
  pid: number;
  started_at: string;
  procs: TrackedProc[];
  ports: Record<string, number>;
  worktrees: string[];
}

export function newRunId(now = new Date()): string {
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `r-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}-${randHex(4)}`;
}

export class RunDir {
  dir: string;
  root: string;
  status: Status;
  state: RunState;
  constructor(root: string, runId: string, init: Omit<Status, "run_id" | "phase" | "suites" | "last_event" | "pid" | "started_at">) {
    this.root = root;
    this.dir = path.join(root, runId);
    fs.mkdirSync(path.join(this.dir, "logs"), { recursive: true });
    fs.mkdirSync(path.join(this.dir, "reports"), { recursive: true });
    const now = new Date().toISOString();
    this.status = { run_id: runId, phase: "starting", started_at: now, suites: [], last_event: "run started", pid: process.pid, ...init };
    this.state = { pid: process.pid, started_at: now, procs: [], ports: {}, worktrees: [] };
    this.saveStatus();
    this.saveState();
    this.event("run_started", { label: init.label, commit: init.commit });
  }
  get runId() {
    return this.status.run_id;
  }
  file(...p: string[]) {
    return path.join(this.dir, ...p);
  }
  saveStatus() {
    writeJson(this.file("status.json"), this.status);
  }
  saveState() {
    writeJson(this.file("state.json"), this.state);
  }
  event(type: string, data: Record<string, unknown> = {}, lastEvent?: string) {
    fs.appendFileSync(this.file("events.jsonl"), JSON.stringify({ t: new Date().toISOString(), type, ...data }) + "\n");
    if (lastEvent) {
      this.status.last_event = lastEvent;
      this.saveStatus();
    }
  }
  setPhase(phase: Phase, lastEvent: string) {
    this.status.phase = phase;
    this.status.last_event = lastEvent;
    this.saveStatus();
    this.event("phase", { phase });
  }
  track(p: TrackedProc) {
    this.state.procs.push(p);
    this.saveState();
  }
  untrack(pgid: number) {
    this.state.procs = this.state.procs.filter((p) => p.pgid !== pgid);
    this.saveState();
  }
  /** A runCapture `track` callback that records the group under `kind`/`name`. */
  tracker(kind: TrackedProc["kind"], name: string) {
    return (pgid: number, running: boolean) => (running ? this.track({ kind, name, pid: pgid, pgid }) : this.untrack(pgid));
  }
  linkLatest() {
    const link = path.join(this.root, "latest");
    try {
      fs.rmSync(link, { force: true });
      fs.symlinkSync(this.status.run_id, link);
    } catch {
      fs.writeFileSync(link, this.status.run_id);
    }
  }
}

export function resolveRun(root: string, id: string | undefined): string | null {
  const which = !id || id === "latest" ? "latest" : id;
  const p = path.join(root, which);
  try {
    const st = fs.lstatSync(p);
    if (st.isSymbolicLink()) return path.join(root, fs.readlinkSync(p));
    if (st.isFile()) return path.join(root, fs.readFileSync(p, "utf8").trim());
    if (st.isDirectory()) return p;
  } catch {
    if (which === "latest") {
      const runs = listRuns(root);
      return runs.length ? path.join(root, runs[runs.length - 1]) : null;
    }
  }
  return null;
}

export function listRuns(root: string): string[] {
  try {
    return fs.readdirSync(root).filter((d) => /^r-\d{8}-\d{6}-[0-9a-f]{4}$/.test(d) && fs.existsSync(path.join(root, d, "status.json"))).sort();
  } catch {
    return [];
  }
}

/** Kill what dead runs left behind and mark them interrupted. */
export async function reapStale(root: string, graceMs: number, log: (msg: string) => void): Promise<string[]> {
  const reaped: string[] = [];
  for (const id of listRuns(root)) {
    const dir = path.join(root, id);
    const status = readJson<Status | null>(path.join(dir, "status.json"), null);
    const state = readJson<RunState | null>(path.join(dir, "state.json"), null);
    if (!status || status.phase === "finished" || !state || state.pid === process.pid || pidAlive(state.pid)) continue;
    const fresh = Date.now() - Date.parse(state.started_at) < 24 * 3600_000;
    let killed = 0;
    if (fresh) for (const p of state.procs) if (await killTracked(p, graceMs)) killed++;
    for (const wt of state.worktrees ?? []) removeWorktree(wt);
    status.phase = "finished";
    status.outcome = "interrupted";
    status.finished_at = new Date().toISOString();
    status.last_event = `reaped: witness (pid ${state.pid}) exited without finishing${killed ? `; killed ${killed} leftover process group(s)` : ""}`;
    writeJson(path.join(dir, "status.json"), status);
    fs.appendFileSync(path.join(dir, "events.jsonl"), JSON.stringify({ t: new Date().toISOString(), type: "reaped", by: process.pid, killed }) + "\n");
    state.procs = [];
    writeJson(path.join(dir, "state.json"), state);
    log(`reaped stale run ${id}${killed ? ` (killed ${killed} leftover process group(s))` : ""}`);
    reaped.push(id);
  }
  return reaped;
}

/** Stop one tracked process: its stop command and pidfile pid (daemons that left the group), then its group. */
export async function killTracked(p: TrackedProc, graceMs: number, opts: { runStop?: boolean } = {}): Promise<boolean> {
  let hit = false;
  const pid = p.pidfile ? Number(readText(p.pidfile)) : 0;
  if (p.stop && opts.runStop !== false && (pidAlive(pid) || groupAlive(p.pgid))) {
    spawnSync("bash", ["-c", p.stop], { cwd: p.cwd, stdio: "ignore", timeout: 60_000 });
    hit = true;
  }
  if (pid > 1 && pidAlive(pid)) {
    try {
      process.kill(pid, graceMs ? "SIGTERM" : "SIGKILL");
    } catch {
      /* gone */
    }
    const until = Date.now() + graceMs;
    while (pidAlive(pid) && Date.now() < until) await new Promise((r) => setTimeout(r, 100));
    if (pidAlive(pid)) {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        /* gone */
      }
    }
    hit = true;
  }
  if (groupAlive(p.pgid)) {
    await killGroup(p.pgid, graceMs);
    hit = true;
  }
  return hit;
}

function readText(f: string): string {
  try {
    return fs.readFileSync(f, "utf8").trim();
  } catch {
    return "";
  }
}

function removeWorktree(wt: string) {
  const common = git(wt, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  if (common.ok) spawnSync("git", ["--git-dir", common.out, "worktree", "remove", "--force", wt]);
  fs.rmSync(wt, { recursive: true, force: true });
  if (common.ok) spawnSync("git", ["--git-dir", common.out, "worktree", "prune"]);
}

export function pruneRuns(root: string, keep: number) {
  const runs = listRuns(root);
  for (const id of runs.slice(0, Math.max(0, runs.length - keep))) {
    const st = readJson<Status | null>(path.join(root, id, "status.json"), null);
    if (st && st.phase !== "finished") continue;
    fs.rmSync(path.join(root, id), { recursive: true, force: true });
  }
}

export class LockError extends Error {}

/** One witness run per checkout at a time; a stale lock from a dead pid is taken over. */
export function acquireLock(file: string): () => void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = fs.openSync(file, "wx");
      fs.writeSync(fd, String(process.pid));
      fs.closeSync(fd);
      return () => {
        try {
          if (fs.readFileSync(file, "utf8").trim() === String(process.pid)) fs.rmSync(file, { force: true });
        } catch {
          /* already gone */
        }
      };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      const pid = Number(fs.readFileSync(file, "utf8").trim());
      if (pidAlive(pid) && pid !== process.pid) throw new LockError(`another witness run (pid ${pid}) is using this checkout; wait for it or stop it (lock: ${file})`);
      fs.rmSync(file, { force: true });
    }
  }
  throw new LockError(`could not take the lock ${file}`);
}
