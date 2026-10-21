import { spawnSync } from "node:child_process";

const target = process.env.SPONSO_TEST_DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
let url;
try { url = new URL(target); } catch { throw new Error("SPONSO_TEST_DATABASE_URL muss eine lokale PostgreSQL-Adresse sein."); }
if (!["postgres:", "postgresql:"].includes(url.protocol) || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
  throw new Error("Datenbanktests sind nur gegen eine lokale Testdatenbank erlaubt. Produktive Datenbanken werden nicht verwendet.");
}
const result = spawnSync("supabase", ["test", "db", "--db-url", target], { stdio: "inherit" });
if (result.error) throw new Error("Für Datenbanktests werden die Supabase CLI und ein laufender lokaler Supabase-Stack benötigt.", { cause: result.error });
process.exitCode = result.status ?? 1;
