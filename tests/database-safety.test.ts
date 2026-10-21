import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("sandbox tests reject a different project before invoking Supabase", () => {
  const result = spawnSync(process.execPath, ["scripts/test-sandbox.mjs"], { env: { ...process.env, SPONSO_TEST_PROJECT_REF: "qnbqbnbdhjvocxycnnwm" }, encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /freigegebenen Testprojekt/);
});

test("database test command rejects remote targets before invoking Supabase", () => {
  for (const target of ["postgresql://test:unused@production.example.com:5432/postgres", "postgresql://test:unused@localhost.example.com/postgres", "https://localhost/", "invalid-url"]) {
    const result = spawnSync(process.execPath, ["scripts/test-db.mjs"], { env: { ...process.env, SPONSO_TEST_DATABASE_URL: target }, encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /lokale.*(Testdatenbank|PostgreSQL-Adresse)/);
    assert.doesNotMatch(result.stderr, /laufender lokaler Supabase-Stack/);
  }
});
