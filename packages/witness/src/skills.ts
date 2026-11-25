import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

export interface SkillInfo {
  name: string;
  description: string;
  dir: string;
}

export const PROFILES = ["standalone", "morph"] as const;
export type Profile = (typeof PROFILES)[number];
export const isProfile = (p: unknown): p is Profile => PROFILES.includes(p as Profile);

/** A bad template marker; the message starts with `file:line:`. */
export class TemplateError extends Error {}

const MARKER = ".installed-by-witness";
const ANY_MARKER = /<!--\s*(if|else|endif)\b/;
const MARKER_LINE = /^\s*<!--\s*(?:if\s+(\S+)|(else)|(endif))\s*-->\s*$/;

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

/** The lines `profile` keeps, each with its 1-based source line number. */
export function renderLines(text: string, profile: Profile, file = "SKILL.md"): { text: string; line: number }[] {
  const lines = text.split("\n");
  const fmEnd = lines[0]?.trim() === "---" ? lines.findIndex((l, i) => i > 0 && l.trim() === "---") : -1;
  const out: { text: string; line: number }[] = [];
  let block: { profile: Profile; line: number; inElse: boolean } | null = null;
  let dropped = false;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const fail = (msg: string): never => {
      throw new TemplateError(`${file}:${i + 1}: ${msg}`);
    };
    if (ANY_MARKER.test(raw)) {
      const m = MARKER_LINE.exec(raw) ?? fail(`a template marker must be alone on its line: ${raw.trim()}`);
      if (i <= fmEnd) fail("template markers are not allowed in the frontmatter");
      if (m[1] !== undefined) {
        if (block) fail(`"if" inside the block opened on line ${block.line}; blocks do not nest`);
        if (!isProfile(m[1])) fail(`unknown profile "${m[1]}"; profiles: ${PROFILES.join(", ")}`);
        block = { profile: m[1] as Profile, line: i + 1, inElse: false };
      } else if (m[2]) {
        if (!block) fail(`"else" without an "if"`);
        else if (block.inElse) fail(`second "else" in the block opened on line ${block.line}`);
        else block.inElse = true;
      } else {
        if (!block) fail(`"endif" without an "if"`);
        block = null;
      }
      dropped = true;
      continue;
    }
    if (block && (block.profile === profile) === block.inElse) {
      dropped = true;
      continue;
    }
    const prev = out[out.length - 1];
    if (dropped && raw.trim() === "" && (!prev || prev.text.trim() === "")) continue;
    dropped = false;
    out.push({ text: raw, line: i + 1 });
  }
  if (block) throw new TemplateError(`${file}:${block.line}: "if ${block.profile}" is never closed with "endif"`);
  return out;
}

/** Render a skill source for one profile: keep its blocks, drop the others and every marker. */
export function renderSkill(text: string, profile: Profile, file?: string): string {
  return renderLines(text, profile, file)
    .map((l) => l.text)
    .join("\n");
}

function walk(dir: string, rel = ""): string[] {
  return fs.readdirSync(path.join(dir, rel), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(dir, path.join(rel, e.name)) : [path.join(rel, e.name)]));
}

/** Every file of every skill rendered for `profile`, keyed `<prefix><dir>/<file>`; SKILL.md's name gets the prefix. */
export function renderSkillFiles(src: string, profile: Profile, prefix = ""): Record<string, string> {
  const files: Record<string, string> = {};
  for (const s of listSkills(src)) {
    const dir = `${prefix}${path.basename(s.dir)}`;
    for (const f of walk(s.dir)) {
      const file = path.join(s.dir, f);
      let text = fs.readFileSync(file, "utf8");
      if (f.endsWith(".md")) text = renderSkill(text, profile, path.relative(process.cwd(), file));
      if (f === "SKILL.md" && prefix) text = text.replace(/^(---\r?\n[\s\S]*?^name:\s*).*$/m, `$1${prefix}${s.name}`);
      files[path.join(dir, f)] = text;
    }
  }
  return files;
}

