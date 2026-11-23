#!/usr/bin/env node
// CI check: each skill, as every profile renders it, stays short and never names a tool that only one agent harness has.
import * as fs from "node:fs";
import * as path from "node:path";
import { frontmatter, PROFILES, type Profile, renderLines, TemplateError } from "../src/skills.ts";

export const WORD_BUDGET = 800;

export const BANNED: [RegExp, string][] = [
  [/\b(Read|Write|Edit|MultiEdit|NotebookEdit|Bash|Grep|Glob|Task|Agent|Skill|Monitor|WebFetch|WebSearch) tool\b/i, "names an agent tool"],
  [/\b(TaskCreate|TaskUpdate|TaskOutput|TaskList|TaskGet|TaskStop|TodoWrite|TodoRead|BashOutput|KillShell|AskUserQuestion|ExitPlanMode|EnterPlanMode|SlashCommand|EnterWorktree|ExitWorktree|ToolSearch|SendMessage|StructuredOutput)\b/, "names an agent tool"],
  [/\b(Bash|Grep|Glob|WebFetch|WebSearch|MultiEdit|NotebookEdit)\b/, "names an agent tool"],
  [/\brun_in_background\b|\bsubagent_type\b|\bsubagents?\b|\bmcp__\w+/i, "names an agent-specific mechanism"],
  [/\bClaude\b|\bCLAUDE\.md\b|\bCodex\b|\bCursor\b|\bCopilot\b|\bGemini\b/i, "names a specific agent product"],
  [/(^|\s)\/(compact|clear|init|review|loop)\b/m, "names a slash command"],
];

export interface SkillProblem {
  file: string;
  line?: number;
  message: string;
}

export const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;

/** Every problem in every SKILL.md under dir, checked as each profile renders it; counts are words per profile per skill. */
export function checkSkills(dir: string): { problems: SkillProblem[]; counts: Record<Profile, Record<string, number>> } {
  const problems: SkillProblem[] = [];
  const counts = Object.fromEntries(PROFILES.map((p) => [p, {}])) as Record<Profile, Record<string, number>>;
  const seen = new Set<string>();
  const add = (p: SkillProblem) => {
    const key = `${p.file}:${p.line}:${p.message}`;
    if (!seen.has(key)) problems.push(p);
    seen.add(key);
  };
  for (const name of fs.readdirSync(dir).sort()) {
    const file = path.join(dir, name, "SKILL.md");
    if (!fs.existsSync(file)) continue;
    const rel = path.relative(process.cwd(), file);
    const source = fs.readFileSync(file, "utf8");
    for (const profile of PROFILES) {
      let lines: { text: string; line: number }[];
      try {
        lines = renderLines(source, profile, rel);
      } catch (e) {
        if (!(e instanceof TemplateError)) throw e;
        const m = /^(.*?):(\d+): (.*)$/.exec(e.message);
        add({ file: rel, line: m ? Number(m[2]) : undefined, message: m ? m[3] : e.message });
        break;
      }
      const text = lines.map((l) => l.text).join("\n");
      const fm = frontmatter(text);
      if (fm.name !== name) add({ file: rel, line: 2, message: `frontmatter name must be "${name}", got ${JSON.stringify(fm.name)}` });
      if (!fm.description || wordCount(fm.description) < 10) add({ file: rel, line: 3, message: "frontmatter description must say what the skill does and when to use it" });
      counts[profile][name] = wordCount(text);
      if (counts[profile][name] > WORD_BUDGET) add({ file: rel, message: `${counts[profile][name]} words in the ${profile} profile, over the budget of ${WORD_BUDGET}` });
      for (const l of lines) {
        for (const [re, why] of BANNED) {
          const m = re.exec(l.text);
          if (m) add({ file: rel, line: l.line, message: `${why}: "${m[0].trim()}"` });
        }
      }
    }
  }
  return { problems, counts };
}

const self = process.argv[1] ? fs.realpathSync(process.argv[1]) : "";
if (self.endsWith("check-skills.ts")) {
  const dir = path.resolve(process.argv[2] ?? path.join(import.meta.dirname, "..", "skills"));
  const { problems, counts } = checkSkills(dir);
  const names = [...new Set(PROFILES.flatMap((p) => Object.keys(counts[p])))].sort();
  process.stderr.write(`${"words".padEnd(12)} ${PROFILES.map((p) => p.padStart(10)).join(" ")}\n`);
  for (const n of names) process.stderr.write(`${n.padEnd(12)} ${PROFILES.map((p) => String(counts[p][n] ?? "-").padStart(10)).join(" ")}\n`);
  for (const p of problems) process.stderr.write(`${p.file}${p.line ? `:${p.line}` : ""}: ${p.message}\n`);
  process.stderr.write(problems.length ? `check-skills: ${problems.length} problem(s)\n` : "check-skills: ok\n");
  process.exit(problems.length ? 1 : 0);
}
