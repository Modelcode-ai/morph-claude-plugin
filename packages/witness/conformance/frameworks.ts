import * as path from "node:path";
import { ADAPTERS, type AdapterName } from "../src/adapters.ts";
import type { Kind } from "../src/config.ts";

export const KIT = import.meta.dirname;
export const IN_DOCKER = path.join(KIT, "bin", "in-docker");

/** How a framework's commands are run: on the host, or through bin/in-docker. */
export interface Tool {
  docker: boolean;
  run: (cmd: string) => string;
}

export type Scenario = "full" | "select" | "list" | "missing" | "broken" | "timeout" | "compound" | "evidence";
export const SCENARIOS: Scenario[] = ["full", "select", "list", "missing", "broken", "timeout", "compound", "evidence"];

export interface Framework {
  name: string;
  adapter: AdapterName;
  /** The suite's kind; api unless set. */
  kind?: Kind;
  project: string;
  /** Stable ids (without the adapter prefix) of the four kit tests. */
  ids: { pass: string; fail: string; skip: string; hang: string };
  /** A command that succeeds when the host has a usable toolchain. */
  local?: string;
  docker?: { image: string; args?: string };
  prepare?: (t: Tool) => string;
  cmd: (t: Tool) => string;
  /** The same suite as a compound command, with ${WITNESS_SELECT} where the runner's arguments go. */
  compound: (t: Tool) => string;
  versions: (t: Tool) => string;
  env?: (t: Tool) => Record<string, string>;
  /** Where the test list comes from when nothing is configured. */
  list: "native" | "last-report";
  timeout: { perTest: string; arg?: string } | { na: string };
  /** Report folders outside $WITNESS_REPORT_DIR, for break-report. */
  reportPaths?: string;
  stdoutReport?: boolean;
  /** What the passing test's evidence must hold: an observation kind its own adapter writes, or a file type the preset collects. */
  evidence: { kind: string } | { file: string };
}

const docker = (args: string) => (t: Tool): Record<string, string> => (t.docker ? { KIT_DOCKER_ARGS: args } : {});
const node = (bin: string) => `node_modules/.bin/${bin}`;
const dotnet = () => process.env.KIT_DOTNET ?? "dotnet";
const dotnetEnv = (t: Tool): Record<string, string> => ({
  DOTNET_CLI_TELEMETRY_OPTOUT: "1",
  DOTNET_NOLOGO: "1",
  ...ADAPTERS.dotnet.env,
  ...(t.docker ? { KIT_DOCKER_ARGS: "-v witness-kit-nuget:/root/.nuget/packages" } : process.env.KIT_DOTNET ? { DOTNET_ROOT: path.dirname(process.env.KIT_DOTNET) } : {}),
});
const dotnetLocal = () => `${dotnet()} --list-sdks | grep -Eq '^1[1-9]\\.'`;