function writeFiles(dest: string, files: Record<string, string>) {
  for (const [rel, content] of Object.entries(files)) {
    const file = path.join(dest, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
}

/** Where `skills path` renders a profile: $XDG_CACHE_HOME/witness/skills/<profile>, else ~/.cache/... */
export function renderedDir(profile: Profile): string {
  const cache = process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache");
  return path.join(cache, "witness", "skills", profile);
}

/** Render `profile` into renderedDir(profile), replacing what an earlier render left there. */
export function renderToCache(src: string, profile: Profile): string {
  const out = renderedDir(profile);
  const files = renderSkillFiles(src, profile);
  fs.rmSync(out, { recursive: true, force: true });
  writeFiles(out, files);
  return out;
}

/** Install the skills rendered for `profile` into `dest` as `<prefix><name>`, or symlink the rendered standalone copies. */
export function installSkills(src: string, dest: string, o: { link: boolean; prefix: string; profile?: Profile; platform?: NodeJS.Platform }): { name: string; path: string }[] {
  const profile = o.profile ?? "standalone";
  if (o.link && profile !== "standalone") throw new Error(`--link installs the standalone skills only; copy the ${profile} profile instead`);
  const files = o.link ? {} : renderSkillFiles(src, profile, o.prefix);
  const linkFrom = o.link ? renderToCache(src, profile) : "";
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
    // never recurse into a link: through a Windows junction that would empty the rendered cache
    fs.rmSync(target, { recursive: !fs.lstatSync(target, { throwIfNoEntry: false })?.isSymbolicLink(), force: true });
    if (o.link) {
      linkDir(path.join(linkFrom, base), target, o.platform ?? process.platform);
      out.push({ name: s.name, path: target });
      continue;
    }
    fs.mkdirSync(target);
    fs.writeFileSync(path.join(target, MARKER), "");
    out.push({ name: `${o.prefix}${s.name}`, path: target });
  }
  writeFiles(dest, files);
  return out;
}

/** A directory symlink; on Windows a junction (no symlink rights needed), else a marked copy when even that fails (e.g. FAT). */
function linkDir(from: string, target: string, platform: NodeJS.Platform) {
  if (platform !== "win32") return fs.symlinkSync(from, target, "dir");
  try {
    fs.symlinkSync(from, target, "junction");
  } catch {
    fs.cpSync(from, target, { recursive: true });
    fs.writeFileSync(path.join(target, MARKER), "");
  }
}

const USAGE = "usage: witness skills path [--profile p] | list | install --dir <path> [--profile standalone|morph] [--link] [--prefix witness-]";

/** `witness skills path|list|install`. */
export function skillsCommand(sub: string | undefined, o: { dir?: string; link: boolean; prefix?: string; profile?: string; json: boolean; log: (s: string) => void }): number {
  const src = skillsDir();
  if (!src) {
    o.log("skills  can't find the skills folder next to this witness; set WITNESS_SKILLS_DIR");
    return 2;
  }
  const profile = o.profile ?? "standalone";
  if (!isProfile(profile)) {
    o.log(`skills  unknown --profile "${profile}"; profiles: ${PROFILES.join(", ")}`);
    return 64;
  }
  try {
    if (sub === "path") {
      const dir = renderToCache(src, profile);
      process.stdout.write(o.json ? JSON.stringify({ path: dir, profile, source: src }) + "\n" : `${dir}\n`);
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
      if (o.link && profile !== "standalone") {
        o.log(`skills  --link installs the standalone skills only; drop --link to copy the ${profile} profile`);
        return 64;
      }
      const prefix = o.prefix ?? "witness-";
      const done = installSkills(src, path.resolve(o.dir), { link: o.link, prefix, profile });
      for (const d of done) o.log(`skills  ${o.link ? "linked" : "installed"} ${d.name} (${profile}) -> ${d.path}`);
      if (o.link && prefix) o.log(`skills  note: linked skills keep their own names (${done.map((d) => d.name).join(", ")})`);
      if (o.json) process.stdout.write(JSON.stringify({ profile, installed: done }, null, 2) + "\n");
      return 0;
    }
  } catch (e) {
    if (!(e instanceof TemplateError)) throw e;
    o.log(`skills  ${e.message}`);
    return 2;
  }
  o.log(USAGE);
  return 64;
}
