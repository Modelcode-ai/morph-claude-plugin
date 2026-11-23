import { spawn, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export const PKG = path.resolve(import.meta.dirname, "..");
export const APPS = path.join(PKG, "testdata", "apps");
export const REPORTS = path.join(PKG, "testdata", "reports");
export const CLI = path.join(PKG, "src", "cli.ts");

export function tmpRepo(toml: string, opts: { git?: boolean; files?: Record<string, string> } = {}): string {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "witness-test-")));
  fs.mkdirSync(path.join(dir, ".witness"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".witness", "witness.toml"), toml.replace(/\$APPS/g, APPS));
  fs.writeFileSync(path.join(dir, ".witness", ".gitignore"), "runs/\ncheck/\ncache/\nup/\nup.json\nrun.lock\n.env\n");
  for (const [f, c] of Object.entries(opts.files ?? {})) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), c);
  }
  if (opts.git) {
    const g = (...a: string[]) => spawnSync("git", a, { cwd: dir, encoding: "utf8" });
    g("init", "-q", "-b", "main");
    g("config", "user.email", "t@example.com");
    g("config", "user.name", "t");
    g("config", "commit.gpgsign", "false");
    g("add", "-A");
    g("commit", "-qm", "init");
  }
  return dir;
}

export interface Result {
  code: number | null;
  stdout: string;
  stderr: string;
  json: Record<string, any> | null;
}

export function witness(cwd: string, args: string[], opts: { env?: Record<string, string>; timeoutMs?: number; onSpawn?: (pid: number) => void } = {}): Promise<Result> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["--no-warnings", CLI, ...args], { cwd, env: { ...process.env, NO_COLOR: "1", ...opts.env }, stdio: ["ignore", "pipe", "pipe"] });
    if (opts.onSpawn && child.pid) opts.onSpawn(child.pid);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    const timer = setTimeout(() => child.kill("SIGKILL"), opts.timeoutMs ?? 60_000);
    child.on("close", (code) => {
      clearTimeout(timer);
      let json = null;
      try {
        json = JSON.parse(stdout);
      } catch {
        /* not json */
      }
      resolve({ code, stdout, stderr, json });
    });
  });
}

export function latest(dir: string): string {
  return path.join(dir, ".witness", "runs", "latest");
}

export function readJson(file: string): any {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function ctrf(dir: string): any {
  return readJson(path.join(latest(dir), "results.ctrf.json"));
}

export const service = (mode: string, extra = "") => `
[[service]]
name = "api"
start = "node $APPS/server.mjs ${mode}"
ready = { http = "\${self.url}/health", timeout = "3s" }
${extra}
`;

export const suite = (mode: string, extra = "") => `
[[suite]]
kind = "api"
name = "fake"
service = "api"
cmd = "node $APPS/suite.mjs ${mode}"
${extra}
`;

export function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
