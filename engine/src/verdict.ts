import { type Claim, normalizeTestId } from "./claims.ts";
import type { JudgeResult } from "./judge.ts";
import type { TestResult } from "./junit.ts";
import type { ParityResult } from "./parity.ts";

export type ClaimStatus = "proven" | "failed" | "cant_tell" | "overturned" | "not_tested" | "flaky";
export type Bite = "bites" | "vacuous" | "preserved" | "not_on_base" | null;

export interface ClaimResult extends Claim {
  status: ClaimStatus;
  reasons: string[];
  testId?: string;
  head?: TestResult;
  base?: TestResult;
  rerun?: TestResult;
  bite: Bite;
  parity?: ParityResult;
  judge?: JudgeResult;
  source?: { file: string; line: number; snippet: string };
  /** Not written by anyone: an existing test's difference from main, or a requirement no claim covers. */
  synthetic?: "existing" | "uncovered";
}

export type Verdict = "proven" | "proven_pending" | "needs_a_look" | "unproven" | "mistrial";

export const STATUS_WORD: Record<ClaimStatus, string> = {
  proven: "proven",
  failed: "failed",
  cant_tell: "can't tell",
  overturned: "overturned",
  not_tested: "not tested",
  flaky: "flaky",
};

/** Per-claim outcome from the runner's facts (T1, bite, parity). The judge is applied afterwards. */
export function assessClaim(
  c: Claim,
  facts: {
    head: Map<string, TestResult>;
    base?: Map<string, TestResult>;
    rerun?: Map<string, TestResult>;
    parity?: ParityResult;
    level: string;
    migrate?: boolean;
    observed?: number;
    /** The proof test's source file changed in this PR. */
    testChanged?: boolean;
    /** No base commit was available for the bite check. */
    noBase?: boolean;
  },
): ClaimResult {
  const r: ClaimResult = { ...c, status: "proven", reasons: [], bite: null };
  if (!c.proof) {
    if (c.tags.includes("judged")) {
      r.status = "cant_tell";
      r.reasons.push("Judged claim; awaiting the judge.");
    } else {
      r.status = "not_tested";
      r.reasons.push("No proof: test linked.");
    }
    return r;
  }
  const id = normalizeTestId(c.proof);
  r.testId = id;
  const head = facts.head.get(id);
  r.head = head;
  if (!head) {
    r.status = "failed";
    r.reasons.push(`The proof test ${id} did not run. Check the class and method name, and that the suite includes it.`);
    return r;
  }
  if (head.status === "skipped") {
    r.status = "failed";
    r.reasons.push(`The proof test ${id} was skipped (disabled or assumption failed), so it proves nothing. Re-enable it or change the proof.`);
    return r;
  }
  if (head.status === "failed") {
    const again = facts.rerun?.get(id);
    r.rerun = again;
    if (again?.status === "passed") {
      r.status = "flaky";
      r.reasons.push(`Failed, then passed when retried once: ${failureHeadline(head.message)}. Treat as unreliable until it passes consistently.`);
    } else {
      r.status = "failed";
      r.reasons.push(`The proof test failed: ${failureHeadline(head.message)}`);
    }
  }
  if (r.status === "proven" && facts.observed === 0) {
    r.status = "cant_tell";
    r.reasons.push("The proof test passed but made no request to the app that witness could see, so it proves nothing about the app. Make it call the app through the witness helper (it sends the X-Witness-Test header).");
  }
  const needsBite = !c.tags.includes("parity") && !c.tags.includes("judged") && !(facts.migrate && c.tags.includes("changed"));
  if (facts.noBase && needsBite && r.status === "proven") {
    r.status = "cant_tell";
    r.reasons.push("No base commit to check against, so witness can't show this test fails without the change. Run with --base <branch>.");
  }
  if (facts.base) {
    const base = facts.base.get(id);
    r.base = base;
    const expectPreserved = c.tags.includes("parity");
    // In a migration, "changed" is relative to the legacy origin, not to this repo's base commit.
    const biteExempt = facts.migrate && c.tags.includes("changed");
    if (base && biteExempt) r.bite = null;
    else if (!base) {
      if (r.status === "proven") {
        r.status = "cant_tell";
        r.reasons.push("The test didn't run against the base app, so witness can't tell whether it proves this change.");
      }
    } else if (base) {
      if (expectPreserved) {
        r.bite = base.status === "passed" ? "preserved" : "not_on_base";
        if (base.status !== "passed") r.reasons.push("Tagged parity, but the test fails on the base app. Is this really existing behavior?");
        if (base.status === "passed" && facts.testChanged && !facts.migrate && r.status === "proven") {
          r.status = "cant_tell";
          r.reasons.push("Tagged parity, but its test changed in this PR and passes on the base app, so it can't show that existing behavior was kept. Use a test that already existed on the base commit, or tag the claim new so it must bite.");
        }
      } else if (base.status === "passed") {
        r.bite = "vacuous";
        if (r.status === "proven") {
          r.status = "failed";
          r.reasons.push("The test also passes on the base app, so it doesn't prove this change (it doesn't bite).");
        }
      } else if (head.status === "passed") r.bite = "bites";
    }
  }
  if (facts.parity && r.status === "proven") {
    r.parity = facts.parity;
    if (facts.parity.status === "unexplained") {
      r.status = "failed";
      r.reasons.push(facts.parity.note ?? `Origin and target differ in ${facts.parity.diffs.length} place(s) that no rule or 'changed' claim explains.`);
    }
  } else if (facts.parity) r.parity = facts.parity;
  if (c.tags.includes("judged") && r.status === "proven") {
    r.status = "cant_tell";
    r.reasons.push("Judged claim; awaiting the judge.");
  }
  return r;
}

