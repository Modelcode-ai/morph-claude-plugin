import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { parse } from "smol-toml";
import { parseConfig } from "../src/config.ts";
import { guess, renderExample } from "../src/init.ts";

function repo(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "witness-init-"));
  for (const [f, c] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), c);
  }
  return dir;
}

test("init finds services and skips test projects without tests", () => {
  const dir = repo({
    "pyproject.toml": "[tool.pytest.ini_options]\naddopts = '-q'\n",
    "pom.xml": "<project><parent><artifactId>spring-boot-starter-parent</artifactId></parent></project>",
    "eShop.sln": "",
    "src/Web/Web.csproj": '<Project Sdk="Microsoft.NET.Sdk.Web"></Project>',
    "tests/UnitTests/UnitTests.csproj": '<Project Sdk="Microsoft.NET.Sdk"><ItemGroup><PackageReference Include="Microsoft.NET.Test.Sdk" /><PackageReference Include="xunit" /></ItemGroup></Project>',
    "web/package.json": JSON.stringify({ scripts: { start: "next start" }, devDependencies: { "@playwright/test": "1", vitest: "2" } }),
    "go.mod": "module example.com/x\n",
    "Gemfile": "gem 'rspec-rails'\n",
    "phpunit.xml.dist": "<phpunit/>",
    "build.gradle.kts": "",
  });
  const g = guess(dir);
  assert.deepEqual(g.suites, []);
  assert.deepEqual(g.excluded.map((e) => `${e.adapter} ${e.reason}`).sort(), ["dotnet no tests found", "go no tests found", "junit-gradle no tests found", "junit-maven no tests found", "phpunit no tests found", "playwright no tests found", "pytest no tests found", "rspec no tests found", "vitest no tests found"]);
  assert.ok(g.services.some((s) => s.start.includes("dotnet run --no-build --project src/Web/Web.csproj")));
  assert.ok(g.services.some((s) => s.cwd === "web" && s.start === "npm start"));
  const cfg = parseConfig(parse(renderExample(g)) as Record<string, unknown>, path.join(dir, ".witness", "witness.toml"));
  assert.equal(cfg.suites.length, g.suites.length);
});

test("init with nothing recognisable still renders a valid config", () => {
  const cfg = parseConfig(parse(renderExample(guess(repo({ "README.md": "hi" })))) as Record<string, unknown>, "/x/.witness/witness.toml");
  assert.equal(cfg.suites.length, 0);
});
