import { spawn } from "node:child_process";
const script = "echo hello; exit 3";
const enc = Buffer.from(script, "utf16le").toString("base64");
for (const exe of ["pwsh", "powershell"]) for (const detached of [true, false]) for (const stdin of ["ignore", "pipe"]) for (const mode of ["enc", "cmd"]) {
  const args = ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", ...(mode === "enc" ? ["-EncodedCommand", enc] : ["-Command", script])];
  const r = await new Promise((res) => {
    const c = spawn(exe, args, { detached, stdio: [stdin, "pipe", "pipe"], windowsHide: true });
    let out = "";
    c.stdout.on("data", (d) => (out += d));
    c.stderr.on("data", (d) => (out += d));
    c.on("close", (code) => res({ code, out: out.trim().slice(0, 200) }));
  });
  console.log(JSON.stringify({ exe, detached, stdin, mode, ...r }));
}
