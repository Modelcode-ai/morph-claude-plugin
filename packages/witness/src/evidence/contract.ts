import * as fs from "node:fs";

/**
 * Witness evidence, version 1: what a test saw while it ran, written by the test itself.
 *
 * Folder: $WITNESS_ARTIFACTS/<test id>/ (the id as the runner names the test; characters outside
 * [A-Za-z0-9_.@-] become "_"). In it, evidence.jsonl is the test's timeline, one observation per
 * line, plus any plain files (screenshots, video, traces, HAR) that observations may name.
 */
export const EVIDENCE_FILE = "evidence.jsonl";

export interface Observation {
  v: 1;
  /** ISO time the test made the observation. */
  t?: string;
  /** What kind of surface or event; known kinds get a tailored view, others render as fields. */
  kind: string;
  /** Optional label for a step of the test ("add the mug to the basket"). */
  step?: string;
  /** The kind's fields (see KINDS for what each known kind needs). */
  data: Record<string, unknown>;
  /** Files in the same folder this observation refers to (a screenshot of this step). */
  files?: string[];
}

interface KindSpec {
  /** One line naming what was observed, for lists and the Markdown report. */
  title: (d: Record<string, any>) => string;
  required: string[];
  /** The observation's outcome when it has one: ok, bad, or undefined. */
  ok?: (d: Record<string, any>) => boolean | undefined;
}

const short = (u: unknown) => {
  const s = String(u ?? "");
  try {
    const x = new URL(s);
    return x.pathname + x.search;
  } catch {
    return s;
  }
};

/** Known kinds. Adding one here is the only change a new surface needs on Witness's side. */
export const KINDS: Record<string, KindSpec> = {
  http: { required: ["method", "url"], title: (d) => `${String(d.method ?? "?").toUpperCase()} ${short(d.url)}${d.status != null ? ` → ${d.status}` : ""}` },
  cli: { required: ["argv"], title: (d) => `$ ${(d.argv as unknown[]).map(String).join(" ")}${d.exit != null ? ` → exit ${d.exit}` : ""}` },
  ui: { required: ["action"], title: (d) => [d.action, d.target, d.value != null ? `"${d.value}"` : "", d.url ? short(d.url) : ""].filter(Boolean).join(" ") },
  message: { required: ["channel", "direction"], title: (d) => `${d.direction === "received" ? "←" : "→"} ${d.channel}` },
  rpc: { required: ["service", "method"], title: (d) => `${d.service}/${d.method}${d.status != null ? ` → ${d.status}` : ""}` },
  check: { required: ["what"], title: (d) => String(d.what), ok: (d) => (typeof d.ok === "boolean" ? d.ok : undefined) },
  state: { required: ["store"], title: (d) => `${d.store}${d.query ? `: ${d.query}` : ""}` },
  note: { required: ["text"], title: (d) => String(d.text) },
};

export function titleOf(o: Observation): string {
  const k = KINDS[o.kind];
  if (k) {
    try {
      return k.title(o.data as Record<string, any>);
    } catch {
      /* fall through to the generic title */
    }
  }
  const first = Object.entries(o.data).find(([, v]) => typeof v === "string" || typeof v === "number");
  return first ? `${o.kind}: ${first[0]} ${first[1]}` : o.kind;
}

export const okOf = (o: Observation) => KINDS[o.kind]?.ok?.(o.data as Record<string, any>);

export interface EvidenceProblem {
  line: number;
  message: string;
}

const MAX_LINES = 2000;

/** Read one test's evidence.jsonl; malformed lines are problems, never fatal. */
export function readEvidence(file: string, files: Set<string> = new Set()): { observations: Observation[]; problems: EvidenceProblem[] } {
  const observations: Observation[] = [];
  const problems: EvidenceProblem[] = [];
  let text = "";
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (e) {
    return { observations, problems: [{ line: 0, message: (e as Error).message }] };
  }
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw) continue;
    if (observations.length >= MAX_LINES) {
      problems.push({ line: i + 1, message: `more than ${MAX_LINES} observations; the rest are ignored` });
      break;
    }
    let o: any;
    try {
      o = JSON.parse(raw);
    } catch {
      problems.push({ line: i + 1, message: "not JSON" });
      continue;
    }
    if (!o || typeof o !== "object" || Array.isArray(o)) {
      problems.push({ line: i + 1, message: "not an object" });
      continue;
    }
    if (o.v !== 1) problems.push({ line: i + 1, message: `"v" should be 1` });
    if (typeof o.kind !== "string" || !o.kind) {
      problems.push({ line: i + 1, message: 'missing "kind"' });
      continue;
    }
    const data = o.data && typeof o.data === "object" && !Array.isArray(o.data) ? o.data : null;
    if (!data) {
      problems.push({ line: i + 1, message: 'missing "data" object' });
      continue;
    }
    const spec = KINDS[o.kind];
    const missing = spec?.required.filter((k) => data[k] == null) ?? [];
    if (missing.length) problems.push({ line: i + 1, message: `${o.kind}: missing ${missing.join(", ")}` });
    const refs = Array.isArray(o.files) ? o.files.filter((f: unknown) => typeof f === "string") : undefined;
    for (const f of refs ?? []) if (files.size && !files.has(f)) problems.push({ line: i + 1, message: `file "${f}" is not in the folder` });
    observations.push({ v: 1, t: typeof o.t === "string" ? o.t : undefined, kind: o.kind, step: typeof o.step === "string" ? o.step : undefined, data, files: refs });
  }
  return { observations, problems };
}
