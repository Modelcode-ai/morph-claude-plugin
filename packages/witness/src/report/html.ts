import { formatDiagnosis } from "../diagnosis.ts";
import { type Observation, okOf, titleOf } from "../evidence/contract.ts";
import { gapLine } from "../evidence/visuals.ts";
import type { NextStep, PlanItemView, ReportModel, SuiteView, TestEvidence, TestRow } from "./model.ts";
import { fmtMs, itemLabel, outcomeLabel, type Take, takes } from "./words.ts";
import { CSS, SCRIPT } from "./html-assets.ts";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const short = (id: string) => {
  const s = id.slice(id.indexOf(":") + 1);
  return s.includes("#") ? `${s.split("#")[0].split(".").pop()}#${s.split("#").slice(1).join("#")}` : s;
};
const ns = (id: string) => {
  const s = id.slice(id.indexOf(":") + 1);
  return s.includes("#") ? s.split("#")[0].split(".").slice(0, -1).join(".") : "";
};
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const TONE: Record<string, "ok" | "bad" | "warn" | "dim"> = { passed: "ok", failed: "bad", error: "warn", mistrial: "warn", stalled: "warn", interrupted: "dim", running: "dim" };

const ICON = {
  check: `<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  cross: `<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  bang: `<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3.5v5.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="8" cy="12" r="1.2" fill="currentColor"/></svg>`,
  plus: `<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3.5v9M3.5 8h9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  info: `<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 7.2v3.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="8" cy="5" r=".9" fill="currentColor"/></svg>`,
};
const sealIcon = (o: string) => (o === "passed" ? ICON.check : o === "failed" ? ICON.cross : ICON.bang).replace(/width="16" height="16"/, 'width="28" height="28"');

function take(t: Take): string {
  return `${esc(t.pre)} <span class="hl ${t.tone}">${esc(t.hl)}</span> ${esc(t.post)}`.trim();
}

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function stack(parts: [number, string, string][]): string {
  const total = parts.reduce((n, p) => n + p[0], 0) || 1;
  return `<div class="stack" role="img" aria-label="${esc(parts.filter((p) => p[0]).map((p) => `${p[0]} ${p[2]}`).join(", "))}">${parts.filter((p) => p[0]).map(([n, c, l]) => `<i style="flex:${Math.max(n / total, 0.012)};background:${c}" title="${esc(`${n} ${l}`)}"></i>`).join("")}</div>`;
}

function hero(m: ReportModel): string {
  const o = m.run.outcome;
  const tone = TONE[o] ?? "dim";
  const items = m.plan?.items ?? [];
  const proven = items.filter((i) => i.state === "proven").length;
  const a = m.against;
  const regress = a ? a.differs.filter((t) => t.originStatus === "passed").length : 0;
  const meta = [`${esc(m.run.branch || "no branch")} · <span class="mono">${esc(m.run.commit.slice(0, 7))}</span>${m.run.dirty ? " (uncommitted changes)" : ""}`, a ? `compared with ${esc(a.ref)}` : "", ...(m.repos ?? []).map((r) => `${esc(r.name)}: ${esc(r.branch || "no branch")} · <span class="mono">${esc(r.commit.slice(0, 7))}</span>${r.dirty ? " (uncommitted changes)" : ""}${r.against ? ` vs ${esc(r.against)}` : ""}`), esc(when(m.run.startedAt)), m.run.ms != null ? fmtMs(m.run.ms) : "", m.run.selected ? "selected tests only" : ""].filter(Boolean).join(" · ");
  const dot = (i: PlanItemView) => `<i class="${i.state === "proven" ? (i.kind === "parity" ? "ok kept" : "ok") : i.state === "failed" ? "bad" : "dim"}" title="${esc(`${i.id} ${itemLabel(i.state)}`)}"></i>`;
  const planCard = m.plan
    ? `<a class="card" href="#ch1"><div class="card-top"><span class="k">Plan</span><span class="go">1 ↓</span></div><div class="big ${proven === items.length ? "" : "bad"}">${proven}<small>of ${items.length} behaviors pass</small></div><div class="dots">${items.map(dot).join("")}</div><span class="cap">${items.filter((i) => i.kind !== "parity").length} changed or new · ${items.filter((i) => i.kind === "parity").length} kept as they were</span></a>`
    : `<a class="card muted" href="#ch1"><div class="card-top"><span class="k">Plan</span><span class="go">1 ↓</span></div><div class="big">—<small>no test plan</small></div><div class="dots"><i class="dim"></i></div><span class="cap">The report can't say which behaviors are proven</span></a>`;
  const baseCard = a
    ? `<a class="card" href="#ch2"><div class="card-top"><span class="k">Against the base</span><span class="go">2 ↓</span></div><div class="big ${regress ? "bad" : ""}">${regress}<small>${regress === 1 ? "test broke" : "tests broke"}</small></div>${stack([[a.parity.same ?? 0, "var(--ok-mid)", "same"], [a.parity.target_only ?? 0, "var(--blue)", "new"], [a.parity.differs ?? 0, "var(--bad)", "differ"], [a.parity.origin_only ?? 0, "var(--line)", "only on the base"]])}<span class="cap">${a.parity.same ?? 0} same · ${a.parity.target_only ?? 0} new · ${a.parity.differs ?? 0} differ${a.outcome !== "passed" && a.outcome !== "failed" ? ` · base ${esc(a.outcome)}` : ""}</span></a>`
    : `<a class="card muted" href="#ch2"><div class="card-top"><span class="k">Against the base</span><span class="go">2 ↓</span></div><div class="big">—<small>not compared</small></div>${stack([[1, "var(--line)", "not compared"]])}<span class="cap">Run with --against to compare</span></a>`;
  const t = m.totals;
  const testsCard = `<a class="card" href="#ch3"><div class="card-top"><span class="k">Tests</span><span class="go">3 ↓</span></div><div class="big ${t.failed + t.other ? "bad" : ""}">${t.failed + t.other ? t.failed + t.other : t.passed}<small>${t.failed + t.other ? `failing · ${t.passed} passed` : `passed${t.skipped ? ` · ${t.skipped} skipped` : ""}`}</small></div>${stack([[t.passed, "var(--ok)", "passed"], [t.failed, "var(--bad)", "failed"], [t.other, "var(--bad-mid)", "missing or error"], [t.skipped, "var(--warn)", "skipped"]])}<span class="cap">${m.suites.map((s) => `${esc(s.name)} ${s.total}`).join(" · ")}</span></a>`;
  const score = m.signals.filter((s) => s.state === "y").length;
  const diag = m.diagnosis && o !== "passed" && o !== "failed" ? `<div class="diag"><b>${esc(m.diagnosis.cause.replace(/_/g, " "))}</b>${formatDiagnosis(m.diagnosis).slice(1).map((l) => `<span>${esc(l)}</span>`).join("")}</div>` : "";
  return `<section class="hero tone-${tone} rise" aria-label="Summary">
  <div class="hero-head"><div class="seal" aria-hidden="true">${sealIcon(o)}</div><div class="hero-title"><span class="k">${esc(outcomeLabel(o))}</span><h1>${esc(m.headline)}</h1><p>${meta}</p></div></div>
  ${diag}
  <div class="cards">${planCard}${baseCard}${testsCard}</div>
  <div class="strength"><div class="lbl">Evidence strength<b>${score} of ${m.signals.length}</b></div><div class="sig">${m.signals.map((s) => `<div class="${s.state}" title="${esc(s.detail)}"><i></i><span>${esc(s.label)}</span></div>`).join("")}</div></div>
</section>`;
}

