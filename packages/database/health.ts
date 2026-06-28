import { sql } from "drizzle-orm";

import db from "./index";

/**
 * Executes a lightweight `SELECT 1` against the application pool.
 * Throws if the database is unreachable or the pool has been exhausted.
 *
 * Intended for use in `/health` endpoints and readiness probes.
 */
export async function pingDatabase(): Promise<void> {
  await db.execute(sql`SELECT 1`);
}

/**
 * Returns the current server timestamp and Postgres version string.
 * Useful for validating that the connection points to the expected database.
 */
export async function getDatabaseInfo(): Promise<{ now: Date; version: string }> {
  const rows = await db.execute<{ now: Date; version: string }>(
    sql`SELECT NOW() AS now, version() AS version`,
  );
  const row = rows.rows[0];
  if (!row) throw new Error("No rows returned from database info query");
  return { now: row.now, version: row.version };
}
