import { ServiceError } from "./errors";
import type { FeatureReleaseResult } from "./github/release-ship";
import { allowSimulatedDeploy } from "./runtime-env";

/**
 * Validates merge + deploy outcomes before marking a feature shipped.
 * Production requires a successful deploy webhook when configured; merge must succeed when attempted.
 */
export function assertReleaseReadyForShip(
  release: FeatureReleaseResult,
  context: { hadOpenPr: boolean; hadGithubConnection: boolean },
): void {
  if (
    context.hadOpenPr &&
    context.hadGithubConnection &&
    release.merge.attempted &&
    !release.merge.merged
  ) {
    throw new ServiceError(
      "PRECONDITION_FAILED",
      `Cannot ship: linked PR merge failed (${release.merge.reason ?? "unknown"}).`,
    );
  }

  if (release.deploy.simulated && !allowSimulatedDeploy()) {
    throw new ServiceError(
      "PRECONDITION_FAILED",
      "Configure SHIP_DEPLOY_WEBHOOK_URL before shipping in production.",
    );
  }

  if (release.deploy.attempted && !release.deploy.triggered && !release.deploy.simulated) {
    throw new ServiceError(
      "PRECONDITION_FAILED",
      `Deploy webhook failed: ${release.deploy.reason ?? "unknown error"}.`,
    );
  }
}