function steps(list: NextStep[]): string {
  if (!list.length) return "";
  const ic = { ok: ICON.check, fix: ICON.cross, do: ICON.plus, low: ICON.info };
  return `<section class="next rise d1" aria-labelledby="h-next"><div class="next-h"><h2 id="h-next">Recommended next steps</h2>${list.some((s) => s.prompt) ? "<span>Copy a step to hand it to your agent</span>" : ""}</div>
${list.map((s) => `<div class="step ${s.tone}"><div class="ic">${ic[s.tone]}</div><div><b>${esc(s.title)}</b><p>${esc(s.detail)}</p></div>${s.prompt ? `<button class="copy" type="button" data-copy="${esc(s.prompt)}">Copy step</button>` : "<span></span>"}</div>`).join("\n")}
</section>`;
}

function mark(i: PlanItemView, col: "here" | "base"): string {
  if (col === "here") {
    if (i.state === "proven") return `<span class="mk y" title="passes">✓</span>`;
    if (i.state === "failed") return `<span class="mk x" title="fails">✕</span>`;
    return `<span class="mk na">${esc(itemLabel(i.state))}</span>`;
  }
  if (i.base === "new") return `<span class="mk new" title="new test, not on the base">new</span>`;
  if (i.base === "same") return `<span class="mk same" title="same result on the base">✓</span>`;
  if (i.base === "differs") return `<span class="mk x" title="different on the base">≠</span>`;
  return `<span class="mk na">—</span>`;
}

