import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { generatedDirs, PLUGIN_SKILLS, pluginFiles } from "../scripts/build-plugin.ts";
import { BANNED, checkSkills, REFERENCE_BUDGET, WORD_BUDGET } from "../scripts/check-skills.ts";
import { frontmatter, installSkills, listSkills, PROFILES, renderSkill, renderSkillFiles, skillsDir, TemplateError } from "../src/skills.ts";
import { PKG, witness } from "./helpers.ts";

const SKILLS = path.join(PKG, "skills");
const NAMES = ["init", "plan", "test-change", "triage", "verify", "write"];
const REFS = ["init/capture.md", "init/interview.md", "write/evidence.md"];
const FILES = [...NAMES.map((n) => `${n}/SKILL.md`), ...REFS].sort();
const tmp = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "witness-skills-")));
const MARKERS = /<!--\s*(if|else|endif)\b/;
const cacheEnv = () => ({ XDG_CACHE_HOME: tmp() });

test("skills: every SKILL.md is within budget and names no harness-specific tool", () => {
  const { problems, counts } = checkSkills(SKILLS);
  assert.deepEqual(problems, []);
  assert.deepEqual(Object.keys(counts).sort(), [...PROFILES].sort());
  for (const p of PROFILES) {
    assert.deepEqual(Object.keys(counts[p]).sort(), [...NAMES, ...REFS].sort());
    for (const [k, c] of Object.entries(counts[p])) assert.ok(c <= (k.endsWith(".md") ? REFERENCE_BUDGET : WORD_BUDGET), `${p} ${k}: ${c}`);
  }
});

test("skills render: if/else/endif keep one profile's lines and drop every marker", () => {
  const src = ["---", "name: x", "---", "", "shared", "", "<!-- if morph -->", "morph only", "<!-- else -->", "not morph", "<!-- endif -->", "", "<!-- if standalone -->", "standalone only", "<!-- endif -->", "", "tail", ""].join("\n");
  assert.equal(renderSkill(src, "standalone"), "---\nname: x\n---\n\nshared\n\nnot morph\n\nstandalone only\n\ntail\n");
  assert.equal(renderSkill(src, "morph"), "---\nname: x\n---\n\nshared\n\nmorph only\n\ntail\n");
  const list = "- a\n  <!-- if morph -->\n- m\n  <!-- endif -->\n- b\n";
  assert.equal(renderSkill(list, "standalone"), "- a\n- b\n");
  assert.equal(renderSkill(list, "morph"), "- a\n- m\n- b\n");
  const plain = fs.readFileSync(path.join(SKILLS, "plan", "SKILL.md"), "utf8").replace(/<!--[\s\S]*?-->\n?/g, "");
  assert.equal(renderSkill(plain, "morph"), plain, "a file without markers renders unchanged");
});

test("skills render: bad markers are errors with the file and line", () => {
  const err = (text: string, re: RegExp) => assert.throws(() => renderSkill(text, "standalone", "s/SKILL.md"), (e: Error) => e instanceof TemplateError && re.test(e.message));
  err("a\n<!-- if cloud -->\nb\n<!-- endif -->\n", /^s\/SKILL\.md:2: unknown profile "cloud"/);
  err("a\n<!-- if morph -->\nb\n", /^s\/SKILL\.md:2: "if morph" is never closed/);
  err("a\n<!-- endif -->\n", /^s\/SKILL\.md:2: "endif" without an "if"/);
  err("<!-- else -->\n", /^s\/SKILL\.md:1: "else" without an "if"/);
  err("<!-- if morph -->\n<!-- else -->\n<!-- else -->\n<!-- endif -->\n", /:3: second "else" in the block opened on line 1/);
  err("<!-- if morph -->\n<!-- if standalone -->\n<!-- endif -->\n<!-- endif -->\n", /:2: "if" inside the block opened on line 1; blocks do not nest/);
  err("text <!-- if morph --> more\n", /:1: a template marker must be alone on its line/);
  err("---\nname: x\n<!-- if morph -->\n<!-- endif -->\n---\n", /:3: template markers are not allowed in the frontmatter/);
  const dir = tmp();
  fs.mkdirSync(path.join(dir, "bad"));
  fs.writeFileSync(path.join(dir, "bad", "SKILL.md"), "---\nname: bad\ndescription: a skill with a broken template block used to test the checker\n---\n\n<!-- if morph -->\nx\n");
  const { problems } = checkSkills(dir);
  assert.deepEqual(problems.map((p) => [p.line, p.message]), [[6, '"if morph" is never closed with "endif"']]);
});

