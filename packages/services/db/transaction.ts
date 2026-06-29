import db from "@repo/database";

/** Drizzle transaction handle — pass to service helpers that must stay atomic. */
export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Runs `fn` inside a Postgres transaction (commit on success, rollback on throw). */
export async function withTransaction<T>(fn: (tx: DbTransaction) => Promise<T>): Promise<T> {
  return db.transaction(fn);
}
