import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

export interface SkillInfo {
  name: string;
  description: string;
  dir: string;
}

const MARKER = ".installed-by-witness";

/** The skills folder: $WITNESS_SKILLS_DIR, else next to src/ or dist/, else beside the bundle. */
export function skillsDir(): string | null {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [process.env.WITNESS_SKILLS_DIR, path.resolve(here, "..", "skills"), path.resolve(here, "skills")].filter(Boolean) as string[];
  return candidates.find((d) => fs.existsSync(path.join(d, "test-change", "SKILL.md"))) ?? null;
}

export function frontmatter(text: string): Record<string, string> {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) return {};
  const out: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([\w-]+):\s*(.*)$/.exec(line);
    if (kv) out[kv[1]] = kv[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

export function listSkills(dir: string): SkillInfo[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(dir, e.name, "SKILL.md")))
    .map((e) => {
      const fm = frontmatter(fs.readFileSync(path.join(dir, e.name, "SKILL.md"), "utf8"));
      return { name: fm.name ?? e.name, description: fm.description ?? "", dir: path.join(dir, e.name) };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function copyDir(src: string, dst: string) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

/** Copy (renaming each skill to <prefix><name>) or symlink the skills into `dest`. */
export function installSkills(src: string, dest: string, o: { link: boolean; prefix: string }): { name: string; path: string }[] {
  fs.mkdirSync(dest, { recursive: true });
  const skills = listSkills(src);
  for (const s of skills) {
    const target = path.join(dest, `${o.prefix}${path.basename(s.dir)}`);
    const st = fs.lstatSync(target, { throwIfNoEntry: false });
    if (st && !st.isSymbolicLink() && !fs.existsSync(path.join(target, MARKER)))
      throw new Error(`${target} exists and was not installed by witness; move it away or pick another --prefix`);
  }
  const out: { name: string; path: string }[] = [];
  for (const s of skills) {
    const base = path.basename(s.dir);
    const target = path.join(dest, `${o.prefix}${base}`);
    fs.rmSync(target, { recursive: true, force: true });
    if (o.link) {
      fs.symlinkSync(s.dir, target, "dir");
      out.push({ name: s.name, path: target });
      continue;
    }
    copyDir(s.dir, target);
    const file = path.join(target, "SKILL.md");
    const name = `${o.prefix}${s.name}`;
    fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace(/^(---\r?\n[\s\S]*?^name:\s*).*$/m, `$1${name}`));
    fs.writeFileSync(path.join(target, MARKER), "");
    out.push({ name, path: target });
  }
  return out;
}

/** `witness skills path|list|install`. */
export function skillsCommand(sub: string | undefined, o: { dir?: string; link: boolean; prefix?: string; json: boolean; log: (s: string) => void }): number {
  const src = skillsDir();
  if (!src) {
    o.log("skills  can't find the skills folder next to this witness; set WITNESS_SKILLS_DIR");
    return 2;
  }
  if (sub === "path") {
    process.stdout.write(o.json ? JSON.stringify({ path: src }) + "\n" : `${src}\n`);
    return 0;
  }
  if (sub === "list") {
    const list = listSkills(src);
    if (o.json) process.stdout.write(JSON.stringify(list, null, 2) + "\n");
    else for (const s of list) process.stdout.write(`${s.name.padEnd(12)} ${s.description}\n`);
    return 0;
  }
  if (sub === "install") {
    if (!o.dir) {
      o.log("skills  install needs --dir <path>, e.g. --dir .claude/skills or --dir ~/.agents/skills");
      return 64;
    }
    const prefix = o.prefix ?? "witness-";
    const done = installSkills(src, path.resolve(o.dir), { link: o.link, prefix });
    for (const d of done) o.log(`skills  ${o.link ? "linked" : "installed"} ${d.name} -> ${d.path}`);
    if (o.link && prefix) o.log(`skills  note: linked skills keep their own names (${done.map((d) => d.name).join(", ")})`);
    if (o.json) process.stdout.write(JSON.stringify({ installed: done }, null, 2) + "\n");
    return 0;
  }
  o.log("usage: witness skills path | list | install --dir <path> [--link] [--prefix witness-]");
  return 64;
}
