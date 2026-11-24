import * as fs from "node:fs";
import * as path from "node:path";
import type { Status } from "../rundir.ts";
import { readJson } from "../util.ts";
import { renderHtml } from "./html.ts";
import { CSS } from "./html-assets.ts";
import { renderMd } from "./md.ts";
import { buildModel, sha256 } from "./model.ts";
import { fmtMs, outcomeLabel } from "./words.ts";

const DERIVED = new Set(["report.html", "report.md", "SHA256SUMS", "state.json"]);

function walk(dir: string, rel = ""): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...walk(dir, r));
    else if (e.isFile() && !(rel === "" && DERIVED.has(e.name))) out.push(r);
  }
  return out;
}

/** `sha256sum -c` format, so anyone can check the run folder against the hash the report shows. */
export function writeSums(dir: string) {
  const lines = walk(dir).sort().map((f) => `${sha256(fs.readFileSync(path.join(dir, f)))}  ${f}`);
  fs.writeFileSync(path.join(dir, "SHA256SUMS"), lines.join("\n") + "\n");
}

export function writeReport(dir: string): { html: string; md: string } {
  writeSums(dir);
  const m = buildModel(dir);
  const html = path.join(dir, "report.html");
  const md = path.join(dir, "report.md");
  fs.writeFileSync(html, renderHtml(m));
  fs.writeFileSync(md, renderMd(m));
  return { html, md };
}

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** `.witness/runs/index.html`: the recent runs, newest first, each linking to its report. */
export function writeRunsIndex(root: string) {
  if (!fs.existsSync(root)) return;
  const runs = fs.readdirSync(root).filter((d) => d.startsWith("r-")).sort().reverse();
  const rows = runs.map((id) => {
    const st = readJson<Status | null>(path.join(root, id, "status.json"), null);
    if (!st) return "";
    const o = st.outcome ?? "running";
    const tone = o === "passed" ? "ok" : o === "failed" ? "bad" : o === "interrupted" || o === "running" ? "dim" : "warn";
    const s = st.summary;
    const ms = st.finished_at ? Date.parse(st.finished_at) - Date.parse(st.started_at) : undefined;
    const has = fs.existsSync(path.join(root, id, "report.html"));
    return `<a class="run ${tone}" href="${has ? `${esc(id)}/report.html` : `${esc(id)}/status.json`}"><span class="pill">${esc(outcomeLabel(o))}</span><span class="what"><b>${esc(st.branch || "no branch")}</b> <span class="mono">${esc(st.commit.slice(0, 7))}</span>${st.label ? ` · ${esc(st.label)}` : ""}${st.against ? ` · vs ${esc(st.against.ref)}` : ""}</span><span class="nums">${s ? `${s.passed} passed${s.failed ? ` · ${s.failed} failed` : ""}${s.skipped ? ` · ${s.skipped} skipped` : ""}` : esc(st.phase)}</span><span class="when">${esc(new Date(st.started_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }))}${ms != null ? ` · ${fmtMs(ms)}` : ""}</span></a>`;
  });
  const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Witness runs</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400&display=swap">
<style>${CSS}
.runs{display:flex;flex-direction:column;gap:8px}.run{display:grid;grid-template-columns:110px minmax(0,1fr) auto auto;gap:14px;align-items:center;background:var(--panel);border:1px solid var(--line-soft);border-radius:8px;padding:12px 14px;color:inherit;text-decoration:none}.run:hover{border-color:var(--line)}
.pill{font-size:12px;font-weight:600;border-radius:999px;padding:2px 10px;text-align:center}.run.ok .pill{background:var(--ok-soft);color:var(--ok)}.run.bad .pill{background:var(--bad-soft);color:var(--bad)}.run.warn .pill{background:var(--warn-soft);color:var(--warn)}.run.dim .pill{background:var(--panel-hi);color:var(--sub)}
.what{min-width:0;overflow-wrap:anywhere}.what b{font-weight:500}.nums,.when{font-size:12.5px;color:var(--sub);white-space:nowrap}
@media (max-width:700px){.run{grid-template-columns:96px minmax(0,1fr)}.nums,.when{grid-column:2}}</style></head><body>
<header class="top"><div class="wrap"><div class="brand">Witness <em>by morph</em></div><div class="crumb"><b>Runs</b></div></div></header>
<main class="wrap"><div class="runs">${rows.join("") || '<p class="cap">No runs yet.</p>'}</div></main></body></html>`;
  fs.writeFileSync(path.join(root, "index.html"), page);
}
