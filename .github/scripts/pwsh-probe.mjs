import { spawn } from "node:child_process";
import fs from "node:fs";
const script = "echo hello; [Console]::Error.WriteLine('err'); exit 3";
const enc = Buffer.from(script, "utf16le").toString("base64");
const helper = `const c = require("child_process").spawn("pwsh", ["-NoProfile", "-NonInteractive", "-EncodedCommand", "${enc}"], { stdio: "inherit", windowsHide: true }); c.on("exit", (code) => process.exit(code ?? 1));`;
const run = (label, file, args, o = {}) =>
  new Promise((res) => {
    const c = spawn(file, args, { detached: true, stdio: ["ignore", "pipe", "pipe"], windowsHide: true, ...o });
    let out = "";
    c.stdout.on("data", (d) => (out += d));
    c.stderr.on("data", (d) => (out += d));
    c.on("close", (code) => res(console.log(JSON.stringify({ label, code, out: out.trim().slice(0, 120) }))));
  });
await run("detached node helper, attached pwsh, pipes", process.execPath, ["-e", helper]);
const fd = fs.openSync("probe.log", "w+");
await new Promise((res) => spawn(process.execPath, ["-e", helper], { detached: true, stdio: ["ignore", fd, fd], windowsHide: true }).on("exit", (code) => res(console.log(JSON.stringify({ label: "detached node helper, attached pwsh, log file", code, out: fs.readFileSync("probe.log", "utf8").trim() })))));
await run("powershell -Command quoting", "powershell", ["-NoProfile", "-NonInteractive", "-Command", `echo "a ""b"" c" 'd "e"'; exit 4`], { detached: false });
