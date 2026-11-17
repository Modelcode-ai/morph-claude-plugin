#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { loadClaims } from "./claims.ts";
import { ContractError, findRoot, loadContract, TEMPLATE } from "./contract.ts";
import { lint } from "./lint.ts";
import { summaryLines, VERDICT_WORD } from "./record.ts";
import { Mistrial, runCleanups, Side } from "./session.ts";
import { color, readJson, worktreeHash } from "./util.ts";
import { verify } from "./verify.ts";

const HELP = `witness: verify a change at its API boundary and keep the record.

Usage:
  witness verify [--level medium|high] [--base <ref> | --no-base] [--no-judge]
                 [--source <file>]... [--why <text>] [--fresh] [--no-rerun] [--json]
  witness lint                 check claims and contract without running anything
  witness doctor               check prerequisites, then boot the app once and probe it
  witness init                 write a starter .witness/witness.toml and VERIFY.md
  witness status [--hook]      is the latest record fresh for the current working tree?
  witness open                 print (and on macOS open) the latest record
  witness report [--format agent|pr|summary]   print a view of the latest record

Levels: medium checks the change against its claims; high also cross-examines the
origin (the base commit) and compares what both apps returned.
Exit codes: 0 proven · 1 needs a look or nothing proven · 2 mistrial (app or claims couldn't be put on trial) · 3 usage.`;

function args(argv: string[]) {
  const flags: Record<string, string | boolean | string[]> = {};
  const pos: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const [k, inline] = a.slice(2).split("=", 2);
      const takes = ["level", "base", "source", "why", "format"].includes(k);
      const v = inline ?? (takes ? argv[++i] : true);
      if (k === "source") (flags.source = (flags.source as string[]) ?? []).push(String(v));
      else flags[k] = v;
    } else pos.push(a);
  }
  return { cmd: pos[0], pos: pos.slice(1), flags };
}

function root(): string {
  const r = findRoot(process.cwd());
  if (!r) {
    console.error("No .witness/witness.toml found here or in a parent folder. Run `witness init` in the repo root.");
    process.exit(3);
  }
  return r;
}

function latestDir(home: string): string | null {
  const recs = path.join(home, "records");
  if (!fs.existsSync(recs)) return null;
  const dirs = fs.readdirSync(recs).filter((d) => d !== "latest" && fs.existsSync(path.join(recs, d, "bundle.json"))).sort();
  return dirs.length ? path.join(recs, dirs[dirs.length - 1]) : null;
}