test("skills render: every profile of the real skills renders with no markers left", () => {
  for (const p of PROFILES) {
    const files = renderSkillFiles(SKILLS, p, "witness-");
    assert.deepEqual(Object.keys(files).sort(), FILES.map((f) => `witness-${f}`));
    for (const [f, text] of Object.entries(files)) {
      assert.doesNotMatch(text, MARKERS, `${p} ${f}`);
      assert.doesNotMatch(text, /\n\n\n/, `${p} ${f} has a doubled blank line`);
    }
  }
  const standalone = renderSkillFiles(SKILLS, "standalone");
  const morph = renderSkillFiles(SKILLS, "morph");
  assert.match(standalone["test-change/SKILL.md"], /tell the user/);
  assert.doesNotMatch(standalone["test-change/SKILL.md"], /\$WITNESS|MCODE_DIR|milestone spec/);
  assert.match(morph["test-change/SKILL.md"], /node "\$WITNESS"/);
  assert.match(morph["plan/SKILL.md"], /milestone spec/);
  assert.match(morph["verify/SKILL.md"], /--against origin/);
  assert.doesNotMatch(morph["triage/SKILL.md"], /\.witness\/\.env/);
  assert.match(standalone["init/interview.md"], /Ask the user and wait for the answer/);
  assert.doesNotMatch(standalone["init/interview.md"], /blocker/);
  assert.match(morph["init/interview.md"], /list it under "Decisions to confirm" in your report/);
  assert.doesNotMatch(morph["init/interview.md"], /\.witness\/\.env|Ask the user/);
  assert.match(standalone["init/SKILL.md"], /use your defaults/);
  assert.match(morph["init/SKILL.md"], /No one answers here/);
  for (const p of [standalone, morph]) assert.match(p["init/SKILL.md"], /read `interview\.md`/);
  for (const p of [standalone, morph]) assert.match(p["init/SKILL.md"], /read\s+`capture\.md`/);
  assert.match(standalone["init/capture.md"], /\[reference\] setup/);
  assert.doesNotMatch(morph["init/capture.md"], /\[reference\]|Shall I go ahead/);
});

test("skills check: reference files get their own budget, the same checks and every profile's markers", () => {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, "ok"));
  fs.writeFileSync(path.join(dir, "ok", "SKILL.md"), "---\nname: ok\ndescription: a skill whose detail lives in a reference file that it names below\n---\n\nRead `steps.md` at step 2.\n");
  fs.writeFileSync(path.join(dir, "ok", "steps.md"), `<!-- if morph -->\n${"word ".repeat(REFERENCE_BUDGET)}\n<!-- endif -->\nUse the Grep tool.\n`);
  fs.writeFileSync(path.join(dir, "ok", "unnamed.md"), "---\nname: x\n---\n<!-- if cloud -->\n<!-- endif -->\n");
  const { problems, counts } = checkSkills(dir);
  const msgs = problems.map((p) => `${path.basename(p.file)}:${p.line ?? "-"} ${p.message}`);
  assert.ok(msgs.some((m) => /^steps\.md:- \d+ words in the morph profile, over the reference budget of 1500/.test(m)), msgs.join("\n"));
  assert.ok(!msgs.some((m) => /standalone profile, over the reference budget/.test(m)), "only the morph profile renders the long block");
  assert.ok(msgs.some((m) => m === 'steps.md:4 names an agent tool: "Grep tool"'));
  assert.ok(msgs.some((m) => m === 'unnamed.md:4 unknown profile "cloud"; profiles: standalone, morph'));
  assert.ok(msgs.some((m) => m === "unnamed.md:1 a reference file has no frontmatter; only SKILL.md does"));
  assert.ok(msgs.some((m) => /^SKILL\.md:- the standalone profile never names its reference file unnamed\.md/.test(m)));
  assert.ok(!msgs.some((m) => /never names its reference file steps\.md/.test(m)));
  assert.equal(counts.standalone["ok/steps.md"], 4);
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
  assert.equal(msgs.filter((m) => /"TaskCreate"/.test(m)).length, 1, "a shared line is reported once, not once per profile");
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

