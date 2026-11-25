#!/usr/bin/env node
// Runs the TypeScript sources when present (Node >= 22.18), else the bundle: bin/witness without bash, for Windows and npm.
import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

const dir = path.resolve(import.meta.dirname, "..");
const src = path.join(dir, "src", "cli.ts");
const useSrc = fs.existsSync(src) && fs.existsSync(path.join(dir, "node_modules")) && !process.env.WITNESS_USE_DIST;
// what --no-warnings does for bin/witness (Node 22 warns that type stripping is experimental)
process.removeAllListeners("warning");
await import(pathToFileURL(useSrc ? src : path.join(dir, "dist", "witness.mjs")).href);
