import * as path from "node:path";
import type { RawCase, ReportFormat } from "./parsers/types.ts";
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
  | "generic";

export interface ReportGlob {
  base: "report-dir" | "cwd";
  glob: string;
}

export interface Adapter {
  name: AdapterName;
  format: ReportFormat;
  /** Args that make the framework write a machine report into dir. */
  reportArgs?: (dir: string) => string;
  reportEnv?: (dir: string) => Record<string, string>;
  /** When the command already matches, the user wired the report; append nothing. */
  reportMarker?: RegExp;
  reportGlobs: ReportGlob[];
  /** The report is the suite's stdout (go test -json). */
  fromStdout?: boolean;
  select?: (cmd: string, ids: string[]) => string | null;
  list?: { cmd: (cmd: string) => string | null; parse: (out: string) => string[] };
  perTestTimeout?: (ms: number) => string;
  id: (c: RawCase) => string;
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

function fullTitleRegex(ids: string[], sep: string): string {
  const parts = ids.map((id) => id.split(" > ").slice(1).join(sep).replace(/ \[[^\]]+\]$/, ""));
  return `(${parts.map(escapeRegExp).join("|")})$`;
}

function goSelect(cmd: string, ids: string[]): string {
  const names = ids.map((id) => splitClassHash(id)[1]);
  const top = [...new Set(names.map((n) => n.split("/")[0]))];
  const subs = names.filter((n) => n.includes("/"));
  let run = `^(${top.map(escapeRegExp).join("|")})$`;
  if (subs.length && top.length === 1 && subs.length === names.length) {
    run += `/^(${subs.map((n) => escapeRegExp(n.split("/").slice(1).join("/"))).join("|")})$`;
  }
  return appendArgs(cmd, `-run ${shq(run)}`);
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

export const ADAPTERS: Record<AdapterName, Adapter> = {
  pytest: {
    name: "pytest",
    format: "junit",
    reportArgs: (d) => `--junitxml=${shq(path.join(d, "junit.xml"))} -o junit_family=xunit1`,
    reportMarker: /--junit-?xml/,
    reportGlobs: [{ base: "report-dir", glob: "**/*.xml" }],
    select: pytestSelect,
    list: {
      cmd: (cmd) => appendArgs(cmd, "--collect-only -q"),
      parse: (out) => parseLines(out, /^(\S+\.py::\S.*)$/, (m) => m[1].trim()),
    },
    perTestTimeout: (ms) => `--timeout=${Math.ceil(ms / 1000)}`,
    id: pytestId,
  },
  "junit-maven": {
    name: "junit-maven",
    format: "junit",
    reportGlobs: [
      { base: "cwd", glob: "**/target/surefire-reports/TEST-*.xml" },
      { base: "cwd", glob: "**/target/failsafe-reports/TEST-*.xml" },
    ],
    select: (cmd, ids) =>
      appendArgs(cmd, `${shq(`-Dtest=${ids.map((id) => { const [c, m] = splitClassHash(id); return `${c}#${stripParams(m)}`; }).join(",")}`)} -Dsurefire.failIfNoSpecifiedTests=false -DfailIfNoTests=false`),
    perTestTimeout: (ms) => shq(`-Djunit.jupiter.execution.timeout.default=${Math.ceil(ms / 1000)} s`),
    id: classHash,
  },
  "junit-gradle": {
    name: "junit-gradle",
    format: "junit",
    reportGlobs: [{ base: "cwd", glob: "**/build/test-results/**/*.xml" }],
    select: (cmd, ids) => appendArgs(cmd, ids.map((id) => { const [c, m] = splitClassHash(id); return `--tests ${shq(`${c}.${stripParams(m)}`)}`; }).join(" ")),
    id: classHash,
  },
  dotnet: {
    name: "dotnet",
    format: "trx",
    reportArgs: (d) => `--logger trx --results-directory ${shq(d)}`,
    reportMarker: /--logger[ =:]+["']?trx|--report-trx/,
    reportGlobs: [
      { base: "report-dir", glob: "**/*.trx" },
      { base: "cwd", glob: "**/TestResults/**/*.trx" },
    ],
    select: (cmd, ids) => appendArgs(cmd, `--filter ${shq(ids.map((id) => { const [c, m] = splitClassHash(id); return `FullyQualifiedName=${c}.${stripParams(m)}`; }).join("|"))}`),
    list: {
      cmd: (cmd) => appendArgs(cmd, "--list-tests"),
      parse: (out) => {
        const ids: string[] = [];
        let on = false;
        for (const line of out.split(/\r?\n/)) {
          if (/The following Tests are available/.test(line)) on = true;
          else if (on && /^\s{2,}\S/.test(line)) ids.push(dotnetFqnToId(line.trim()));
          else if (on && line.trim() && !/^\s/.test(line)) on = false;
        }
        return [...new Set(ids)];
      },
    },
    perTestTimeout: (ms) => `--blame-hang-timeout ${Math.ceil(ms / 1000)}s`,
    id: classHash,
  },
  jest: {
    name: "jest",
    format: "jest-json",
    reportArgs: (d) => `--json --outputFile=${shq(path.join(d, "jest.json"))}`,
    reportMarker: /--json\b/,
    reportGlobs: [{ base: "report-dir", glob: "**/*.json" }],
    select: (cmd, ids) => appendArgs(cmd, `-t ${shq(fullTitleRegex(ids, " "))}`),
    perTestTimeout: (ms) => `--testTimeout=${ms}`,
    id: titled,
  },
  vitest: {
    name: "vitest",
    format: "junit",
    reportArgs: (d) => `--reporter=default --reporter=junit --outputFile.junit=${shq(path.join(d, "junit.xml"))}`,
    reportMarker: /--reporter[= ]junit/,
    reportGlobs: [{ base: "report-dir", glob: "**/*.xml" }],
    select: (cmd, ids) => appendArgs(cmd, `-t ${shq(fullTitleRegex(ids, " "))}`),
    list: {
      cmd: (cmd) => (/\bvitest\s+run\b/.test(cmd) ? cmd.replace(/\bvitest\s+run\b/, "vitest list") : /\bvitest\b/.test(cmd) ? cmd.replace(/\bvitest\b/, "vitest list") : null),
      parse: (out) => parseLines(out, /^(\S+\.[cm]?[jt]sx? > .+)$/, (m) => m[1].trim()),
    },
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
    select: (cmd, ids) => {
      const files = [...new Set(ids.map((id) => id.split(" > ")[0]))];
      return appendArgs(cmd, `${files.map(shq).join(" ")} --grep ${shq(fullTitleRegex(ids, " "))}`);
    },
    list: { cmd: (cmd) => appendArgs(cmd, "--list"), parse: playwrightListParse },
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
    select: goSelect,
    list: {
      cmd: (cmd) => (/\bgo\s+test\b/.test(cmd) ? cmd.replace(/\s-json\b/, "").replace(/\s-run\s+\S+/, "") + " -list ." : null),
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
    select: (cmd, ids) => appendArgs(cmd, `--grep ${shq(fullTitleRegex(ids, " "))}`),
    perTestTimeout: (ms) => `--timeout ${ms}`,
    id: titled,
  },
  rspec: {
    name: "rspec",
    format: "junit",
    reportArgs: (d) => `--format progress --format RspecJunitFormatter --out ${shq(path.join(d, "rspec.xml"))}`,
    reportMarker: /RspecJunitFormatter/,
    reportGlobs: [{ base: "report-dir", glob: "**/*.xml" }],
    select: (cmd, ids) => appendArgs(cmd, ids.map((id) => `-e ${shq(id.split(" > ").slice(1).join(" > "))}`).join(" ")),
    id: (c) => [normFile(c.file) ?? c.classname, clean(c.name)].filter(Boolean).join(" > "),
  },
  phpunit: {
    name: "phpunit",
    format: "junit",
    reportArgs: (d) => `--log-junit ${shq(path.join(d, "phpunit.xml"))}`,
    reportMarker: /--log-junit/,
    reportGlobs: [{ base: "report-dir", glob: "**/*.xml" }],
    select: (cmd, ids) => {
      const pat = ids.map((id) => { const [c, m] = splitClassHash(id); return `${escapeRegExp(c)}::${escapeRegExp(stripParams(m).replace(/ with data set .*$/, ""))}`; });
      return appendArgs(cmd, `--filter ${shq(`/(${pat.join("|")})( with data set .*)?$/`)}`);
    },
    list: {
      cmd: (cmd) => appendArgs(cmd, "--list-tests"),
      parse: (out) => parseLines(out, /^\s*-\s+(\S+)::(\S+)/, (m) => `${m[1]}#${m[2]}`),
    },
    perTestTimeout: (ms) => `--default-time-limit=${Math.ceil(ms / 1000)}`,
    id: classHash,
  },
  generic: {
    name: "generic",
    format: "junit",
    reportGlobs: [{ base: "report-dir", glob: "**/*.{xml,trx,json}" }],
    id: classHash,
  },
};

export const stableId = (adapter: AdapterName, id: string) => `${adapter}:${id}`;

/** The command that runs only `ids`: the suite's own select template wins over the adapter. */
export function selectCommand(adapter: Adapter, cmd: string, ids: string[], template?: string): string | null {
  if (template) {
    if (template.includes("{ids}")) return template.replace("{ids}", ids.map(shq).join(" "));
    if (template.includes("{id}") && ids.length === 1) return template.replace("{id}", shq(ids[0]));
    return null;
  }
  return adapter.select ? adapter.select(cmd, ids) : null;
}
