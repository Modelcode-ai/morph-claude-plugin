import * as fs from "node:fs";
import * as path from "node:path";
import type { ParsedFile, RawCase, ReportFormat } from "./parsers/types.ts";
import { escapeRegExp, shellWords, shq } from "./util.ts";

export type AdapterName =
  | "pytest"
  | "junit-maven"
  | "junit-gradle"
  | "dotnet"
  | "jest"
  | "vitest"
  | "playwright"
  | "go"
  | "mocha"
  | "rspec"
  | "phpunit"
  | "bats"
  | "generic";

export interface ReportGlob {
  base: "report-dir" | "cwd";
  glob: string;
}

export interface Adapter {
  name: AdapterName;
  format: ReportFormat;
  /** Args that make the framework write a machine report into dir. */
  reportArgs?: (dir: string, cwd: string, cmd: string) => string;
  /** Why no report could be requested, and how to fix it; shown when the report is missing. */
  reportHint?: (cwd: string, cmd: string) => string | undefined;
  reportEnv?: (dir: string) => Record<string, string>;
  /** When the command already matches, the user wired the report; append nothing. */
  reportMarker?: RegExp;
  reportGlobs: ReportGlob[];
  /** The report is the suite's stdout (go test -json). */
  fromStdout?: boolean;
  /** Runner args that run only `ids`; what `${WITNESS_SELECT}` becomes. */
  selectArgs?: (ids: string[]) => string;
  /** Rewrites the command when appending selectArgs is not enough (pytest's positional paths). */
  select?: (cmd: string, ids: string[]) => string | null;
  list?: NativeList;
  perTestTimeout?: (ms: number, cwd: string, cmd: string) => string | null;
  /** The per-test timeout as environment variables, for runners that take it only that way (bats). */
  perTestTimeoutEnv?: (ms: number) => Record<string, string>;
  /** Environment the preset sets for every run, listing and probe of the suite; the suite's own env wins. */
  env?: Record<string, string>;
  /** Report or timeout plugins the framework needs; `missing` matches the error it prints without them. */
  plugins?: Plugin[];
  /** Corrects the parsed report with what only the console says (a test aborted at its time limit, a test host that died mid-test). */
  amend?: (files: ParsedFile[], output: string) => void;
  id: (c: RawCase) => string;
}

export interface NativeList {
  /** Turns the suite command into a listing command (vitest list, go -list); null when it can't. */
  rewrite?: (cmd: string) => string | null;
  args?: string;
  /** "adapter": parse the output; "report": the listing writes the adapter's report (every test unrun). */
  format: "adapter" | "report";
  parse?: (out: string) => string[];
}

export interface Plugin {
  name: string;
  needed: (perTestTimeout: boolean) => boolean;
  /** Args for a cheap command that fails the same way when the plugin is missing. */
  probeArgs?: string;
  missing: RegExp;
  hint: string;
}

