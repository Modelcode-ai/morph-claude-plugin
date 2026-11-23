import { tailLines } from "./util.ts";

export type Stage = "config" | "deps" | "boot" | "suite" | "report";
export type Cause =
  | "missing_env"
  | "bad_config"
  | "dependency_unreachable"
  | "setup_failed"
  | "exited_before_ready"
  | "ready_timeout"
  | "port_in_use"
  | "auth_failed"
  | "network"
  | "service_died"
  | "suite_timeout"
  | "stalled"
  | "report_missing"
  | "report_unreadable"
  | "report_incomplete";

export interface Diagnosis {
  stage: Stage;
  service?: string;
  suite?: string;
  cause: Cause;
  command?: string;
  evidence?: string;
  log?: string;
  env_missing?: string[];
  retryable: boolean;
  try: string[];
}

export interface DiagnoseInput {
  stage: Stage;
  cause: Cause;
  service?: string;
  suite?: string;
  command?: string;
  log?: string;
  cwd?: string;
  port?: number;
  url?: string;
  envMissing?: string[];
  evidence?: string;
  extraTry?: string[];
}

interface Pattern {
  cause: Cause | "missing_tool";
  re: RegExp;
}

const PATTERNS: Pattern[] = [
  { cause: "port_in_use", re: /EADDRINUSE|address already in use|port is already allocated|Failed to bind to address|Only one usage of each socket address|ports? \d+ (?:is|are) (?:already )?in use/i },
  { cause: "auth_failed", re: /\b401 Unauthorized\b|HTTP\/\d(?:\.\d)? 401\b|status(?: code)?[:= ]+401\b|password authentication failed|authentication failed|Access denied for user|invalid_grant|invalid credentials|Login failed for user/i },
  { cause: "network", re: /ENOTFOUND|EAI_AGAIN|getaddrinfo|Name or service not known|Temporary failure in name resolution|nodename nor servname provided|Could not resolve host|No such host is known|NameResolutionError|UnknownHostException/i },
  { cause: "dependency_unreachable", re: /ECONNREFUSED|Connection refused|could not connect to server|actively refused|Connection reset by peer|Is the server running on host|server was not found or was not accessible/i },
  { cause: "missing_tool", re: /ModuleNotFoundError|No module named|Cannot find module|MODULE_NOT_FOUND|command not found|is not recognized as an internal or external command|Could not find or load main class|ClassNotFoundException|No such file or directory|ERR_MODULE_NOT_FOUND|You must install or update \.NET|A compatible \.NET SDK was not found|Could not execute because the specified command or file was not found/i },
];

const NO_REFINE = new Set<Cause>(["bad_config", "missing_env", "stalled", "suite_timeout"]);
const RETRYABLE = new Set<Cause>(["port_in_use", "network", "service_died", "stalled", "suite_timeout", "ready_timeout", "dependency_unreachable"]);

const lastMeaningful = (lines: string[]) => [...lines].reverse().find((l) => !/^\s*\$ /.test(l) && l.trim().length > 1)?.trim();

/** Turn a failure into cause + evidence + next commands, using the log tail to refine the cause. */
export function diagnose(inp: DiagnoseInput): Diagnosis {
  const lines = inp.log ? tailLines(inp.log, 200) : [];
  let cause = inp.cause;
  let evidence = inp.evidence;
  let missingTool = false;
  if (!NO_REFINE.has(cause)) {
    for (const p of PATTERNS) {
      const hit = [...lines].reverse().find((l) => p.re.test(l));
      if (!hit) continue;
      evidence = hit.trim().slice(0, 500);
      if (p.cause === "missing_tool") missingTool = true;
      else cause = p.cause;
      break;
    }
  }
  evidence ??= lastMeaningful(lines)?.slice(0, 500);
  const d: Diagnosis = {
    stage: inp.stage,
    cause,
    retryable: RETRYABLE.has(cause),
    try: [],
  };
  if (inp.service) d.service = inp.service;
  if (inp.suite) d.suite = inp.suite;
  if (inp.command) d.command = inp.command;
  if (evidence) d.evidence = evidence;
  if (inp.log) d.log = inp.log;
  if (inp.envMissing?.length) d.env_missing = inp.envMissing;
  d.try = suggestions(d, inp, missingTool);
  return d;
}