const clip = (v: unknown, n = 4000) => {
  const t = typeof v === "string" ? v : JSON.stringify(v, null, 2);
  return t.length > n ? `${t.slice(0, n)}\n… ${t.length - n} more characters in the evidence file` : t;
};

/** The lines around the first place `body` contains one of `wanted`, with the match marked. */
function excerpt(body: string, wanted: string[]): string {
  for (const w of wanted) {
    const at = body.indexOf(w);
    if (at < 0) continue;
    const lines = body.split("\n");
    let n = 0;
    let line = 0;
    while (line < lines.length && n + lines[line].length + 1 <= at) n += lines[line++].length + 1;
    const from = Math.max(0, line - 3);
    const text = lines.slice(from, line + 4).join("\n");
    const i = text.indexOf(w);
    return `<div class="obs-part"><span class="k">Where the response shows "${esc(w.length > 60 ? `${w.slice(0, 60)}…` : w)}" (line ${line + 1})</span><pre class="hit">${esc(text.slice(0, i))}<mark>${esc(w)}</mark>${esc(text.slice(i + w.length))}</pre></div>`;
  }
  return "";
}

function observationBody(o: Observation, wanted: string[] = []): string {
  const d = o.data as Record<string, any>;
  if (o.kind === "http") {
    const part = (label: string, p: any) => (p && (p.body || (p.headers && Object.keys(p.headers).length)) ? `<div class="obs-part"><span class="k">${label}</span>${p.headers && Object.keys(p.headers).length ? `<pre class="hdr">${esc(Object.entries(p.headers).map(([k, v]) => `${k}: ${v}`).join("\n"))}</pre>` : ""}${p.body ? `<pre>${esc(clip(p.body))}</pre>` : ""}</div>` : "");
    const hit = typeof d.response?.body === "string" ? excerpt(d.response.body, wanted) : "";
    return hit + part("Request", d.request) + part("Response", d.response);
  }
  if (o.kind === "cli") return `${d.stdout ? `<div class="obs-part"><span class="k">Output</span><pre>${esc(clip(d.stdout))}</pre></div>` : ""}${d.stderr ? `<div class="obs-part"><span class="k">Errors</span><pre>${esc(clip(d.stderr))}</pre></div>` : ""}`;
  if (o.kind === "check") return `<div class="obs-part"><span class="k">Expected</span><pre>${esc(clip(d.expected ?? ""))}</pre></div><div class="obs-part"><span class="k">Actual</span><pre>${esc(clip(d.actual ?? ""))}</pre></div>`;
  return `<div class="obs-part"><pre>${esc(clip(d))}</pre></div>`;
}

