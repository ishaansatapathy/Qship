/**
 * Shared API bootstrap — local server (index.ts) and Vercel (vercel.ts).
 */
import { logger } from "@repo/logger";

import { runMigrations } from "./migrate";

export type ApiBootstrapOptions = {
  /** Skip long-running jobs when running as a serverless function. */
  serverless?: boolean;
};

export async function runApiBootstrap(_opts: ApiBootstrapOptions = {}): Promise<void> {
  try {
    await runMigrations();
    logger.info("Database schema patches applied");
  } catch (err) {
    logger.error("Database migration failed", { err });
  }
}

export function validateApiEnv(): string[] {
  return ["DATABASE_URL", "BASE_URL", "CLIENT_URL"].filter((key) => !process.env[key]?.trim());
}
