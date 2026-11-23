#!/usr/bin/env node
// Renders skills/<name> (standalone profile) into the morph plugin as plugins/morph/skills/witness-<name>; the output is committed.
import * as fs from "node:fs";
import * as path from "node:path";
import { renderSkillFiles } from "../src/skills.ts";

const PKG = path.resolve(import.meta.dirname, "..");
export const PLUGIN_SKILLS = path.resolve(PKG, "..", "..", "plugins", "morph", "skills");
export const PREFIX = "witness-";

export function pluginFiles(pkgDir = PKG): Record<string, string> {
  return renderSkillFiles(path.join(pkgDir, "skills"), "standalone", PREFIX);
}

export function generatedDirs(out = PLUGIN_SKILLS): string[] {
  if (!fs.existsSync(out)) return [];
  return fs.readdirSync(out).filter((d) => d.startsWith(PREFIX));
}

export function buildPlugin(out = PLUGIN_SKILLS, pkgDir = PKG) {
  for (const d of generatedDirs(out)) fs.rmSync(path.join(out, d), { recursive: true, force: true });
  for (const [rel, content] of Object.entries(pluginFiles(pkgDir))) {
    fs.mkdirSync(path.dirname(path.join(out, rel)), { recursive: true });
    fs.writeFileSync(path.join(out, rel), content);
  }
  return out;
}

const self = process.argv[1] ? fs.realpathSync(process.argv[1]) : "";
if (self.endsWith("build-plugin.ts")) process.stderr.write(`wrote ${path.relative(process.cwd(), buildPlugin()) || "."}\n`);