export function normFile(f: string | undefined, cwd?: string): string | undefined {
  if (!f) return undefined;
  let s = f.replace(/\\/g, "/");
  if (cwd && path.isAbsolute(s)) {
    const rel = path.relative(cwd, s).replace(/\\/g, "/");
    if (!rel.startsWith("..")) s = rel;
  }
  return s.replace(/^\.\//, "");
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/** Insert `--` for npm scripts so the args reach the test runner, not npm. */
export function appendArgs(cmd: string, args: string): string {
  if (!args) return cmd;
  if (/^\s*npm\s+(test|t|run\s+\S+|run-script\s+\S+)\b/.test(cmd) && !/\s--(\s|$)/.test(cmd)) return `${cmd} -- ${args}`;
  return `${cmd} ${args}`;
}

const SELECT_VAR = /\$\{WITNESS_SELECT(?::-([^}]*))?\}/;

export const hasSelectVar = (cmd: string) => SELECT_VAR.test(cmd);

/** Add runner args where they belong: just before `${WITNESS_SELECT}` when the command has it, else at the end. */
export function addArgs(cmd: string, args: string): string {
  if (!args) return cmd;
  const m = SELECT_VAR.exec(cmd);
  return m ? `${cmd.slice(0, m.index)}${args} ${cmd.slice(m.index)}` : appendArgs(cmd, args);
}

/** Replace `${WITNESS_SELECT}` with the selection, or with its `:-default` (else nothing) when running everything. */
export function fillSelect(cmd: string, selection?: string): string {
  return cmd.replace(new RegExp(SELECT_VAR.source, "g"), (_m, dflt: string | undefined) => selection ?? dflt ?? "").replace(/[ \t]+$/, "");
}

/** A title pattern no test has: jest then reports every test as skipped without running it. */
export const NO_TEST = "^witness-list-only: no test has this name$";

function classHash(c: RawCase): string {
  const cls = c.classname ? clean(c.classname) : "";
  let name = clean(c.name);
  if (cls && name.startsWith(`${cls}.`)) name = name.slice(cls.length + 1);
  return cls ? `${cls}#${name}` : name;
}

function titled(c: RawCase): string {
  const titles = c.titles ?? [...(c.classname && c.classname !== c.file ? [c.classname] : []), c.name];
  return [normFile(c.file), ...titles.map(clean)].filter(Boolean).join(" > ") + (c.project ? ` [${c.project}]` : "");
}

export function pytestId(c: RawCase): string {
  const cls = c.classname ?? "";
  let file = normFile(c.file);
  let rest: string[];
  if (file) {
    const mod = file.replace(/\.py$/, "").replace(/\//g, ".");
    rest = cls === mod ? [] : cls.startsWith(`${mod}.`) ? cls.slice(mod.length + 1).split(".") : [];
  } else {
    const segs = cls.split(".").filter(Boolean);
    let i = segs.findIndex((s, k) => k > 0 && /^[A-Z]/.test(s));
    if (i < 0) i = segs.length;
    file = segs.length ? `${segs.slice(0, i).join("/")}.py` : undefined;
    rest = segs.slice(i);
  }
  return [file, ...rest, c.name].filter(Boolean).join("::");
}

const PYTEST_VALUE_OPTS = new Set([
  "-k", "-m", "-c", "-p", "-o", "-n", "-W", "-r", "--rootdir", "--maxfail", "--tb", "--junitxml", "--junit-prefix", "--deselect",
  "--ignore", "--ignore-glob", "--durations", "--timeout", "--log-level", "--cov", "--cov-report", "--confcutdir", "--basetemp",
  "--import-mode", "--dist", "--reruns", "--color",
]);

function pytestSelect(cmd: string, ids: string[]): string | null {
  const w = shellWords(cmd);
  if (!w) return null;
  let start = w.findIndex((x) => /(^|\/)(pytest|py\.test)$/.test(x));
  if (start < 0) {
    const m = w.findIndex((x, i) => x === "-m" && w[i + 1] === "pytest");
    if (m < 0) return null;
    start = m + 1;
  }
  const out = w.slice(0, start + 1);
  for (let i = start + 1; i < w.length; i++) {
    const t = w[i];
    if (t.startsWith("-")) {
      out.push(t);
      if (PYTEST_VALUE_OPTS.has(t) && i + 1 < w.length) out.push(w[++i]);
    }
  }
  return [...out, ...ids].map(shq).join(" ");
}

const stripParams = (m: string) => m.replace(/[([].*$/, "");

function splitClassHash(id: string): [string, string] {
  const i = id.indexOf("#");
  return i < 0 ? ["", id] : [id.slice(0, i), id.slice(i + 1)];
}

/** A title regex for `-t`/`--grep`; `sep` is a regex, since runners join describe and test titles differently. */
function fullTitleRegex(ids: string[], sep: string): string {
  const parts = ids.map((id) => id.replace(/ \[[^\]]+\]$/, "").split(" > ").slice(1).map(escapeRegExp).join(sep));
  return `(${parts.join("|")})$`;
}

function goSelectArgs(ids: string[]): string {
  const names = ids.map((id) => splitClassHash(id)[1]);
  const top = [...new Set(names.map((n) => n.split("/")[0]))];
  const subs = names.filter((n) => n.includes("/"));
  let run = `^(${top.map(escapeRegExp).join("|")})$`;
  if (subs.length && top.length === 1 && subs.length === names.length) {
    run += `/^(${subs.map((n) => escapeRegExp(n.split("/").slice(1).join("/"))).join("|")})$`;
  }
  return `-run ${shq(run)}`;
}

function parseLines(out: string, re: RegExp, map: (m: RegExpExecArray) => string): string[] {
  const ids: string[] = [];
  for (const line of out.split(/\r?\n/)) {
    const m = re.exec(line);
    if (m) ids.push(map(m));
  }
  return [...new Set(ids)];
}

export function dotnetFqnToId(fqn: string): string {
  const paren = fqn.indexOf("(");
  const head = paren < 0 ? fqn : fqn.slice(0, paren);
  const dot = head.lastIndexOf(".");
  return dot < 0 ? fqn : `${fqn.slice(0, dot)}#${fqn.slice(dot + 1)}`;
}

function goListParse(out: string): string[] {
  const ids: string[] = [];
  let pending: string[] = [];
  for (const line of out.split(/\r?\n/)) {
    const ok = /^ok\s+(\S+)/.exec(line);
    if (ok) {
      ids.push(...pending.map((t) => `${ok[1]}#${t}`));
      pending = [];
    } else if (/^(Test|Example|Fuzz)\w*$/.test(line.trim())) pending.push(line.trim());
  }
  return ids;
}

function playwrightListParse(out: string): string[] {
  const rows: { project: string; rest: string }[] = [];
  for (const line of out.split(/\r?\n/)) {
    const m = /^\s*(?:\[([^\]]+)\]\s+›\s+)?(\S+?):\d+:\d+\s+›\s+(.+)$/.exec(line);
    if (m) rows.push({ project: m[1] ?? "", rest: `${m[2]} > ${m[3].split(" › ").map(clean).join(" > ")}` });
  }
  const multi = new Set(rows.map((r) => r.project)).size > 1;
  return [...new Set(rows.map((r) => (multi && r.project ? `${r.rest} [${r.project}]` : r.rest)))];
}

/** PHPUnit lists a test stopped by its time limit as risky ("This test was aborted after N seconds"), not as a failure. */
function phpunitAborted(files: ParsedFile[], output: string) {
  const cases = files.flatMap((f) => f.cases);
  for (const block of output.split(/\r?\n(?=\d+\) \S+::\S)/)) {
    const head = /^\d+\) (\S+)::(\S+?)(?: with data set .*)?\r?\n/.exec(block);
    const why = /This test was aborted after (\d+) seconds?/.exec(block);
    if (!head || !why) continue;
    for (const c of cases) {
      if (c.classname !== head[1] || stripParams(c.name).replace(/ with data set .*$/, "") !== head[2] || c.status === "failed") continue;
      c.status = "failed";
      c.statusDetail = "timeout";
      c.message = `aborted after ${why[1]}s (phpunit time limit; reported as risky)`;
    }
  }
}

