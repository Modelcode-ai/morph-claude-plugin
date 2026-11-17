import * as fs from "node:fs";
import * as path from "node:path";
import type { ClaimFile } from "./claims.ts";
import type { Contract } from "./contract.ts";

export interface LintIssue {
  level: "error" | "warning";
  message: string;
  where?: string;
}

const SOURCE_EXT = /\.(java|kt|groovy|scala|ts|tsx|js|mjs|py|go|rb|cs|rs|php)$/;
const SKIP = /(node_modules|\/target\/|\/build\/|\/dist\/|\/\.git\/|\/\.witness\/(records|cache)\/)/;

function sourceFiles(root: string): string[] {
  return fs.globSync(path.join(root, "**", "*")).filter((f) => SOURCE_EXT.test(f) && !SKIP.test(f));
}

/** Static checks that need no running app. */
export function lint(contract: Contract, files: ClaimFile[]): LintIssue[] {
  const issues: LintIssue[] = [];
  const ids = new Map<string, string>();
  let srcCache: { file: string; text: string }[] | null = null;
  const suiteFiles = () => contract.suites.flatMap((x) => (x.tests ? fs.globSync(path.join(contract.root, x.tests)) : []));
  const src = () => (srcCache ??= [...new Set([...sourceFiles(contract.root), ...suiteFiles()])].map((f) => ({ file: f, text: fs.readFileSync(f, "utf8") })));
  for (const f of files) {
    const rel = path.relative(contract.root, f.file);
    if (!f.claims.length) issues.push({ level: "warning", message: `${rel} has no claims (expected lines like "- C1 [api] ...")`, where: rel });
    for (const c of f.claims) {
      const where = `${rel}:${c.line}`;
      if (ids.has(c.id)) issues.push({ level: "error", message: `claim id ${c.id} is used twice (${ids.get(c.id)} and ${where})`, where });
      ids.set(c.id, where);
      if (c.retired) continue;
      if (!c.surfaces.length) issues.push({ level: "warning", message: `${c.id} names no surface (api, ui, cli)`, where });
      if (c.tags.includes("changed") && !c.expectDiff.length) issues.push({ level: "error", message: `${c.id} is tagged changed but has no "expect-diff:" line`, where });
      if (!c.proof && !c.tags.includes("judged")) issues.push({ level: "warning", message: `${c.id} has no proof: and is not judged, so it will be reported as not tested`, where });
      if (c.proof) {
        if (!c.proof.includes("#")) {
          issues.push({ level: "error", message: `${c.id} proof "${c.proof}" must look like Class#method`, where });
          continue;
        }
        const [cls, method] = c.proof.split("#");
        const m = method.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const hit =
          src().find((s) => path.basename(s.file).startsWith(cls + ".") && new RegExp(`\\b${m}\\s*\\(`).test(s.text)) ??
          src().find((s) => suiteFiles().includes(s.file) && new RegExp(`(test|it)\\(\\s*['"\`]${m}['"\`]`).test(s.text));
        if (!hit) issues.push({ level: "error", message: `${c.id} proof ${c.proof}: no test "${method}" found (in a file named ${cls}.* or in a suite's tests glob)`, where });
        else if (!/witness/i.test(hit.text) && !/extends\s+\w*Witness\w*/.test(hit.text))
          issues.push({ level: "warning", message: `${c.id}: ${cls} doesn't appear to use the witness helper, so its exchanges won't be attributed`, where });
      }
    }
  }
  for (const s of contract.suites) if (s.junit.startsWith("/")) issues.push({ level: "warning", message: `suite ${s.name}: junit path should be relative to the repo root` });
  return issues;
}