function suggestions(d: Diagnosis, inp: DiagnoseInput, missingTool: boolean): string[] {
  const t: string[] = [];
  const log = inp.log ? `tail -n 50 ${inp.log}` : undefined;
  const inCwd = (c?: string) => (c ? (inp.cwd && inp.cwd !== "." ? `cd ${inp.cwd} && ${c}` : c) : undefined);
  const svc = inp.service;
  switch (d.cause) {
    case "missing_env":
      for (const k of inp.envMissing ?? []) t.push(`echo '${k}=...' >> .witness/.env   # or export ${k}=...`);
      break;
    case "bad_config":
      t.push("witness check --stage config");
      break;
    case "dependency_unreachable":
      if (inp.command) t.push(inCwd(inp.command)!);
      t.push("witness check --stage deps");
      if (log) t.push(log);
      break;
    case "setup_failed":
      if (log) t.push(log);
      if (inp.command) t.push(inCwd(inp.command)!);
      break;
    case "exited_before_ready":
    case "service_died":
      if (log) t.push(log);
      if (missingTool) t.push(`witness check --stage boot${svc ? ` --service ${svc}` : ""}   # without --no-setup, so setup runs again`);
      else if (inp.command) t.push(inCwd(inp.command)!);
      if (d.cause === "service_died") t.push(`witness check --stage boot${svc ? ` --service ${svc}` : ""}`);
      break;
    case "ready_timeout":
      if (inp.url) t.push(`curl -i ${inp.url}`);
      if (log) t.push(log);
      t.push(`raise ready.timeout for service ${svc ?? ""}`.trim());
      break;
    case "port_in_use":
      if (inp.port) t.push(`lsof -nP -iTCP:${inp.port} -sTCP:LISTEN`);
      t.push("witness down   # if a previous `witness up` still holds the port");
      if (svc) t.push(`set ports = "<free range>" for service ${svc}, and make start use \${PORT}`);
      break;
    case "auth_failed":
      t.push("check the credentials in .witness/.env (or the env the service reads)");
      if (log) t.push(log);
      break;
    case "network":
      t.push("check DNS / VPN / proxy; the failing host is in the evidence line");
      if (log) t.push(log);
      break;
    case "suite_timeout":
      if (log) t.push(log);
      t.push(`raise timeout for suite ${inp.suite ?? ""}, or run part of it: witness run --suite ${inp.suite ?? "<suite>"} --select <test-id>`);
      break;
    case "stalled":
      if (log) t.push(log);
      t.push(`set per_test_timeout for suite ${inp.suite ?? ""} so a hung test fails instead of hanging`);
      t.push("raise [run] stall_timeout if the suite is legitimately quiet for long");
      break;
    case "report_missing":
      if (log) t.push(log);
      if (missingTool && inp.command) t.push(inCwd(inp.command)!);
      t.push(`check that suite ${inp.suite ?? ""} writes its report (adapter args, or set report = "<glob>")`);
      break;
    case "report_unreadable":
      t.push(`inspect the raw report under reports/${inp.suite ?? ""}/ (truncated or not a test report)`);
      if (log) t.push(log);
      break;
    case "report_incomplete":
      if (log) t.push(log);
      t.push("the suite exited non-zero or left out tests although its report shows no failures; look for errors outside tests (teardown, coverage thresholds, crashed workers)");
      break;
  }
  for (const x of inp.extraTry ?? []) t.push(x);
  return t;
}

export function formatDiagnosis(d: Diagnosis): string[] {
  const where = [d.stage, d.service && `service ${d.service}`, d.suite && `suite ${d.suite}`].filter(Boolean).join(", ");
  const out = [`cause: ${d.cause} (${where})${d.retryable ? " · retryable" : ""}`];
  if (d.env_missing?.length) out.push(`missing: ${d.env_missing.join(", ")}`);
  if (d.command) out.push(`command: ${d.command}`);
  if (d.evidence) out.push(`evidence: ${d.evidence}`);
  if (d.log) out.push(`log: ${d.log}`);
  for (const t of d.try) out.push(`try: ${t}`);
  return out;
}
