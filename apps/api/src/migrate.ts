import { runJournalMigrations } from "@repo/database/migrate";

export async function runMigrations() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return;
  }

  await runJournalMigrations(databaseUrl);
}
