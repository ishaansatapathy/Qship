import { runShipflowSeed } from "../../auth/scripts/seed-demo";

runShipflowSeed().catch((error: unknown) => {
  console.error("[seed] Failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
