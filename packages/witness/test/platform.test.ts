import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, test } from "node:test";
import { parse } from "smol-toml";
import { ADAPTERS, nullDevice } from "../src/adapters.ts";
import { ConfigError, parseConfig, substitute } from "../src/config.ts";
import { childEnv, envGet, groupAlive, type Host, killGroup, resolveShell, ShellError, shellArgv, signalPid, useShell } from "../src/proc.ts";
import { onPath, playwrightCache } from "../src/scan.ts";
import { cmdq, posixq, shq } from "../src/util.ts";

const tmp = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "witness-platform-")));

/** A fake Windows (or POSIX) host: `files` exist, `live` pids are running, and every kill/taskkill is recorded. */
function fakeHost(o: { platform?: NodeJS.Platform; env?: NodeJS.ProcessEnv; files?: string[]; live?: number[]; polite?: boolean; stubborn?: boolean } = {}) {
  const live = new Set(o.live ?? []);
  const calls: string[] = [];
  const host: Host = {
    platform: o.platform ?? "win32",
    env: o.env ?? {},
    isFile: (p) => (o.files ?? []).some((f) => f.toLowerCase() === p.toLowerCase()),
    kill: (pid, sig) => {
      calls.push(`kill ${pid} ${sig}`);
      const id = Math.abs(pid);
      if (!live.has(id)) throw Object.assign(new Error("ESRCH"), { code: "ESRCH" });
      if (sig !== 0 && !o.stubborn) live.delete(id);
      if (sig === "SIGKILL") live.delete(id);
    },
    taskkill: (pid, force) => {
      calls.push(`taskkill ${pid}${force ? " /F" : ""}`);
      if (!live.has(pid)) return 128;
      if (force) {
        live.delete(pid);
        return 0;
      }
      if (!o.polite) return 1;
      if (!o.stubborn) live.delete(pid);
      return 0;
    },
  };
  return { host, calls, live };
}

