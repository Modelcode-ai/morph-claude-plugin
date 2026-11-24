import { formatDiagnosis } from "../diagnosis.ts";
import { okOf, titleOf } from "../evidence/contract.ts";
import type { ReportModel } from "./model.ts";
import { fmtMs, itemLabel, outcomeLabel, takeaways } from "./words.ts";

const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
const mark = { y: "[x]", p: "[~]", n: "[ ]" } as const;
const tone = { fix: "Fix", do: "Do", low: "Consider", ok: "OK" } as const;

/** The report as Markdown: the same top-down story as the HTML, for agents and for pasting into a PR. */
export function renderMd(m: ReportModel): string {
  const t = takeaways(m);
  const md: string[] = [];
  md.push(`# Witness run ${m.run.id}: ${m.run.outcome}`, "");
  md.push(`> ${m.headline}`, "");
  md.push([`${m.run.branch || "(no branch)"} @ \`${m.run.commit.slice(0, 12)}\`${m.run.dirty ? " (uncommitted changes)" : ""}`, m.against ? `compared with ${m.against.ref}` : "", m.run.label ?? "", m.run.ms != null ? fmtMs(m.run.ms) : "", m.run.selected ? "selected tests only" : ""].filter(Boolean).join(" · "), "");

  md.push("## Summary", "");
  md.push(`- **Verdict:** ${outcomeLabel(m.run.outcome)}`);
  if (m.plan) md.push(`- **Plan:** ${t.planCard}`);
  md.push(`- **Against the base:** ${t.baseCard}`);
  md.push(`- **Tests:** ${m.totals.passed} passed, ${m.totals.failed} failed, ${m.totals.skipped} skipped${m.totals.other ? `, ${m.totals.other} other` : ""} in ${m.suites.length} suite(s)`);
  md.push(`- **Evidence strength:** ${m.signals.filter((s) => s.state === "y").length} of ${m.signals.length}`);
  for (const s of m.signals) md.push(`  - ${mark[s.state]} ${s.label}: ${s.detail}`);
  if (m.diagnosis && m.run.outcome !== "passed" && m.run.outcome !== "failed") {
    md.push("", "### Diagnosis", "");
    for (const l of formatDiagnosis(m.diagnosis)) md.push(`- ${l}`);
  }

  md.push("", "## Recommended next steps", "");
  m.steps.forEach((s, i) => {
    md.push(`${i + 1}. **${tone[s.tone]}: ${s.title}.** ${s.detail}`);
    if (s.prompt) md.push(`   > ${s.prompt}`);
  });

  md.push("", "## 1. The change and its evidence", "", `**${t.ch1}**`, "");
  if (m.change) {
    const app = m.change.files.filter((f) => f.role === "app");
    const tst = m.change.files.filter((f) => f.role === "test");
    md.push(`Compared with ${m.change.baseLabel} (\`${m.change.base.slice(0, 10)}\`): ${m.change.commits.length} commit(s); ${app.length} app file(s), ${tst.length} test file(s) changed.`, "");
    for (const c of m.change.commits.slice(0, 10)) md.push(`- \`${c.sha}\` ${c.subject}`);
    if (m.change.commits.length > 10) md.push(`- … ${m.change.commits.length - 10} more`);
    md.push("");
  }
  if (m.plan) {
    md.push(`Plan source: ${m.plan.source}`, "");
    md.push("| Item | Kind | Behavior | Expected | This branch | Base | Tests |", "| --- | --- | --- | --- | --- | --- | --- |");
    for (const i of m.plan.items) md.push(`| ${i.id} | ${i.kind} | ${cell(i.behavior)} | ${cell(i.expect)} | ${itemLabel(i.state)} | ${i.base === "none" ? "-" : i.base} | ${i.tests.map((x) => `\`${cell(x.ref)}\`${x.found ? ` ${x.found.status}` : " not found"}`).join("<br>")} |`);
    const lines: string[] = [];
    for (const i of m.plan.items)
      for (const t of i.tests) {
        const e = t.found ? m.evidence[t.found.id] : undefined;
        if (!e?.here) continue;
        lines.push(`- **${i.id}** \`${t.found!.id}\` (\`${e.here.source}/\`):`);
        for (const o of e.here.observations.slice(0, 12)) lines.push(`  - ${o.kind}: ${titleOf(o)}${o.step ? ` (${o.step})` : ""}${okOf(o) === false ? " ✕" : ""}`);
        if (e.here.observations.length > 12) lines.push(`  - … ${e.here.observations.length - 12} more`);
        for (const f of e.here.files.slice(0, 8)) lines.push(`  - ${f.type}: \`${f.file}\``);
        if (e.here.problems.length) lines.push(`  - ${e.here.problems.length} problem(s) in evidence.jsonl, e.g. line ${e.here.problems[0].line}: ${e.here.problems[0].message}`);
      }
    md.push("", "Evidence the planned tests recorded:", "", ...(lines.length ? lines : ["- none"]));
  } else md.push("No test plan was found for this run (`.witness/plan.yaml`).");

  md.push("", "## 2. Against the base", "", `**${t.ch2}**`, "");
  if (m.against) {
    const words: Record<string, string> = { same: "same result on both", differs: "different", target_only: "new on this branch", origin_only: "only on the base" };
    md.push(Object.entries(m.against.parity).map(([k, v]) => `${v} ${words[k] ?? k}`).join(", ") + ".", "");
    if (m.against.newTests.length) {
      md.push("New on this branch:", "");
      for (const n of m.against.newTests.slice(0, 50)) md.push(`- \`${n.id}\`${n.item ? ` (${n.item})` : ""}`);
    }
    if (m.against.differs.length) {
      md.push("", "Different from the base:", "");
      for (const d of m.against.differs.slice(0, 50)) md.push(`- \`${d.id}\`: ${d.originStatus ?? "absent"} on the base, ${d.status} here`);
    }
  }

  md.push("", "## 3. How the app was exercised", "", `**${t.ch3}**`, "");
  md.push("| Suite | Kind | App | State | Passed | Failed | Error | Missing | Skipped |", "| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: |");
  for (const s of m.suites) md.push(`| ${s.name} | ${s.kind || "-"} | ${s.services.length ? s.services.join(", ") : "in the tests"} | ${s.state}${s.cause ? ` (${s.cause})` : ""}${s.state === "skipped" && s.note ? `: ${s.note}` : ""} | ${s.passed} | ${s.failed} | ${s.error} | ${s.missing} | ${s.skipped} |`);
  const bad = m.tests.filter((x) => x.status === "failed" || x.status === "other");
  if (bad.length) {
    md.push("", `### Not passing (${bad.length})`, "");
    for (const x of bad.slice(0, 50)) md.push(`- \`${x.id}\` ${x.status}${x.detail ? ` (${x.detail})` : ""}${x.message ? `: ${x.message}` : ""}`);
    if (bad.length > 50) md.push(`- … ${bad.length - 50} more in results.ctrf.json`);
  }
  if (m.lint) md.push("", `Lint: ${m.lint.files.length} file(s), ${m.lint.tests} test(s), ${m.lint.errors} error(s), ${m.lint.warnings} warning(s).`);
  md.push("", "## Run", "", `- Run dir: \`${m.run.dir}\``, `- Witness ${m.version}${m.run.hash ? ` · run hash sha256 \`${m.run.hash}\` (of SHA256SUMS)` : ""}`, "- Full results: `results.ctrf.json`; this report as a page: `report.html`");
  return md.join("\n") + "\n";
}
