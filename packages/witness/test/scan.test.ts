import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { scan } from "../src/scan.ts";
import { PKG, witness } from "./helpers.ts";

const FIX = path.join(PKG, "testdata", "scan");

function copy(name: string): string {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "witness-scan-")));
  fs.cpSync(path.join(FIX, name), dir, { recursive: true });
  return dir;
}

const byName = <T extends { name: string }>(xs: T[], n: string) => xs.find((x) => x.name === n);

test("scan: a compose repo with a database gives dependency commands, the e2e folder as the suite and the CI commands", () => {
  const r = scan(path.join(FIX, "compose-db"));
  const tp = r.testProjects.find((t) => t.status === "functional")!;
  assert.equal(tp.suite?.cmd, "python -m pytest tests/e2e");
  assert.equal(tp.confidence, "medium", "a filtered command is a guess");
  assert.ok(tp.evidence.includes("tests/e2e/test_items.py:5 base URL from the environment"), tp.evidence.join());
  assert.ok(r.testProjects.some((t) => t.status === "excluded" && t.path === "tests/unit/test_prices.py"));

  const db = byName(r.infrastructure, "db")!;
  assert.equal(db.type, "postgres");
  assert.equal(db.source, "compose");
  assert.equal(db.confidence, "high");
  assert.equal(db.start, "docker compose up -d db");
  assert.equal(db.check, "docker compose exec -T db pg_isready -U app", "the compose healthcheck, run in the container");
  assert.deepEqual(db.evidence, ["docker-compose.yml:2"]);
  assert.equal(byName(r.infrastructure, "cache")?.check, "docker compose exec -T cache redis-cli ping");
  assert.ok(r.infrastructure.some((i) => i.source === "ci" && i.type === "postgres"));
  assert.ok(!r.infrastructure.some((i) => i.source === "dependency"), "a driver adds nothing once compose names the database");

  const api = byName(r.containers, "api")!;
  assert.equal(api.start, "docker compose up --build api");
  assert.deepEqual(api.dependsOn, ["db", "cache"]);
  assert.ok(r.urls.some((u) => u.url === "http://localhost:8000" && u.for === "compose service api"));

  const cmd = (c: string) => r.commands.find((x) => x.cmd === c);
  assert.deepEqual([cmd("alembic upgrade head")?.role, cmd("alembic upgrade head")?.evidence], ["migrate", [".github/workflows/ci.yml:21"]]);
  assert.equal(cmd("pytest tests/e2e")?.role, "test", "${{ env.X }} is resolved from the workflow");
  assert.equal(cmd("pytest tests/e2e")?.confidence, "high");
  assert.equal(cmd("make serve")?.role, "start");
  assert.deepEqual([cmd("uvicorn app.main:app --host 0.0.0.0 --port 8000")?.role, cmd("uvicorn app.main:app --host 0.0.0.0 --port 8000")?.evidence], ["start", ["Dockerfile:6"]]);
  assert.ok(cmd("pip install alembic"), "a RUN continued over lines is one command per &&");
  assert.ok(!r.commands.some((c) => c.cmd.startsWith("#")));

  assert.deepEqual(r.health, [{ path: "/health", confidence: "high", evidence: ["app/main.py:9"] }]);
  const pw = byName(r.env, "POSTGRES_PASSWORD")!;
  assert.deepEqual([pw.secret, pw.readBy], [true, ["compose"]]);
  assert.deepEqual(byName(r.env, "DATABASE_URL")?.readBy, ["app"]);
  assert.deepEqual(byName(r.env, "API_URL")?.readBy, ["tests"]);
  assert.ok(r.data.some((d) => d.kind === "user" && d.login === "admin@shop.test" && d.confidence === "high"));
  assert.ok(r.frameworks.some((f) => f.name === "fastapi" && f.role === "app"));
  assert.ok(r.frameworks.some((f) => f.name === "python" && f.version === "3.12"));
  assert.deepEqual(r.adapters, ["pytest"]);
  assert.equal(r.config, null);
});

test("scan: secrets named in .env.example, read by the app and passed by CI, never with their values", () => {
  const r = scan(path.join(FIX, "node-secrets"));
  const secrets = r.env.filter((e) => e.secret).map((e) => e.name);
  assert.deepEqual(secrets, ["E2E_ADMIN_PASSWORD", "JWT_SECRET", "SENDGRID_API_KEY", "STRIPE_SECRET_KEY"]);
  const stripe = byName(r.env, "STRIPE_SECRET_KEY")!;
  assert.deepEqual(stripe.readBy, ["ci", "example", "app"]);
  assert.deepEqual(stripe.evidence, [".github/workflows/test.yml:14", ".env.example:4", "src/server.js:4"]);
  assert.equal(stripe.exampleValue, undefined, "an empty example value");
  assert.equal(byName(r.env, "JWT_SECRET")?.exampleValue, undefined, "a placeholder is not a value");
  assert.equal(byName(r.env, "DATABASE_URL")?.exampleValue, true);
  assert.equal(byName(r.env, "E2E_ADMIN_PASSWORD")?.testUser, true);
  assert.equal(byName(r.env, "E2E_ADMIN_EMAIL")?.secret, false);
  assert.ok(!JSON.stringify(r).includes("billing:billing"), "values from env files are never printed");

  const db = r.infrastructure.find((i) => i.source === "env")!;
  assert.deepEqual([db.name, db.type, db.host, db.confidence], ["DATABASE_URL", "postgres", "localhost:5432", "high"]);
  assert.deepEqual(r.health.map((h) => h.path), ["/healthz"]);
  const roles = Object.fromEntries(r.commands.filter((c) => c.runs).map((c) => [c.cmd, [c.role, c.runs]]));
  assert.deepEqual(roles, { "npm start": ["start", "node src/server.js"], "npm run dev": ["start", "nodemon src/server.js"], "npm run migrate": ["migrate", "knex migrate:latest"], "npm run seed": ["seed", "knex seed:run"], "npm test": ["test", "jest"] });
  assert.deepEqual(r.commands.find((c) => c.cmd === "npm ci")?.evidence, [".github/workflows/test.yml:11", "package.json"], "one command, found in CI and implied by the lockfile");
  assert.ok(r.data.some((d) => d.kind === "user" && d.login === "owner@billing.test" && d.confidence === "high"));
  assert.ok(r.data.some((d) => d.kind === "seed" && d.path === "db/seeds/01_users.js"));
  assert.equal(r.testProjects[0].status, "functional");
  assert.equal(r.testProjects[0].confidence, "high");
  assert.ok(r.frameworks.some((f) => f.name === "express" && f.role === "app"));
});

