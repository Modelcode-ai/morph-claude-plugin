import type { Equivalence } from "./contract.ts";
import type { Exchange } from "./proxy.ts";

export interface Diff {
  field: string;
  origin: string;
  target: string;
}

export type ParityStatus = "equal" | "intended" | "unexplained";

export interface ParityResult {
  status: ParityStatus;
  diffs: Diff[];
  pairs: { origin: number | null; target: number | null }[];
  note?: string;
}

function globToRegex(p: string): RegExp {
  const esc = p
    .replace(/^\$\.?/, "")
    .replace(/[.+?^${}()|\\]/g, "\\$&")
    .replace(/\\\.\*\*\\\./g, "(?:\\.|.*\\.)")
    .replace(/\*\*/g, ".*")
    .replace(/\[\*\]/g, "\\[\\d+\\]")
    .replace(/(?<!\.)\*/g, "[^.\\[]*");
  return new RegExp(`^${esc}$`);
}

/** Does a diff/JSON path match a pattern? Supports `**`, `*`, `[*]` and prefix matches. */
export function pathMatches(pathStr: string, pattern: string): boolean {
  const p = pattern.replace(/^\$\.?/, "");
  const s = pathStr.replace(/^\$\.?/, "");
  if (s === p || s.startsWith(p + ".") || s.startsWith(p + "[")) return true;
  if (p.startsWith("**.")) {
    const leaf = p.slice(3);
    if (s === leaf || s.endsWith("." + leaf) || globToRegex("**." + leaf).test(s)) return true;
  }
  return globToRegex(p).test(s);
}

function stable(v: unknown): string {
  return JSON.stringify(v, (_k, x) =>
    x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x,
  );
}

function normalize(v: unknown, at: string, eq: Equivalence): unknown {
  if (Array.isArray(v)) {
    const items = v.map((x, i) => normalize(x, `${at}[${i}]`, eq));
    const generic = `${at}[*]`;
    if (eq.unordered.some((u) => pathMatches(generic, u) || pathMatches(at, u))) items.sort((a, b) => stable(a).localeCompare(stable(b)));
    return items;
  }
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) {
      const p = at ? `${at}.${k}` : k;
      if (eq.ignore_fields.some((f) => pathMatches(p, f))) continue;
      out[k] = normalize(x, p, eq);
    }
    return out;
  }
  return v;
}

function deepDiff(a: unknown, b: unknown, at: string, out: Diff[], allowAdded = false) {
  if (out.length > 50) return;
  const show = (x: unknown) => (x === undefined ? "(absent)" : JSON.stringify(x)?.slice(0, 200) ?? String(x));
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length === b.length && a.length > 1 && stable(a) !== stable(b)) {
      const sa = a.map(stable).sort().join("\u0000");
      const sb = b.map(stable).sort().join("\u0000");
      if (sa === sb) {
        out.push({ field: `${at}[order]`, origin: `${a.length} items`, target: `same ${b.length} items, different order` });
        return;
      }
    }
    if (a.length !== b.length) out.push({ field: `${at}.length`, origin: String(a.length), target: String(b.length) });
    for (let i = 0; i < Math.min(a.length, b.length); i++) deepDiff(a[i], b[i], `${at}[${i}]`, out, allowAdded);
    return;
  }
  if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of [...keys].sort()) {
      if (allowAdded && !(k in (a as object))) continue;
      deepDiff((a as any)[k], (b as any)[k], `${at}.${k}`, out, allowAdded);
    }
    return;
  }
  if (stable(a) !== stable(b)) out.push({ field: at, origin: show(a), target: show(b) });
}

function parseBody(s: string): unknown {
  if (!s) return undefined;
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

const pathOnly = (p: string) => p.split("?")[0];

/** Compare the exchanges one test made against origin and target. */
export function compareExchanges(origin: Exchange[], target: Exchange[], eq: Equivalence, expectDiff: string[]): ParityResult {
  const diffs: Diff[] = [];
  const pairs: ParityResult["pairs"] = [];
  const n = Math.max(origin.length, target.length);
  for (let i = 0; i < n; i++) {
    const o = origin[i];
    const t = target[i];
    pairs.push({ origin: o?.seq ?? null, target: t?.seq ?? null });
    const pre = n > 1 ? `#${i + 1} ` : "";
    if (!o || !t) {
      diffs.push({ field: `${pre}exchange`, origin: o ? `${o.method} ${o.path}` : "(none)", target: t ? `${t.method} ${t.path}` : "(none)" });
      continue;
    }
    if (o.method !== t.method || pathOnly(o.path) !== pathOnly(t.path))
      diffs.push({ field: `${pre}request`, origin: `${o.method} ${o.path}`, target: `${t.method} ${t.path}` });
    if (eq.compare_status && o.status !== t.status) diffs.push({ field: `${pre}status`.trim(), origin: String(o.status), target: String(t.status) });
    for (const h of eq.headers) {
      const ov = (o.resHeaders[h] ?? "").split(";")[0].trim();
      const tv = (t.resHeaders[h] ?? "").split(";")[0].trim();
      if (ov !== tv) diffs.push({ field: `${pre}header.${h}`.trim(), origin: ov || "(absent)", target: tv || "(absent)" });
    }
    const ob = normalize(parseBody(o.resBody), "", eq);
    const tb = normalize(parseBody(t.resBody), "", eq);
    const bd: Diff[] = [];
    deepDiff(ob, tb, "body", bd, eq.allow_added_fields);
    for (const d of bd) diffs.push({ ...d, field: `${pre}${d.field}`.trim() });
  }
  const strip = (f: string) => f.replace(/^#\d+ /, "");
  if (diffs.length === 0) {
    if (expectDiff.length) return { status: "unexplained", diffs, pairs, note: `Expected a difference in ${expectDiff.join(", ")} but origin and target matched.` };
    return { status: "equal", diffs, pairs };
  }
  const explained = diffs.every((d) => expectDiff.some((e) => pathMatches(strip(d.field), e)));
  return { status: explained ? "intended" : "unexplained", diffs, pairs };
}
