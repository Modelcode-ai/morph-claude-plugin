import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { parse } from "smol-toml";
import { ConfigError, loadEnv, parseConfig, parseEnvFile, substitute, topoOrder } from "../src/config.ts";
import { parseDuration } from "../src/util.ts";

const cfg = (toml: string) => parseConfig(parse(toml) as Record<string, unknown>, "/repo/.witness/witness.toml");
const err = (toml: string) => {
  try {
    cfg(toml);
  } catch (e) {
    assert.ok(e instanceof ConfigError);
    return e.message;
  }
  assert.fail("expected a ConfigError");
};

const FULL = `
version = 1
[env]
file = ".witness/.env"
required = ["DATABASE_URL"]
[[dependency]]
name = "postgres"
check = "pg_isready"
timeout = "60s"
[[service]]
name = "api"
setup = "npm ci"
start = "npm start -- --port \${PORT}"
ports = "3000-3005"
ready = { http = "\${self.url}/health", status = 200, timeout = "120s" }
env = { API_URL = "\${api.url}" }
[[service]]
name = "web"
start = "npm run web"
depends_on = ["api"]
[[service]]
name = "api-origin"
role = "origin"
external = "http://legacy.internal:8080"
[[suite]]
name = "api-e2e"
service = "api"
adapter = "pytest"
cmd = "pytest tests/e2e"
timeout = "20m"
per_test_timeout = "120s"
[[suite]]
name = "ui"
service = ["web", "api"]
adapter = "playwright"
cmd = "npx playwright test"
[run]
stall_timeout = "5m"
heartbeat = "60s"
keep_runs = 10
`;

describe("config v1", () => {
  test("the contract example parses with typed values", () => {
    const c = cfg(FULL);
    assert.equal(c.root, "/repo");
    assert.deepEqual(c.required, ["DATABASE_URL"]);
    assert.deepEqual(c.services[0].ports, [3000, 3005]);
    assert.equal(c.services[0].ready?.timeoutMs, 120_000);
    assert.equal(c.services[2].role, "origin");
    assert.deepEqual(c.suites[0].services, ["api"]);
    assert.deepEqual(c.suites[1].services, ["web", "api"]);
    assert.equal(c.suites[0].perTestTimeoutMs, 120_000);
    assert.equal(c.run.stallMs, 300_000);
    assert.equal(c.run.keepRuns, 10);
  });

  test("errors name the offending key", () => {
    assert.match(err(`version = 2`), /^version: unsupported version 2/);
    assert.match(err(`[[service]]\nname="a"\nstart="x"`), /^version: is required/);
    assert.match(err(`version = 1\n[[service]]\nname = "api"\nstrat = "x"`), /^service\[0\]\.strat: unknown key \(did you mean "start"\?\)/);
    assert.match(err(`version = 1\n[[service]]\nname = "api"`), /^service\.api: needs start/);
    assert.match(err(`version = 1\n[[service]]\nname = "api"\nstart = "x"\nports = "9-1"`), /^service\.api\.ports: invalid port range/);
    assert.match(err(`version = 1\n[[suite]]\nname = "s"\ncmd = "x"\nadapter = "nose"`), /^suite\.s\.adapter: unknown adapter "nose"/);
    assert.match(err(`version = 1\n[[suite]]\nname = "s"\ncmd = "x"\ntimeout = "forever"`), /^suite\.s\.timeout: expected a duration/);
    assert.match(err(`version = 1\n[[suite]]\nname = "s"\ncmd = "x"\nservice = "nope"`), /^suite\.s\.service: unknown service "nope"/);
    assert.match(err(`version = 1\n[[service]]\nname = "a"\nstart = "x"\ndepends_on = ["b"]\n[[service]]\nname = "b"\nstart = "x"\ndepends_on = ["a"]`), /dependency cycle: a -> b -> a/);
    assert.match(err(`version = 1\n[[service]]\nname = "a"\nstart = "\${b.url}"`), /^service\.a\.start: \$\{b\.url\} refers to an unknown service/);
    assert.match(err(`version = 1\n[[service]]\nname = "a"\nstart = "x"\nready = { http = "/", cmd = "true" }`), /^service\.a\.ready: set exactly one of http or cmd/);
    assert.match(err(`version = 1\n[[dependency]]\nname = "db"`), /^dependency\[0\]: "db" needs check or check_http/);
    assert.match(err(`version = 1\n[runn]\nx = 1`), /^runn: unknown key \(did you mean "run"\?\)/);
  });

  test("depends_on order", () => {
    const c = cfg(FULL);
    assert.deepEqual(topoOrder(c.services, ["web"]).map((s) => s.name), ["api", "web"]);
  });

  test("variable substitution leaves unknown names for the shell", () => {
    assert.equal(substitute("x ${PORT} ${api.url} ${HOME_NOT_SET} $PATH", { PORT: "1", "api.url": "http://a" }), "x 1 http://a ${HOME_NOT_SET} $PATH");
  });

  test("env file: comments, export, quotes; process env wins; required check", () => {
    assert.deepEqual(parseEnvFile(`# c\nexport A=1\nB="two words"\nC='x # y'\nD=v # trailing\nnot a line\n`), { A: "1", B: "two words", C: "x # y", D: "v" });
    const c = cfg(`version = 1\n[env]\nrequired = ["WITNESS_UNSET_FOR_TEST", "PATH"]`);
    assert.deepEqual(loadEnv(c).missing, ["WITNESS_UNSET_FOR_TEST"]);
  });

  test("durations", () => {
    assert.equal(parseDuration("250ms"), 250);
    assert.equal(parseDuration("90s"), 90_000);
    assert.equal(parseDuration("5m"), 300_000);
    assert.equal(parseDuration("1h"), 3_600_000);
    assert.equal(parseDuration(30), 30_000);
    assert.equal(parseDuration("soon"), null);
  });
});