function timelineOf(e: TestEvidence, base: string): string {
  const shots = new Set<string>();
  const wanted = e.observations.filter((o) => o.kind === "check" && typeof (o.data as any).expected === "string" && (o.data as any).expected.length >= 3).map((o) => (o.data as any).expected as string);
  const row = (o: Observation) => {
    const ok = okOf(o);
    const imgs = (o.files ?? []).map((f) => `${e.source}/${f}`).filter((f) => /\.(png|jpe?g|gif|webp)$/i.test(f));
    for (const f of imgs) shots.add(f);
    const body = observationBody(o, wanted);
    const head = `<span class="obs-kind">${esc(o.kind)}</span><span class="obs-title">${esc(titleOf(o))}</span>${ok === true ? '<span class="st-passed">✓</span>' : ok === false ? '<span class="st-failed">✕</span>' : ""}${o.step ? `<span class="obs-step">${esc(o.step)}</span>` : ""}`;
    const pics = imgs.map((f) => `<a href="${esc(base + f)}"><img class="thumb" src="${esc(base + f)}" alt="${esc(o.step ?? titleOf(o))}" loading="lazy"></a>`).join("");
    return body ? `<details class="obs"><summary>${head}</summary><div class="obs-body">${body}${pics}</div></details>` : `<div class="obs">${head}${pics}</div>`;
  };
  const list = e.observations.slice(0, 60).map(row).join("");
  const more = e.observations.length > 60 ? `<p class="cap">… ${e.observations.length - 60} more in ${esc(e.source)}/evidence.jsonl</p>` : "";
  const files = e.files.filter((f) => !shots.has(f.file));
  const media = mediaOf(files, base);
  const problems = e.problems.length ? `<p class="cap st-skipped">${plural(e.problems.length, "problem")} in evidence.jsonl, e.g. line ${e.problems[0].line}: ${esc(e.problems[0].message)}</p>` : "";
  return `${list}${more}${media ? `<div class="media">${media}</div>` : ""}${problems}`;
}

function mediaOf(files: { file: string; type: string }[], base = ""): string {
  return files.map((f) => (f.type === "screenshot" ? `<a href="${esc(base + f.file)}"><img class="thumb" src="${esc(base + f.file)}" alt="${esc(f.file.split("/").pop())}" loading="lazy"></a>` : f.type === "video" ? `<video class="thumb" src="${esc(base + f.file)}" controls preload="none"></video>` : `<a class="mono file-link" href="${esc(base + f.file)}">${esc(f.type)} · ${esc(f.file.split("/").pop())}</a>${f.type === "trace" ? '<span class="cap">open with npx playwright show-trace</span>' : ""}`)).join("");
}

const MAX_SCREENS = 300;

/** Every test's screenshots and video, in test order, with the suites whose passing tests left none. */
function screens(m: ReportModel): string {
  const shown = m.tests.flatMap((r) => {
    const files = (m.evidence[r.id]?.here?.files ?? []).filter((f) => f.type === "screenshot" || f.type === "video");
    return files.length ? [{ r, files: [...files.filter((f) => f.type === "screenshot").slice(-3), ...files.filter((f) => f.type === "video").slice(0, 1)] }] : [];
  });
  const gaps = m.visuals.map(gapLine).filter((x): x is string => !!x);
  if (!shown.length && !gaps.length) return "";
  const cards = shown.slice(0, MAX_SCREENS).map(({ r, files }) => `<div class="ev shot"><div class="tref"><span class="st-${esc(r.status)}">${esc(r.status)}</span><span class="mono">${esc(short(r.id))}</span></div><div class="media">${mediaOf(files)}</div></div>`).join("");
  const warn = gaps.map((g) => `<p class="cap st-skipped">${esc(g)}. See "Record screenshots and video" in the next steps.</p>`).join("");
  const more = shown.length > MAX_SCREENS ? `<p class="cap">… ${shown.length - MAX_SCREENS} more tests with screenshots or video in artifacts/</p>` : "";
  return `<details class="more"${gaps.length ? " open" : ""}><summary>Screenshots and video of ${plural(shown.length, "test")}</summary><div class="more-body">${warn}${cards ? `<div class="gallery">${cards}</div>` : ""}${more}</div></details>`;
}

function evidenceFor(m: ReportModel, row?: TestRow): string {
  const e = row ? m.evidence[row.id] : undefined;
  if (!e?.here && !e?.base) return `<div class="ev todo"><span class="k">Evidence</span><p>The test recorded nothing it sent or saw. See "Record evidence" in the next steps.</p></div>`;
  const side = (label: string, x?: TestEvidence) => (x ? `<div class="ev side"><span class="k">${label}</span>${timelineOf(x, "")}</div>` : "");
  return `<div class="ev-sides ${e.here && e.base ? "two" : ""}">${side("Evidence on this branch", e.here)}${side("On the base", e.base)}</div>`;
}

