import * as fs from "node:fs";
import { parse as parseYaml } from "yaml";
import type { Exchange } from "./proxy.ts";

export interface Operation {
  key: string;
  method: string;
  path: string;
  feature: string;
  summary: string;
  regex: RegExp;
}

export type OpState = "proven" | "failing" | "unsure" | "exercised" | "untested";

export interface SurfaceOp {
  key: string;
  method: string;
  path: string;
  feature: string;
  summary: string;
  state: OpState;
  /** Why this operation counts as touched by the change, if it does. */
  changed: string[];
  calls: number;
  tests: string[];
  claims: { id: string; status: string }[];
}

export interface SurfaceMap {
  source: string;
  ops: SurfaceOp[];
  unmatched: { method: string; path: string; calls: number }[];
  screens: { test: string; name: string; status: string; changed: boolean }[];
}

const METHODS = ["get", "post", "put", "patch", "delete"];

/** Operations from an OpenAPI document (yaml or json). The servers[0] path is the prefix requests carry. */
export function loadOperations(text: string): { ops: Operation[]; prefix: string } {
  const doc = parseYaml(text) as any;
  const server = doc?.servers?.[0]?.url ?? "";
  const prefix = server.replace(/^[a-z]+:\/\/[^/]+/i, "").replace(/\/$/, "");
  const ops: Operation[] = [];
  for (const [p, item] of Object.entries<any>(doc?.paths ?? {})) {
    for (const m of METHODS) {
      const op = item?.[m];
      if (!op) continue;
      const pattern = (prefix + p).replace(/[.+?^$()|[\]\\]/g, "\\$&").replace(/\{[^}]+\}/g, "[^/]+");
      ops.push({
        key: `${m.toUpperCase()} ${p}`,
        method: m.toUpperCase(),
        path: p,
        feature: op.tags?.[0] ?? "other",
        summary: op.summary ?? op.operationId ?? "",
        regex: new RegExp(`^${pattern}/?$`),
      });
    }
  }
  return { ops, prefix };
}

export function matchOp(ops: Operation[], method: string, url: string): Operation | undefined {
  const p = url.split("?")[0];
  return ops.find((o) => o.method === method && o.regex.test(p));
}

/** Operation keys whose spec block differs between two versions of the document. */
export function changedInSpec(baseText: string | null, headText: string): Map<string, string> {
  const out = new Map<string, string>();
  const read = (t: string | null) => {
    if (!t) return new Map<string, string>();
    const doc = parseYaml(t) as any;
    const m = new Map<string, string>();
    for (const [p, item] of Object.entries<any>(doc?.paths ?? {})) for (const k of METHODS) if (item?.[k]) m.set(`${k.toUpperCase()} ${p}`, JSON.stringify(item[k]));
    return m;
  };
  const a = read(baseText);
  const b = read(headText);
  for (const [k, v] of b) {
    if (!a.has(k)) out.set(k, "new in the API spec");
    else if (a.get(k) !== v) out.set(k, "API spec changed");
  }
  return out;
}

export function buildSurface(
  specFile: string,
  opts: {
    headText: string;
    baseText: string | null;
    exchanges: Exchange[];
    claims: { id: string; status: string; testId?: string; synthetic?: string; parityChanged?: boolean; tags: string[] }[];
    behaviorChanged: Set<string>;
  },
): SurfaceMap {
  const { ops, prefix } = loadOperations(opts.headText);
  const spec = changedInSpec(opts.baseText, opts.headText);
  const byKey = new Map<string, SurfaceOp>(
    ops.map((o) => [o.key, { key: o.key, method: o.method, path: o.path, feature: o.feature, summary: o.summary, state: "untested", changed: [], calls: 0, tests: [], claims: [] }]),
  );
  const unmatched = new Map<string, { method: string; path: string; calls: number }>();
  const testOps = new Map<string, Set<string>>();
  for (const e of opts.exchanges.filter((x) => x.side === "head" && x.run === "primary")) {
    const op = matchOp(ops, e.method, e.path);
    if (!op) {
      const p = e.path.split("?")[0];
      if (!prefix || p.startsWith(prefix)) {
        const k = `${e.method} ${p}`;
        unmatched.set(k, { method: e.method, path: p, calls: (unmatched.get(k)?.calls ?? 0) + 1 });
      }
      continue;
    }
    const s = byKey.get(op.key)!;
    s.calls++;
    if (e.test && !s.tests.includes(e.test)) s.tests.push(e.test);
    if (e.test) (testOps.get(e.test) ?? testOps.set(e.test, new Set()).get(e.test)!).add(op.key);
  }
  for (const c of opts.claims) {
    if (!c.testId) continue;
    for (const k of testOps.get(c.testId) ?? []) {
      const s = byKey.get(k)!;
      s.claims.push({ id: c.id, status: c.status });
      if ((c.tags.includes("new") || c.tags.includes("changed")) && !c.synthetic) s.changed.push(`claim ${c.id} (${c.tags.includes("new") ? "new behavior" : "declared change"})`);
      if (c.synthetic === "existing" || (c.parityChanged && c.status !== "proven")) s.changed.push(`responses differ from the base (${c.id})`);
    }
  }
  for (const [k, why] of spec) byKey.get(k)?.changed.unshift(why);
  for (const k of opts.behaviorChanged) {
    const s = byKey.get(k);
    if (s && !s.changed.some((c) => c.startsWith("responses differ"))) s.changed.push("responses differ from the base");
  }
  for (const s of byKey.values()) {
    s.changed = [...new Set(s.changed)];
    const st = s.claims.map((c) => c.status);
    if (st.some((x) => x === "failed" || x === "flaky")) s.state = "failing";
    else if (st.some((x) => x === "cant_tell" || x === "not_tested")) s.state = "unsure";
    else if (st.length) s.state = "proven";
    else if (s.calls) s.state = "exercised";
  }
  return { source: specFile, ops: [...byKey.values()], unmatched: [...unmatched.values()], screens: [] };
}

export function readIfFile(f: string): string | null {
  return fs.existsSync(f) ? fs.readFileSync(f, "utf8") : null;
}
