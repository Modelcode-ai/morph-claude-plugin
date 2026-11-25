// break-report.mjs <missing|broken> <cmd...>: run cmd, then delete (missing) or truncate (broken) the report it wrote.
// Listings, single-test reruns and retries keep their reports, so witness's fallbacks can be checked.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const [mode, ...cmd] = process.argv.slice(2);
const dir = process.env.WITNESS_REPORT_DIR ?? "";
const keep = /[/\\](rerun|retry)[/\\]|[/\\]list$/.test(dir);
const stdoutReport = process.env.KIT_STDOUT_REPORT === "1" && !keep;
const t0 = Date.now() - 1000;

const stdio = ["ignore", stdoutReport ? "pipe" : "inherit", "inherit"];
const child = process.platform === "win32" ? await underBash(cmd) : spawn("env", cmd, { stdio });
const out = [];
child.stdout?.on("data", (d) => out.push(d));
for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => child.kill(sig));

child.on("close", (code, signal) => {
  if (stdoutReport) {
    const lines = Buffer.concat(out).toString("utf8").split("\n");
    if (mode === "broken") process.stdout.write(lines.slice(0, Math.ceil(lines.length / 2)).join("\n") + '\n{"Action":"pass","Test":');
    else process.stdout.write("(test output discarded by break-report)\n");
  } else if (!keep) {
    const roots = [dir, ...(process.env.KIT_REPORT_PATHS ?? "").split(":").filter(Boolean).map((p) => path.resolve(p))];
    for (const f of roots.flatMap((r) => walk(r))) {
      if (!/\.(xml|trx|json)$/.test(f) || fs.statSync(f).mtimeMs < t0) continue;
      if (mode === "missing") fs.rmSync(f);
      else fs.writeFileSync(f, fs.readFileSync(f).subarray(0, Math.floor(fs.statSync(f).size * 0.4)));
      console.error(`break-report: ${mode === "missing" ? "deleted" : "truncated"} ${f}`);
    }
  }
  process.exit(code ?? (signal ? 1 : 0));
});

function walk(d) {
  let es;
  try {
    es = fs.readdirSync(d, { withFileTypes: true });
  } catch {
    return [];
  }
  return es.flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
}

/** Windows has no `env`, and npm's .bin shims there are shell scripts: run the words (NAME=value first) under Git Bash. */
async function underBash(words) {
  const { resolveShell } = await import("../../src/proc.ts");
  const { posixq } = await import("../../src/util.ts");
  let assigning = true;
  const quoted = words.map((w) => {
    const m = assigning && /^([A-Za-z_]\w*)=(.*)$/s.exec(w);
    assigning = !!m;
    return m ? `${m[1]}=${posixq(m[2])}` : posixq(w);
  });
  return spawn(resolveShell("bash").file, ["-c", quoted.join(" ")], { stdio });
}