/** VSTest leaves the test that hung or crashed the test host out of the TRX and names it only on the console. */
function dotnetHostDied(files: ParsedFile[], output: string) {
  const block = /The test running when the crash occurred:\s*\r?\n([\s\S]*?)\r?\nThis test may, or may not be the source of the crash/.exec(output);
  const target = files.find((f) => f.cases.length);
  if (!block || !target) return;
  const hang = /Blame' message: The specified inactivity time of (\d+) seconds? has elapsed/.exec(output);
  for (const fqn of block[1].split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    const [cls, method] = splitClassHash(dotnetFqnToId(fqn));
    if (files.some((f) => f.cases.some((c) => c.classname === cls && (c.name === method || c.name === fqn)))) continue;
    target.cases.push({ name: method, classname: cls, status: "failed", statusDetail: hang ? "timeout" : "error", durationMs: 0, message: hang ? `hung: no progress for ${hang[1]}s, so --blame-hang-timeout killed the test host` : "the test host crashed while this test ran" });
  }
}

export type DotnetMode = "vstest" | "mtp" | "mtp-xunit" | "mtp-none";

function readUp(start: string, name: string): { text: string; dirs: string[] } {
  const dirs: string[] = [];
  let text = "";
  for (let d = path.resolve(start); ; d = path.dirname(d)) {
    dirs.push(d);
    const f = path.join(d, name);
    if (fs.existsSync(f)) {
      text = fs.readFileSync(f, "utf8");
      break;
    }
    if (path.dirname(d) === d || fs.existsSync(path.join(d, ".git"))) break;
  }
  return { text, dirs };
}

