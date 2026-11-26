import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, test } from "node:test";
import { parse } from "smol-toml";
import { ADAPTERS, nullDevice } from "../src/adapters.ts";
import { ConfigError, parseConfig, substitute } from "../src/config.ts";
import { childEnv, directArgv, envGet, groupAlive, type Host, isPowerShell, killGroup, pidFromFile, psScript, resolveShell, ShellError, shellArgv, signalPid, useShell } from "../src/proc.ts";
import { resolveRun, RunDir } from "../src/rundir.ts";
import { onPath, playwrightCache } from "../src/scan.ts";
import { installSkills } from "../src/skills.ts";
import { suiteCommand } from "../src/suite.ts";
import { cmdq, posixq, pwshq, shq } from "../src/util.ts";
import { PKG } from "./helpers.ts";

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
  const PWSH = "C:\\Program Files\\PowerShell\\7\\pwsh.exe";
  const WINPS = "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
  test("macOS and Linux use bash, and pwsh only when asked for and on PATH", () => {
    for (const pref of ["auto", "bash", "cmd", "powershell"] as const) assert.deepEqual(resolveShell(pref, fakeHost({ platform: "linux" }).host), { kind: "bash", file: "bash" });
    assert.deepEqual(resolveShell("pwsh", fakeHost({ platform: "darwin", env: { PATH: "/usr/bin:/opt/homebrew/bin" }, files: ["/opt/homebrew/bin/pwsh"] }).host), { kind: "pwsh", file: "pwsh" });
    assert.throws(() => resolveShell("pwsh", fakeHost({ platform: "linux", env: { PATH: "/usr/bin" } }).host), ShellError);
  });
  test("Windows auto: pwsh on PATH or in its install folder, then Windows PowerShell, then cmd.exe; never bash", () => {
    const bash = { PATH: `${GIT}\\bin`, SystemRoot: "C:\\Windows", ProgramFiles: "C:\\Program Files" };
    assert.deepEqual(resolveShell("auto", fakeHost({ env: { ...bash, PATH: `D:\\ps;${GIT}\\bin` }, files: ["D:\\ps\\pwsh.exe", `${GIT}\\bin\\bash.exe`, WINPS] }).host), { kind: "pwsh", file: "D:\\ps\\pwsh.exe" });
    assert.deepEqual(resolveShell("auto", fakeHost({ env: bash, files: [PWSH, `${GIT}\\bin\\bash.exe`] }).host), { kind: "pwsh", file: PWSH });
    assert.deepEqual(resolveShell("auto", fakeHost({ env: bash, files: [WINPS, `${GIT}\\bin\\bash.exe`] }).host), { kind: "powershell", file: WINPS });
    assert.deepEqual(resolveShell("auto", fakeHost({ env: { ...bash, ComSpec: "C:\\Windows\\system32\\cmd.exe" }, files: [`${GIT}\\bin\\bash.exe`] }).host), { kind: "cmd", file: "C:\\Windows\\system32\\cmd.exe" });
  });
  test("Windows: an explicit shell that isn't there is an error, not a fallback", () => {
    assert.throws(() => resolveShell("pwsh", fakeHost({ env: { SystemRoot: "C:\\Windows" }, files: [WINPS] }).host), ShellError);
    assert.throws(() => resolveShell("powershell", fakeHost().host), ShellError);
    assert.throws(() => resolveShell("bash", fakeHost().host), ShellError);
    assert.equal(resolveShell("powershell", fakeHost({ env: { SystemRoot: "C:\\Windows" }, files: [PWSH, WINPS] }).host).kind, "powershell");
    assert.equal(resolveShell("cmd", fakeHost({ files: [PWSH] }).host).kind, "cmd");
  });
  test("Windows bash: bash.exe on PATH wins, but not WSL's launcher in System32 or WindowsApps", () => {
    const env = { Path: `C:\\Windows\\System32;C:\\Users\\me\\AppData\\Local\\Microsoft\\WindowsApps;${GIT}\\bin`, SystemRoot: "C:\\Windows" };
    const files = ["C:\\Windows\\System32\\bash.exe", "C:\\Users\\me\\AppData\\Local\\Microsoft\\WindowsApps\\bash.exe", `${GIT}\\bin\\bash.exe`];
    assert.deepEqual(resolveShell("bash", fakeHost({ env, files }).host), { kind: "bash", file: `${GIT}\\bin\\bash.exe` });
    assert.throws(() => resolveShell("bash", fakeHost({ env, files: files.slice(0, 2) }).host), ShellError, "WSL's bash alone does not count");
  });
  test("Windows bash: Git Bash next to git.exe on PATH, then Git's default install folder", () => {
    assert.equal(resolveShell("bash", fakeHost({ env: { PATH: `D:\\tools\\Git\\cmd` }, files: ["D:\\tools\\Git\\cmd\\git.exe", "D:\\tools\\Git\\bin\\bash.exe"] }).host).file, "D:\\tools\\Git\\bin\\bash.exe");
    assert.equal(resolveShell("bash", fakeHost({ env: { ProgramFiles: "C:\\Program Files" }, files: [`${GIT}\\bin\\bash.exe`] }).host).file, `${GIT}\\bin\\bash.exe`);
  });
  test("argv: bash -c, cmd.exe /d /s /c with the command quoted verbatim, PowerShell an encoded script", () => {
    assert.deepEqual(shellArgv({ kind: "bash", file: "bash" }, "echo $PORT"), { file: "bash", args: ["-c", "echo $PORT"] });
    assert.deepEqual(shellArgv({ kind: "cmd", file: "cmd.exe" }, 'dotnet test --filter "A|B"'), { file: "cmd.exe", args: ["/d", "/s", "/c", '"dotnet test --filter "A|B""'], windowsVerbatimArguments: true });
    const ps = shellArgv({ kind: "pwsh", file: "pwsh.exe" }, "npx playwright test");
    assert.deepEqual(ps.args.slice(0, 5), ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand"]);
    assert.equal(Buffer.from(ps.args[5], "base64").toString("utf16le"), psScript("npx playwright test"));
    assert.match(psScript("x"), /\$ErrorActionPreference = 'Stop'[\s\S]*\nx\n[\s\S]*exit \$LASTEXITCODE$/);
  });
  test("Windows PowerShell: a plain command whose program is an .exe starts directly; anything else goes through the shell", () => {
    const env = { PATH: "C:\\nodejs;C:\\dotnet", PATHEXT: ".COM;.EXE;.BAT;.CMD" };
    const { host } = fakeHost({ files: ["C:\\dotnet\\dotnet.exe", "C:\\nodejs\\npx.cmd", "C:\\nodejs\\npx.ps1", "C:\\repo\\.venv\\Scripts\\pytest.exe", "C:\\nodejs\\dotnet.cmd"] });
    assert.equal(directArgv("dotnet test --project A.csproj", "C:\\repo", { ...env, PATH: "C:\\dotnet" }, host)?.file, "C:\\dotnet\\dotnet.exe");
    assert.deepEqual(directArgv(".venv/Scripts/pytest --junitxml=C:/r/x.xml", "C:\\repo", env, host), { file: "C:\\repo\\.venv\\Scripts\\pytest.exe", args: ["--junitxml=C:/r/x.xml"] });
    assert.equal(directArgv("npx playwright test", "C:\\repo", env, host), null, "npx.ps1/npx.cmd need a shell");
    assert.equal(directArgv("dotnet test", "C:\\repo", env, host), null, "the dotnet.cmd found first is what PowerShell would run");
    assert.equal(directArgv("dotnet test --filter 'A|B'", "C:\\repo", { ...env, PATH: "C:\\dotnet" }, host), null);
    assert.equal(directArgv("$env:X=1; dotnet test", "C:\\repo", env, host), null);
    assert.equal(directArgv("dotnet test", "/repo", { PATH: "C:\\dotnet" }, fakeHost({ platform: "linux", files: ["C:\\dotnet\\dotnet.exe"] }).host), null);
  });
  test("pwshq: plain words stay bare; the rest single-quoted, with \" escaped for legacy argument passing", () => {
    assert.equal(pwshq("C:/a/b.xml"), "C:/a/b.xml");
    assert.equal(pwshq("--junitxml=C:\\r\\x.xml"), "--junitxml=C:\\r\\x.xml");
    assert.equal(pwshq("-Dtest=A#b"), "'-Dtest=A#b'");
    assert.equal(pwshq("-Dfoo.bar=1"), "'-Dfoo.bar=1'");
    assert.equal(pwshq("it\u2019s Bob's"), "'it\u2019\u2019s Bob''s'");
    assert.equal(pwshq('say "hi" $HOME @x a,b'), `'say \\"hi\\" $HOME @x a,b'`);
  });
  test("shq quotes for the shell in use, and a suite's own shell quotes its command", (t) => {
    t.after(() => useShell("auto", fakeHost({ platform: "darwin" }).host));
    useShell("cmd", fakeHost().host);
    assert.equal(shq("a b"), '"a b"');
    assert.equal(ADAPTERS.jest.selectArgs!(["jest:a.test.js > suite > it works"]), `-t "(suite it works)$"`);
    useShell("auto", fakeHost({ platform: "darwin" }).host);
    assert.equal(shq("a b"), "'a b'");
    useShell("auto", fakeHost({ env: { ProgramFiles: "C:\\Program Files" }, files: [PWSH] }).host);
    const suite = { name: "e2e", kind: "api", adapter: "jest", cwd: ".", cmd: "npx jest", timeoutMs: 1, env: {} } as const;
    assert.equal(suiteCommand({ ...suite }, ADAPTERS.jest, {}, "C:/r", ["jest:a.test.js > it's"]).split(" -t ")[1].split(" ")[0], "'(it''s)$'");
    assert.match(suiteCommand({ ...suite, shell: "cmd" }, ADAPTERS.jest, {}, "C:/r", ["jest:a.test.js > it's"]), / -t "\(it's\)\$" /);
    assert.equal(shq("a b"), "'a b'", "the suite's shell applied only while its command was built");
  });
  test("cmdq: plain words stay bare; quotes and trailing backslashes are escaped for the MSVC parser", () => {
    assert.equal(cmdq("C:\\a\\b.xml"), "C:\\a\\b.xml");
    assert.equal(cmdq("it's a test"), `"it's a test"`);
    assert.equal(cmdq('say "hi"'), '"say \\"hi\\""');
    assert.equal(cmdq("C:\\dir with space\\"), '"C:\\dir with space\\\\"');
    assert.equal(posixq("it's"), `'it'\\''s'`);
  });
  test("shell is set in [run], or per dependency, service and suite; a listed repo's commands keep its own [run] shell", () => {
    const cfg = (toml: string) => parseConfig(parse(`version = 1\n${toml}`) as Record<string, unknown>, "/repo/.witness/witness.toml");
    assert.equal(cfg("").run.shell, "auto");
    for (const v of ["bash", "pwsh", "powershell", "cmd"]) assert.equal(cfg(`[run]\nshell = "${v}"`).run.shell, v);
    assert.throws(() => cfg('[run]\nshell = "zsh"'), (e) => e instanceof ConfigError && /^run\.shell: expected "auto", "bash", "pwsh", "powershell", "cmd"/.test(e.message));
    const c = cfg('[[dependency]]\nname = "db"\ncheck = "x"\nshell = "cmd"\n[[service]]\nname = "api"\nstart = "x"\nready = { cmd = "x" }\nshell = "bash"\n[[suite]]\nname = "e2e"\nkind = "api"\ncmd = "x"\nshell = "powershell"\n');
    assert.deepEqual([c.dependencies[0].shell, c.services[0].shell, c.suites[0].shell], ["cmd", "bash", "powershell"]);
    assert.throws(() => cfg('[[suite]]\nname = "e2e"\nkind = "api"\ncmd = "x"\nshell = "sh"\n'), (e) => e instanceof ConfigError && /^suite\.e2e\.shell:/.test(e.message));
    const root = tmp();
    fs.mkdirSync(path.join(root, "back", ".witness"), { recursive: true });
    fs.writeFileSync(path.join(root, "back", ".witness", "witness.toml"), 'version = 1\n[[service]]\nname = "api"\nstart = "x"\nready = { cmd = "x" }\n[[suite]]\nname = "e2e"\nkind = "api"\ncmd = "x"\n[run]\nshell = "bash"\n');
    fs.mkdirSync(path.join(root, "front", ".witness"), { recursive: true });
    const front = parseConfig(parse('version = 1\n[[repo]]\nname = "back"\npath = "../back"\nsuites = ["e2e"]\n[run]\nshell = "pwsh"\n') as Record<string, unknown>, path.join(root, "front", ".witness", "witness.toml"));
    assert.deepEqual([front.services[0].shell, front.suites[0].shell, front.run.shell], ["bash", "bash", "pwsh"]);
  });
  test("a pidfile written by Windows PowerShell's > (UTF-16 with a BOM) still reads", () => {
    const f = path.join(tmp(), "svc.pid");
    fs.writeFileSync(f, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("4242\r\n", "utf16le")]));
    assert.equal(pidFromFile(f), 4242);
    fs.writeFileSync(f, "\uFEFF77\n");
    assert.equal(pidFromFile(f), 77);
  });
});

