import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, test } from "node:test";
import { ConfigError, loadConfig, loadEnv } from "../src/config.ts";
import { parseAgainst } from "../src/repos.ts";
import { PKG, readJson, witness } from "./helpers.ts";

const FIXTURE = path.join(PKG, "testdata", "multirepo");

/** Folders `name -> witness.toml` (null: no config) side by side in a fresh temp dir. */
function repos(files: Record<string, string | null>): string {
  const top = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "witness-repos-")));
  for (const [name, toml] of Object.entries(files)) {
    fs.mkdirSync(path.join(top, name, ".witness"), { recursive: true });
    if (toml !== null) fs.writeFileSync(path.join(top, name, ".witness", "witness.toml"), `version = 1\n${toml}`);
  }
  return top;
}

const load = (top: string, name: string) => loadConfig(path.join(top, name, ".witness", "witness.toml"));
const fails = (top: string, name: string, re: RegExp) => assert.throws(() => load(top, name), (e: Error) => e instanceof ConfigError && re.test(e.message), `expected ${re}`);

const svc = (name: string, extra = "") => `[[service]]\nname = "${name}"\nstart = "run ${name}"\nready = { cmd = "true" }\n${extra}\n`;

describe("[[repo]] config", () => {
  test("the listed repo's services come in as <repo>.<name>, with their references, folder and [[repo]] env", () => {
    const top = path.join(fs.realpathSync(os.tmpdir()), `witness-fixture-${process.pid}`);
    fs.cpSync(FIXTURE, top, { recursive: true });
    const cfg = load(top, "frontend");
    assert.deepEqual(cfg.services.map((s) => s.name), ["web", "backend.store", "backend.api"]);
    const api = cfg.services.find((s) => s.name === "backend.api")!;
    assert.equal(api.repo, "backend");
    assert.equal(api.local, "api");
    assert.equal(api.root, path.join(top, "backend"));
    assert.deepEqual(api.dependsOn, ["backend.store"]);
    assert.deepEqual(api.env, { STORE_URL: "${backend.store.url}", GREETING_NAME: "witness" });
    const suite = cfg.suites.find((s) => s.name === "backend.api")!;
    assert.deepEqual(suite.services, ["backend.api"]);
    assert.equal(suite.root, path.join(top, "backend"));
    assert.deepEqual(cfg.repos.map((r) => [r.name, r.path, r.root]), [["backend", "../backend", path.join(top, "backend")]]);
    assert.equal(cfg.repos[0].envFile, path.join(top, "backend", ".witness", ".env"));
    fs.rmSync(top, { recursive: true, force: true });
  });

  test("services picks what to take; their dependencies come along; suites default to none", () => {
    const top = repos({
      a: `[[repo]]\nname = "b"\npath = "../b"\nservices = ["api"]\n${svc("web", 'depends_on = ["b.api"]\nenv = { API = "${b.api.url}" }')}`,
      b: `[[dependency]]\nname = "pg"\ncheck = "true"\n${svc("db")}${svc("api", 'depends_on = ["db"]\nenv = { DB = "${db.url}", SELF = "${self.url}" }')}${svc("admin")}[[suite]]\nname = "api"\nkind = "api"\ncmd = "x"\n`,
    });
    const cfg = load(top, "a");
    assert.deepEqual(cfg.services.map((s) => s.name), ["web", "b.db", "b.api"]);
    assert.deepEqual(cfg.services.find((s) => s.name === "b.api")!.env, { DB: "${b.db.url}", SELF: "${self.url}" });
    assert.deepEqual(cfg.dependencies.map((d) => [d.name, d.root]), [["b.pg", path.join(top, "b")]]);
    assert.deepEqual(cfg.suites, []);
  });

  test("a repo listed by a listed repo comes along under its own name; suites can live in any listed repo", () => {
    const top = repos({
      a: `[[repo]]\nname = "b"\npath = "../b"\nsuites = ["e2e"]\n[[suite]]\nname = "c-smoke"\nkind = "api"\nrepo = "c"\ncmd = "x"\n`,
      b: `[[repo]]\nname = "c"\npath = "../c"\n${svc("web", 'depends_on = ["c.api"]\nenv = { API = "${c.api.url}" }')}[[suite]]\nname = "e2e"\nkind = "ui"\ncmd = "x"\n`,
      c: `[env]\nrequired = ["C_TOKEN"]\n${svc("api")}`,
    });
    const cfg = load(top, "a");
    assert.deepEqual(cfg.services.map((s) => s.name), ["c.api", "b.web"]);
    assert.deepEqual(cfg.services.find((s) => s.name === "b.web")!.env, { API: "${c.api.url}" });
    assert.deepEqual(cfg.repos.map((r) => [r.name, r.via]), [["b", undefined], ["c", "b"]]);
    assert.deepEqual(cfg.suites.map((s) => [s.name, s.root, s.services]), [
      ["c-smoke", path.join(top, "c"), undefined],
      ["b.e2e", path.join(top, "b"), ["b.web", "c.api"]],
    ]);
    const env = loadEnv(cfg);
    assert.deepEqual(env.missing, ["c:C_TOKEN"]);
    assert.equal(env.missingFiles["c:C_TOKEN"], path.join(top, "c", ".witness", ".env"));
  });

  test("bad [[repo]] tables are config errors naming the key", () => {
    fails(repos({ a: `[[repo]]\nname = "b"\n` }), "a", /repo\.b\.path: is required/);
    fails(repos({ a: `[[repo]]\nname = "b"\npath = "../nope"\n` }), "a", /repo\.b\.path: .*nope does not exist/);
    fails(repos({ a: `[[repo]]\nname = "b.x"\npath = "../b"\n`, b: "" }), "a", /repo\[0\]\.name: "b\.x" must start with a letter/);
    fails(repos({ a: `[[repo]]\nname = "b"\npath = "../b"\n`, b: null }), "a", /repo\.b: .*has no \.witness\/witness\.toml.*services = \[\]/);
    assert.equal(load(repos({ a: `[[repo]]\nname = "b"\npath = "../b"\nservices = []\n`, b: null }), "a").repos[0].file, undefined);
    fails(repos({ a: `[[repo]]\nname = "b"\npath = "../b"\nservices = ["ap"]\n`, b: svc("api") }), "a", /repo\.b\.services: no service "ap" in .* \(did you mean "api"\?\)/);
    fails(repos({ a: `[[repo]]\nname = "b"\npath = "../b"\nsuites = ["e2e"]\n`, b: svc("api") }), "a", /repo\.b\.suites: no suite "e2e"/);
    fails(repos({ a: `[[repo]]\nname = "b"\npath = "../b"\n`, b: `[[suite]]\nname = "x"\nkind = "api"\ncmd = "x"\nservice = ["nope"]\n` }), "a", /repo\.b: in .*b[\\/]\.witness[\\/]witness\.toml: suite\.x\.service: unknown service "nope"/);
    fails(repos({ a: `[[suite]]\nname = "e2e"\nkind = "ui"\nrepo = "b"\ncmd = "x"\n` }), "a", /suite\.e2e\.repo: unknown repo "b"; list it in a \[\[repo\]\] table/);
    fails(repos({ a: `[[repo]]\nname = "b"\npath = "../b"\n${svc("web", 'depends_on = ["b.nope"]')}`, b: svc("api") }), "a", /service\.web\.depends_on: unknown service "b\.nope"/);
    fails(repos({ a: `[[repo]]\nname = "b"\npath = "../b"\n${svc("web", 'env = { X = "${b.nope.url}" }')}`, b: svc("api") }), "a", /service\.web\.env\.X: \$\{b\.nope\.url\} refers to an unknown service/);
    fails(repos({ a: `[[repo]]\nname = "b"\npath = "../b"\n[reference]\nrepos = { c = "main" }\n`, b: "" }), "a", /reference\.repos\.c: unknown repo "c"; repos: b/);
  });

  test("name clashes: one name for two repos, two names for one repo, two services with one URL variable", () => {
    fails(repos({ a: `[[repo]]\nname = "b"\npath = "../b"\n[[repo]]\nname = "b"\npath = "../c"\n`, b: "", c: "" }), "a", /repo\.b: name clash: "b" is .*[\\/]b in this config and .*[\\/]c in this config/);
    fails(repos({ a: `[[repo]]\nname = "b"\npath = "../b"\n[[repo]]\nname = "bee"\npath = "../b"\n`, b: "" }), "a", /repo\.bee: name clash: .*[\\/]b is listed as "b" in this config and as "bee"/);
    fails(repos({ a: `[[repo]]\nname = "b"\npath = "../b"\n[[repo]]\nname = "cee"\npath = "../c"\n`, b: `[[repo]]\nname = "c"\npath = "../c"\n`, c: "" }), "a", /name clash: .*[\\/]c is listed as "cee" in this config and as "c" in repo b's config/);
    fails(repos({ a: `[[repo]]\nname = "b"\npath = "../b"\n${svc("b-api")}`, b: svc("api") }), "a", /service\.b\.api: name clash: its URL variable WITNESS_B_API_URL is also b-api's/);
  });

  test("cycles: a repo that lists a repo on the way back is an error with the chain", () => {
    const top = repos({ a: `[[repo]]\nname = "b"\npath = "../b"\n`, b: `[[repo]]\nname = "c"\npath = "../c"\n`, c: `[[repo]]\nname = "a"\npath = "../a"\n` });
    fails(top, "a", /repo\.a: cycle: a -> b -> c -> a; a repo can't list a repo that lists it back/);
    fails(repos({ a: `[[repo]]\nname = "self"\npath = "."\n` }), "a", /repo\.self: cycle: a -> self/);
  });

  test("--against values: one ref for this checkout, <repo>=<ref> for each listed repo", () => {
    const cfg = load(repos({ a: `[[repo]]\nname = "b"\npath = "../b"\nservices = []\n`, b: null }), "a");
    assert.deepEqual(parseAgainst(cfg, ["main", "b=release/1"]), { against: "main", repos: { b: "release/1" } });
    assert.deepEqual(parseAgainst(cfg, ["b=main"]), { repos: { b: "main" } });
    assert.match((parseAgainst(cfg, ["c=main"]) as { error: string }).error, /no repo "c"; repos: b/);
    assert.match((parseAgainst(cfg, ["main", "dev"]) as { error: string }).error, /one ref for this checkout; name the others as <repo>=<ref>/);
    assert.match((parseAgainst(cfg, ["b=x", "b=y"]) as { error: string }).error, /given twice/);
    const single = load(repos({ a: "" }), "a");
    assert.deepEqual(parseAgainst(single, ["topic=x"]), { against: "topic=x", repos: {} }, "without [[repo]] a value is a ref, as before");
  });
});

const git = (dir: string, ...a: string[]) => {
  const r = spawnSync("git", a, { cwd: dir, encoding: "utf8" });
  assert.equal(r.status, 0, `git ${a.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
};

function gitInit(dir: string) {
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.email", "t@example.com");
  git(dir, "config", "user.name", "t");
  git(dir, "config", "commit.gpgsign", "false");
  git(dir, "add", "-A");
  git(dir, "commit", "-qm", "init");
}

const edit = (file: string, from: string, to: string) => fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace(from, to));

describe("a suite in one repo against another repo's service", { concurrency: 1 }, () => {
  test("runs both repos' services and suites, records both checkouts, and compares each repo with its own base", async (t) => {
    // the fixtures' suites are node --test runs, which skip their files when they inherit this runner's context
    const ctx = process.env.NODE_TEST_CONTEXT;
    delete process.env.NODE_TEST_CONTEXT;
    t.after(() => void (ctx !== undefined && (process.env.NODE_TEST_CONTEXT = ctx)));
    const top = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "witness-multirepo-")));
    fs.cpSync(FIXTURE, top, { recursive: true });
    const [back, front] = [path.join(top, "backend"), path.join(top, "frontend")];
    gitInit(back);
    gitInit(front);
    const backMain = git(back, "rev-parse", "HEAD");

    // the backend change breaks the frontend's page; the frontend change adds a test
    git(back, "checkout", "-qb", "feature");
    edit(path.join(back, "greeting.mjs"), "`${word}, ${name}`", "`${word[0].toUpperCase()}${word.slice(1)}, ${name}!`");
    git(back, "commit", "-qam", "capitalize the greeting");
    git(front, "checkout", "-qb", "feature");
    edit(path.join(front, "web.mjs"), "<html><body>", "<html><head><title>Greeter</title></head><body>");
    fs.appendFileSync(path.join(front, "test", "e2e.test.mjs"), `\ntest("page has a title", async () => {\n  assert.match(await (await fetch(process.env.WITNESS_WEB_URL)).text(), /<title>Greeter<\\/title>/);\n});\n`);
    git(front, "commit", "-qam", "add a title");

    const r = await witness(front, ["run", "--json", "--against", "main"]);
    assert.equal(r.code, 1, r.stderr);
    assert.match(r.stderr, /repo {3}backend · feature @ \w{10} · /);
    assert.match(r.stderr, /against repo backend · merge base with main · checked out \w{10} in /);
    const st = r.json!;
    assert.deepEqual(st.repos.backend, { path: "../backend", root: back, commit: git(back, "rev-parse", "HEAD"), branch: "feature", dirty: false });
    assert.deepEqual(st.against.repos, { backend: { ref: "merge base with main", commit: backMain } });
    assert.deepEqual(st.against.parity, { same: 2, differs: 1, target_only: 1, origin_only: 0 }, "the page's greeting broke because of the backend; the title test is new");
    assert.deepEqual(st.suites.map((s: { name: string; state: string; services: string[] }) => [s.name, s.state, s.services]), [["e2e", "failed", ["web"]], ["backend.api", "passed", ["backend.api"]]]);
    const ctrfDoc = readJson(path.join(front, ".witness", "runs", "latest", "results.ctrf.json"));
    assert.equal(ctrfDoc.results.extra.witness.repos.backend.branch, "feature");
    const differs = ctrfDoc.results.tests.find((t: { extra: { witness: { parity?: string } } }) => t.extra.witness.parity === "differs");
    assert.match(differs.name, /page shows the backend's greeting/);
    const context = readJson(path.join(front, ".witness", "runs", "latest", "context.json"));
    assert.deepEqual(context.repos[0], { name: "backend", path: "../backend", commit: st.repos.backend.commit, branch: "feature", dirty: false, change: { base: backMain, baseLabel: "merge base with main", commits: 1, files: 1 } });
    const md = fs.readFileSync(path.join(front, ".witness", "runs", "latest", "report.md"), "utf8");
    assert.match(md, /- repo backend: feature @ `\w{12}` · compared with merge base with main · 1 commit\(s\), 1 file\(s\) since merge base with main/);
    assert.match(fs.readFileSync(path.join(front, ".witness", "runs", "latest", "report.html"), "utf8"), /<dt>Repo backend<\/dt>/);
    assert.match(r.stderr, /against main, backend=merge base with main: origin passed/);

    const same = await witness(front, ["run", "--json", "--against", "main", "--against", "backend=feature"]);
    assert.equal(same.code, 1, same.stderr);
    assert.match(same.stderr, /against repo backend · feature · runs from its checkout \(already at \w{10}\)/);
    assert.deepEqual(same.json?.against.parity, { same: 3, differs: 0, target_only: 1, origin_only: 0 }, "the backend is the same on both sides, so the greeting fails on both");

    fs.writeFileSync(path.join(back, "notes.txt"), "wip");
    const dirty = await witness(front, ["run", "--json", "--suite", "backend.api"]);
    assert.equal(dirty.code, 0, dirty.stderr);
    assert.equal(dirty.json?.repos.backend.dirty, true);
    assert.equal(dirty.json?.against, undefined);

    const bad = await witness(front, ["run", "--against", "backend=nope"]);
    assert.equal(bad.code, 64, bad.stderr);
    assert.match(bad.stderr, /--against backend=nope: not a commit in /);
    for (const d of [back, front]) assert.equal(git(d, "worktree", "list").split("\n").length, 1, "temporary worktrees removed");
    fs.rmSync(top, { recursive: true, force: true });
  });
});