function chapter1(m: ReportModel, t: Take): string {
  const hasBase = !!m.against;
  const head = `<span class="h">Behavior</span><span class="h">This branch</span>${hasBase ? '<span class="h">Base</span>' : ""}`;
  const rows = (m.plan?.items ?? []).map((i) => `<span class="r"><span class="beh"><span class="id">${esc(i.id)}</span><span class="t">${esc(i.behavior)}${i.kind !== "parity" ? `<span class="kd">${esc(i.kind)}</span>` : ""}</span></span></span><span class="r c">${mark(i, "here")}</span>${hasBase ? `<span class="r c">${mark(i, "base")}</span>` : ""}`).join("");
  const viz = m.plan
    ? `<div class="viz"><div class="matrix ${hasBase ? "" : "two"}" role="table" aria-label="Planned behaviors and their results">${head}${rows}</div></div>`
    : `<div class="viz empty"><p>Write <span class="mono">.witness/plan.yaml</span> (the plan skill does it) and the next run shows each behavior here with its evidence.</p></div>`;
  const change = m.change
    ? (() => {
        const files = m.change.files.filter((f) => f.role !== "witness");
        const app = files.filter((f) => f.role === "app");
        const tst = files.filter((f) => f.role === "test");
        const sum = (fs: typeof files) => `+${fs.reduce((n, f) => n + f.added, 0)} −${fs.reduce((n, f) => n + f.deleted, 0)}`;
        const first = m.change.commits[0];
        return `<div class="ev"><span class="k">The change · ${plural(m.change.commits.length, "commit")} since ${esc(m.change.baseLabel)} · ${plural(app.length, "app file")} ${sum(app)} · ${plural(tst.length, "test file")} ${sum(tst)}</span>${first?.body ? `<p class="body">${esc(first.body)}</p>` : ""}<div class="files">${files.slice(0, 30).map((f) => `<div class="file"><span class="tag ${f.role}">${f.role}</span><span class="p">${esc(f.path)}</span><span class="n"><span class="a">+${f.added}</span> <span class="d">−${f.deleted}</span></span></div>`).join("")}${files.length > 30 ? `<span class="cap">… ${files.length - 30} more</span>` : ""}</div>${m.change.commits.length > 1 ? `<details class="mini"><summary>${plural(m.change.commits.length, "commit")}</summary><div class="commits">${m.change.commits.map((c) => `<div><span class="mono">${esc(c.sha)}</span> ${esc(c.subject)}</div>`).join("")}</div></details>` : ""}</div>`;
      })()
    : "";
  const items = (m.plan?.items ?? []).map((i) => `<div class="ev-item"><h3><span>${esc(i.id)}</span>${esc(i.behavior)}</h3><div class="ev-grid two"><div class="ev"><span class="k">Expected</span><p>${esc(i.expect)}</p></div><div class="ev"><span class="k">Tests</span>${i.tests.map((x) => `<div class="tref"><span class="st-${x.found ? esc(x.found.status) : "none"}">${x.found ? esc(x.found.status) : "not found"}</span><span class="mono">${esc(short(x.ref))}</span>${x.found ? `<span class="cap">${esc(x.found.suite)} · ${x.found.ms} ms${x.running ? " · running app" : " · app in the tests"}</span>` : ""}${x.found?.message ? `<span class="msg">${esc(x.found.message)}</span>` : ""}</div>`).join("")}</div></div>${i.tests.filter((x) => x.found).map((x) => evidenceFor(m, x.found)).join("") || evidenceFor(m)}</div>`).join("");
  const more = change || items ? `<details class="more"><summary>${m.plan ? "The change, and each behavior's tests and evidence" : "The change"}</summary><div class="more-body">${change}${m.plan ? `<p class="cap">Plan source: ${esc(m.plan.source)}</p>` : ""}${items}</div></details>` : "";
  return chapter(1, "The change and its evidence", take(t), viz, more);
}