export function dotnetProject(cwd: string, cmd: string): string | undefined {
  const m = /--project[ =]+["']?([^\s"']+)/.exec(cmd) ?? /(?:^|\s)["']?([^\s"']+\.(?:cs|fs|vb)proj)\b/.exec(cmd);
  return m ? path.resolve(cwd, m[1]) : undefined;
}

/** How to add a TRX reporter to an MTP project, including the central PackageVersion when the repo uses central package management. */
export function trxHint(cwd: string, cmd: string): string {
  const proj = dotnetProject(cwd, cmd);
  const where = (proj && path.relative(cwd, proj)) || "the test project";
  const add = `add <PackageReference Include="Microsoft.Testing.Extensions.TrxReport" /> to ${where}`;
  const start = proj ? path.dirname(proj) : cwd;
  const props = readUp(start, "Directory.Packages.props");
  if (!props.text || !/<ManagePackageVersionsCentrally>\s*true\s*</i.test(props.text + readUp(start, "Directory.Build.props").text)) return `this Microsoft.Testing.Platform project has no TRX reporter: ${add.replace(" />", ' Version="<version>" />')}`;
  const file = props.dirs.at(-1) ? path.relative(cwd, path.join(props.dirs.at(-1)!, "Directory.Packages.props")) : "Directory.Packages.props";
  const ver = /<PackageVersion\s+Include="Microsoft\.Testing\.(?:Platform|Extensions\.[\w.]+)"\s+Version="([^"]+)"/.exec(props.text)?.[1];
  return `this Microsoft.Testing.Platform project has no TRX reporter: ${add}, and <PackageVersion Include="Microsoft.Testing.Extensions.TrxReport" Version="${ver ?? "<version>"}" /> to ${file} (the repo uses central package management)`;
}

