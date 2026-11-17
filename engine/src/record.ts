import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { Bundle } from "./verify.ts";
import { type ClaimResult, firstLine, STATUS_WORD } from "./verdict.ts";
import { fmtMs } from "./util.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

export const VERDICT_WORD = { proven: "Proven", needs_a_look: "Needs a look", unproven: "Nothing proven", mistrial: "Mistrial" } as const;

const short = (s?: string | null) => (s ?? "").slice(0, 7);

export function writeRecord(dir: string, b: Bundle) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "bundle.json"), JSON.stringify(b, null, 2));
  fs.writeFileSync(path.join(dir, "agent.md"), agentDigest(b, dir));
  fs.writeFileSync(path.join(dir, "pr.md"), prComment(b));
  const tpl = fs.readFileSync(path.join(here, "viewer", "index.html"), "utf8");
  const data = JSON.stringify(b).replace(/</g, "\\u003c");
  fs.writeFileSync(path.join(dir, "index.html"), tpl.replace("/*__WITNESS_DATA__*/null", data));
  const latest = path.join(path.dirname(dir), "latest");
  try {
    fs.rmSync(latest, { force: true });
    fs.symlinkSync(path.basename(dir), latest);
  } catch {
    /* symlinks may be unavailable */
  }
}

function countLine(b: Bundle): string {
  const k = b.counts;
  const parts = [
    k.proven && `${k.proven} proven`,
    k.failed && `${k.failed} failed`,
    k.flaky && `${k.flaky} flaky`,
    k.cant_tell && `${k.cant_tell} can't tell`,
    k.overturned && `${k.overturned} overturned`,
    k.not_tested && `${k.not_tested} not tested`,
  ].filter(Boolean);
  return parts.join(" · ") || "no claims";
}

