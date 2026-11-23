import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { generatedDirs, PLUGIN_SKILLS, pluginFiles } from "../scripts/build-plugin.ts";
import { BANNED, checkSkills, WORD_BUDGET } from "../scripts/check-skills.ts";
import { frontmatter, installSkills, listSkills, skillsDir } from "../src/skills.ts";
import { PKG, witness } from "./helpers.ts";

const SKILLS = path.join(PKG, "skills");
const NAMES = ["init", "plan", "test-change", "triage", "verify", "write"];
const tmp = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "witness-skills-")));

test("skills: every SKILL.md is within budget and names no harness-specific tool", () => {
  const { problems, counts } = checkSkills(SKILLS);
  assert.deepEqual(problems, []);
  assert.deepEqual(Object.keys(counts).sort(), NAMES);
  for (const c of Object.values(counts)) assert.ok(c <= WORD_BUDGET);
});

test("skills check: catches tool names, a missing description, a wrong name and the word budget", () => {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, "bad"));
  fs.writeFileSync(
    path.join(dir, "bad", "SKILL.md"),
    `---\nname: other\ndescription: short\n---\n\nUse the Write tool, then TaskCreate.\nRun it with run_in_background.\nAsk Claude.\n${"word ".repeat(WORD_BUDGET)}\n`,
  );
  const { problems } = checkSkills(dir);
  const msgs = problems.map((p) => `${p.line ?? "-"} ${p.message}`);
  assert.ok(msgs.some((m) => m.startsWith("2 frontmatter name")));
  assert.ok(msgs.some((m) => m.startsWith("3 frontmatter description")));
  assert.ok(msgs.some((m) => /^6 names an agent tool: "Write tool"/.test(m)));
  assert.ok(msgs.some((m) => /^6 names an agent tool: "TaskCreate"/.test(m)));
  assert.ok(msgs.some((m) => /^7 names an agent-specific mechanism/.test(m)));
  assert.ok(msgs.some((m) => /^8 names a specific agent product/.test(m)));
  assert.ok(msgs.some((m) => /over the budget/.test(m)));
  for (const ok of ["Read the diagnosis.", "Write down each behavior.", "Edit the file.", "run this command in the background", "the agent"]) assert.ok(!BANNED.some(([re]) => re.test(ok)), ok);
});

test("skills check script exits 0 on the real skills and 1 on bad ones", async () => {
  const { spawnSync } = await import("node:child_process");
  const run = (dir?: string) => spawnSync(process.execPath, ["--no-warnings", path.join(PKG, "scripts", "check-skills.ts"), ...(dir ? [dir] : [])], { encoding: "utf8" });
  assert.equal(run().status, 0);
  const bad = tmp();
  fs.mkdirSync(path.join(bad, "x"));
  fs.writeFileSync(path.join(bad, "x", "SKILL.md"), "---\nname: x\ndescription: use the Bash tool to run things whenever you like to\n---\n");
  const r = run(bad);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /names an agent tool: "Bash tool"/);
});

test("skills: path, list and frontmatter", async () => {
  assert.equal(skillsDir(), SKILLS);
  assert.deepEqual(listSkills(SKILLS).map((s) => s.name), NAMES);
  assert.match(frontmatter(fs.readFileSync(path.join(SKILLS, "test-change", "SKILL.md"), "utf8")).description, /Use after implementing/);
  const p = await witness(PKG, ["skills", "path"]);
  assert.equal(p.code, 0);
  assert.equal(p.stdout.trim(), SKILLS);
  const l = await witness(PKG, ["skills", "list", "--json"]);
  assert.deepEqual(l.json && (l.json as unknown as { name: string }[]).map((s) => s.name), NAMES);
  const env = await witness(PKG, ["skills", "path"], { env: { WITNESS_SKILLS_DIR: "/nonexistent" } });
  assert.equal(env.stdout.trim(), SKILLS);
});

test("skills install: copies with a prefix and renamed frontmatter, links, refuses foreign folders", async () => {
  const dest = tmp();
  const r = await witness(PKG, ["skills", "install", "--dir", dest, "--json"]);
  assert.equal(r.code, 0, r.stderr);
  for (const n of NAMES) {
    const text = fs.readFileSync(path.join(dest, `witness-${n}`, "SKILL.md"), "utf8");
    assert.equal(frontmatter(text).name, `witness-${n}`);
    assert.equal(text.split("\n").slice(4).join("\n"), fs.readFileSync(path.join(SKILLS, n, "SKILL.md"), "utf8").split("\n").slice(4).join("\n"));
  }
  assert.equal((await witness(PKG, ["skills", "install", "--dir", dest])).code, 0, "reinstall replaces its own copies");
  const linked = tmp();
  installSkills(SKILLS, linked, { link: true, prefix: "" });
  assert.equal(fs.realpathSync(path.join(linked, "plan")), path.join(SKILLS, "plan"));
  installSkills(SKILLS, linked, { link: true, prefix: "" });
  const foreign = tmp();
  fs.mkdirSync(path.join(foreign, "witness-plan"));
  fs.writeFileSync(path.join(foreign, "witness-plan", "SKILL.md"), "mine");
  const refused = await witness(PKG, ["skills", "install", "--dir", foreign]);
  assert.equal(refused.code, 2);
  assert.match(refused.stderr, /exists and was not installed by witness/);
  assert.equal(fs.readFileSync(path.join(foreign, "witness-plan", "SKILL.md"), "utf8"), "mine");
  assert.equal((await witness(PKG, ["skills", "install"])).code, 64);
  assert.equal((await witness(PKG, ["skills"])).code, 64);
});

test("plugins/morph/skills/witness-* are generated from the skills and up to date (npm run build:plugin)", () => {
  const want = pluginFiles();
  const have: Record<string, string> = {};
  for (const d of generatedDirs()) {
    const dir = path.join(PLUGIN_SKILLS, d);
    for (const f of fs.readdirSync(dir)) have[`${d}/${f}`] = fs.readFileSync(path.join(dir, f), "utf8");
  }
  assert.deepEqual(Object.keys(have).sort(), Object.keys(want).sort());
  for (const [k, v] of Object.entries(want)) assert.equal(have[k], v, `${k} is stale; run npm run build:plugin`);
  assert.match(want["witness-test-change/SKILL.md"], /^name: witness-test-change$/m);
});
