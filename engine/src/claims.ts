import * as fs from "node:fs";
import * as path from "node:path";

export type Tag = "parity" | "changed" | "new" | "judged";
const TAGS: Tag[] = ["parity", "changed", "new", "judged"];

export interface Claim {
  id: string;
  text: string;
  surfaces: string[];
  tags: Tag[];
  proof?: string;
  evidence?: string;
  expectDiff: string[];
  retired?: string;
  feature: string;
  change?: string;
  file: string;
  line: number;
}

export interface ClaimFile {
  file: string;
  feature: string;
  change?: string;
  raw: string;
  claims: Claim[];
}

function frontmatter(src: string): { meta: Record<string, string>; body: string; offset: number } {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(src);
  if (!m) return { meta: {}, body: src, offset: 0 };
  const meta: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const kv = /^([\w-]+):\s*(.*)$/.exec(line.trim());
    if (kv) meta[kv[1]] = kv[2].replace(/^["']|["']$/g, "");
  }
  return { meta, body: src.slice(m[0].length), offset: m[0].split("\n").length - 1 };
}

const CLAIM_RE = /^-\s+([A-Za-z][\w.-]*)\s+\[([^\]]*)\]\s+(.+)$/;
const FIELD_RE = /^\s{2,}([\w-]+):\s*(.*)$/;

export function parseClaimFile(file: string, src: string): ClaimFile {
  const { meta, body, offset } = frontmatter(src);
  const feature = meta.feature || path.basename(file, ".md");
  const claims: Claim[] = [];
  let cur: Claim | null = null;
  body.split("\n").forEach((line, i) => {
    const m = CLAIM_RE.exec(line);
    if (m) {
      const labels = m[2].split(",").map((s) => s.trim()).filter(Boolean);
      cur = {
        id: m[1],
        text: m[3].trim(),
        surfaces: labels.filter((l) => !TAGS.includes(l as Tag)),
        tags: labels.filter((l): l is Tag => TAGS.includes(l as Tag)),
        expectDiff: [],
        feature,
        change: meta.change,
        file,
        line: i + 1 + offset,
      };
      claims.push(cur);
      return;
    }
    const f = FIELD_RE.exec(line);
    if (f && cur) {
      const [, key, val] = f;
      if (key === "proof") cur.proof = val.trim();
      else if (key === "evidence") cur.evidence = val.trim();
      else if (key === "expect-diff") cur.expectDiff = val.split(",").map((s) => s.trim()).filter(Boolean);
      else if (key === "retired") cur.retired = val.trim();
      return;
    }
    if (cur && /^\s{2,}\S/.test(line) && !f) cur.text += " " + line.trim();
  });
  return { file, feature, change: meta.change, raw: src, claims };
}

export function loadClaims(witnessDir: string): ClaimFile[] {
  const dir = path.join(witnessDir, "claims");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => parseClaimFile(path.join(dir, f), fs.readFileSync(path.join(dir, f), "utf8")));
}

/** Normalize a proof reference like `pkg.OwnerIT#method()` to `OwnerIT#method`. */
export function normalizeTestId(ref: string): string {
  const [cls, method = ""] = ref.split("#");
  const simple = cls.split(/[.$/]/).pop() || cls;
  return `${simple}#${method.replace(/\(.*\)$/, "").trim()}`;
}
