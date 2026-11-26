import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
const script = "echo hello; exit 3";
const enc = Buffer.from(script, "utf16le").toString("base64");
fs.writeFileSync("probe.ps1", script);
const run = (label, file, args, o = {}) =>
  new Promise((res) => {
    const c = spawn(file, args, { detached: true, stdio: ["ignore", "pipe", "pipe"], windowsHide: true, ...o });
    let out = "";
    c.stdout.on("data", (d) => (out += d));
    c.stderr.on("data", (d) => (out += d));
    c.on("close", (code) => res(console.log(JSON.stringify({ label, code, out: out.trim().slice(0, 120) }))));
  });
await run("pwsh -Command, no -NonInteractive", "pwsh", ["-NoProfile", "-Command", script]);
await run("pwsh -NoLogo -NonInteractive -Command", "pwsh", ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script]);
await run("pwsh -File", "pwsh", ["-NoProfile", "-NonInteractive", "-File", "probe.ps1"]);
await run("cmd trampoline pwsh", process.env.ComSpec, ["/d", "/s", "/c", `"pwsh -NoProfile -NonInteractive -EncodedCommand ${enc}"`], { windowsVerbatimArguments: true });
await run("cmd trampoline powershell", process.env.ComSpec, ["/d", "/s", "/c", `"powershell -NoProfile -NonInteractive -Command echo hello; exit 3"`], { windowsVerbatimArguments: true });
await run("powershell -OutputFormat Text -EncodedCommand (attached)", "powershell", ["-NoProfile", "-NonInteractive", "-OutputFormat", "Text", "-EncodedCommand", enc], { detached: false });
await run("powershell -EncodedCommand ProgressPreference env (attached)", "powershell", ["-NoProfile", "-NonInteractive", "-EncodedCommand", enc], { detached: false, env: { ...process.env, PSModuleAutoLoadingPreference: "None" } });
// does an attached child outlive node? (libuv puts it in a kill-on-close job)
fs.rmSync("alive.txt", { force: true });
spawnSync(process.execPath, ["-e", `require("child_process").spawn("pwsh", ["-NoProfile", "-Command", "Start-Sleep 4; Set-Content alive.txt x"], { stdio: "ignore", windowsHide: true }); setTimeout(() => process.exit(0), 1500)`]);
await new Promise((r) => setTimeout(r, 8000));
console.log(JSON.stringify({ label: "attached child outlives node", alive: fs.existsSync("alive.txt") }));
