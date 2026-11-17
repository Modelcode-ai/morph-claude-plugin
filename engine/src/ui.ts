import * as fs from "node:fs";
import * as path from "node:path";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

/** One checkpoint a UI test captured: a screenshot and/or the visible text, named `NN-name`. */
export interface Checkpoint {
  name: string;
  png?: string;
  txt?: string;
  /** Traces, videos and other files the test left for this checkpoint's test. */
}

export interface TestArtifacts {
  checkpoints: Checkpoint[];
  /** Other evidence files (trace.zip, video.webm), kept for the full release viewer. */
  files: string[];
}

export interface ScreenCompare {
  test: string;
  name: string;
  head?: string;
  origin?: string;
  diff?: string;
  /** Share of pixels that differ, 0..1. */
  ratio?: number;
  size?: string;
  textChanges: { origin: string; target: string }[];
  status: "same" | "text" | "visual" | "missing";
}

/** Read `<dir>/<testId>/*` written by the per-framework witness helper. */
export function collectArtifacts(dir: string): Record<string, TestArtifacts> {
  const out: Record<string, TestArtifacts> = {};
  if (!fs.existsSync(dir)) return out;
  for (const t of fs.readdirSync(dir)) {
    const td = path.join(dir, t);
    if (!fs.statSync(td).isDirectory()) continue;
    const id = decodeURIComponent(t);
    const cps = new Map<string, Checkpoint>();
    const files: string[] = [];
    for (const f of fs.readdirSync(td).sort()) {
      const abs = path.join(td, f);
      const m = /^(.+)\.(png|txt)$/.exec(f);
      if (m) {
        const cp = cps.get(m[1]) ?? { name: m[1] };
        cp[m[2] as "png" | "txt"] = abs;
        cps.set(m[1], cp);
      } else files.push(abs);
    }
    out[id] = { checkpoints: [...cps.values()], files };
  }
  return out;
}

/** Copy artifacts under `dest`, returning the same structure with new paths. */
export function copyArtifacts(a: Record<string, TestArtifacts>, dest: string, relTo?: string): Record<string, TestArtifacts> {
  const out: Record<string, TestArtifacts> = {};
  const cp = (src: string, t: string) => {
    const d = path.join(dest, encodeURIComponent(t).replace(/%/g, "_"), path.basename(src));
    fs.mkdirSync(path.dirname(d), { recursive: true });
    if (path.resolve(src) !== path.resolve(d)) fs.copyFileSync(src, d);
    return relTo ? path.relative(relTo, d) : d;
  };
  for (const [t, v] of Object.entries(a)) {
    out[t] = {
      checkpoints: v.checkpoints.map((c) => ({ name: c.name, png: c.png && cp(c.png, t), txt: c.txt && cp(c.txt, t) })),
      files: v.files.map((f) => cp(f, t)),
    };
  }
  return out;
}

function textLines(file: string | undefined, ignore: RegExp[]): string[] {
  if (!file || !fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .map((l) => ignore.reduce((s, r) => s.replace(r, "…"), l.trim()))
    .filter(Boolean);
}

/** Compare one test's checkpoints between origin and target: pixels (pixelmatch) and visible text. */
export function compareScreens(
  test: string,
  origin: TestArtifacts | undefined,
  target: TestArtifacts | undefined,
  opts: { outDir: string; threshold: number; ignoreText: string[] },
): ScreenCompare[] {
  const ignore = opts.ignoreText.map((p) => new RegExp(p, "g"));
  const names = [...new Set([...(origin?.checkpoints ?? []), ...(target?.checkpoints ?? [])].map((c) => c.name))];
  return names.map((name) => {
    const o = origin?.checkpoints.find((c) => c.name === name);
    const t = target?.checkpoints.find((c) => c.name === name);
    const res: ScreenCompare = { test, name, head: t?.png, origin: o?.png, textChanges: [], status: "same" };
    if (!o || !t) {
      res.status = "missing";
      return res;
    }
    const ol = textLines(o.txt, ignore);
    const tl = textLines(t.txt, ignore);
    const removed = ol.filter((l) => !tl.includes(l));
    const added = tl.filter((l) => !ol.includes(l));
    for (let i = 0; i < Math.max(removed.length, added.length) && i < 20; i++) res.textChanges.push({ origin: removed[i] ?? "", target: added[i] ?? "" });
    if (o.png && t.png && fs.existsSync(o.png) && fs.existsSync(t.png)) {
      const a = PNG.sync.read(fs.readFileSync(o.png));
      const b = PNG.sync.read(fs.readFileSync(t.png));
      const w = Math.max(a.width, b.width);
      const h = Math.max(a.height, b.height);
      const pad = (img: PNG) => {
        if (img.width === w && img.height === h) return img;
        const p = new PNG({ width: w, height: h });
        p.data.fill(255);
        PNG.bitblt(img, p, 0, 0, img.width, img.height, 0, 0);
        return p;
      };
      const diff = new PNG({ width: w, height: h });
      const n = pixelmatch(pad(a).data, pad(b).data, diff.data, w, h, { threshold: 0.1, alpha: 0.25, diffColor: [220, 40, 40] });
      res.ratio = n / (w * h);
      res.size = a.width === b.width && a.height === b.height ? `${w}×${h}` : `${a.width}×${a.height} → ${b.width}×${b.height}`;
      if (n > 0) {
        const f = path.join(opts.outDir, encodeURIComponent(test).replace(/%/g, "_"), `${name}.diff.png`);
        fs.mkdirSync(path.dirname(f), { recursive: true });
        fs.writeFileSync(f, PNG.sync.write(diff));
        res.diff = f;
      }
    }
    res.status = res.textChanges.length ? "text" : (res.ratio ?? 0) > opts.threshold ? "visual" : "same";
    return res;
  });
}