function chapter2(m: ReportModel, t: Take): string {
  const a = m.against;
  if (!a) return chapter(2, "Against the base", take(t), `<div class="viz empty"><p>Run <span class="mono">witness run --against &lt;base branch&gt;</span> to run the same suites on the base and see, test by test, whether anything changed.</p></div>`, "");
  const legend = [
    ["var(--ok-dim)", a.parity.same ?? 0, "same result on both"],
    ["var(--blue)", a.parity.target_only ?? 0, a.newTests.some((n) => n.item) ? `new, ${[...new Set(a.newTests.map((n) => n.item).filter(Boolean))].join(" and ")}` : "new on this branch"],
    ["var(--bad)", a.parity.differs ?? 0, "different result"],
    ["var(--line)", a.parity.origin_only ?? 0, "only on the base"],
  ] as const;
  const viz = `<div class="viz"><div class="waffle-wrap"><div class="waffle" id="waffle" role="img" aria-label="${esc(legend.map((l) => `${l[1]} ${l[2]}`).join(", "))}"></div><div class="wf-legend">${legend.map(([c, n, l]) => `<div><i style="background:${c}"></i><b>${n}</b><span>${esc(l)}</span></div>`).join("")}</div></div></div>`;
  const rows = (list: TestRow[], f: (r: TestRow) => string) => list.slice(0, 100).map((r) => `<div class="tref">${f(r)}<span class="mono">${esc(short(r.id))}</span></div>`).join("");
  const more = `<details class="more"><summary>What differs, what's new, and how the comparison ran</summary><div class="more-body">
${a.differs.length ? `<div class="ev"><span class="k">Different from the base</span>${rows(a.differs, (r) => `<span class="st-failed">${esc(r.originStatus ?? "absent")} → ${esc(r.status)}</span>`)}</div>` : ""}
${a.newTests.length ? `<div class="ev"><span class="k">New on this branch</span>${a.newTests.slice(0, 100).map((n) => `<div class="tref"><span class="newb">${n.item ? esc(n.item) : "new"}</span><span class="mono">${esc(short(n.id))}</span></div>`).join("")}</div>` : ""}
<p class="cap">Witness ran the same suites on ${esc(a.ref)} and matched each test by its id. One square is one test.${a.diagnosis ? ` The base side ended ${esc(a.outcome)}: ${esc(a.diagnosis.cause)}${a.diagnosis.evidence ? `, ${esc(a.diagnosis.evidence)}` : ""}.` : ""}</p></div></details>`;
  return chapter(2, "Against the base", take(t), viz, more);
}

