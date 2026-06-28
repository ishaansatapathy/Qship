import { getDatabaseInfo, pingDatabase } from "../health";
import { env } from "../env";
import { getMigrationDatabaseUrl, isNeonDatabase } from "../pg";

async function main() {
  console.log("ShipFlow — database connectivity check\n");
  console.log(`  App URL (pooled):       ${maskHost(env.DATABASE_URL)}`);

  await pingDatabase();
  console.log("  ✓ App pool connection OK");

  const { version } = await getDatabaseInfo();
  console.log(`  ✓ Server: ${version.split(" ").slice(0, 2).join(" ")}`);

  const migrationUrl = getMigrationDatabaseUrl();
  if (env.DATABASE_URL_UNPOOLED) {
    console.log(`  ✓ Migration URL (direct): ${maskHost(env.DATABASE_URL_UNPOOLED)}`);
  } else if (isNeonDatabase(migrationUrl) && migrationUrl.includes("-pooler.")) {
    console.warn(
      "\n  ⚠ WARNING: Neon pooled URL used for migrations.\n" +
        "    Add DATABASE_URL_UNPOOLED (direct URL from Neon dashboard) to avoid DDL errors.",
    );
  } else {
    console.log(`  ✓ Migration URL:          ${maskHost(migrationUrl)}`);
  }

  console.log("\n  All checks passed.");
}

/** Redacts credentials; returns only the hostname for safe logging. */
function maskHost(connectionString: string): string {
  try {
    const normalized = connectionString.replace(/^postgres(ql)?:\/\//, "https://");
    const url = new URL(normalized);
    return url.hostname;
  } catch {
    return "(invalid URL)";
  }
}

main().catch((error: unknown) => {
  console.error(
    "\n  ✗ Database check failed:",
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
});