describe("shell", () => {
  const GIT = "C:\\Program Files\\Git";
  test("macOS and Linux always use bash, whatever [run] shell says", () => {
    for (const pref of ["auto", "bash", "cmd"] as const) assert.deepEqual(resolveShell(pref, fakeHost({ platform: "linux" }).host), { kind: "bash", file: "bash" });
  });
  test("Windows: bash.exe on PATH wins, but not WSL's launcher in System32 or WindowsApps", () => {
    const env = { Path: `C:\\Windows\\System32;C:\\Users\\me\\AppData\\Local\\Microsoft\\WindowsApps;${GIT}\\bin`, SystemRoot: "C:\\Windows" };
    const files = ["C:\\Windows\\System32\\bash.exe", "C:\\Users\\me\\AppData\\Local\\Microsoft\\WindowsApps\\bash.exe", `${GIT}\\bin\\bash.exe`];
    assert.deepEqual(resolveShell("auto", fakeHost({ env, files }).host), { kind: "bash", file: `${GIT}\\bin\\bash.exe` });
    assert.equal(resolveShell("auto", fakeHost({ env, files: files.slice(0, 2) }).host).kind, "cmd", "WSL's bash alone does not count");
  });
  test("Windows: Git Bash next to git.exe on PATH, then Git's default install folder", () => {
    assert.equal(resolveShell("auto", fakeHost({ env: { PATH: `D:\\tools\\Git\\cmd` }, files: ["D:\\tools\\Git\\cmd\\git.exe", "D:\\tools\\Git\\bin\\bash.exe"] }).host).file, "D:\\tools\\Git\\bin\\bash.exe");
    assert.equal(resolveShell("auto", fakeHost({ env: { ProgramFiles: "C:\\Program Files" }, files: [`${GIT}\\bin\\bash.exe`] }).host).file, `${GIT}\\bin\\bash.exe`);
  });
  test("Windows: cmd.exe when there is no Git Bash or when asked for; shell = bash without one is an error", () => {
    assert.deepEqual(resolveShell("auto", fakeHost({ env: { ComSpec: "C:\\Windows\\system32\\cmd.exe" } }).host), { kind: "cmd", file: "C:\\Windows\\system32\\cmd.exe" });
    assert.equal(resolveShell("cmd", fakeHost({ env: { PATH: `${GIT}\\bin` }, files: [`${GIT}\\bin\\bash.exe`] }).host).kind, "cmd");
    assert.throws(() => resolveShell("bash", fakeHost().host), ShellError);
  });
  test("argv: bash -c, or cmd.exe /d /s /c with the command quoted verbatim", () => {
    assert.deepEqual(shellArgv({ kind: "bash", file: "bash" }, "echo $PORT"), { file: "bash", args: ["-c", "echo $PORT"] });
    assert.deepEqual(shellArgv({ kind: "cmd", file: "cmd.exe" }, 'dotnet test --filter "A|B"'), { file: "cmd.exe", args: ["/d", "/s", "/c", '"dotnet test --filter "A|B""'], windowsVerbatimArguments: true });
  });
  test("shq quotes for the shell in use", (t) => {
    t.after(() => useShell("auto", fakeHost({ platform: "darwin" }).host));
    useShell("cmd", fakeHost().host);
    assert.equal(shq("a b"), '"a b"');
    assert.equal(ADAPTERS.jest.selectArgs!(["jest:a.test.js > suite > it works"]), `-t "(suite it works)$"`);
    useShell("auto", fakeHost({ platform: "darwin" }).host);
    assert.equal(shq("a b"), "'a b'");
  });
  test("cmdq: plain words stay bare; quotes and trailing backslashes are escaped for the MSVC parser", () => {
    assert.equal(cmdq("C:\\a\\b.xml"), "C:\\a\\b.xml");
    assert.equal(cmdq("it's a test"), `"it's a test"`);
    assert.equal(cmdq('say "hi"'), '"say \\"hi\\""');
    assert.equal(cmdq("C:\\dir with space\\"), '"C:\\dir with space\\\\"');
    assert.equal(posixq("it's"), `'it'\\''s'`);
  });
  test("[run] shell is auto, bash or cmd", () => {
    const cfg = (run: string) => parseConfig(parse(`version = 1\n[run]\n${run}`) as Record<string, unknown>, "/repo/.witness/witness.toml");
    assert.equal(cfg("").run.shell, "auto");
    assert.equal(cfg('shell = "cmd"').run.shell, "cmd");
    assert.throws(() => cfg('shell = "pwsh"'), (e) => e instanceof ConfigError && /run\.shell/.test(e.message));
  });
});