test("scan: an existing config marks what it covers, counts a comment as a recorded choice, and lists the rest", () => {
  const dir = copy("compose-db");
  fs.mkdirSync(path.join(dir, ".witness"));
  fs.writeFileSync(
    path.join(dir, ".witness", "witness.toml"),
    [
      "version = 1",
      "[env]",
      'required = ["DATABASE_URL"]',
      "# POSTGRES_PASSWORD: compose's default is fine for tests",
      "[[dependency]]",
      'name = "db"',
      'check = "docker compose exec -T db pg_isready"',
      'start = "docker compose up -d db"',
      "[[suite]]",
      'name = "e2e"',
      'kind = "api"',
      'adapter = "pytest"',
      'cmd = "python -m pytest tests/e2e"',
      "service = []",
      "[[suite]]",
      'name = "old"',
      'kind = "api"',
      'adapter = "generic"',
      'cmd = "./gone.sh"',
      "service = []",
      "",
    ].join("\n"),
  );
  const r = scan(dir);
  assert.equal(r.config?.error, undefined);
  assert.equal(r.testProjects.find((t) => t.status === "functional")?.configured, "e2e");
  assert.equal(byName(r.infrastructure, "db")?.configured, "db");
  assert.equal(byName(r.env, "DATABASE_URL")?.configured, "required");
  assert.equal(byName(r.env, "POSTGRES_PASSWORD")?.configured, "comment");
  assert.deepEqual(r.config?.missing, { testProjects: [], infrastructure: ["cache"], secrets: [] });
  assert.deepEqual(r.config?.unmatched, { suites: ["old"], dependencies: [] });
  assert.equal(r.config?.rendered, false);

  fs.writeFileSync(path.join(dir, ".witness", "witness.toml"), "# Rendered by morph from the lifecycle config\nversion = 1\n[[suite]]\nname = 'x'\n");
  const bad = scan(dir);
  assert.equal(bad.config?.rendered, true);
  assert.match(bad.config?.error ?? "", /kind/);
  assert.deepEqual(bad.config?.missing.testProjects, [". (pytest)"]);
});

test("scan: a dependency named after a store type covers the database URLs of that type", () => {
  const dir = copy("node-secrets");
  fs.mkdirSync(path.join(dir, ".witness"));
  fs.writeFileSync(path.join(dir, ".witness", "witness.toml"), 'version = 1\n[[dependency]]\nname = "postgres"\ncheck = "pg_isready -h localhost"\n');
  const r = scan(dir);
  assert.equal(r.infrastructure.find((i) => i.name === "DATABASE_URL")?.configured, "postgres", "a dependency named after the store type");
  assert.deepEqual(r.config?.missing.infrastructure, []);
  assert.deepEqual(r.config?.missing.secrets, ["E2E_ADMIN_PASSWORD", "JWT_SECRET", "SENDGRID_API_KEY", "STRIPE_SECRET_KEY"]);
});

test("init --scan prints JSON, writes nothing, and plain init still writes the example", async () => {
  const dir = copy("node-secrets");
  const r = await witness(dir, ["init", "--scan"]);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.json?.version, 1);
  assert.ok(Array.isArray(r.json?.commands));
  assert.match(r.stderr, /Nothing written/);
  assert.ok(!fs.existsSync(path.join(dir, ".witness")), "--scan must not create .witness/");
  const w = await witness(dir, ["init"]);
  assert.equal(w.code, 0, w.stderr);
  assert.ok(fs.existsSync(path.join(dir, ".witness", "witness.example.toml")));
});

test("scan: agent instruction files (CLAUDE.md, AGENTS.md, Copilot, Cursor) give commands at medium confidence, with trailing comments dropped", () => {
  const r = scan(path.join(FIX, "agent-docs"));
  const find = (cmd: string) => r.commands.find((c) => c.cmd === cmd);
  const dev = find(".venv/bin/python scripts/dev.py server start");
  assert.ok(dev, JSON.stringify(r.commands.map((c) => c.cmd)));
  assert.equal(dev.source, "agent-docs");
  assert.equal(dev.confidence, "medium");
  assert.deepEqual(dev.evidence, ["CLAUDE.md:6"]);
  assert.ok(find("pytest tests/e2e"));
  assert.equal(find("npm run dev")?.cwd, "services/api", "a nested AGENTS.md speaks for its own folder");
  assert.equal(find("make test")?.cwd, ".");
  assert.ok(find("docker compose up -d"));
  assert.ok(!r.commands.some((c) => c.cmd === "install"));
});
