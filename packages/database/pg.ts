import pg from "pg";

import { env } from "./env";

/**
 * Returns true when the connection string targets Neon's managed Postgres.
 * Neon requires SSL and uses a shorter max-pool-size due to serverless limits.
 */
export function isNeonDatabase(connectionString: string): boolean {
  return connectionString.includes("neon.tech");
}

/**
 * Returns true when the connection string explicitly requests SSL via the
 * `sslmode` query parameter.
 */
function requiresSsl(connectionString: string): boolean {
  return /sslmode=(require|verify-full|verify-ca)/i.test(connectionString);
}

/** Builds a `pg.ClientConfig` appropriate for the target host. */
export function pgConnectionConfig(connectionString: string): pg.ClientConfig {
  const config: pg.ClientConfig = { connectionString };

  if (isNeonDatabase(connectionString) || requiresSsl(connectionString)) {
    // `rejectUnauthorized: false` is intentional for Neon's self-signed certs.
    config.ssl = { rejectUnauthorized: false };
  }

  return config;
}

/**
 * Returns the database URL to use for drizzle-kit / journal migrations.
 * Neon requires the *direct* (non-pooler) URL for DDL statements because
 * PgBouncer in transaction mode does not support `CREATE TABLE` / `ALTER`.
 */
export function getMigrationDatabaseUrl(): string {
  return env.DATABASE_URL_UNPOOLED ?? env.DATABASE_URL;
}

/**
 * Creates a connection pool for the application's query workload.
 * Pool size is constrained to 5 on Neon (serverless compute limit) and 10
 * on dedicated Postgres.
 */
export function createPgPool(connectionString = env.DATABASE_URL): pg.Pool {
  const pool = new pg.Pool({
    ...pgConnectionConfig(connectionString),
    max: isNeonDatabase(connectionString) ? 5 : 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  pool.on("error", (err) => {
    // Pool-level errors (e.g., unexpected client disconnects) must be handled
    // here to prevent unhandled-rejection crashes.
    console.error("[pg] pool error:", err.message);
  });

  return pool;
}

/**
 * Opens a single `pg.Client` connection, connects it, and returns it.
 * Callers are responsible for calling `client.end()` when finished.
 */
export async function createPgClient(connectionString?: string): Promise<pg.Client> {
  const url = connectionString ?? env.DATABASE_URL;
  const client = new pg.Client(pgConnectionConfig(url));
  await client.connect();
  return client;
}
