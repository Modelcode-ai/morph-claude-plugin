#!/usr/bin/env node
// CI check: skills stay short and never name a tool that only one agent harness has.
import * as fs from "node:fs";
import * as path from "node:path";
import { frontmatter } from "../src/skills.ts";

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

/** Every problem in every SKILL.md under dir. */
export function checkSkills(dir: string): { problems: SkillProblem[]; counts: Record<string, number> } {
  const problems: SkillProblem[] = [];
  const counts: Record<string, number> = {};
  for (const name of fs.readdirSync(dir).sort()) {
    const file = path.join(dir, name, "SKILL.md");
    if (!fs.existsSync(file)) continue;
    const rel = path.relative(process.cwd(), file);
    const text = fs.readFileSync(file, "utf8");
    const fm = frontmatter(text);
    if (fm.name !== name) problems.push({ file: rel, line: 2, message: `frontmatter name must be "${name}", got ${JSON.stringify(fm.name)}` });
    if (!fm.description || wordCount(fm.description) < 10) problems.push({ file: rel, line: 3, message: "frontmatter description must say what the skill does and when to use it" });
    counts[name] = wordCount(text);
    if (counts[name] > WORD_BUDGET) problems.push({ file: rel, message: `${counts[name]} words, over the budget of ${WORD_BUDGET}` });
    text.split("\n").forEach((line, i) => {
      for (const [re, why] of BANNED) {
        const m = re.exec(line);
        if (m) problems.push({ file: rel, line: i + 1, message: `${why}: "${m[0].trim()}"` });
      }
    });
  }
  return { problems, counts };
}

const self = process.argv[1] ? fs.realpathSync(process.argv[1]) : "";
if (self.endsWith("check-skills.ts")) {
  const dir = path.resolve(process.argv[2] ?? path.join(import.meta.dirname, "..", "skills"));
  const { problems, counts } = checkSkills(dir);
  for (const [n, c] of Object.entries(counts)) process.stderr.write(`${n.padEnd(12)} ${c} words\n`);
  for (const p of problems) process.stderr.write(`${p.file}${p.line ? `:${p.line}` : ""}: ${p.message}\n`);
  process.stderr.write(problems.length ? `check-skills: ${problems.length} problem(s)\n` : "check-skills: ok\n");
  process.exit(problems.length ? 1 : 0);
}
