import type { Observation } from "../evidence/contract.ts";
import { type RawCase, ReportError, type StatusDetail, type TestStatus } from "./types.ts";

interface Item {
  id?: string;
  name?: string;
  item?: Item[];
}
interface Assertion {
  assertion?: string;
  skipped?: boolean;
  error?: { name?: string; message?: string; stack?: string };
}
interface ScriptRun {
  error?: { name?: string; message?: string; stack?: string };
}
interface Execution {
  item?: Item;
  request?: { method?: string; url?: unknown; body?: { mode?: string; raw?: string; urlencoded?: { key: string; value?: string; disabled?: boolean }[] } };
  response?: { code?: number; status?: string; responseTime?: number; stream?: { type?: string; data?: number[] } | string; header?: { key: string; value: string }[] };
  requestError?: { code?: string; message?: string };
  assertions?: Assertion[];
  testScript?: ScriptRun[];
  prerequestScript?: ScriptRun[];
}

const BODY_MAX = 4000;
const TIMED_OUT = /^E(SOCKET)?TIMEDOUT$|timed? ?out/i;

/** Item id to its full name, folders and request joined by " / " as Newman's own reporters name it. */
export function newmanPaths(items: Item[] | undefined, prefix: string[] = [], out = new Map<string, string>()): Map<string, string> {
  for (const it of items ?? []) {
    const chain = [...prefix, it.name ?? it.id ?? "?"];
    if (it.id) out.set(it.id, chain.join(" / "));
    if (Array.isArray(it.item)) newmanPaths(it.item, chain, out);
  }
  return out;
}

export function urlText(u: unknown): string {
  if (typeof u === "string") return u;
  if (!u || typeof u !== "object") return "";
  const x = u as { raw?: string; protocol?: string; host?: string[] | string; port?: string; path?: string[] | string; query?: { key?: string; value?: string; disabled?: boolean }[] };
  const host = Array.isArray(x.host) ? x.host.join(".") : (x.host ?? "");
  if (!host) return x.raw ?? "";
  const p = Array.isArray(x.path) ? x.path.join("/") : (x.path ?? "");
  const q = (x.query ?? []).filter((k) => !k.disabled && k.key).map((k) => `${k.key}${k.value != null ? `=${k.value}` : ""}`);
  return `${x.protocol ?? "http"}://${host}${x.port ? `:${x.port}` : ""}/${p.replace(/^\//, "")}${q.length ? `?${q.join("&")}` : ""}`;
}

function bodyText(s: Execution["response"]): string | undefined {
  const st = s?.stream;
  if (typeof st === "string") return st.slice(0, BODY_MAX);
  if (!st || !Array.isArray(st.data)) return undefined;
  return Buffer.from(st.data.slice(0, BODY_MAX)).toString("utf8");
}

function requestBody(r: Execution["request"]): string | undefined {
  const b = r?.body;
  if (b?.mode === "raw" && b.raw) return b.raw.slice(0, BODY_MAX);
  if (b?.mode === "urlencoded") return (b.urlencoded ?? []).filter((k) => !k.disabled).map((k) => `${k.key}=${k.value ?? ""}`).join("&").slice(0, BODY_MAX) || undefined;
  return undefined;
}

/** What the request was and what came back, without headers (they carry tokens). */
function httpObservation(e: Execution, step: string): Observation {
  const data: Record<string, unknown> = { method: e.request?.method ?? "GET", url: urlText(e.request?.url) };
  if (e.response?.code != null) data.status = e.response.code;
  if (e.response?.responseTime != null) data.ms = e.response.responseTime;
  const req = requestBody(e.request);
  if (req) data.request = { body: req };
  const res = bodyText(e.response);
  if (res) data.response = { body: res };
  if (e.requestError) data.error = e.requestError.code ?? e.requestError.message ?? "request failed";
  return { v: 1, kind: "http", step, data };
}

const rank: Record<TestStatus, number> = { skipped: 0, pending: 0, passed: 1, other: 2, failed: 3 };