test("skills: path renders a profile, list and frontmatter", async () => {
  assert.equal(skillsDir(), SKILLS);
  assert.deepEqual(listSkills(SKILLS).map((s) => s.name), NAMES);
  assert.match(frontmatter(fs.readFileSync(path.join(SKILLS, "test-change", "SKILL.md"), "utf8")).description, /Use when the user asks to use witness, after implementing/);
  const env = cacheEnv();
  const p = await witness(PKG, ["skills", "path"], { env });
  assert.equal(p.code, 0, p.stderr);
  assert.equal(p.stdout.trim(), path.join(env.XDG_CACHE_HOME, "witness", "skills", "standalone"));
  assert.equal(fs.readFileSync(path.join(p.stdout.trim(), "init", "SKILL.md"), "utf8"), renderSkillFiles(SKILLS, "standalone")["init/SKILL.md"]);
  const m = await witness(PKG, ["skills", "path", "--profile", "morph", "--json"], { env });
  assert.equal(m.json?.profile, "morph");
  assert.equal(fs.readFileSync(path.join(m.json?.path, "verify", "SKILL.md"), "utf8"), renderSkillFiles(SKILLS, "morph")["verify/SKILL.md"]);
  assert.equal((await witness(PKG, ["skills", "path", "--profile", "cloud"], { env })).code, 64);
  const l = await witness(PKG, ["skills", "list", "--json"]);
  assert.deepEqual(l.json && (l.json as unknown as { name: string }[]).map((s) => s.name), NAMES);
  const fallback = await witness(PKG, ["skills", "path", "--json"], { env: { ...env, WITNESS_SKILLS_DIR: "/nonexistent" } });
  assert.equal(fallback.json?.source, SKILLS);
});

test("skills install: renders a profile with a prefix and renamed frontmatter, links standalone, refuses foreign folders", async () => {
  const env = cacheEnv();
  for (const profile of [undefined, ...PROFILES]) {
    const dest = tmp();
    const r = await witness(PKG, ["skills", "install", "--dir", dest, "--json", ...(profile ? ["--profile", profile] : [])], { env });
    assert.equal(r.code, 0, r.stderr);
    assert.equal(r.json?.profile, profile ?? "standalone");
    const want = renderSkillFiles(SKILLS, profile ?? "standalone", "witness-");
    for (const n of NAMES) {
      const text = fs.readFileSync(path.join(dest, `witness-${n}`, "SKILL.md"), "utf8");
      assert.equal(frontmatter(text).name, `witness-${n}`);
      assert.equal(text, want[`witness-${n}/SKILL.md`]);
      assert.ok(fs.existsSync(path.join(dest, `witness-${n}`, ".installed-by-witness")));
    }
    for (const r of REFS) {
      const text = fs.readFileSync(path.join(dest, `witness-${r}`), "utf8");
      assert.equal(text, want[`witness-${r}`], `${r} is rendered for ${profile ?? "standalone"}`);
      assert.doesNotMatch(text, MARKERS);
    }
    assert.equal((await witness(PKG, ["skills", "install", "--dir", dest, ...(profile ? ["--profile", profile] : [])], { env })).code, 0, "reinstall replaces its own copies");
  }
  assert.equal((await witness(PKG, ["skills", "install", "--dir", tmp(), "--profile", "cloud"], { env })).code, 64);
  const refusedLink = await witness(PKG, ["skills", "install", "--dir", tmp(), "--profile", "morph", "--link"], { env });
  assert.equal(refusedLink.code, 64);
  assert.match(refusedLink.stderr, /--link installs the standalone skills only/);
  const linked = await witness(PKG, ["skills", "install", "--dir", tmp(), "--link", "--prefix", "", "--json"], { env });
  assert.equal(linked.code, 0, linked.stderr);
  const plan = (linked.json?.installed as { name: string; path: string }[]).find((d) => d.name === "plan")!.path;
  assert.equal(fs.realpathSync(plan), fs.realpathSync(path.join(env.XDG_CACHE_HOME, "witness", "skills", "standalone", "plan")));
  assert.doesNotMatch(fs.readFileSync(path.join(plan, "SKILL.md"), "utf8"), MARKERS);
  process.env.XDG_CACHE_HOME = env.XDG_CACHE_HOME;
  const again = tmp();
  installSkills(SKILLS, again, { link: true, prefix: "" });
  installSkills(SKILLS, again, { link: true, prefix: "" });
  assert.throws(() => installSkills(SKILLS, tmp(), { link: true, prefix: "", profile: "morph" }), /standalone skills only/);
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
  assert.equal(want["witness-init/interview.md"], renderSkillFiles(SKILLS, "standalone")["init/interview.md"], "reference files are rendered too");
});