function lane(s: SuiteView, m: ReportModel): string {
  const svc = m.services.filter((x) => s.services.includes(x.name));
  const host = (u?: string) => (u ? u.replace(/^https?:\/\//, "") : "");
  if (s.mode === "not-run") return `<div class="lane ghost"><div class="src"><b>${esc(s.name)}</b><span>${esc(s.kind)} · did not run</span></div><div class="wire"><span>${esc(s.note ?? s.cause ?? "skipped")}</span></div><div class="dst"><b>Nothing reached</b><span>&nbsp;</span></div></div>`;
  const counts = `${plural(s.total, "test")} · ${esc(s.kind)}${s.failed ? ` · ${s.failed} failed` : ""}${s.skipped ? ` · ${s.skipped} skipped` : ""}`;
  if (s.mode === "running-app")
    return `<div class="lane live ${s.failed + s.error ? "bad" : ""}"><div class="src"><b>${esc(s.name)}</b><span>${counts}</span></div><div class="wire"><span>HTTP ${esc(host(s.url) || s.services.join(", "))}</span></div><div class="dst"><b>Running app, started by Witness</b><span>${svc.map((x) => `${esc(x.name)}${x.readyMs != null ? ` · ready in ${(x.readyMs / 1000).toFixed(1)}s` : ""}`).join(" · ") || esc(s.services.join(", "))}</span></div></div>`;
  return `<div class="lane ${s.failed + s.error ? "bad" : ""}"><div class="src"><b>${esc(s.name)}</b><span>${counts}</span></div><div class="wire"><span>in-process</span></div><div class="dst"><b>App inside the tests</b><span>the test process hosts it</span></div></div>`;
}

function chapter3(m: ReportModel, t: Take): string {
  const reports = m.suites.filter((s) => s.mode !== "not-run").length;
  const reruns = m.suites.reduce((n, s) => n + s.reruns, 0);
  const viz = `<div class="viz"><div class="lanes">${m.suites.map((s) => lane(s, m)).join("")}</div><div class="split"><div class="chip-row">${m.suites.filter((s) => s.ms != null).map((s) => `<b>${(s.ms! / 1000).toFixed(1)}s</b><span>${esc(s.name)}</span>`).join("")}</div><div class="chip-row"><b>${reruns}</b><span>${reruns === 1 ? "test rerun alone" : "tests rerun alone"}</span><b>${reports}</b><span>${reports === 1 ? "suite" : "suites"} read from reports, checked against exit codes</span></div></div></div>`;
  const tl = m.timeline;
  const pct = (x: number) => `${((x / tl.total) * 100).toFixed(2)}%`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => `<span style="left:${f * 100}%">${Math.round(tl.total * f)}s</span>`).join("");
  const more = tl.rows.length
    ? `<details class="more"><summary>Timeline${tl.rows.length > 1 ? " of both runs" : ""}</summary><div class="more-body"><div class="tl" role="img" aria-label="Timeline of the run">${tl.rows.map((r) => `<div class="tl-row"><span>${esc(r.label)}</span><div class="track">${r.segments.map((s) => `<div class="seg ${s.type} ${s.state === "passed" || !s.state ? "" : "bad"} ${r.label === "Base" ? "base" : ""}" style="left:${pct(s.start)};width:${pct(Math.max(s.end - s.start, tl.total * 0.004))}" title="${esc(`${s.label} ${(s.end - s.start).toFixed(1)}s`)}">${s.type === "boot" ? "" : esc(s.label)}</div>`).join("")}</div></div>`).join("")}<div class="tl-row"><span></span><div class="axis">${ticks}</div></div></div></div></details>`
    : "";
  return chapter(3, "How the app was exercised", take(t), viz, more + screens(m));
}

function chapter(n: number, kicker: string, takeHtml: string, viz: string, more: string): string {
  return `<section class="ch rise d${Math.min(n + 1, 3)}" id="ch${n}" aria-labelledby="h${n}x"><div class="num">${n}</div><div class="ch-body"><span class="ch-kicker">${esc(kicker)}</span><h2 class="ch-take" id="h${n}x">${takeHtml}</h2>${viz}${more}</div></section>`;
}

function deep(m: ReportModel): string {
  const svc = m.services.map((s) => `<dt>${esc(s.name)}</dt><dd>${esc(s.url ?? "")}${s.readyMs != null ? ` · ready in ${(s.readyMs / 1000).toFixed(1)}s` : ""}</dd>`).join("");
  const lint = m.lint ? `<dt>Lint</dt><dd>${m.lint.files.length} file(s), ${m.lint.tests} tests, ${m.lint.errors} errors, ${m.lint.warnings} warnings</dd>` : "";
  const findings = m.lint?.findings.length ? `<div class="ev"><span class="k">Lint findings</span>${m.lint.findings.slice(0, 50).map((f) => `<div class="tref"><span class="st-${f.level === "error" ? "failed" : "skipped"}">${esc(f.rule)}</span><span class="mono">${esc(f.file)}:${f.line}</span><span class="msg">${esc(f.message)}</span></div>`).join("")}</div>` : "";
  return `<details class="deep"><summary><h2>Deep dive</h2><span>All ${m.tests.length} tests · run facts · environment</span><svg class="chev" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 5l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></summary>
<div class="deep-body">
  <div class="filters"><input id="q" type="search" placeholder="Filter tests by name or namespace" aria-label="Filter tests">
    <div class="seg-btn" role="group" aria-label="Suite" id="f-suite"><button type="button" aria-pressed="true" data-v="">All</button>${m.suites.map((s) => `<button type="button" aria-pressed="false" data-v="${esc(s.name)}">${esc(s.name)}</button>`).join("")}</div>
    <div class="seg-btn" role="group" aria-label="Status" id="f-st"><button type="button" aria-pressed="true" data-v="">Any</button><button type="button" aria-pressed="false" data-v="failing">Failing</button>${m.against ? '<button type="button" aria-pressed="false" data-v="new">New</button><button type="button" aria-pressed="false" data-v="differs">Differs</button>' : ""}<button type="button" aria-pressed="false" data-v="skipped">Skipped</button></div>
    <span id="count" class="cap"></span></div>
  <div class="tbl"><table><thead><tr><th>Suite</th><th>Test</th><th>Result</th>${m.against ? "<th>Base</th>" : ""}<th style="text-align:right">ms</th></tr></thead><tbody id="rows"></tbody></table></div>
  <div class="facts">
    <div class="ev"><span class="k">Run</span><dl><dt>Run id</dt><dd>${esc(m.run.id)}</dd><dt>Commit</dt><dd>${esc(m.run.commit.slice(0, 12))} · ${esc(m.run.branch)}${m.run.dirty ? " · uncommitted changes" : " · clean"}</dd>${m.against ? `<dt>Base</dt><dd>${esc(m.against.ref)}</dd>` : ""}${(m.repos ?? []).map((r) => `<dt>Repo ${esc(r.name)}</dt><dd>${esc(r.commit.slice(0, 12))} · ${esc(r.branch)}${r.dirty ? " · uncommitted changes" : " · clean"}${r.against ? ` · base ${esc(r.against)}` : ""}${r.change ? ` · ${r.change.commits} commit(s), ${r.change.files} file(s) since ${esc(r.change.baseLabel)}` : ""}</dd>`).join("")}${m.run.label ? `<dt>Label</dt><dd>${esc(m.run.label)}</dd>` : ""}<dt>Witness</dt><dd>${esc(m.version)}</dd>${m.run.hash ? `<dt>Run hash</dt><dd title="sha256 of SHA256SUMS in the run folder">${esc(m.run.hash.slice(0, 16))}…</dd>` : ""}</dl></div>
    <div class="ev"><span class="k">Environment and checks</span><dl>${svc || "<dt>Services</dt><dd>none started</dd>"}${lint}</dl></div>
  </div>
  ${findings}
  <div class="ev"><span class="k">Run folder</span><pre>${esc(m.run.dir)}
results.ctrf.json   every test, with Witness's fields
status.json · events.jsonl · context.json · plan.yaml
logs/ · reports/${m.against ? " · against/" : ""}${m.artifacts.length ? " · artifacts/" : ""}
SHA256SUMS          the hash of every file above</pre></div>
</div></details>`;
}

/** One self-contained page: verdict and next steps first, three chapters, then the deep dive. */
export function renderHtml(m: ReportModel): string {
  const t = takes(m);
  const data = m.tests.map((r) => [r.suite, short(r.id), ns(r.id), r.status, r.ms, r.parity ?? "", r.message ?? ""]);
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(`Witness · ${outcomeLabel(m.run.outcome)} · ${m.run.branch || m.run.id}`)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap">
<style>${CSS}</style></head><body>
<header class="top"><div class="wrap"><div class="brand"><svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><rect x="1" y="1" width="18" height="18" rx="5" fill="none" stroke="#069bfa" stroke-width="1.6"/><path d="M5.5 10.3l2.8 2.8 6.2-6.6" fill="none" stroke="#069bfa" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>Witness <em>by morph</em></div><div class="crumb"><b>${esc(m.run.branch || "no branch")}</b>${m.against ? `<span>vs</span><span>${esc(m.against.ref)}</span>` : ""}</div><div class="grow"></div><span class="runid">${esc(m.run.id)}</span></div></header>
<main class="wrap">
${hero(m)}
${steps(m.steps)}
<div class="chapters">
${chapter1(m, t.ch1)}
${chapter2(m, t.ch2)}
${chapter3(m, t.ch3)}
</div>
${deep(m)}
<footer class="foot"><span>Built by <span class="mono">witness</span> from the run folder, the plan and git. Pass and fail come only from the test reports.</span><span>report.md has the same content for agents</span></footer>
</main>
<script>const TESTS=${json};const HAS_BASE=${m.against ? "true" : "false"};${SCRIPT}</script>
</body></html>
`;
}