describe("process trees", () => {
  test("Windows liveness checks the tree's root pid, not a negative group id", () => {
    const { host, calls } = fakeHost({ live: [42] });
    assert.equal(groupAlive(42, host), true);
    assert.deepEqual(calls, ["kill 42 0"]);
    assert.equal(groupAlive(43, host), false);
    const posix = fakeHost({ platform: "linux", live: [42] });
    assert.equal(groupAlive(42, posix.host), true);
    assert.deepEqual(posix.calls, ["kill -42 0"]);
  });
  test("Windows: a tree that closes politely is not forced", async () => {
    const { host, calls } = fakeHost({ live: [42], polite: true });
    assert.equal(await killGroup(42, 1000, host), "terminated");
    assert.deepEqual(calls.filter((c) => c.startsWith("taskkill")), ["taskkill 42"]);
  });
  test("Windows: console programs refuse a polite taskkill, so the tree is forced at once", async () => {
    const { host, calls } = fakeHost({ live: [42] });
    const t0 = Date.now();
    assert.equal(await killGroup(42, 5000, host), "terminated");
    assert.ok(Date.now() - t0 < 1000, "did not wait out the grace period");
    assert.deepEqual(calls.filter((c) => c.startsWith("taskkill")), ["taskkill 42", "taskkill 42 /F"]);
  });
  test("Windows: a tree that accepts the close but lingers is forced after the grace period", async () => {
    const { host, calls, live } = fakeHost({ live: [42], polite: true, stubborn: true });
    assert.equal(await killGroup(42, 300, host), "killed");
    assert.deepEqual(calls.filter((c) => c.startsWith("taskkill")), ["taskkill 42", "taskkill 42 /F"]);
    assert.equal(live.size, 0);
  });
  test("POSIX: SIGTERM to the group, then SIGKILL after the grace period", async () => {
    const { host, calls } = fakeHost({ platform: "linux", live: [42], stubborn: true });
    assert.equal(await killGroup(42, 300, host), "killed");
    assert.deepEqual(calls.filter((c) => !c.endsWith(" 0")), ["kill -42 SIGTERM", "kill -42 SIGKILL"]);
  });
  test("a pidfile daemon: one signal on POSIX, its whole tree on Windows", () => {
    const posix = fakeHost({ platform: "darwin", live: [7] });
    signalPid(7, false, posix.host);
    assert.deepEqual(posix.calls, ["kill 7 SIGTERM"]);
    const win = fakeHost({ live: [7] });
    signalPid(7, true, win.host);
    assert.deepEqual(win.calls, ["taskkill 7 /F"]);
  });
});

describe("environment", () => {
  test("Windows env names are case-insensitive: PATH finds Path, and a child gets one of them", () => {
    assert.equal(envGet({ Path: "C:\\bin" }, "PATH", "win32"), "C:\\bin");
    assert.equal(envGet({ Path: "C:\\bin" }, "PATH", "linux"), undefined);
    const win = childEnv({ Path: "C:\\bin", anthropic_api_key: "secret", HOME: "x" }, { PATH: "C:\\tools;C:\\bin" }, "win32");
    assert.deepEqual(win, { PATH: "C:\\tools;C:\\bin", HOME: "x" });
    const posix = childEnv({ Path: "a", ANTHROPIC_API_KEY: "s" }, { PATH: "b" }, "linux");
    assert.deepEqual(posix, { Path: "a", PATH: "b" });
  });
  test("Windows: witness's own folders are substituted with forward slashes; other values as they are", () => {
    const vars = { CHECKOUT: "C:\\repo", WITNESS_REPORT_DIR: "C:\\repo\\.witness\\runs\\r\\reports", OTHER: "C:\\x" };
    assert.equal(substitute("${CHECKOUT}/x --out=${WITNESS_REPORT_DIR} ${OTHER}", vars, "win32"), "C:/repo/x --out=C:/repo/.witness/runs/r/reports C:\\x");
    assert.equal(substitute("${CHECKOUT}", vars, "darwin"), "C:\\repo");
  });
  test("the rspec probe writes to a null device each shell understands", () => {
    assert.equal(nullDevice("win32"), "NUL");
    assert.equal(nullDevice("linux"), "/dev/null");
  });
  test("Windows: tools are found through PATHEXT and a `Path` variable; the Playwright cache is under LOCALAPPDATA", () => {
    const bin = tmp();
    fs.writeFileSync(path.join(bin, "node.CMD"), "@echo off\r\n");
    assert.equal(onPath("node", { Path: bin, PATHEXT: ".COM;.EXE;.CMD" }, "win32"), path.join(bin, "node.CMD"));
    assert.equal(onPath("node", { Path: bin }, "linux"), undefined);
    assert.equal(playwrightCache({ LOCALAPPDATA: "L", USERPROFILE: "U", HOME: "H" }, "win32"), path.join("L", "ms-playwright"));
    assert.equal(playwrightCache({ USERPROFILE: "U", HOME: "/c/Users/u" }, "win32"), path.join("U", "AppData", "Local", "ms-playwright"));
  });
});
