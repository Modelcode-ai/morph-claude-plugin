// Starts server.mjs in its own process group (like a real daemon), writes its pid to argv[2], and exits.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const child = spawn(process.execPath, [path.join(import.meta.dirname, "server.mjs"), "ok"], { detached: true, stdio: "ignore", env: process.env });
fs.writeFileSync(process.argv[2], String(child.pid));
child.unref();