export const FRAMEWORKS: Framework[] = [
  {
    name: "pytest",
    evidence: { kind: "http" },
    adapter: "pytest",
    project: "pytest",
    ids: { pass: "tests/test_items.py::test_lists_items", fail: "tests/test_items.py::test_item_name", skip: "tests/test_items.py::test_skipped", hang: "tests/test_items.py::test_hangs" },
    local: "python3 -c 'import sys; sys.exit(sys.version_info < (3, 10))'",
    docker: { image: "python:3.12-slim", args: "-v witness-kit-pyvenv:/venv" },
    prepare: (t) => (t.docker ? t.run("sh -c 'python -m venv /venv && /venv/bin/pip install -q -r requirements.txt'") : "python3 -m venv .venv && .venv/bin/pip install -q -r requirements.txt"),
    cmd: (t) => t.run(t.docker ? "/venv/bin/pytest" : ".venv/bin/pytest"),
    compound: (t) => `cd tests/.. && ${t.run(t.docker ? "/venv/bin/pytest" : ".venv/bin/pytest")} \${WITNESS_SELECT:-tests} && echo kit-done`,
    versions: (t) => t.run(t.docker ? "/venv/bin/pytest --version" : ".venv/bin/python --version && .venv/bin/pytest --version"),
    env: docker("-v witness-kit-pyvenv:/venv"),
    list: "native",
    timeout: { perTest: "3s" },
  },
  {
    name: "jest",
    evidence: { kind: "http" },
    adapter: "jest",
    project: "jest",
    ids: { pass: "items.test.js > items api > lists items", fail: "items.test.js > items api > item name", skip: "items.test.js > items api > skipped", hang: "items.test.js > items api > hangs" },
    prepare: () => "npm install --no-audit --no-fund --loglevel=error",
    cmd: () => node("jest"),
    compound: () => `true && ${node("jest")} \${WITNESS_SELECT} && echo kit-done`,
    versions: () => `node --version && ${node("jest")} --version`,
    list: "native",
    timeout: { perTest: "3s" },
  },
  {
    name: "vitest",
    evidence: { kind: "http" },
    adapter: "vitest",
    project: "vitest",
    ids: { pass: "items.test.js > items api > lists items", fail: "items.test.js > items api > item name", skip: "items.test.js > items api > skipped", hang: "items.test.js > items api > hangs" },
    // npm 10 (Node 22) crashes resolving vitest 5's optional peers without a lock file
    prepare: () => "npm install --no-audit --no-fund --loglevel=error --legacy-peer-deps",
    cmd: () => `${node("vitest")} run`,
    compound: () => `true && ${node("vitest")} run \${WITNESS_SELECT} && echo kit-done`,
    versions: () => `node --version && ${node("vitest")} --version`,
    list: "native",
    timeout: { perTest: "3s" },
  },
  {
    name: "mocha",
    evidence: { kind: "http" },
    adapter: "mocha",
    project: "mocha",
    ids: { pass: "test/items.test.js > items api > lists items", fail: "test/items.test.js > items api > item name", skip: "test/items.test.js > items api > skipped", hang: "test/items.test.js > items api > hangs" },
    prepare: () => "npm install --no-audit --no-fund --loglevel=error",
    cmd: () => node("mocha"),
    compound: () => `true && ${node("mocha")} \${WITNESS_SELECT} && echo kit-done`,
    versions: () => `node --version && ${node("mocha")} --version`,
    list: "native",
    timeout: { perTest: "3s" },
  },
  {
    name: "playwright",
    evidence: { file: "trace" },
    adapter: "playwright",
    kind: "ui",
    project: "playwright",
    ids: { pass: "page.spec.ts > items page > shows the items", fail: "page.spec.ts > items page > heading", skip: "page.spec.ts > items page > skipped", hang: "page.spec.ts > items page > hangs" },
    prepare: () => `npm install --no-audit --no-fund --loglevel=error && ${node("playwright")} install${process.env.CI ? " --with-deps" : ""} chromium`,
    cmd: () => `BASE_URL=\${app.url} ${node("playwright")} test`,
    compound: () => `export BASE_URL=\${app.url} && ${node("playwright")} test \${WITNESS_SELECT} && echo kit-done`,
    versions: () => `node --version && ${node("playwright")} --version`,
    list: "native",
    timeout: { perTest: "5s" },
  },
  {
    name: "cli-bats",
    evidence: { kind: "cli" },
    adapter: "bats",
    kind: "cli",
    project: "cli-bats",
    ids: { pass: "items.bats#lists items", fail: "items.bats#item name", skip: "items.bats#skipped", hang: "items.bats#hangs" },
    prepare: () => "npm install --no-audit --no-fund --loglevel=error",
    cmd: () => `${node("bats")} test`,
    compound: () => `true && ${node("bats")} test \${WITNESS_SELECT} && echo kit-done`,
    versions: () => `node --version && ${node("bats")} --version`,
    list: "last-report",
    timeout: { perTest: "3s" },
  },
  {
    name: "junit-maven",
    evidence: { kind: "http" },
    adapter: "junit-maven",
    project: "junit-maven",
    ids: { pass: "kit.ItemsTest#listsItems", fail: "kit.ItemsTest#itemName", skip: "kit.ItemsTest#skipped", hang: "kit.ItemsTest#hangs" },
    local: "java -version && mvn -version",
    docker: { image: "maven:3.9-eclipse-temurin-17", args: "-v witness-kit-m2:/root/.m2" },
    prepare: (t) => t.run("mvn -B -ntp -q test-compile"),
    cmd: (t) => t.run("mvn -B -ntp test"),
    compound: (t) => `true && ${t.run("mvn -B -ntp test")} \${WITNESS_SELECT} && echo kit-done`,
    versions: (t) => t.run("mvn -B -ntp -v"),
    env: docker("-v witness-kit-m2:/root/.m2"),
    list: "last-report",
    timeout: { perTest: "3s" },
    reportPaths: "target/surefire-reports",
  },
  {
    name: "junit-gradle",
    evidence: { kind: "http" },
    adapter: "junit-gradle",
    project: "junit-gradle",
    ids: { pass: "kit.ItemsTest#listsItems()", fail: "kit.ItemsTest#itemName()", skip: "kit.ItemsTest#skipped()", hang: "kit.ItemsTest#hangs()" },
    local: "java -version && gradle --version",
    docker: { image: "gradle:8.14.3-jdk17", args: "-v witness-kit-gradle:/home/gradle/.gradle" },
    prepare: (t) => t.run("gradle --no-daemon -q testClasses"),
    cmd: (t) => t.run("gradle --no-daemon test"),
    compound: (t) => `true && ${t.run("gradle --no-daemon test")} \${WITNESS_SELECT} && echo kit-done`,
    versions: (t) => t.run("gradle --no-daemon --version"),
    env: docker("-v witness-kit-gradle:/home/gradle/.gradle"),
    list: "last-report",
    timeout: { perTest: "3s", arg: "-PkitTestTimeout={s}" },
    reportPaths: "build/test-results",
  },
  {
    name: "go",
    evidence: { kind: "http" },
    adapter: "go",
    project: "go",
    ids: { pass: "example.com/kit#TestListsItems", fail: "example.com/kit#TestItemName", skip: "example.com/kit#TestSkipped", hang: "example.com/kit#TestHangs" },
    local: "go version",
    docker: { image: "golang:1.25", args: "-v witness-kit-go:/go/pkg" },
    prepare: (t) => t.run("go vet ./..."),
    cmd: (t) => t.run("go test -count=1 ./..."),
    compound: (t) => `true && ${t.run("go test -count=1 ./...")} \${WITNESS_SELECT} && echo kit-done`,
    versions: (t) => t.run("go version"),
    env: docker("-v witness-kit-go:/go/pkg"),
    list: "native",
    timeout: { perTest: "3s", arg: "-timeout {s}s" },
    stdoutReport: true,
  },
  {
    name: "rspec",
    evidence: { kind: "http" },
    adapter: "rspec",
    project: "rspec",
    ids: { pass: "spec/items_spec.rb > items api lists items", fail: "spec/items_spec.rb > items api item name", skip: "spec/items_spec.rb > items api skipped", hang: "spec/items_spec.rb > items api hangs" },
    local: "ruby -e 'exit(RUBY_VERSION >= \"3.1\" ? 0 : 1)' && bundle --version",
    docker: { image: "ruby:3.4-slim", args: "-v witness-kit-bundle:/usr/local/bundle" },
    prepare: (t) => t.run("bundle install --quiet"),
    cmd: (t) => t.run("bundle exec rspec"),
    compound: (t) => `true && ${t.run("bundle exec rspec")} \${WITNESS_SELECT} && echo kit-done`,
    versions: (t) => t.run("sh -c 'ruby --version && bundle exec rspec --version'"),
    env: docker("-v witness-kit-bundle:/usr/local/bundle"),
    list: "native",
    timeout: { na: "RSpec has no per-test timeout flag (only in-code Timeout.timeout wrappers)" },
  },
  {
    name: "phpunit",
    evidence: { kind: "http" },
    adapter: "phpunit",
    project: "phpunit",
    ids: { pass: "Kit\\ItemsTest#testListsItems", fail: "Kit\\ItemsTest#testItemName", skip: "Kit\\ItemsTest#testSkipped", hang: "Kit\\ItemsTest#testHangs" },
    local: "php -r 'exit(PHP_VERSION_ID >= 80300 ? 0 : 1);' && composer --version",
    docker: { image: "composer:2", args: "" },
    prepare: (t) => t.run("composer install -q --no-interaction"),
    cmd: (t) => t.run("vendor/bin/phpunit"),
    compound: (t) => `true && ${t.run("vendor/bin/phpunit")} \${WITNESS_SELECT} && echo kit-done`,
    versions: (t) => t.run("sh -c 'php --version | head -1 && vendor/bin/phpunit --version'"),
    list: "native",
    timeout: { perTest: "3s" },
  },
  {
    name: "dotnet-xunit",
    evidence: { kind: "http" },
    adapter: "dotnet",
    project: "dotnet-xunit",
    ids: { pass: "Kit.ItemsTests#ListsItems", fail: "Kit.ItemsTests#ItemName", skip: "Kit.ItemsTests#Skipped", hang: "Kit.ItemsTests#Hangs" },
    local: dotnetLocal(),
    docker: { image: "mcr.microsoft.com/dotnet/sdk:11.0" },
    prepare: (t) => t.run(`${t.docker ? "dotnet" : dotnet()} build -v q Kit.Xunit.csproj`),
    cmd: (t) => t.run(`${t.docker ? "dotnet" : dotnet()} test --project Kit.Xunit.csproj`),
    compound: (t) => `true && ${t.run(`${t.docker ? "dotnet" : dotnet()} test --project Kit.Xunit.csproj`)} \${WITNESS_SELECT} && echo kit-done`,
    versions: (t) => t.run(`${t.docker ? "dotnet" : dotnet()} --version`),
    env: dotnetEnv,
    list: "native",
    timeout: { na: "xunit v3 on Microsoft.Testing.Platform has no per-test timeout option (only [Fact(Timeout = ...)] in code)" },
  },
  {
    name: "dotnet-mstest",
    evidence: { kind: "http" },
    adapter: "dotnet",
    project: "dotnet-mstest",
    ids: { pass: "Kit.ItemsTests#ListsItems", fail: "Kit.ItemsTests#ItemName", skip: "Kit.ItemsTests#Skipped", hang: "Kit.ItemsTests#Hangs" },
    local: dotnetLocal(),
    docker: { image: "mcr.microsoft.com/dotnet/sdk:11.0" },
    prepare: (t) => t.run(`${t.docker ? "dotnet" : dotnet()} build -v q Kit.MSTest.csproj`),
    cmd: (t) => t.run(`${t.docker ? "dotnet" : dotnet()} test Kit.MSTest.csproj`),
    compound: (t) => `true && ${t.run(`${t.docker ? "dotnet" : dotnet()} test Kit.MSTest.csproj`)} \${WITNESS_SELECT} && echo kit-done`,
    versions: (t) => t.run(`${t.docker ? "dotnet" : dotnet()} --version`),
    env: dotnetEnv,
    list: "native",
    timeout: { perTest: "5s" },
  },
];
