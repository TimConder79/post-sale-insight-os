import pg from "pg";
import { migrate } from "./migrations.js";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required for migrations. See .env.example.");
  process.exitCode = 1;
} else {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    // Session lock prevents concurrent runners from racing the migration journal.
    await client.query("SELECT pg_advisory_lock(1427481376)");
    await migrate(
      {
        exec: (sql) => client.query(sql),
        query: (sql, args) => client.query(sql, args),
      },
      new URL("../database/migrations/", import.meta.url),
    );
    console.log("Database migrations are up to date.");
  } catch (error) {
    // Do not log connection strings or credentials from driver errors.
    console.error(
      `Migration failed (${error.code ?? "migration error"}). Check connectivity and migration integrity.`,
    );
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}
