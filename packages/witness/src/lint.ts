import * as fs from "node:fs";
import * as path from "node:path";
import { type Plan, type PlanItem, splitId } from "./plan.ts";
import { git, globFiles } from "./util.ts";

export type Lang = "py" | "js" | "cs" | "java" | "go" | "rb" | "php";
export type Rule = "no-assertion" | "swallowed-exception" | "long-sleep" | "error-status-only";

export interface Finding {
  file: string;
  line: number;
  rule: Rule;
  level: "error" | "warning";
  message: string;
  test?: string;
}

export interface Block {
  name: string;
  line: number;
  start: number;
  end: number;
  skipped?: boolean;
}

const EXT: Record<string, Lang> = {
  ".py": "py",
  ".js": "js",
  ".jsx": "js",
  ".mjs": "js",
  ".cjs": "js",
  ".ts": "js",
  ".tsx": "js",
  ".mts": "js",
  ".cts": "js",
  ".cs": "cs",
  ".java": "java",
  ".kt": "java",
  ".kts": "java",
  ".go": "go",
  ".rb": "rb",
  ".php": "php",
};

export const langOf = (file: string): Lang | undefined => EXT[path.extname(file).toLowerCase()];

const TEST_PATH = [/(^|\/)[^/]*(tests?|specs?|__tests__|e2e)\//i, /([._-](test|spec)s?|Tests?|IT)\.[a-z]+$/, /(^|\/)test_[^/]*\.py$/, /_(test|spec)\.(go|py|rb)$/];
export const isTestPath = (rel: string) => !!langOf(rel) && TEST_PATH.some((re) => re.test(rel.replace(/\\/g, "/")));

/** Blank out comments and string contents (keeping quotes and newlines) so structure can be matched. */
export function mask(src: string, lang: Lang): string {
  const out = src.split("");
  const n = src.length;
  const blank = (a: number, b: number) => {
    for (let k = a; k < b && k < n; k++) if (out[k] !== "\n") out[k] = " ";
  };
  const hash = lang === "py" || lang === "rb" || lang === "php";
  const slash = lang !== "py" && lang !== "rb";
  let i = 0;
  while (i < n) {
    const c = src[i];
    const c2 = src.slice(i, i + 2);
    if (slash && c2 === "//") {
      const e = src.indexOf("\n", i);
      blank(i, e < 0 ? n : e);
      i = e < 0 ? n : e;
    } else if (slash && c2 === "/*") {
      const e = src.indexOf("*/", i + 2);
      blank(i, e < 0 ? n : e + 2);
      i = e < 0 ? n : e + 2;
    } else if (hash && c === "#" && !(lang === "php" && src[i + 1] === "[")) {
      const e = src.indexOf("\n", i);
      blank(i, e < 0 ? n : e);
      i = e < 0 ? n : e;
    } else if ((lang === "py" || lang === "cs") && (src.startsWith('"""', i) || (lang === "py" && src.startsWith("'''", i)))) {
      const q = src.slice(i, i + 3);
      const e = src.indexOf(q, i + 3);
      blank(i, e < 0 ? n : e + 3);
      i = e < 0 ? n : e + 3;
    } else if (lang === "cs" && c2 === '@"') {
      let j = i + 2;
      while (j < n && !(src[j] === '"' && src[j + 1] !== '"')) j += src[j] === '"' ? 2 : 1;
      blank(i + 2, j);
      i = j + 1;
    } else if (lang === "js" && c === "/" && regexAllowed(src, i)) {
      let j = i + 1;
      let cls = false;
      while (j < n && src[j] !== "\n" && (cls || src[j] !== "/")) {
        if (src[j] === "\\") j++;
        else if (src[j] === "[") cls = true;
        else if (src[j] === "]") cls = false;
        j++;
      }
      blank(i + 1, j);
      i = j + 1;
    } else if (c === '"' || c === "'" || (c === "`" && (lang === "js" || lang === "go"))) {
      const raw = c === "`" && lang === "go";
      let j = i + 1;
      while (j < n && src[j] !== c) {
        if (src[j] === "\\" && !raw) j++;
        else if (src[j] === "\n" && c !== "`") break;
        j++;
      }
      blank(i + 1, j);
      i = j + 1;
    } else i++;
  }
  return out.join("");
}

/** A `/` starts a regex literal (not division) after an operator, an opening bracket or a keyword. */
function regexAllowed(src: string, i: number): boolean {
  if (src[i + 1] === "/" || src[i + 1] === "*" || src[i + 1] === ">") return false;
  let k = i - 1;
  while (k >= 0 && (src[k] === " " || src[k] === "\t")) k--;
  if (k < 0 || src[k] === "\n") return true;
  if (src[k] === ">") return src[k - 1] === "=";
  if ("(,=:[!&|?{};+-*%~^".includes(src[k])) return true;
  return /\b(return|typeof|case|in|of|delete|void|throw|new|yield|await)$/.test(src.slice(Math.max(0, k - 7), k + 1));
}

/** Index of the bracket that closes the one at `open` in masked code, or -1. */
export function matchBracket(code: string, open: number): number {
  const o = code[open];
  const cl = o === "(" ? ")" : o === "{" ? "}" : "]";
  let depth = 0;
  for (let k = open; k < code.length; k++) {
    if (code[k] === o) depth++;
    else if (code[k] === cl && --depth === 0) return k;
  }
  return -1;
}

const lineAt = (text: string, idx: number) => {
  let l = 1;
  for (let k = 0; k < idx && k < text.length; k++) if (text[k] === "\n") l++;
  return l;
};

const indentOf = (line: string) => line.length - line.trimStart().length;

/** End offset of an indentation block (Python, Ruby) starting at the line containing `at`. */
function indentBlockEnd(code: string, at: number, ruby: boolean): number {
  const lineStart = code.lastIndexOf("\n", at) + 1;
  const ind = indentOf(code.slice(lineStart, code.indexOf("\n", at) < 0 ? code.length : code.indexOf("\n", at)));
  let pos = code.indexOf("\n", at);
  if (pos < 0) return code.length;
  let paren = 0;
  for (let k = lineStart; k < pos; k++) paren += code[k] === "(" ? 1 : code[k] === ")" ? -1 : 0;
  while (pos < code.length) {
    const next = code.indexOf("\n", pos + 1);
    const line = code.slice(pos + 1, next < 0 ? code.length : next);
    const open = paren > 0;
    for (const ch of line) paren += ch === "(" ? 1 : ch === ")" ? -1 : 0;
    if (line.trim() && !open && indentOf(line) <= ind) return ruby && /^\s*end\b/.test(line) ? (next < 0 ? code.length : next) : pos;
    if (next < 0) return code.length;
    pos = next;
  }
  return code.length;
}

/** Body after a signature: brace-matched `{...}`, or an `=> expr;` body. */
function bodyAfter(code: string, from: number): [number, number] | null {
  const lead = /^\s*(=>|=(?!=))?/.exec(code.slice(from))!;
  if (lead[1] === "=>") {
    let depth = 0;
    for (let k = from + lead[0].length; k < code.length; k++) {
      const ch = code[k];
      if (ch === "(" || ch === "{" || ch === "[") depth++;
      else if (ch === ")" || ch === "}" || ch === "]") depth--;
      else if (ch === ";" && depth <= 0) return [from, k + 1];
    }
    return null;
  }
  const brace = code.indexOf("{", from);
  const semi = code.indexOf(";", from);
  if (brace < 0 || (semi >= 0 && semi < brace)) return null;
  const end = matchBracket(code, brace);
  return end < 0 ? null : [brace, end + 1];
}

/** Test functions/blocks in a file, from masked code (raw text gives titles). */
export function findTests(raw: string, code: string, lang: Lang): Block[] {
  const blocks: Block[] = [];
  const add = (name: string, at: number, start: number, end: number, skipped = false) => {
    if (!blocks.some((b) => b.start === start)) blocks.push({ name, line: lineAt(code, at), start, end, skipped });
  };
  let m: RegExpExecArray | null;
  if (lang === "py") {
    const re = /^([ \t]*)(?:async\s+)?def\s+(test\w*)\s*\(/gm;
    while ((m = re.exec(code))) {
      const before = code.slice(Math.max(0, m.index - 400), m.index).split("\n").slice(-4).join("\n");
      add(m[2], m.index, m.index, indentBlockEnd(code, m.index, false), /@(pytest\.mark\.skip|unittest\.skip)/.test(before));
    }
  } else if (lang === "rb") {
    const re = /^([ \t]*)(?:(it|specify|scenario|example|test)\b\s*\(?\s*(['"])|def\s+(test_\w+))/gm;
    while ((m = re.exec(code))) {
      const lineEnd = code.indexOf("\n", m.index);
      const header = code.slice(m.index, lineEnd < 0 ? code.length : lineEnd);
      const rawHeader = raw.slice(m.index, lineEnd < 0 ? raw.length : lineEnd);
      const title = m[4] ?? (/(['"])(.*?)\1/.exec(rawHeader)?.[2] ?? "");
      if (!m[4] && !/\bdo\b|\{/.test(header)) continue;
      const brace = !m[4] && !/\bdo\b/.test(header) ? code.indexOf("{", m.index) : -1;
      const end = brace >= 0 ? matchBracket(code, brace) + 1 : indentBlockEnd(code, m.index, true);
      add(title, m.index, m.index, end, /^\s*x(it|specify)|skip/.test(header));
    }
  } else if (lang === "js") {
    const re = /(?<![\w.$])(it|test)((?:\.(?:only|skip|concurrent|fixme|fail|failing|slow|todo))*)\s*\(\s*(['"`])/g;
    while ((m = re.exec(code))) {
      const open = code.indexOf("(", m.index + m[1].length + m[2].length);
      const close = matchBracket(code, open);
      if (close < 0) continue;
      const q = open + 1 + (code.slice(open + 1).length - code.slice(open + 1).trimStart().length);
      const qEnd = code.indexOf(raw[q], q + 1);
      add(raw.slice(q + 1, qEnd), m.index, open, close + 1, /skip|todo|fixme/.test(m[2]));
    }
  } else if (lang === "go") {
    const re = /\bfunc\s+(Test\w*)\s*\(\s*\w+\s+\*testing\.T\s*\)/g;
    while ((m = re.exec(code))) {
      const b = bodyAfter(code, m.index + m[0].length);
      if (b) add(m[1], m.index, b[0], b[1]);
    }
  } else {
    const re =
      lang === "cs"
        ? /\[\s*(?:Xunit\.|NUnit\.Framework\.)?(Fact|Theory|Test|TestMethod|DataTestMethod|TestCase|TestCaseSource|SkippableFact|SkippableTheory)\b(\([^\]]*\))?\s*(?:,[^\]]*)?\]/g
        : lang === "java"
          ? /@(Test|ParameterizedTest|RepeatedTest|TestFactory|TestTemplate)\b(\([^)]*\))?/g
          : /(#\[\s*Test\s*\]|@test\b)|\bfunction\s+(test\w*)\s*\(/g;
    while ((m = re.exec(code))) {
      let k = m.index + m[0].length;
      let name: string | undefined;
      if (lang === "php" && m[2]) {
        name = m[2];
        k = m.index + m[0].length - 1;
      } else {
        const sig = /^(?:\s*(?:\[[^\]]*\]|@\w+(?:\([^)]*\))?|#\[[^\]]*\]))*[^;{(=]*?(\w+|`[^`]+`)\s*\(/.exec(code.slice(k));
        if (!sig) continue;
        name = sig[1].replace(/`/g, "");
        k += sig[0].length - 1;
      }
      if (lang === "php" && m[1] && !/function\s+\w+\s*\($/.test(code.slice(m.index, k + 1))) continue;
      const close = matchBracket(code, k);
      if (close < 0) continue;
      const b = bodyAfter(code, close + 1);
      if (!b) continue;
      const rawSig = raw.slice(m.index, b[0]);
      add(name, m.index, b[0], b[1], /\bSkip\s*=|@Disabled|@Ignore|\[Ignore\]/.test(rawSig));
    }
  }
  return blocks.sort((a, b) => a.start - b.start);
}

const COMMON_ASSERT = /\b(assert|verify|expect|should)(?!ed\b|ation)\w*\s*[(!<]|\b(assert|expect|should)\s*\.|\bassert\b|\bEnsureSuccess\w*\s*\(|\bfail\s*\(|\bthrow\s+new\s+\w*(Error|Exception)\b|\braise\s+\w*(Error|Exception)\b/i;
const LANG_ASSERT: Record<Lang, RegExp> = {
  py: /\bpytest\.(raises|fail|warns)\b|\.assert_\w+\s*\(|\bself\.fail\w*\(/,
  js: /\bt\.(is|not|deepEqual|true|false|truthy|falsy|throws\w*|equal|ok|same|match|regex|like|snapshot|pass|fail|notOk)\s*\(|\.should\b|\bfind(All)?By\w+\s*\(/,
  cs: /\.Should\w*\(|\bShould\.\w+|\.(Received|DidNotReceive|ReceivedWithAnyArgs|DidNotReceiveWithAnyArgs)\s*[(<]|\bMustHaveHappened\w*\(|\bMustNotHaveHappened\w*\(/,
  java: /\bandExpect\s*\(|\.expect\w*\s*\(|\bverify\s*\(/,
  go: /\bt\.(Error|Errorf|Fatal|Fatalf|Fail|FailNow)\s*\(|\b(assert|require)\.\w+\s*\(/,
  rb: /\bexpect\s*\{|\bis_expected\b|\bmust_\w+|\bwont_\w+|\bshould\b|\bflunk\b/,
  php: /\$this->(assert|expect)\w*\s*\(|(self|static)::(assert|expect|fail)\w*\s*\(/,
};

const hasAssert = (code: string, lang: Lang) => COMMON_ASSERT.test(code) || LANG_ASSERT[lang].test(code);

/** Names of non-test functions in the file whose bodies assert, so tests calling them count. */
function assertingHelpers(code: string, lang: Lang, tests: Block[]): Set<string> {
  const defs: { name: string; body: string }[] = [];
  let m: RegExpExecArray | null;
  if (lang === "py" || lang === "rb") {
    const re = /^[ \t]*(?:async\s+)?def\s+(?:self\.)?(\w+[?!]?)/gm;
    while ((m = re.exec(code))) defs.push({ name: m[1], body: code.slice(m.index, indentBlockEnd(code, m.index, lang === "rb")) });
  } else {
    const re =
      lang === "js"
        ? /\b(?:function\s*\*?\s*(\w+)\s*\(|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?(?:function\b[^(]*\(|\([^)]*\)\s*(?::\s*[^=]+)?=>|\w+\s*=>))/g
        : lang === "go"
          ? /\bfunc\s+(?:\([^)]*\)\s*)?(\w+)\s*\(/g
          : lang === "php"
            ? /\bfunction\s+(\w+)\s*\(/g
            : /\b(\w+)\s*\([^;{}()]*(?:\([^)]*\)[^;{}()]*)*\)\s*(?:throws\s+[\w.,\s]+)?\{/g;
    while ((m = re.exec(code))) {
      const name = m[1] ?? m[2];
      if (!name || /^(if|for|while|switch|catch|using|lock|foreach|return|new|function)$/.test(name)) continue;
      const b = bodyAfter(code, lang === "cs" || lang === "java" ? m.index + m[0].length - 1 : m.index + m[0].length);
      if (b) defs.push({ name, body: code.slice(b[0], b[1]) });
    }
  }
  const testStarts = new Set(tests.map((t) => t.name));
  const helpers = new Set<string>();
  for (let round = 0; round < 3; round++) {
    for (const d of defs) {
      if (testStarts.has(d.name) || helpers.has(d.name)) continue;
      if (hasAssert(d.body, lang) || [...helpers].some((h) => callsName(d.body, h))) helpers.add(d.name);
    }
  }
  return helpers;
}

const callsName = (body: string, name: string) => new RegExp(`(?<![\\w$])${name.replace(/[?!$]/g, "\\$&")}\\s*[(<]`).test(body);

interface SleepPattern {
  re: RegExp;
  seconds: (m: RegExpExecArray) => number;
}

const num = (s: string) => Number(s.replace(/_/g, "").replace(/[lLfFdDmM]$/, ""));
const UNIT: Record<string, number> = { Millisecond: 0.001, Milliseconds: 0.001, MILLISECONDS: 0.001, Second: 1, Seconds: 1, SECONDS: 1, Minute: 60, Minutes: 60, MINUTES: 60, Hour: 3600, Hours: 3600, HOURS: 3600 };

const SLEEPS: Record<Lang, SleepPattern[]> = {
  py: [
    { re: /(?:\bawait\s+(?:asyncio\.|anyio\.|trio\.)?|(?<![\w.])time\.|^\s*|[;=]\s*)sleep\s*\(\s*([\d_.]+)\s*\)/gm, seconds: (m) => num(m[1]) },
    { re: /\bwait_for_timeout\s*\(\s*([\d_.]+)\s*\)/g, seconds: (m) => num(m[1]) / 1000 },
  ],
  js: [
    { re: /\bsetTimeout\s*\([^,]*,\s*([\d_.]+)\s*\)/g, seconds: (m) => num(m[1]) / 1000 },
    { re: /\bwaitForTimeout\s*\(\s*([\d_.]+)\s*\)/g, seconds: (m) => num(m[1]) / 1000 },
    { re: /\b(?:sleep|delay|wait)\s*\(\s*([\d_.]+)\s*\)/g, seconds: (m) => num(m[1]) / 1000 },
  ],
  cs: [
    { re: /\b(?:Thread\.Sleep|Task\.Delay|WaitForTimeoutAsync)\s*\(\s*([\d_.]+)\s*\)/g, seconds: (m) => num(m[1]) / 1000 },
    { re: /\b(?:Thread\.Sleep|Task\.Delay)\s*\(\s*TimeSpan\.From(Milliseconds|Seconds|Minutes|Hours)\s*\(\s*([\d_.]+)/g, seconds: (m) => num(m[2]) * UNIT[m[1]] },
  ],
  java: [
    { re: /\bThread\.sleep\s*\(\s*([\d_.]+[lL]?)\s*\)/g, seconds: (m) => num(m[1]) / 1000 },
    { re: /\bTimeUnit\.(MILLISECONDS|SECONDS|MINUTES|HOURS)\.sleep\s*\(\s*([\d_.]+)/g, seconds: (m) => num(m[2]) * UNIT[m[1]] },
    { re: /\bThread\.sleep\s*\(\s*Duration\.of(Millis|Seconds|Minutes)\s*\(\s*([\d_.]+)/g, seconds: (m) => num(m[2]) * (m[1] === "Millis" ? 0.001 : UNIT[m[1]]) },
    { re: /(?<![\w.])delay\s*\(\s*([\d_.]+[lL]?)\s*\)/g, seconds: (m) => num(m[1]) / 1000 },
  ],
  go: [
    { re: /\btime\.Sleep\s*\(\s*([\d_.]+)\s*\*\s*time\.(Millisecond|Second|Minute|Hour)\b/g, seconds: (m) => num(m[1]) * UNIT[m[2]] },
    { re: /\btime\.Sleep\s*\(\s*time\.(Millisecond|Second|Minute|Hour)\s*(?:\*\s*([\d_.]+))?\s*\)/g, seconds: (m) => (m[2] ? num(m[2]) : 1) * UNIT[m[1]] },
  ],
  rb: [{ re: /(?<![\w.])sleep[\s(]+([\d_.]+)/g, seconds: (m) => num(m[1]) }],
  php: [
    { re: /(?<![\w>:])sleep\s*\(\s*(\d+)\s*\)/g, seconds: (m) => num(m[1]) },
    { re: /\busleep\s*\(\s*([\d_]+)\s*\)/g, seconds: (m) => num(m[1]) / 1e6 },
  ],
};

export const MAX_SLEEP_S = 5;

const NO_RAISE = /\b(not?|never|doesn'?t|does not|must not|should not|won'?t)[ _]+(raises?|throws?|propagates?|fails?)\b|\bno[ _](raise|throw|exception)\b|does_?not_?(raise|throw)|DoesNotThrow|never_?raises?|swallow|survivable/i;

/** Spans of functions defined inside a test (fake hangs, callbacks), where a sleep isn't the test waiting. */
function nestedFunctions(code: string, lang: Lang, t: Block): [number, number][] {
  const spans: [number, number][] = [];
  const body = code.slice(t.start, t.end);
  let m: RegExpExecArray | null;
  if (lang === "py" || lang === "rb") {
    const re = /^[ \t]*(?:async\s+)?def\s+\w+/gm;
    re.lastIndex = body.indexOf("\n") + 1;
    while ((m = re.exec(body))) spans.push([t.start + m.index, indentBlockEnd(code, t.start + m.index, lang === "rb")]);
    return spans;
  }
  const re = lang === "go" ? /\bfunc\s*\([^)]*\)[^{\n]*\{/g : /=>\s*\{|\bfunction\b[^{]*\{|\bdelegate\b[^{]*\{/g;
  let first = lang === "js";
  while ((m = re.exec(body))) {
    if (first) {
      first = false;
      continue;
    }
    const open = t.start + m.index + m[0].length - 1;
    const close = matchBracket(code, open);
    if (close > 0) spans.push([open, close]);
  }
  return spans;
}

interface CatchHit {
  at: number;
  handler: string;
}

/** Blanket catch/except/rescue handlers inside a block, with their handler code. */
function blanketCatches(code: string, lang: Lang, from: number, to: number): CatchHit[] {
  const seg = code.slice(from, to);
  const hits: CatchHit[] = [];
  let m: RegExpExecArray | null;
  if (lang === "py") {
    const re = /^([ \t]*)except\s*(?:\(?\s*(?:Exception|BaseException)\b[^:\n]*)?:[ \t]*(.*)$/gm;
    while ((m = re.exec(seg))) hits.push({ at: from + m.index, handler: m[2] + code.slice(from + m.index + m[0].length, indentBlockEnd(code, from + m.index, false)) });
    const sup = /\bsuppress\s*\(\s*(?:Exception|BaseException)\s*\)/g;
    while ((m = sup.exec(seg))) hits.push({ at: from + m.index, handler: "" });
  } else if (lang === "rb") {
    const re = /^([ \t]*)rescue(?:\s+(?:StandardError|Exception))?(?:\s*=>\s*\w+)?[ \t]*$/gm;
    while ((m = re.exec(seg))) {
      const ind = m[1].length;
      const rest = code.slice(from + m.index + m[0].length).split("\n").slice(1);
      const body: string[] = [];
      for (const l of rest) {
        if (l.trim() && indentOf(l) <= ind) break;
        body.push(l);
      }
      hits.push({ at: from + m.index, handler: body.join("\n") });
    }
    const mod = /\S[^\n]*?\brescue\s+nil\b/g;
    while ((m = mod.exec(seg))) hits.push({ at: from + m.index, handler: "" });
  } else if (lang !== "go") {
    const re =
      lang === "js"
        ? /\bcatch\s*(?:\([^)]*\))?\s*\{/g
        : lang === "cs"
          ? /\bcatch\s*(?:\(\s*(?:System\.)?Exception(?:\s+\w+)?\s*\))?\s*(?:when\s*\([^)]*\)\s*)?\{/g
          : lang === "java"
            ? /\bcatch\s*\(\s*(?:final\s+)?(?:\w+\s*:\s*)?(?:java\.lang\.)?(?:Exception|Throwable|RuntimeException|Error)(?:\s+\w+)?\s*\)\s*\{/g
            : /\bcatch\s*\(\s*\\?(?:Exception|Throwable|Error)(?:\s+\$\w+)?\s*\)\s*\{/g;
    while ((m = re.exec(seg))) {
      const open = from + m.index + m[0].length - 1;
      hits.push({ at: from + m.index, handler: code.slice(open, matchBracket(code, open) + 1) });
    }
    if (lang === "js") {
      const pc = /\.catch\s*\(\s*(?:async\s*)?\(?\s*(\w*)[^)=]*\)?\s*=>\s*/g;
      while ((m = pc.exec(seg))) {
        const k = from + m.index + m[0].length;
        const close = matchBracket(code, code.indexOf("(", from + m.index));
        const handler = code[k] === "{" ? code.slice(k, matchBracket(code, k) + 1) : code.slice(k, close);
        if (m[1] && handler.trim() === m[1]) continue;
        hits.push({ at: from + m.index, handler });
      }
      const noop = /\.catch\s*\(\s*(?:noop|_\.noop|\(\)\s*=>\s*\{\s*\})\s*\)/g;
      while ((m = noop.exec(seg))) if (!hits.some((h) => h.at === from + m!.index)) hits.push({ at: from + m.index, handler: "" });
    }
  }
  return hits;
}

const RETHROWS = /\bthrow\b|\braise\b|\bfail\w*\s*[(!]|\bflunk\b|\breject\s*\(|\bskip\w*\s*\(|\bt\.Skip/i;

const RECORDS = /\.(append|add|push|put|put_nowait|set_exception|Add|Enqueue|offer)\s*\(/;

const ERR_STATUS = [
  /\b(status|code|statuscode|status_code)\w*\b[^\n]*\b[45]\d\d\b|\b[45]\d\d\b[^\n]*\b(status|code)/i,
  /HttpStatusCode\.(BadRequest|Unauthorized|Forbidden|NotFound|MethodNotAllowed|Conflict|Gone|UnprocessableEntity|UnprocessableContent|TooManyRequests|InternalServerError|NotImplemented|BadGateway|ServiceUnavailable|GatewayTimeout)\b/,
  /HttpStatus\.(BAD_REQUEST|UNAUTHORIZED|FORBIDDEN|NOT_FOUND|METHOD_NOT_ALLOWED|CONFLICT|GONE|UNPROCESSABLE_ENTITY|TOO_MANY_REQUESTS|INTERNAL_SERVER_ERROR|SERVICE_UNAVAILABLE)\b|\bstatus\.HTTP_[45]\d\d|\bis[45]xx\w*\(|\bis(Client|Server)Error\b/,
  /\bhave_http_status\(\s*:(bad_request|unauthorized|forbidden|not_found|conflict|unprocessable_entity|internal_server_error)/,
  /\b(ok|IsSuccessStatusCode|is_success|successful)\b[^\n]*\b(false|False|toBeFalsy|IsFalse|assertFalse)\b|\bassert\s+not\s+\w+\.ok\b|\b(IsFalse|assertFalse)\s*\([^\n]*\b(ok|IsSuccessStatusCode)\b/,
];

const EXPECTS_FAILURE = /\b[45]\d\d\b|\b[45]xx\b|error|fail|reject|refus|den(y|ied)|forbidden|unauthori[sz]ed|not found|invalid|conflict|bad request|throws?\b|exception|not allowed|blocked/i;

export const expectsSuccess = (item: PlanItem) => !EXPECTS_FAILURE.test(`${item.expect}`);

const lastSegment = (id: string) => (id.split(/::|#| > /).pop() ?? id).replace(/[[(].*$/, "").trim();

/** Files a plan points at: file paths in ids, or Class.<ext> for Class#method ids. */
export function planFiles(plan: Plan, root: string, roots: string[] = []): string[] {
  const out = new Set<string>();
  const bases = [root, ...roots.map((r) => path.resolve(root, r))];
  let all: string[] | undefined;
  for (const t of plan.items.flatMap((i) => i.tests)) {
    const [, id] = splitId(t);
    const file = id.includes("::") ? id.split("::")[0] : id.includes(" > ") ? id.split(" > ")[0] : undefined;
    if (file) {
      for (const b of bases) if (fs.existsSync(path.join(b, file))) out.add(path.join(b, file));
      continue;
    }
    const cls = id.split("#")[0].split(".").pop();
    if (!cls || !id.includes("#")) continue;
    all ??= globFiles(root, ["**/*.{cs,java,kt,php,go}"], { maxDepth: 8, skipDirs: new Set([".git", "node_modules", "bin", "obj", "target", "build", "dist", "vendor", ".witness"]) });
    for (const f of all) if (path.basename(f).replace(/\.\w+$/, "") === cls && isTestPath(f)) out.add(path.join(root, f));
  }
  return [...out];
}

const IGNORE = /witness-lint:\s*ignore(?:\[([\w,\s-]+)\]|=([\w,-]+))?/;

function suppressed(rawLines: string[], line: number, rule: Rule): boolean {
  for (const l of [rawLines[line - 1], rawLines[line - 2]]) {
    const m = l ? IGNORE.exec(l) : null;
    if (!m) continue;
    const list = (m[1] ?? m[2])?.split(/[,\s]+/).filter(Boolean);
    if (!list || list.includes(rule)) return true;
  }
  return false;
}

/** All findings for one file; `plan` enables error-status-only on the tests it names. */
export function lintSource(file: string, raw: string, opts: { plan?: Plan; rel?: string } = {}): { findings: Finding[]; tests: Block[] } {
  const lang = langOf(file);
  if (!lang) return { findings: [], tests: [] };
  const code = mask(raw, lang);
  const rel = opts.rel ?? file;
  const rawLines = raw.split("\n");
  const tests = findTests(raw, code, lang);
  const helpers = assertingHelpers(code, lang, tests);
  const findings: Finding[] = [];
  const push = (f: Omit<Finding, "file">) => {
    if (!suppressed(rawLines, f.line, f.rule)) findings.push({ file: rel, ...f });
  };
  for (const t of tests) {
    const body = code.slice(t.start, t.end);
    if (!t.skipped && !hasAssert(body, lang) && ![...helpers].some((h) => callsName(body, h))) {
      const noRaise = NO_RAISE.test(`${t.name}\n${raw.slice(t.start, t.end)}`);
      push({
        line: t.line,
        rule: "no-assertion",
        level: noRaise ? "warning" : "error",
        test: t.name,
        message: noRaise ? `test "${t.name}" only checks that nothing raises: also assert the result or side effect if there is one` : `test "${t.name}" asserts nothing: check the observable result (response body, stored state, rendered text)`,
      });
    }
    const nestedFns = nestedFunctions(code, lang, t);
    for (const h of blanketCatches(code, lang, t.start, t.end))
      if (!nestedFns.some(([a, b]) => h.at > a && h.at < b) && !RETHROWS.test(h.handler) && !hasAssert(h.handler, lang) && !RECORDS.test(h.handler))
        push({ line: lineAt(code, h.at), rule: "swallowed-exception", level: "error", test: t.name, message: `test "${t.name}" catches every exception and carries on, so a failure can pass: catch the specific exception or let it fail the test` });
  }
  for (const t of tests) {
    const nested = nestedFunctions(code, lang, t);
    for (const p of SLEEPS[lang]) {
      const re = new RegExp(p.re.source, p.re.flags);
      re.lastIndex = t.start;
      let m: RegExpExecArray | null;
      while ((m = re.exec(code)) && m.index < t.end) {
        const s = p.seconds(m);
        if (!Number.isFinite(s) || s <= MAX_SLEEP_S || nested.some(([a, b]) => m!.index > a && m!.index < b)) continue;
        push({ line: lineAt(code, m.index), rule: "long-sleep", level: "error", test: t.name, message: `test "${t.name}" sleeps ${+s.toFixed(3)}s (over ${MAX_SLEEP_S}s): wait for the condition instead (poll with a timeout, or the framework's wait/expect)` });
      }
    }
  }
  if (opts.plan) {
    for (const item of opts.plan.items.filter(expectsSuccess)) {
      for (const tid of item.tests) {
        const [, id] = splitId(tid);
        const fileHint = id.includes("::") ? id.split("::")[0] : id.includes(" > ") ? id.split(" > ")[0] : undefined;
        if (fileHint && !rel.replace(/\\/g, "/").endsWith(fileHint.replace(/^\.\//, ""))) continue;
        const name = lastSegment(id);
        for (const t of tests.filter((x) => x.name.trim() === name)) {
          const lines = code.slice(t.start, t.end).split("\n");
          const asserting = lines.filter((l) => hasAssert(l, lang));
          if (asserting.length && asserting.every((l) => ERR_STATUS.some((re) => re.test(l))))
            push({ line: t.line, rule: "error-status-only", level: "error", test: t.name, message: `${item.id} expects "${item.expect}", but test "${t.name}" only asserts an error status: assert the success result` });
        }
      }
    }
  }
  return { findings: findings.sort((a, b) => a.line - b.line), tests };
}

/** Test files changed in the working tree (vs HEAD) plus untracked ones. */
export function changedTestFiles(root: string): string[] {
  const top = git(root, ["rev-parse", "--show-toplevel"]);
  if (!top.ok) return [];
  const base = top.out.trim();
  const names = [...git(base, ["diff", "--name-only", "HEAD"]).out.split("\n"), ...git(base, ["ls-files", "--others", "--exclude-standard"]).out.split("\n")];
  return [...new Set(names.map((s) => s.trim()).filter((s) => s && isTestPath(s)))].map((s) => path.join(base, s)).filter((f) => fs.existsSync(f));
}

export function expandArgs(args: string[], cwd: string): string[] {
  const out: string[] = [];
  for (const a of args) {
    const abs = path.resolve(cwd, a);
    if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) {
      const skip = new Set([".git", "node_modules", "bin", "obj", "target", "build", "dist", "vendor", ".witness", ".venv", "venv"]);
      for (const f of globFiles(abs, ["**/*"], { maxDepth: 12, skipDirs: skip })) {
        const full = path.isAbsolute(f) ? f : path.join(abs, f);
        if (isTestPath(path.join(path.basename(abs), f))) out.push(full);
      }
    } else out.push(abs);
  }
  return [...new Set(out)];
}

/** `witness lint`: exit 1 when any error-level finding remains. */
export function lintCommand(o: { files: string[]; cwd: string; root: string; plan?: Plan; planFile?: string; suiteCwds?: string[]; json: boolean; log: (s: string) => void }): number {
  let files = expandArgs(o.files, o.cwd);
  let from = "arguments";
  if (!o.files.length) {
    files = [...new Set([...changedTestFiles(o.root), ...(o.plan ? planFiles(o.plan, o.root, o.suiteCwds) : [])])];
    from = o.plan ? "changed test files and the plan's tests" : "changed test files";
  }
  const findings: Finding[] = [];
  let tests = 0;
  const linted: string[] = [];
  for (const f of files) {
    const rel = path.relative(o.cwd, f) || f;
    if (!langOf(f)) {
      if (o.files.length) o.log(`lint  skip  ${rel} (not a supported language)`);
      continue;
    }
    let raw: string;
    try {
      raw = fs.readFileSync(f, "utf8");
    } catch (e) {
      o.log(`lint  skip  ${rel}: ${(e as Error).message}`);
      continue;
    }
    const r = lintSource(f, raw, { plan: o.plan, rel });
    linted.push(rel);
    tests += r.tests.length;
    findings.push(...r.findings);
  }
  if (!linted.length) {
    o.log(`LINT ok · nothing to lint (no ${from}); pass test files or folders`);
    if (o.json) process.stdout.write(JSON.stringify({ ok: true, files: [], tests: 0, findings: [] }, null, 2) + "\n");
    return 0;
  }
  for (const f of findings) o.log(`lint  ${f.level === "error" ? "ERROR" : "warn "} ${f.file}:${f.line} ${f.rule}: ${f.message}`);
  const errors = findings.filter((f) => f.level === "error").length;
  o.log(`LINT ${errors ? "failed" : "ok"} · ${linted.length} file(s), ${tests} test(s), ${errors} error(s)${o.planFile ? ` · plan ${path.relative(o.cwd, o.planFile)}` : ""}`);
  if (o.json) process.stdout.write(JSON.stringify({ ok: !errors, files: linted, tests, findings }, null, 2) + "\n");
  return errors ? 1 : 0;
}