/** Newman's json reporter: one row per assertion, named `<folder> / <request> > <assertion>` like its JUnit reporter, with the request and response as evidence. */
export function parseNewmanJson(json: unknown): RawCase[] {
  const doc = json as { collection?: { item?: Item[] }; run?: { executions?: Execution[] } };
  if (!doc || typeof doc !== "object" || !doc.run || !Array.isArray(doc.run.executions)) throw new ReportError("not a Newman JSON report (no run.executions)");
  const paths = newmanPaths(doc.collection?.item);
  const rows = new Map<string, RawCase & { observations: Observation[] }>();
  const add = (path: string, name: string, c: Omit<RawCase, "name" | "titles">, obs: Observation[]) => {
    const key = `${path} > ${name}`;
    const prev = rows.get(key);
    if (!prev) return void rows.set(key, { name, titles: [path, name], ...c, observations: obs });
    // a later iteration of the same request: one row, the worst status
    prev.observations.push(...obs);
    prev.durationMs += c.durationMs;
    if (rank[c.status] > rank[prev.status]) Object.assign(prev, { status: c.status, statusDetail: c.statusDetail, message: c.message, trace: c.trace });
  };
  for (const e of doc.run.executions) {
    const path = (e.item?.id && paths.get(e.item.id)) || e.item?.name || "(unnamed request)";
    const http = httpObservation(e, path);
    const reqErr = e.requestError ? (e.requestError.code ?? e.requestError.message ?? "request failed") : undefined;
    const timedOut = !!reqErr && TIMED_OUT.test(reqErr);
    const ms = e.response?.responseTime ?? 0;
    const asserts = e.assertions ?? [];
    for (const a of asserts) {
      const name = a.assertion ?? "(unnamed assertion)";
      const check: Observation = { v: 1, kind: "check", step: path, data: { what: name, ...(a.skipped ? { skipped: true } : { ok: !a.error }), ...(a.error?.message ? { actual: a.error.message } : {}) } };
      const status: TestStatus = a.skipped ? "skipped" : a.error ? "failed" : "passed";
      const detail: StatusDetail | undefined = status === "failed" && timedOut ? "timeout" : undefined;
      const message = a.error ? `${reqErr ? `${timedOut ? "request timed out" : "request failed"} (${reqErr}); ` : ""}${a.error.message ?? a.error.name ?? "assertion failed"}` : undefined;
      add(path, name, { status, statusDetail: detail, durationMs: ms, message, trace: a.error?.stack?.slice(0, 20000) }, [http, check]);
    }
    const scriptErrs = [...(e.prerequestScript ?? []).map((s) => ["pre-request script", s.error] as const), ...(e.testScript ?? []).map((s) => ["test script", s.error] as const)].filter(([, err]) => err);
    for (const [where, err] of scriptErrs) {
      const msg = err!.message ?? err!.name ?? "error";
      add(path, `(${where})`, { status: "failed", statusDetail: TIMED_OUT.test(msg) ? "timeout" : "error", durationMs: ms, message: `${where} error: ${msg}`, trace: err!.stack }, [http]);
    }
    if (reqErr && !asserts.length && !scriptErrs.length) add(path, "(request)", { status: "failed", statusDetail: timedOut ? "timeout" : "error", durationMs: ms, message: `request ${timedOut ? "timed out" : "failed"}: ${reqErr}` }, [http]);
  }
  return [...rows.values()];
}

interface CollectionItem extends Item {
  event?: { listen?: string; script?: { exec?: string[] | string } }[];
  request?: unknown;
}

const TEST_NAME = /\bpm\.test(?:\.skip)?\s*\(\s*(["'`])((?:\\.|(?!\1)[^\\])*)\1\s*,|\btests\s*\[\s*(["'])((?:\\.|(?!\3)[^\\])*)\3\s*\]\s*=/g;

/** The `pm.test` (and legacy `tests["..."]`) names a test script declares; names built at run time can't be read. */
export function newmanTestNames(script: string): string[] {
  const code = script.replace(/^\s*\/\/.*$/gm, "");
  const out: string[] = [];
  for (const m of code.matchAll(TEST_NAME)) {
    const q = m[1] ?? m[3];
    const raw = m[2] ?? m[4];
    if (q === "`" && raw.includes("${")) continue;
    const name = raw.replace(/\\(.)/g, "$1");
    if (!out.includes(name)) out.push(name);
  }
  return out;
}

const scriptOf = (it: CollectionItem) => (it.event ?? []).filter((e) => e.listen === "test").map((e) => (Array.isArray(e.script?.exec) ? e.script!.exec.join("\n") : (e.script?.exec ?? ""))).join("\n");

/** The collection file and `--folder` names of a `newman run` command; undefined when it runs a URL or isn't one. */
export function newmanRun(words: string[]): { collection: string; folders: string[] } | undefined {
  const i = words.findIndex((w, k) => w === "run" && k > 0 && /(^|[/\\])newman(\.cmd|\.js)?$/.test(words[k - 1]));
  if (i < 0) return undefined;
  const collection = words[i + 1];
  if (!collection || collection.startsWith("-") || /^https?:/.test(collection)) return undefined;
  const folders: string[] = [];
  words.forEach((w, k) => {
    if (w === "--folder" && words[k + 1]) folders.push(words[k + 1]);
    else if (w.startsWith("--folder=")) folders.push(w.slice(9));
  });
  return { collection, folders };
}

/** Test ids read from the collection without running it: each request's assertions, its folders' and the collection's included. */
export function newmanListFromCollection(doc: { item?: CollectionItem[]; event?: CollectionItem["event"] }, folders: string[] = []): string[] {
  const ids: string[] = [];
  const walk = (items: CollectionItem[], chain: string[], inherited: string[], picked: boolean) => {
    for (const it of items) {
      const name = it.name ?? it.id ?? "?";
      const on = picked || !folders.length || folders.includes(name) || (!!it.id && folders.includes(it.id));
      const names = [...inherited, ...newmanTestNames(scriptOf(it)).filter((n) => !inherited.includes(n))];
      if (Array.isArray(it.item)) walk(it.item, [...chain, name], names, on);
      else if (on) for (const n of names) ids.push(`${[...chain, name].join(" / ")} > ${n}`);
    }
  };
  walk(doc.item ?? [], [], newmanTestNames(scriptOf(doc)), false);
  return [...new Set(ids)];
}

/** The request an id names: its last " / " segment before the first " > ". */
export function newmanRequestOf(id: string): string {
  const at = id.indexOf(" > ");
  const p = at < 0 ? id : id.slice(0, at);
  const k = p.lastIndexOf(" / ");
  return k < 0 ? p : p.slice(k + 3);
}
