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
  /** For a `<repo>:<NAME>` in envMissing: that repo's env file. */
  envFiles?: Record<string, string>;
  evidence?: string;
  extraTry?: string[];
  /** The adapter can pass a per-test timeout for this suite. */
  perTestTimeout?: boolean;
  adapter?: string;
  /** The ready URL kept answering with this 4xx status: the URL, not the timeout, is wrong. */
  steadyStatus?: number;
}

interface Pattern {
  cause: Cause | "missing_tool";
  re: RegExp;
}

const PATTERNS: Pattern[] = [
  { cause: "port_in_use", re: /\bEADDRINUSE\b|[Aa]ddress already in use|port is already allocated|Failed to bind to address|Only one usage of each socket address|ports? \d+ (?:is|are) (?:already )?in use/ },
  { cause: "auth_failed", re: /\b401 Unauthorized\b|HTTP\/\d(?:\.\d)? 401\b|[Ss]tatus(?: code)?[:= ]+401\b|password authentication failed|[Aa]uthentication failed|Access denied for user|invalid_grant|[Ii]nvalid credentials|Login failed for user/ },
  { cause: "network", re: /\bENOTFOUND\b|\bEAI_AGAIN\b|getaddrinfo (?:ENOTFOUND|EAI_AGAIN|failed)|Name or service not known|Temporary failure in name resolution|nodename nor servname provided|Could not resolve host|No such host is known|NameResolutionError|UnknownHostException/ },
  { cause: "dependency_unreachable", re: /\bECONNREFUSED\b|[Cc]onnection refused|could not connect to server|actively refused|Connection reset by peer|Is the server running on host|server was not found or was not accessible/ },
  { cause: "missing_tool", re: /ModuleNotFoundError|No module named|Cannot find module|MODULE_NOT_FOUND|command not found|is not recognized as an internal or external command|Could not find or load main class|ClassNotFoundException|No such file or directory|ERR_MODULE_NOT_FOUND|You must install or update \.NET|A compatible \.NET SDK was not found|Could not execute because the specified command or file was not found|could not determine executable to run/i },
];

const NO_REFINE = new Set<Cause>(["bad_config", "missing_env", "stalled", "suite_timeout"]);
const RETRYABLE = new Set<Cause>(["port_in_use", "network", "service_died", "stalled", "suite_timeout", "ready_timeout", "dependency_unreachable"]);

const FRAME = /^\s+(at\s|File "|\.\.\. \d+ more)|^\s+\S+\.go:\d+/;
const ERRORISH = /exception|error|fatal|panic|unhandled|traceback/i;
// lines a build tool prints after every failure; they never say what went wrong
const BOILERPLATE = /^\[ERROR\]\s*(->\s*)?(\[Help \d+\].*|To see the full stack trace.*|Re-run Maven .*|For more information about the errors.*)?$|^npm (error|ERR!) A complete log of this run can be found in/;
export const COMPILER_ERROR = /^\[ERROR\] \S.*\.(java|kt|scala|groovy):\[\d+,\d+\] |^\S.*\.(java|kt):\d+: error: /;

/** The error line of the last command's output, skipping stack frames; else its last line. */
function lastMeaningful(lines: string[], preferError: boolean): string | undefined {
  let start = 0;
  lines.forEach((l, i) => {
    if (/^\s*\$ /.test(l)) start = i + 1;
  });
  const cand = lines.slice(start).filter((l) => l.trim().length > 1 && !FRAME.test(l) && !BOILERPLATE.test(l.trim()));
  const compiler = preferError ? cand.find((l) => COMPILER_ERROR.test(l.trim())) : undefined;
  if (compiler) return compiler.trim();
  const pool = cand.length ? cand : lines.filter((l) => !/^\s*\$ /.test(l) && l.trim().length > 1);
  return ((preferError ? [...pool].reverse().find((l) => ERRORISH.test(l) && !/^\s*\d+ Error\(s\)\s*$|\b0 errors?\b/i.test(l)) : undefined) ?? pool.at(-1))?.trim();
}

/** The log's error line, when it has one; for failures outside the tests (a coverage gate after a clean run). */
export function logErrorLine(log: string | undefined): string | undefined {
  const line = log ? lastMeaningful(tailLines(log, 200), true) : undefined;
  return line && ERRORISH.test(line) ? line.slice(0, 400) : undefined;
}

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
  const linger = cause === "stalled" && !evidence ? lines.find((l) => /did not exit one second after the test run has completed/.test(l)) : undefined;
  if (linger) {
    evidence = linger.trim();
    inp = { ...inp, extraTry: ["the tests finished but open handles (a hung request, a server, a timer) kept jest running: close them in afterAll, or add --forceExit to the suite cmd", ...(inp.extraTry ?? [])] };
  }
  evidence ??= lastMeaningful(lines, cause !== "stalled" && cause !== "suite_timeout")?.slice(0, 500);
  const d: Diagnosis = {
    stage: inp.stage,
    cause,
    retryable: RETRYABLE.has(cause) && !(cause === "ready_timeout" && inp.steadyStatus),
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
      for (const k of inp.envMissing ?? []) {
        const name = inp.envFiles?.[k] ? k.slice(k.indexOf(":") + 1) : k;
        t.push(`echo '${name}=...' >> ${inp.envFiles?.[k] ?? ".witness/.env"}   # or export ${name}=...`);
      }
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
      if (inp.steadyStatus) t.push(`the app answers HTTP ${inp.steadyStatus} at the ready URL, so it is up but the URL ${inp.steadyStatus === 404 ? "does not exist" : "is refused"}: fix ready.http (or ready.status) for service ${svc ?? ""}; a longer timeout will not help`.trim());
      else t.push(`raise ready.timeout for service ${svc ?? ""}`.trim());
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
      if (inp.perTestTimeout !== false) t.push(`set per_test_timeout for suite ${inp.suite ?? ""} so a hung test fails instead of hanging`);
      else if (inp.adapter === "dotnet") t.push(`per_test_timeout does nothing for this dotnet project (Microsoft.Testing.Platform); to name the hung test add the Microsoft.Testing.Extensions.HangDump package and append --hangdump --hangdump-timeout 5m to the suite cmd`);
      if (inp.perTestTimeout === false) t.push(`narrow it down: witness run --suite ${inp.suite ?? "<suite>"} --select <test-id>,...`);
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
