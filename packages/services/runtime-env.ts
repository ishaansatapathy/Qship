/** Shared runtime environment helpers for production gates. */

export function isProductionEnv(): boolean {
  const nodeEnv = process.env.NODE_ENV;
  return nodeEnv === "production" || nodeEnv === "prod";
}

/** Demo login + bootstrap only outside production. */
export function isDemoModeEnabled(): boolean {
  return process.env.DEMO_LOGIN_ENABLED === "true" && !isProductionEnv();
}

/** Skip deploy webhook requirement in dev/test unless explicitly disabled. */
export function allowSimulatedDeploy(): boolean {
  if (process.env.ALLOW_SIMULATED_DEPLOY === "true") return true;
  if (process.env.ALLOW_SIMULATED_DEPLOY === "false") return false;
  return !isProductionEnv();
}