async function main() {
  const { cmd, flags } = args(process.argv.slice(2));
  if (!cmd || flags.help || cmd === "help") {
    console.log(HELP);
    return;
  }
  try {
    switch (cmd) {
      case "verify": {
        const contract = loadContract(root());
        const level = String(flags.level ?? "medium");
        if (level !== "medium" && level !== "high") throw new ContractError(`--level must be medium or high, not ${level}`);
        const { bundle, dir } = await verify(contract, {
          level,
          base: flags["no-base"] ? null : (flags.base as string | undefined),
          judge: !flags["no-judge"],
          sources: (flags.source as string[]) ?? [],
          why: flags.why as string | undefined,
          rerun: !flags["no-rerun"],
          fresh: !!flags.fresh,
        });
        if (flags.json) console.log(JSON.stringify({ verdict: bundle.verdict, counts: bundle.counts, record: dir }, null, 2));
        else {
          const lines = summaryLines(bundle);
          const col = bundle.verdict === "proven" ? color.green : bundle.verdict === "mistrial" || bundle.verdict === "unproven" ? color.yellow : color.red;
          console.log("\n" + col(color.bold(lines[0])));
          for (const l of lines.slice(1)) console.log(l);
          console.log(`\nRecord:  ${path.join(dir, "index.html")}`);
          console.log(`For agents: ${path.join(dir, "agent.md")}`);
        }
        process.exitCode = bundle.verdict === "proven" ? 0 : bundle.verdict === "mistrial" ? 2 : 1;
        return;
      }
      case "lint": {
        const contract = loadContract(root());
        const files = loadClaims(contract.home);
        const issues = lint(contract, files);
        const n = files.reduce((a, f) => a + f.claims.length, 0);
        for (const i of issues) console.log(`${i.level === "error" ? color.red("error") : color.yellow("warning")}  ${i.message}`);
        console.log(`${n} claim(s) in ${files.length} file(s) · ${issues.filter((i) => i.level === "error").length} error(s) · ${issues.filter((i) => i.level === "warning").length} warning(s)`);
        process.exitCode = issues.some((i) => i.level === "error") ? 1 : 0;
        return;
      }
      case "doctor": {
        const r = root();
        const checks: [string, boolean, string][] = [];
        const docker = spawnSync("docker", ["info", "--format", "{{.ServerVersion}}"], { encoding: "utf8" });
        checks.push(["docker is running", docker.status === 0, "Start Docker Desktop (needed if your contract uses containers)."]);
        checks.push(["git repository", spawnSync("git", ["rev-parse"], { cwd: r }).status === 0, "Run witness inside a git repository."]);
        const claude = spawnSync(process.env.WITNESS_CLAUDE_BIN || "claude", ["--version"], { encoding: "utf8" });
        checks.push(["claude CLI for the judge", claude.status === 0, "Install Claude Code, or run verify with --no-judge."]);
        let contract;
        try {
          contract = loadContract(r);
          checks.push(["contract parses", true, ""]);
        } catch (e) {
          checks.push(["contract parses", false, (e as Error).message]);
        }
        for (const [name, ok, fix] of checks) console.log(`${ok ? color.green("ok  ") : color.red("FAIL")} ${name}${ok ? "" : `  →  ${fix}`}`);
        if (!contract || checks.some((c) => !c[1])) {
          process.exitCode = 2;
          return;
        }
        const logDir = path.join(contract.home, "records", "doctor");
        const side = new Side("head", contract, r, logDir);
        try {
          await side.boot();
          for (const [k, v] of Object.entries(side.surfaceEnv())) {
            const res = await fetch(v).catch((e) => ({ status: `error ${e.message}` }));
            console.log(`${color.green("ok  ")} ${k}=${v} answers (HTTP ${res.status})`);
          }
          console.log(color.green(`\nThe app boots in ${(side.bootMs / 1000).toFixed(1)}s. Next: witness verify`));
        } catch (e) {
          if (e instanceof Mistrial) {
            console.log(`${color.red("FAIL")} boot: ${e.message}\n  →  ${e.remedy}\n${color.dim(e.logTail)}`);
            process.exitCode = 2;
          } else throw e;
        } finally {
          await side.shutdown();
        }
        return;
      }
      case "init": {
        const r = findRoot(process.cwd()) ?? process.cwd();
        const home = path.join(r, ".witness");
        const file = path.join(home, "witness.toml");
        if (fs.existsSync(file)) {
          console.log(`${file} already exists.`);
          return;
        }
        fs.mkdirSync(path.join(home, "claims"), { recursive: true });
        fs.writeFileSync(file, TEMPLATE);
        fs.writeFileSync(path.join(home, ".gitignore"), "records/\ncache/\n");
        if (!fs.existsSync(path.join(r, "VERIFY.md")))
          fs.writeFileSync(path.join(r, "VERIFY.md"), "# How this app is verified\n\n- Boot: see `.witness/witness.toml`.\n- Claims: `.witness/claims/*.md`, one sentence of behavior each, linked to a boundary test.\n- Run: `witness verify` (add `--level high` to compare with the base commit).\n");
        console.log(`Wrote ${file} and VERIFY.md. Edit the start/ready/suite lines, then run \`witness doctor\`.`);
        return;
      }
      case "status": {
        const r = findRoot(process.cwd());
        if (!r) {
          if (flags.hook) return;
          console.log("No .witness/ here.");
          return;
        }
        const dir = latestDir(path.join(r, ".witness"));
        const b = dir ? readJson<any>(path.join(dir, "bundle.json"), null) : null;
        const tree = worktreeHash(r);
        const fresh = b && b.head?.tree === tree;
        if (flags.hook) {
          const input = readJson<any>("/dev/stdin", {});
          if (input.stop_hook_active || process.env.WITNESS_HOOK === "off" || fresh) return;
          if (!b && !hasCodeChanges(r)) return;
          const why = b ? `the code changed since the last verdict (${VERDICT_WORD[b.verdict as keyof typeof VERDICT_WORD]})` : "this repo has witness claims but no verdict yet";
          console.log(JSON.stringify({ decision: "block", reason: `Witness: ${why}. Run \`witness verify\` (or /witness:verify) and report the verdict before finishing. Set WITNESS_HOOK=off to skip.` }));
          return;
        }
        if (!b) console.log("No record yet. Run `witness verify`.");
        else console.log(`${fresh ? "fresh" : "stale"} · ${VERDICT_WORD[b.verdict as keyof typeof VERDICT_WORD]} · ${b.startedAt} · ${path.join(dir!, "index.html")}`);
        process.exitCode = fresh ? 0 : 1;
        return;
      }
      case "open":
      case "report": {
        const r = root();
        const dir = latestDir(path.join(r, ".witness"));
        if (!dir) {
          console.log("No record yet. Run `witness verify`.");
          process.exitCode = 1;
          return;
        }
        if (cmd === "open") {
          const f = path.join(dir, "index.html");
          console.log(f);
          if (process.platform === "darwin" && !flags["no-browser"]) spawnSync("open", [f]);
          return;
        }
        const fmt = String(flags.format ?? "summary");
        if (fmt === "agent") console.log(fs.readFileSync(path.join(dir, "agent.md"), "utf8"));
        else if (fmt === "pr") console.log(fs.readFileSync(path.join(dir, "pr.md"), "utf8"));
        else console.log(summaryLines(readJson(path.join(dir, "bundle.json"), {} as any)).join("\n"));
        return;
      }
      default:
        console.error(`Unknown command "${cmd}".\n\n${HELP}`);
        process.exitCode = 3;
    }
  } catch (e) {
    if (e instanceof ContractError) {
      console.error(color.red(`Contract problem: ${e.message}`));
      process.exitCode = 2;
    } else {
      console.error(color.red(`witness failed: ${(e as Error).stack ?? e}`));
      process.exitCode = 2;
    }
  }
}

function hasCodeChanges(r: string): boolean {
  const s = spawnSync("git", ["status", "--porcelain", "--", ".", ":(exclude).witness/records", ":(exclude).witness/cache"], { cwd: r, encoding: "utf8" });
  return !!s.stdout.trim();
}

let stopping = false;
const stop = async () => {
  if (stopping) process.exit(130);
  stopping = true;
  process.stderr.write("\nInterrupted: stopping the apps and removing temporary worktrees...\n");
  await runCleanups();
  process.exit(130);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
main();