export function applyJudge(r: ClaimResult, j: JudgeResult, kind: "judged" | "parity") {
  r.judge = j;
  r.reasons = r.reasons.filter((x) => !x.includes("awaiting the judge"));
  if (kind === "parity") {
    if (j.accepted === "overturned") {
      r.status = "overturned";
      r.reasons.push(`Overturned by the judge: ${j.note}`);
    } else r.reasons.push(`The judge upheld the failure: ${j.note}`);
    return;
  }
  if (j.accepted === "pass") r.status = r.status === "cant_tell" ? "proven" : r.status;
  else if (j.accepted === "fail") r.status = "failed";
  else r.status = "cant_tell";
  r.reasons.push(`Judge: ${j.note}`);
}

export function overall(claims: ClaimResult[], regressions: TestResult[], extraProblems = 0, pendingApproval = false): Verdict {
  if (!claims.filter((c) => !c.synthetic).length) return claims.some((c) => c.status === "failed") || regressions.length || extraProblems ? "needs_a_look" : "unproven";
  if (extraProblems) return "needs_a_look";
  const bad = claims.some((c) => c.status !== "proven" && c.status !== "overturned");
  if (bad || regressions.length) return "needs_a_look";
  return pendingApproval ? "proven_pending" : "proven";
}

export function counts(claims: ClaimResult[]) {
  const k: Record<ClaimStatus, number> = { proven: 0, failed: 0, cant_tell: 0, overturned: 0, not_tested: 0, flaky: 0 };
  for (const c of claims) k[c.status]++;
  return k;
}

/** The useful part of an assertion message: its first line plus any expected/actual lines. */
export function failureHeadline(msg?: string): string {
  const lines = (msg ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return "no message";
  const picked = [lines[0], ...lines.slice(1, 12).filter((l) => /expected|actual|but was|doesn't match|does not match/i.test(l))];
  return [...new Set(picked)].slice(0, 4).join(" · ").slice(0, 400);
}

export const firstLine = (s?: string) => (s ?? "").split("\n").find((l) => l.trim())?.trim().slice(0, 300) ?? "no message";
