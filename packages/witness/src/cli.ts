#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";
import { checkCommand, downCommand, reportCommand, statusCommand, upCommand } from "./commands.ts";
import { type Config, ConfigError, findConfig, loadConfig as parseConfigFile, rootFor } from "./config.ts";
import { VERSION } from "./ctrf.ts";
import { diagnose, formatDiagnosis } from "./diagnosis.ts";
import { initCommand } from "./init.ts";
import { scanCommand } from "./scan.ts";
import { lintCommand } from "./lint.ts";
import { skillsCommand } from "./skills.ts";
import { type Plan, parsePlan, planCheckCommand } from "./plan.ts";
import { ShellError, shellFor, useShell } from "./proc.ts";
import { EXIT } from "./reconcile.ts";
import { defaultAgainst, parseAgainst } from "./repos.ts";
import { ensureScratch, runCommand, UsageError } from "./run.ts";

const HELP = `witness ${VERSION}: boot the app, run its own tests, and record results you can trust.

Usage:
  witness check  [--stage config|deps|boot|suite] [--service s] [--suite s] [--no-setup] [--against <git-ref>|reference]
  witness run    [--suite s]... [--select id,...] [--retries n] [--no-setup] [--against <git-ref>|reference] [--label name]
                 with [[repo]]: also --against <repo>=<git-ref> per listed repo (default: its merge base)
  witness up     [--service s] [--no-setup]        start services and leave them running (run reuses them)
  witness down                                    stop what \`witness up\` started
  witness status [run-id|latest]
  witness report [run-id|latest] [--format md|json|html]   html: rewrite report.html (every run writes it) and print its path
  witness init                                    write .witness/witness.example.toml guessed from the repo
  witness init --scan                             print the repo's facts as JSON (confidence, evidence); writes nothing
  witness plan check [file] [--draft] [--no-list] validate a test plan (default .witness/plan.yaml)
  witness lint [files...] [--plan file]           static checks on test files (default: changed test files)
  witness skills path [--profile p] | list        render the agent skills and print where / what they are
  witness skills install --dir <path> [--profile standalone|morph] [--link] [--prefix witness-]
                                                  render (or link) the skills into an agent's skills folder

Common: --json (machine output on stdout) · --config <path> (default .witness/witness.toml)
        --run-dir-root <path> (default .witness/runs)
Exit codes: 0 passed · 1 failed · 2 error · 3 mistrial · 4 stalled/timeout · 5 interrupted · 64 usage`;

/** Load the config and resolve every shell its commands run under, so a missing one is a config error now. */
function loadConfig(file: string): Config {
  const cfg = parseConfigFile(file);
  const own = [...cfg.dependencies.map((d) => ["dependency", d] as const), ...cfg.services.map((s) => ["service", s] as const), ...cfg.suites.map((s) => ["suite", s] as const)];
  let key = "run.shell";
  try {
    useShell(cfg.run.shell);
    for (const [k, x] of own) {
      key = `${k}.${x.name}.shell`;
      shellFor(x.shell);
    }
  } catch (e) {
    if (e instanceof ShellError) throw new ConfigError(key, e.message);
    throw e;
  }
  return cfg;
}

const VALUE_FLAGS = new Set(["config", "run-dir-root", "stage", "service", "suite", "select", "retries", "against", "label", "format", "plan", "dir", "prefix", "profile"]);
const BOOL_FLAGS = new Set(["json", "no-setup", "help", "version", "draft", "no-list", "link", "scan"]);
const REPEAT = new Set(["suite", "select", "against"]);