/** The PowerShells on this machine: pwsh when installed, and Windows PowerShell 5.1 on Windows. */
const powerShells = (["pwsh", "powershell"] as const).flatMap((pref) => {
  try {
    const sh = resolveShell(pref);
    return isPowerShell(sh) ? [sh] : [];
  } catch {
    return [];
  }
});

describe("PowerShell, run for real", { skip: !powerShells.length && "no PowerShell on this machine" }, () => {
  const ARGS = path.join(PKG, "testdata", "apps", "args.mjs");
  const node = `& ${pwshq(process.execPath)}`;
  for (const sh of powerShells) {
    const run = (cmd: string) => {
      const a = shellArgv(sh, cmd);
      const r = spawnSync(a.file, a.args, { encoding: "utf8", windowsHide: true, timeout: 60_000 });
      return { code: r.status, out: r.stdout, err: r.stderr };
    };
    test(`${sh.kind}: a failing cmdlet stops the command, as bash -e would`, () => {
      const r = run("Get-Item ./no-such-file; echo after");
      assert.notEqual(r.code, 0);
      assert.doesNotMatch(r.out, /after/);
      assert.match(r.err, /no-such-file/);
    });
    test(`${sh.kind}: a native command's exit code is the command's`, () => {
      assert.equal(run(`${node} -e "process.exit(3)"`).code, 3);
      assert.equal(run(`${node} -e "process.exit(3)"; echo after`).code, 3);
      assert.equal(run("exit 7").code, 7);
      assert.equal(run(`${node} -e "process.exit(0)"`).code, 0);
    });
    test(`${sh.kind}: a native command writing to stderr is not an error`, () => {
      const r = run(`${node} -e "console.error('a warning'); console.log('done')"`);
      assert.equal(r.code, 0, r.err);
      assert.match(r.err, /a warning/);
      assert.match(r.out, /done/);
    });
    test(`${sh.kind}: a command that isn't there exits 127, as in bash`, () => {
      assert.equal(run("no-such-command-xyz --version").code, 127);
    });
    test(`${sh.kind}: output is UTF-8`, () => {
      assert.match(run(`${node} -e "console.log('caf\\u00e9 \\u2713')"`).out, /café ✓/);
      assert.match(run("Write-Output 'caf\u00e9 \u2713'").out, /café ✓/);
    });
    test(`${sh.kind}: words quoted by shq reach the program unchanged`, () => {
      const words = ["a b", 'say "hi"', "it's", "-Dfoo.bar=1", "-Djunit.jupiter.execution.timeout.default=3 s", "(a|b)$", "C:/x y/z", "Kit\\ItemsTest#a", "$HOME", "`tick", "50%", "a,b", "@x", "{x}", "it\u2019s", "^(TestA|TestB)$"];
      const r = run(`${node} ${pwshq(ARGS)} ${words.map(pwshq).join(" ")}`);
      assert.equal(r.code, 0, r.err);
      assert.deepEqual(JSON.parse(r.out), words);
    });
  }
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

describe("links", () => {
  const run = (root: string) => new RunDir(root, `r-20260101-000000-${Math.random().toString(16).slice(2, 6)}`, { commit: "", branch: "", dirty: false });
  test("latest: a relative symlink on POSIX, a link to the absolute run folder on Windows; both resolve", () => {
    const root = tmp();
    const a = run(root);
    a.linkLatest("darwin");
    if (process.platform !== "win32") assert.equal(fs.readlinkSync(path.join(root, "latest")), a.runId);
    assert.equal(resolveRun(root, "latest"), a.dir);
    const b = run(root);
    b.linkLatest("win32");
    assert.equal(fs.realpathSync(path.join(root, "latest")), fs.realpathSync(b.dir));
    assert.equal(resolveRun(root, undefined), b.dir);
    assert.ok(fs.existsSync(path.join(root, "latest", "status.json")), "latest/status.json works, as the skills say");
  });
  test("latest: a pointer file holding the run id also resolves", () => {
    const root = tmp();
    const a = run(root);
    fs.writeFileSync(path.join(root, "latest"), `${a.runId}\r\n`);
    assert.equal(resolveRun(root, "latest"), a.dir);
  });
  test("skills install --link on Windows links each skill by its absolute path (a junction there)", (t) => {
    const cache = tmp();
    const prev = process.env.XDG_CACHE_HOME;
    process.env.XDG_CACHE_HOME = cache;
    t.after(() => (prev === undefined ? delete process.env.XDG_CACHE_HOME : (process.env.XDG_CACHE_HOME = prev)));
    const dest = tmp();
    installSkills(path.join(PKG, "skills"), dest, { link: true, prefix: "", platform: "win32" });
    installSkills(path.join(PKG, "skills"), dest, { link: true, prefix: "", platform: "win32" });
    const target = fs.readlinkSync(path.join(dest, "plan"));
    assert.ok(path.isAbsolute(target), target);
    assert.ok(fs.existsSync(path.join(cache, "witness", "skills", "standalone", "plan", "SKILL.md")), "reinstalling did not empty the rendered cache through the link");
  });
});