function biteLine(b: Bundle): string | null {
  const bites = b.claims.filter((c) => c.bite === "bites").length;
  const vac = b.claims.filter((c) => c.bite === "vacuous").length;
  if (!b.base || bites + vac === 0) return null;
  return `Bite check: ${bites} of ${bites + vac} new test(s) fail on ${b.base.ref}@${short(b.base.sha)} and pass with this change${vac ? ` · ${vac} also pass${vac === 1 ? "es" : ""} without it (doesn't bite)` : ""}`;
}

function otherLine(b: Bundle): string | null {
  const others = b.otherTests.length;
  if (!others) return null;
  return `Existing boundary tests: ${b.otherTests.filter((t) => t.status === "passed").length} of ${others} pass${b.regressions.length ? ` · ${b.regressions.length} regression(s)` : ""}`;
}

/** What the PR changed in claims and rules: the things a reviewer must approve. */
export function declarationLines(b: Bundle): string[] {
  const d = b.declarations;
  if (!d) return [];
  const out: string[] = [];
  if (d.added.length) out.push(`New claims: ${d.added.join(", ")}`);
  if (d.changed.length) out.push(`Claims edited: ${d.changed.join(", ")}`);
  if (d.retired.length) out.push(`Claims retired: ${d.retired.join(", ")}`);
  if (d.removed.length) out.push(`Claims deleted without a reason: ${d.removed.join(", ")}`);
  for (const l of d.rules.added) out.push(`Rule added in equivalence.toml: ${l}`);
  for (const l of d.rules.removed) out.push(`Rule removed from equivalence.toml: ${l}`);
  const declared = b.claims.filter((c) => c.tags.includes("changed") && (d.added.includes(c.id) || d.changed.includes(c.id)));
  for (const c of declared) out.push(`Declared difference from the origin (${c.id}): ${c.expectDiff.join(", ")}`);
  return out;
}

export function summaryLines(b: Bundle): string[] {
  if (b.verdict === "mistrial") return [`Mistrial: ${b.mistrial?.message}`, `Remedy: ${b.mistrial?.remedy}`];
  if (b.verdict === "unproven") return ["Nothing proven: no claims cover this change.", "Add claims in .witness/claims/ (the /witness:claims skill helps), then run witness verify again."];
  const out = [`${VERDICT_WORD[b.verdict]} · ${countLine(b)} · level ${b.level} · ${fmtMs(b.ms)}`];
  for (const l of [biteLine(b), otherLine(b)]) if (l) out.push(l);
  const dl = declarationLines(b);
  if (dl.length) out.push(`Changed in this PR (a reviewer should approve): ${dl.join(" · ")}`);
  for (const c of b.claims.filter((c) => c.status !== "proven")) out.push(`  ${STATUS_WORD[c.status].padEnd(11)} ${c.id} ${c.text}`);
  for (const t of b.regressions) out.push(`  regression  ${t.id}: ${firstLine(t.message)}`);
  return out;
}

function exchangesFor(b: Bundle, c: ClaimResult, side: string) {
  return b.exchanges.filter((e) => e.test === c.testId && e.side === side && e.run === "primary");
}

/** Compact failure digest for a coding agent's context window. */
export function agentDigest(b: Bundle, dir: string): string {
  const L: string[] = [`# Witness verdict: ${VERDICT_WORD[b.verdict]}`, ""];
  if (b.verdict === "mistrial") {
    L.push(`The app or the claims could not be put on trial: ${b.mistrial?.message}`, "", `Remedy: ${b.mistrial?.remedy}`, "");
    if (b.mistrial?.logTail) L.push("Log tail:", "```", b.mistrial.logTail.slice(-3000), "```");
    L.push("", `Logs: ${path.join(dir, "logs")}`);
    return L.join("\n");
  }
  if (b.verdict === "unproven") {
    L.push(...summaryLines(b));
    return L.join("\n");
  }
  L.push(summaryLines(b)[0], biteLine(b) ?? "", otherLine(b) ?? "", "");
  const dl = declarationLines(b);
  if (dl.length) L.push("Changed in this PR (tell the user; a reviewer must approve these):", ...dl.map((x) => `- ${x}`), "");
  const bad = b.claims.filter((c) => c.status !== "proven" && c.status !== "overturned");
  if (!bad.length && !b.regressions.length) L.push("All claims hold. Nothing to fix.");
  for (const c of bad) {
    L.push(`## ${c.id} · ${STATUS_WORD[c.status]} · ${c.text}`, `Claim: ${path.basename(c.file)}:${c.line}${c.testId ? ` · test ${c.testId}${c.source ? ` (${c.source.file}:${c.source.line})` : ""}` : ""}`);
    for (const r of c.reasons) L.push(`- ${r}`);
    if (c.head?.message) L.push("", "Failure:", "```", c.head.message.split("\n").slice(0, 12).join("\n"), "```");
    const ex = exchangesFor(b, c, "head").slice(-3);
    if (ex.length) {
      L.push("", "Last exchanges on this branch:");
      for (const e of ex) L.push(`- ${e.method} ${e.path} -> ${e.status} ${e.resBody.slice(0, 300).replace(/\n/g, " ")}`);
    }
    if (c.parity?.diffs.length) {
      L.push("", "Origin vs target differences:");
      for (const d of c.parity.diffs.slice(0, 10)) L.push(`- ${d.field}: origin ${d.origin} -> target ${d.target}`);
    }
    if (c.judge?.suggested_claim) L.push("", `Judge suggests the claim: ${c.judge.suggested_claim}`);
    L.push("");
  }
  for (const t of b.regressions) L.push(`## Regression · ${t.id}`, "```", (t.message ?? "").split("\n").slice(0, 10).join("\n"), "```", "");
  if (b.warnings.length) L.push("Warnings:", ...b.warnings.map((w) => `- ${w}`), "");
  L.push(
    "Rules: fix the code or the test so the claim holds. Do not weaken or delete a claim to make it pass without telling the user;",
    "if a claim is wrong, say so and propose the change.",
    "",
    `Full record: ${path.join(dir, "index.html")}`,
  );
  return L.join("\n");
}

/** Level-0 summary for a pull request comment. */
export function prComment(b: Bundle): string {
  const icon = b.verdict === "proven" ? "🟢" : b.verdict === "mistrial" || b.verdict === "unproven" ? "⚪" : "🔴";
  const L = [`### ${icon} witness · ${VERDICT_WORD[b.verdict]}`, ""];
  if (b.verdict === "mistrial") {
    L.push(`The app could not be verified: ${b.mistrial?.message}`, "", `**Remedy:** ${b.mistrial?.remedy}`);
    return L.join("\n");
  }
  if (b.verdict === "unproven") {
    L.push("No claims cover this change, so nothing was verified.");
    return L.join("\n");
  }
  L.push(`**${countLine(b)}** · level ${b.level} · ${fmtMs(b.ms)}`, "");
  for (const l of [biteLine(b), otherLine(b)]) if (l) L.push(`- ${l}`);
  const dl = declarationLines(b);
  if (dl.length) L.push("", "**Changed in this PR — please review:**", ...dl.map((x) => `- ${x}`), "");
  for (const c of b.claims.filter((c) => c.status === "failed" || c.status === "flaky")) L.push(`- **${STATUS_WORD[c.status]}:** ${c.text} (${c.id}) — ${c.reasons[0] ?? ""}`);
  for (const c of b.claims.filter((c) => c.status === "cant_tell")) L.push(`- **Can't tell:** ${c.text} (${c.id})${c.judge ? ` — ${c.judge.note}` : ""}`);
  for (const c of b.claims.filter((c) => c.status === "overturned"))
    L.push(`- **Overturned:** ${c.text} (${c.id}) — judge cited ${c.judge?.citations.find((x) => x.verified)?.source}: “${c.judge?.citations.find((x) => x.verified)?.quote}”`);
  for (const c of b.claims.filter((c) => c.status === "not_tested")) L.push(`- **Not tested:** ${c.text} (${c.id})`);
  for (const t of b.regressions) L.push(`- **Regression:** ${t.id}`);
  L.push("", "<details><summary>Claims</summary>", "", "| | Claim | Proof |", "|---|---|---|");
  for (const c of b.claims) L.push(`| ${STATUS_WORD[c.status]} | ${c.id} ${c.text} | ${c.testId ?? "judged"}${c.bite === "bites" ? " · bites" : ""} |`);
  L.push("", "</details>", "", `<sub>head ${short(b.head.sha)}${b.head.dirty ? "+dirty" : ""}${b.base ? ` · base ${b.base.ref}@${short(b.base.sha)}` : ""} · reproduce: \`witness verify${b.level === "high" ? " --level high" : ""}\`</sub>`);
  return L.join("\n");
}