/** Split a --select list on commas outside brackets and quotes; a piece without an `adapter:` prefix continues the previous id (a title with a comma). */
export function splitIds(v: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote = "";
  let cur = "";
  for (const ch of v) {
    if (quote) quote = ch === quote ? "" : quote;
    else if (ch === '"' || ch === "'") quote = ch;
    else if ("([{".includes(ch)) depth++;
    else if (")]}".includes(ch)) depth = Math.max(0, depth - 1);
    else if (ch === "," && depth === 0) {
      parts.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  parts.push(cur);
  const prefixed = parts.some((x) => /^\s*[\w-]+:\S/.test(x));
  const out: string[] = [];
  for (const x of parts) {
    if (prefixed && out.length && !/^\s*[\w-]+:\S/.test(x)) out[out.length - 1] += `,${x}`;
    else out.push(x);
  }
  return out.map((x) => x.trim()).filter(Boolean);
}

export function parseArgs(argv: string[]) {
  const flags: Record<string, string | boolean> = {};
  const lists: Record<string, string[]> = {};
  const pos: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h") {
      flags.help = true;
      continue;
    }
    if (!a.startsWith("--")) {
      pos.push(a);
      continue;
    }
    const eq = a.indexOf("=");
    const k = eq > 0 ? a.slice(2, eq) : a.slice(2);
    if (BOOL_FLAGS.has(k)) {
      flags[k] = true;
      continue;
    }
    if (!VALUE_FLAGS.has(k)) throw new UsageError(`unknown option --${k}`);
    const v = eq > 0 ? a.slice(eq + 1) : argv[++i];
    if (v === undefined) throw new UsageError(`--${k} needs a value`);
    if (REPEAT.has(k)) (lists[k] ??= []).push(...(k === "select" ? splitIds(v) : [v]));
    else flags[k] = v;
  }
  return { cmd: pos[0], pos: pos.slice(1), flags, lists };
}

function configPath(flags: Record<string, string | boolean>): string {
  if (typeof flags.config === "string") return path.resolve(flags.config);
  const found = findConfig(process.cwd());
  if (!found) throw new ConfigError("", "no .witness/witness.toml here or in a parent folder; run `witness init`");
  return found;
}

function runRoot(flags: Record<string, string | boolean>, root: string): string {
  return typeof flags["run-dir-root"] === "string" ? path.resolve(flags["run-dir-root"]) : path.join(root, ".witness", "runs");
}