/** VSTest vs Microsoft.Testing.Platform (global.json test.runner), and which TRX flag the test project supports. */
export function dotnetMode(cwd: string, cmd = ""): DotnetMode {
  const gj = readUp(cwd, "global.json").text;
  let mtp = false;
  try {
    mtp = /Microsoft\.Testing\.Platform/.test(JSON.parse(gj || "{}")?.test?.runner ?? "");
  } catch {
    mtp = false;
  }
  if (!mtp) return "vstest";
  const proj = dotnetProject(cwd, cmd);
  if (proj && fs.existsSync(proj)) {
    const text = fs.readFileSync(proj, "utf8") + readUp(path.dirname(proj), "Directory.Build.props").text;
    if (/"xunit\.v3(\.mtp-v\d)?"/.test(text)) return "mtp-xunit";
    if (/Microsoft\.Testing\.Extensions\.TrxReport|Sdk="MSTest\.Sdk|Include="MSTest"|Include="TUnit"/.test(text)) return "mtp";
    return "mtp-none";
  }
  return /"xunit\.v3"/.test(readUp(cwd, "Directory.Packages.props").text) ? "mtp-xunit" : "mtp";
}

// build servers and reused MSBuild nodes leave the suite's process group and outlive a stalled suite
const DOTNET_NO_BUILD_SERVERS = { DOTNET_CLI_USE_MSBUILD_SERVER: "0", MSBUILDDISABLENODEREUSE: "1", UseSharedCompilation: "false", UseRazorBuildServer: "false" };

export const ADAPTERS: Record<AdapterName, Adapter> = {
  pytest: {
    name: "pytest",
    format: "junit",
    reportArgs: (d) => `--junitxml=${shq(path.join(d, "junit.xml"))} -o junit_family=xunit1`,
    reportMarker: /--junit-?xml/,
    reportGlobs: [{ base: "report-dir", glob: "**/*.xml" }],
    selectArgs: (ids) => ids.map(shq).join(" "),
    select: pytestSelect,
    list: { args: "--collect-only -q", format: "adapter", parse: (out) => parseLines(out, /^(\S+\.py::\S.*)$/, (m) => m[1].trim()) },
    perTestTimeout: (ms) => `--timeout=${Math.ceil(ms / 1000)}`,
    plugins: [{ name: "pytest-timeout", needed: (ptt) => ptt, probeArgs: "--collect-only -q --timeout=1", missing: /unrecognized arguments:.*--timeout/, hint: "per_test_timeout needs the pytest-timeout plugin: add pytest-timeout to the test requirements and install it" }],
    id: pytestId,
  },
  "junit-maven": {
    name: "junit-maven",
    format: "junit",
    reportGlobs: [
      { base: "cwd", glob: "**/target/surefire-reports/TEST-*.xml" },
      { base: "cwd", glob: "**/target/failsafe-reports/TEST-*.xml" },
    ],
    selectArgs: (ids) => `${shq(`-Dtest=${ids.map((id) => { const [c, m] = splitClassHash(id); return `${c}#${stripParams(m)}`; }).join(",")}`)} -Dsurefire.failIfNoSpecifiedTests=false -DfailIfNoTests=false`,
    perTestTimeout: (ms) => shq(`-Djunit.jupiter.execution.timeout.default=${Math.ceil(ms / 1000)} s`),
    id: classHash,
  },
  "junit-gradle": {
    name: "junit-gradle",
    format: "junit",
    // an up-to-date test task writes no new report; --rerun (Gradle 7.6+) makes it run
    reportArgs: () => "--rerun",
    reportMarker: /--rerun\b|--rerun-tasks|\bcleanTest\b/,
    reportGlobs: [{ base: "cwd", glob: "**/build/test-results/**/*.xml" }],
    selectArgs: (ids) => ids.map((id) => { const [c, m] = splitClassHash(id); return `--tests ${shq(`${c}.${stripParams(m)}`)}`; }).join(" "),
    id: classHash,
  },
  dotnet: {
    name: "dotnet",
    format: "trx",
    reportArgs: (d, cwd, cmd) => {
      const mode = dotnetMode(cwd, cmd);
      if (mode === "mtp-none") return "";
      return `${mode === "vstest" ? "--logger trx" : mode === "mtp-xunit" ? "--report-xunit-trx" : "--report-trx"} --results-directory ${shq(d)}`;
    },
    reportHint: (cwd, cmd) => (dotnetMode(cwd, cmd) === "mtp-none" ? trxHint(cwd, cmd) : undefined),
    reportMarker: /--logger[ =:]+["']?trx|--report-(xunit-)?trx/,
    reportGlobs: [
      { base: "report-dir", glob: "**/*.trx" },
      { base: "cwd", glob: "**/TestResults/**/*.trx" },
    ],
    selectArgs: (ids) => `--filter ${shq(dotnetFilter(ids))}`,
    // a second --filter is rejected (MSTest: "expects at most 1 arguments"), so the selection is ANDed into the suite's own
    select: (cmd, ids) => {
      const m = /--filter(?:\s+|=)(?:'([^']*)'|"([^"]*)"|([^\s'"]+))/.exec(cmd);
      if (!m) return appendArgs(cmd, `--filter ${shq(dotnetFilter(ids))}`);
      return `${cmd.slice(0, m.index)}--filter ${shq(`(${m[1] ?? m[2] ?? m[3]})&(${dotnetFilter(ids)})`)}${cmd.slice(m.index + m[0].length)}`;
    },
    list: {
      args: "--list-tests",
      format: "adapter",
      parse: (out) => {
        const ids: string[] = [];
        let on = false;
        for (const line of out.split(/\r?\n/)) {
          if (/The following Tests are available|^Discovered \d+ tests? in/.test(line)) on = true;
          else if (on && /^\s{2,}\S/.test(line)) ids.push(dotnetFqnToId(line.trim()));
          else if (on && line.trim() && !/^\s/.test(line)) on = false;
        }
        return [...new Set(ids)];
      },
    },
    perTestTimeout: (ms, cwd, cmd) => (dotnetMode(cwd, cmd) === "vstest" ? `--blame-hang-timeout ${Math.ceil(ms / 1000)}s` : null),
    env: DOTNET_NO_BUILD_SERVERS,
    amend: dotnetHostDied,
    id: classHash,
  },
  jest: {
    name: "jest",
    format: "jest-json",
    reportArgs: (d) => `--json --outputFile=${shq(path.join(d, "jest.json"))}`,
    reportMarker: /--json\b/,
    reportGlobs: [{ base: "report-dir", glob: "**/*.json" }],
    selectArgs: (ids) => `-t ${shq(fullTitleRegex(ids, " "))}`,
    list: { args: `--testNamePattern=${shq(NO_TEST)}`, format: "report" },
    perTestTimeout: (ms) => `--testTimeout=${ms} --forceExit`,
    id: titled,
  },
  vitest: {
    name: "vitest",
    format: "junit",
    reportArgs: (d) => `--reporter=default --reporter=junit --outputFile.junit=${shq(path.join(d, "junit.xml"))}`,
    reportMarker: /--reporter[= ]junit/,
    reportGlobs: [{ base: "report-dir", glob: "**/*.xml" }],
    selectArgs: (ids) => `-t ${shq(fullTitleRegex(ids, "(?: > | )"))}`,
    list: { args: `-t ${shq(NO_TEST)}`, format: "report" },
    perTestTimeout: (ms) => `--testTimeout=${ms}`,
    id: (c) => titled({ ...c, titles: c.titles ?? c.name.split(" > "), file: c.file ?? c.classname }),
  },
  playwright: {
    name: "playwright",
    format: "playwright-json",
    reportArgs: () => "--reporter=list,json",
    reportEnv: (d) => ({ PLAYWRIGHT_JSON_OUTPUT_NAME: path.join(d, "playwright.json"), PLAYWRIGHT_JSON_OUTPUT_FILE: path.join(d, "playwright.json") }),
    reportMarker: /--reporter/,
    reportGlobs: [{ base: "report-dir", glob: "**/*.json" }],
    selectArgs: (ids) => `${[...new Set(ids.map((id) => id.split(" > ")[0]))].map(shq).join(" ")} --grep ${shq(fullTitleRegex(ids, " "))}`,
    list: { args: "--list", format: "adapter", parse: playwrightListParse },
    perTestTimeout: (ms) => `--timeout=${ms}`,
    id: titled,
  },
  go: {
    name: "go",
    format: "go-json",
    reportArgs: () => "-json",
    reportMarker: /\s-json\b/,
    reportGlobs: [],
    fromStdout: true,
    selectArgs: goSelectArgs,
    list: {
      rewrite: (cmd) => (/\bgo\s+test\b/.test(cmd) ? cmd.replace(/\s-json\b/, "").replace(/\s-run\s+\S+/, "") : null),
      args: "-list .",
      format: "adapter",
      parse: goListParse,
    },
    id: classHash,
  },
  mocha: {
    name: "mocha",
    format: "junit",
    reportArgs: (d) => `--reporter xunit --reporter-option output=${shq(path.join(d, "mocha.xml"))}`,
    reportMarker: /--reporter\b/,
    reportGlobs: [{ base: "report-dir", glob: "**/*.xml" }],
    selectArgs: (ids) => `--grep ${shq(fullTitleRegex(ids, " "))}`,
    list: { args: "--dry-run", format: "report" },
    perTestTimeout: (ms) => `--timeout ${ms} --exit`,
    id: titled,
  },
  rspec: {
    name: "rspec",
    format: "junit",
    reportArgs: (d) => `--format progress --format RspecJunitFormatter --out ${shq(path.join(d, "rspec.xml"))}`,
    reportMarker: /RspecJunitFormatter/,
    reportGlobs: [{ base: "report-dir", glob: "**/*.xml" }],
    selectArgs: (ids) => ids.map((id) => `-e ${shq(id.split(" > ").slice(1).join(" > "))}`).join(" "),
    list: { args: "--dry-run", format: "report" },
    plugins: [{ name: "rspec_junit_formatter", needed: () => true, probeArgs: "--dry-run --format RspecJunitFormatter --out /dev/null", missing: /cannot load such file -- rspec_junit_formatter|Formatter '?RspecJunitFormatter'? unknown|uninitialized constant RspecJunitFormatter/, hint: 'witness reads rspec results through the rspec_junit_formatter gem: add gem "rspec_junit_formatter" to the Gemfile (test group) and bundle install' }],
    id: (c) => [normFile(c.file) ?? c.classname, clean(c.name)].filter(Boolean).join(" > "),
  },
  phpunit: {
    name: "phpunit",
    format: "junit",
    reportArgs: (d) => `--log-junit ${shq(path.join(d, "phpunit.xml"))}`,
    reportMarker: /--log-junit/,
    reportGlobs: [{ base: "report-dir", glob: "**/*.xml" }],
    selectArgs: (ids) => {
      const pat = ids.map((id) => { const [c, m] = splitClassHash(id); return `${escapeRegExp(c)}::${escapeRegExp(stripParams(m).replace(/ with data set .*$/, ""))}`; });
      return `--filter ${shq(`/(${pat.join("|")})( with data set .*)?$/`)}`;
    },
    list: { args: "--list-tests", format: "adapter", parse: (out) => parseLines(out, /^\s*-\s+(\S+)::(\S+)/, (m) => `${m[1]}#${m[2]}`) },
    perTestTimeout: (ms) => `--enforce-time-limit --default-time-limit=${Math.ceil(ms / 1000)}`,
    amend: phpunitAborted,
    plugins: [{ name: "phpunit/php-invoker", needed: (ptt) => ptt, missing: /php-invoker|pcntl extension is required/i, hint: "phpunit enforces per-test time limits only with the phpunit/php-invoker package and the pcntl extension: composer require --dev phpunit/php-invoker" }],
    id: classHash,
  },
  bats: {
    name: "bats",
    format: "junit",
    reportArgs: (d) => `--report-formatter junit --output ${shq(d)}`,
    reportMarker: /--report-formatter\b/,
    reportGlobs: [{ base: "report-dir", glob: "**/*.xml" }],
    selectArgs: (ids) => `--filter ${shq(`^(${ids.map((id) => escapeRegExp(splitClassHash(id)[1])).join("|")})$`)}`,
    perTestTimeoutEnv: (ms) => ({ BATS_TEST_TIMEOUT: String(Math.ceil(ms / 1000)) }),
    id: classHash,
  },
  generic: {
    name: "generic",
    format: "junit",
    reportGlobs: [{ base: "report-dir", glob: "**/*.{xml,trx,json}" }],
    id: classHash,
  },
};

function dotnetFilter(ids: string[]): string {
  return ids.map((id) => { const [c, m] = splitClassHash(id); return `FullyQualifiedName=${c}.${stripParams(m)}`; }).join("|");
}

/** The preset's environment plus the per-test timeout for runners that read it from the environment. */
export function presetEnv(adapter: Adapter, perTestTimeoutMs: number | undefined, hasTimeoutArg = false): Record<string, string> {
  return { ...adapter.env, ...(perTestTimeoutMs && !hasTimeoutArg && adapter.perTestTimeoutEnv ? adapter.perTestTimeoutEnv(perTestTimeoutMs) : {}) };
}

export const stableId = (adapter: AdapterName, id: string) => `${adapter}:${id}`;

/** The command that runs only `ids`: the suite's select template, else `${WITNESS_SELECT}`, else the adapter's rewrite. */
export function selectCommand(adapter: Adapter, cmd: string, ids: string[], template?: string): string | null {
  if (template) {
    if (template.includes("{ids}")) return template.replace("{ids}", () => ids.map(shq).join(" "));
    if (template.includes("{id}") && ids.length === 1) return template.replace("{id}", () => shq(ids[0]));
    return null;
  }
  if (hasSelectVar(cmd)) return adapter.selectArgs ? fillSelect(cmd, adapter.selectArgs(ids)) : null;
  if (adapter.select) return adapter.select(cmd, ids);
  return adapter.selectArgs ? appendArgs(cmd, adapter.selectArgs(ids)) : null;
}
