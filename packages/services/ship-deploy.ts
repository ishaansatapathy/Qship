import { allowSimulatedDeploy, isProductionEnv } from "./runtime-env";

export type ShipDeployIntegrationStatus = {
  configured: boolean;
  mode: "live" | "simulated";
  production: boolean;
  allowsSimulatedDeploy: boolean;
  hookHost: string | null;
  setupHint: string;
  verifyPath: string;
};

function hookHostFromUrl(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

/** Machine-readable ship/deploy status for evaluators (URL never exposed). */
export function getShipDeployIntegrationStatus(): ShipDeployIntegrationStatus {
  const raw = process.env.SHIP_DEPLOY_WEBHOOK_URL?.trim() ?? "";
  const configured = raw.length > 0;
  const production = isProductionEnv();
  const simulatedAllowed = allowSimulatedDeploy();

  return {
    configured,
    mode: configured ? "live" : simulatedAllowed ? "simulated" : "simulated",
    production,
    allowsSimulatedDeploy: simulatedAllowed,
    hookHost: configured ? hookHostFromUrl(raw) : null,
    setupHint:
      "Railway API → SHIP_DEPLOY_WEBHOOK_URL = Vercel Deploy Hook URL (Settings → Git → Deploy Hooks on qship web project)",
    verifyPath:
      "Approve a feature → Mark shipped → Vercel shows new Production deployment; GET /integrations/ship returns configured:true",
  };
}

/** POST to deploy hook — triggers a real deploy. Use only for manual verification. */
export async function triggerShipDeployWebhookProbe(input?: {
  featureId?: string;
  featureTitle?: string;
}): Promise<{ ok: boolean; status?: number; error?: string }> {
  const deployUrl = process.env.SHIP_DEPLOY_WEBHOOK_URL?.trim();
  if (!deployUrl) {
    return { ok: false, error: "SHIP_DEPLOY_WEBHOOK_URL is not set" };
  }

  try {
    const response = await fetch(deployUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "feature.shipped",
        featureId: input?.featureId ?? "ship-deploy-probe",
        featureTitle: input?.featureTitle ?? "Ship deploy webhook probe",
        organizationId: "probe",
        prUrl: null,
        merged: false,
        shippedAt: new Date().toISOString(),
        probe: true,
      }),
    });

    if (!response.ok) {
      return { ok: false, status: response.status, error: `HTTP ${response.status}` };
    }

    return { ok: true, status: response.status };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