export async function main(argv: string[]): Promise<number> {
  let args: ReturnType<typeof parseArgs>;
  try {
    args = parseArgs(argv);
  } catch (e) {
    process.stderr.write(`witness  ${(e as Error).message}\n\n${HELP}\n`);
    return EXIT_USAGE;
  }
  const { cmd, pos, flags, lists } = args;
  if (flags.version) {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }
  if (!cmd || flags.help || cmd === "help") {
    process.stdout.write(HELP + "\n");
    return cmd || flags.help ? 0 : EXIT_USAGE;
  }
  const json = !!flags.json;
  let cfg: Config | undefined;
  const needsConfig = ["check", "run", "up", "down"].includes(cmd);
  try {
    if (cmd === "init") return flags.scan ? scanCommand(process.cwd()) : initCommand(process.cwd(), json);
    if (cmd === "skills")
      return skillsCommand(pos[0], { dir: flags.dir as string | undefined, link: !!flags.link, prefix: flags.prefix as string | undefined, profile: flags.profile as string | undefined, json, log: (s) => process.stderr.write(`witness  ${s}\n`) });
    if (cmd === "lint") {
      const cp = typeof flags.config === "string" ? path.resolve(flags.config) : findConfig(process.cwd());
      const lintCfg = cp ? loadConfig(cp) : undefined;
      const root = lintCfg?.root ?? process.cwd();
      const dflt = path.join(root, ".witness", "plan.yaml");
      const planFile = typeof flags.plan === "string" ? path.resolve(flags.plan) : fs.existsSync(dflt) ? dflt : undefined;
      let plan: Plan | undefined;
      if (planFile) {
        const r = parsePlan(fs.readFileSync(planFile, "utf8"), { draft: true });
        if (!r.plan) throw new UsageError(`${planFile} is not a valid plan; run \`witness plan check\``);
        plan = r.plan;
      }
      return lintCommand({ files: pos, cwd: process.cwd(), root, plan, planFile, suiteCwds: lintCfg?.suites.map((s) => s.cwd), json, log: (s) => process.stderr.write(`witness  ${s}\n`) });
    }
    if (cmd === "plan") {
      if (pos[0] !== "check") throw new UsageError(`usage: witness plan check [file]`);
      const cp = typeof flags.config === "string" ? path.resolve(flags.config) : findConfig(process.cwd());
      const planCfg = cp ? loadConfig(cp) : undefined;
      const file = path.resolve(pos[1] ?? path.join(planCfg?.root ?? process.cwd(), ".witness", "plan.yaml"));
      return await planCheckCommand(file, planCfg, { draft: !!flags.draft, list: !flags["no-list"], json, log: (s) => process.stderr.write(`witness  ${s}\n`) });
    }
    if (cmd === "status" || cmd === "report") {
      const cp = typeof flags.config === "string" ? path.resolve(flags.config) : findConfig(process.cwd());
      const root = cp ? rootFor(cp) : process.cwd();
      const rr = runRoot(flags, root);
      if (cmd === "status") return statusCommand(rr, pos[0], json);
      const fmt = json ? "json" : String(flags.format ?? "md");
      if (fmt !== "md" && fmt !== "json" && fmt !== "html") throw new UsageError(`--format must be md, json or html`);
      return reportCommand(rr, pos[0], fmt);
    }
    if (!needsConfig) throw new UsageError(`unknown command "${cmd}"`);
    cfg = loadConfig(configPath(flags));
    ensureScratch(cfg.root);
    const parsed = parseAgainst(cfg, lists.against);
    if ("error" in parsed) throw new UsageError(parsed.error);
    const againstRepos = parsed.repos;
    const against = parsed.against ?? (Object.keys(againstRepos).length ? defaultAgainst(cfg) : undefined);
    if (!against && Object.keys(againstRepos).length) throw new UsageError("--against <repo>=<ref>: this checkout has no merge base with a default branch to compare with; add --against <ref> for it");
    const rr = runRoot(flags, cfg.root);
    switch (cmd) {
      case "check": {
        const stage = flags.stage as string | undefined;
        if (stage && !["config", "deps", "boot", "suite"].includes(stage)) throw new UsageError(`--stage must be config, deps, boot or suite`);
        if (typeof flags.service === "string" && !cfg.services.some((s) => s.name === flags.service)) throw new UsageError(`unknown service "${flags.service}"`);
        return await checkCommand(cfg, { stage: stage as "config" | undefined, service: flags.service as string | undefined, suites: lists.suite, json, noSetup: !!flags["no-setup"], against, againstRepos });
      }
      case "run": {
        const retries = flags.retries === undefined ? 0 : Number(flags.retries);
        if (!Number.isInteger(retries) || retries < 0 || retries > 10) throw new UsageError("--retries must be a whole number from 0 to 10");
        return await runCommand(cfg, { suites: lists.suite, select: lists.select, retries, noSetup: !!flags["no-setup"], against, againstRepos, label: flags.label as string | undefined, json, runDirRoot: rr });
      }
      case "up":
        if (typeof flags.service === "string" && !cfg.services.some((s) => s.name === flags.service)) throw new UsageError(`unknown service "${flags.service}"`);
        return await upCommand(cfg, { service: flags.service as string | undefined, noSetup: !!flags["no-setup"], json, runDirRoot: rr });
      case "down":
        return await downCommand(cfg, { json });
    }
  } catch (e) {
    if (e instanceof UsageError) {
      process.stderr.write(`witness  ${e.message}\n`);
      return EXIT_USAGE;
    }
    if (e instanceof ConfigError) {
      const d = diagnose({ stage: "config", cause: "bad_config", evidence: e.message });
      process.stderr.write(`witness  VERDICT mistrial · the config can't be used\n`);
      for (const l of formatDiagnosis(d)) process.stderr.write(`witness    ${l}\n`);
      if (json) process.stdout.write(JSON.stringify({ outcome: "mistrial", diagnosis: d }, null, 2) + "\n");
      return EXIT.mistrial;
    }
    throw e;
  }
  return EXIT_USAGE;
}

export const EXIT_USAGE = 64;

const self = process.argv[1] ? fs.realpathSync(process.argv[1]) : "";
if (self.endsWith("cli.ts") || self.endsWith("witness.mjs")) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (e) => {
      process.stderr.write(`witness  internal error: ${(e as Error).stack ?? e}\n`);
      process.exit(EXIT.error);
    },
  );
}
