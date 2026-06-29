/** Shared runtime environment helpers for production gates. */

export function isProductionEnv(): boolean {
  const nodeEnv = String(process.env.NODE_ENV ?? "");
  return nodeEnv === "production" || nodeEnv === "prod";
}

/** Demo login + bootstrap only outside production. */
export function isDemoModeEnabled(): boolean {
  return process.env.DEMO_LOGIN_ENABLED === "true" && !isProductionEnv();
}

/** Legacy Gmail/calendar stub tRPC routers — off in production by default. */
export function isLegacyUiStubsEnabled(): boolean {
  if (process.env.LEGACY_UI_STUBS_ENABLED === "true") return true;
  if (process.env.LEGACY_UI_STUBS_ENABLED === "false") return false;
  return !isProductionEnv();
}

/** Apply journal migrations during API boot (uses Postgres advisory lock). */
export function shouldRunMigrationsOnBoot(): boolean {
  if (process.env.RUN_MIGRATIONS_ON_BOOT === "false") return false;
  if (process.env.RUN_MIGRATIONS_ON_BOOT === "true") return true;
  return true;
}

/** Skip deploy webhook requirement in dev/test unless explicitly disabled. */
export function allowSimulatedDeploy(): boolean {
  if (process.env.ALLOW_SIMULATED_DEPLOY === "true") return true;
  if (process.env.ALLOW_SIMULATED_DEPLOY === "false") return false;
  return !isProductionEnv();
}
