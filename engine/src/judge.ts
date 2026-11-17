import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createHash } from "node:crypto";

export interface Source {
  name: string;
  text: string;
  /** Can a quote from this source justify overturning a parity failure? */
  canOverturn: boolean;
}

export interface Citation {
  source: string;
  quote: string;
  verified?: boolean;
}

export interface JudgeResult {
  verdict: "pass" | "fail" | "cant_tell" | "overturn";
  note: string;
  citations: Citation[];
  suggested_claim?: string;
  accepted: "pass" | "fail" | "cant_tell" | "overturned";
  rejectedOverturn?: string;
  error?: string;
  cached?: boolean;
  ms: number;
}

const SCHEMA = {
  type: "object",
  properties: {
    verdict: { type: "string", enum: ["pass", "fail", "cant_tell", "overturn"] },
    note: { type: "string", description: "One or two plain sentences for a code reviewer." },
    citations: {
      type: "array",
      items: {
        type: "object",
        properties: { source: { type: "string" }, quote: { type: "string" } },
        required: ["source", "quote"],
      },
    },
    suggested_claim: { type: "string", description: "A sharper claim that would make this assertable, if useful." },
  },
  required: ["verdict", "note", "citations"],
};

const SYSTEM = `You are the judge in a verification tool. You rule on ONE item using ONLY the evidence and sources given.
Rules:
- Cite evidence for every ruling: quote exchange lines (source "evidence") or source documents (use the source's exact name).
- "cant_tell" is a correct answer when the evidence does not settle it. Never guess.
- You never see the author's reasoning and must not assume intent beyond the sources.
- "overturn" is only allowed for a PARITY FAILURE, and only when a quote from a source marked [may justify overturn] explicitly justifies the difference. Quote it verbatim (at least 30 characters). Otherwise answer "fail" or "cant_tell".
- If the claim, the change description and the behavior disagree or something is ambiguous, say so in the note and propose suggested_claim.
Respond with the JSON object only.`;

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

export function verifyQuote(quote: string, sources: Source[], sourceName: string): boolean {
  const q = norm(quote);
  if (q.length < 30) return false;
  const src = sources.find((s) => s.name === sourceName && s.canOverturn);
  return !!src && norm(src.text).includes(q);
}

export function judge(item: { kind: "judged" | "parity"; claim: string; question: string; evidence: string }, sources: Source[], cacheDir?: string): JudgeResult {
  const t0 = Date.now();
  const key = createHash("sha256").update(JSON.stringify([SYSTEM, item, sources, process.env.WITNESS_JUDGE_MODEL ?? ""])).digest("hex").slice(0, 16);
  const cached = cacheDir ? path.join(cacheDir, `${key}.json`) : null;
  if (cached && fs.existsSync(cached)) return { ...JSON.parse(fs.readFileSync(cached, "utf8")), cached: true, ms: 0 };
  const res = judgeOnce(item, sources, t0);
  if (cached && !res.error) {
    fs.mkdirSync(cacheDir!, { recursive: true });
    fs.writeFileSync(cached, JSON.stringify(res));
  }
  return res;
}

function judgeOnce(item: { kind: "judged" | "parity"; claim: string; question: string; evidence: string }, sources: Source[], t0: number): JudgeResult {
  const srcText = sources
    .map((s) => `<source name="${s.name}"${s.canOverturn ? " [may justify overturn]" : ""}>\n${s.text.slice(0, 12000)}\n</source>`)
    .join("\n\n");
  const prompt = `ITEM KIND: ${item.kind === "parity" ? "PARITY FAILURE (origin vs target differ in a way no rule explains)" : "JUDGED CLAIM (cannot be asserted mechanically)"}
CLAIM: ${item.claim}
QUESTION: ${item.question}

EVIDENCE:
${item.evidence.slice(0, 20000)}

SOURCES:
${srcText || "(none)"}`;
  const model = process.env.WITNESS_JUDGE_MODEL || "sonnet";
  const r = spawnSync(
    process.env.WITNESS_CLAUDE_BIN || "claude",
    ["-p", "--model", model, "--tools", "", "--no-session-persistence", "--strict-mcp-config", "--setting-sources", "", "--system-prompt", SYSTEM, "--json-schema", JSON.stringify(SCHEMA), "--output-format", "json"],
    { input: prompt, encoding: "utf8", cwd: os.tmpdir(), timeout: 180_000, maxBuffer: 20 * 1024 * 1024 },
  );
  const ms = Date.now() - t0;
  const fail = (error: string): JudgeResult => ({ verdict: "cant_tell", note: "The judge could not rule.", citations: [], accepted: "cant_tell", error, ms });
  if (r.status !== 0) return fail((r.stderr || r.stdout || "claude exited non-zero").slice(0, 500));
  let parsed: any;
  try {
    const outer = JSON.parse(r.stdout);
    parsed = outer.structured_output ?? (typeof outer.result === "string" ? JSON.parse(outer.result.replace(/^```json\s*|```\s*$/g, "")) : outer.result);
  } catch (e) {
    return fail(`unparseable judge output: ${(e as Error).message}`);
  }
  if (!parsed?.verdict) return fail("judge returned no verdict");
  const res: JudgeResult = {
    verdict: parsed.verdict,
    note: parsed.note ?? "",
    citations: (parsed.citations ?? []).map((c: Citation) => ({ ...c })),
    suggested_claim: parsed.suggested_claim || undefined,
    accepted: "cant_tell",
    ms,
  };
  for (const c of res.citations) c.verified = c.source === "evidence" ? true : verifyQuote(c.quote, sources, c.source) || norm(sources.find((s) => s.name === c.source)?.text ?? "").includes(norm(c.quote));
  if (res.verdict === "overturn") {
    const ok = item.kind === "parity" && res.citations.some((c) => verifyQuote(c.quote, sources, c.source));
    if (ok) res.accepted = "overturned";
    else {
      res.accepted = "fail";
      res.rejectedOverturn =
        item.kind !== "parity"
          ? "Overturn is only allowed for parity failures."
          : "No verbatim quote of 30+ characters from a source that can justify an overturn (base-revision VERIFY.md or .witness/sources, or an external --source file).";
    }
  } else res.accepted = res.verdict;
  return res;
}

export function readIfExists(file: string): string | null {
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
}
