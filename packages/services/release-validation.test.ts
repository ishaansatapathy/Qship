import { describe, expect, it, beforeEach, afterEach } from "vitest";

import { ServiceError } from "./errors";
import { assertReleaseReadyForShip } from "./release-validation";
import type { FeatureReleaseResult } from "./github/release-ship";
import { allowSimulatedDeploy, isDemoModeEnabled, isProductionEnv } from "./runtime-env";

function emptyRelease(): FeatureReleaseResult {
  return {
    merge: { attempted: false, merged: false },
    deploy: { attempted: false, triggered: false, simulated: false },
  };
}

describe("runtime-env", () => {
  const original = { ...process.env };

  beforeEach(() => {
    process.env = { ...original };
  });

  afterEach(() => {
    process.env = original;
  });

  it("treats production NODE_ENV as production", () => {
    process.env.NODE_ENV = "production";
    expect(isProductionEnv()).toBe(true);
    expect(isDemoModeEnabled()).toBe(false);
    expect(allowSimulatedDeploy()).toBe(false);
  });

  it("allows demo mode only outside production", () => {
    process.env.NODE_ENV = "development";
    process.env.DEMO_LOGIN_ENABLED = "true";
    expect(isDemoModeEnabled()).toBe(true);
    expect(allowSimulatedDeploy()).toBe(true);
  });
});

describe("assertReleaseReadyForShip", () => {
  const original = { ...process.env };

  beforeEach(() => {
    process.env = { ...original, NODE_ENV: "production" };
  });

  afterEach(() => {
    process.env = original;
  });

  it("blocks ship when merge was attempted but failed", () => {
    const release = emptyRelease();
    release.merge = { attempted: true, merged: false, reason: "merge_failed" };

    expect(() =>
      assertReleaseReadyForShip(release, { hadOpenPr: true, hadGithubConnection: true }),
    ).toThrow(ServiceError);
  });

  it("blocks ship in production without deploy webhook", () => {
    const release = emptyRelease();
    release.deploy = {
      attempted: false,
      triggered: false,
      simulated: true,
      reason: "not configured",
    };

    expect(() =>
      assertReleaseReadyForShip(release, { hadOpenPr: false, hadGithubConnection: false }),
    ).toThrow(/SHIP_DEPLOY_WEBHOOK_URL/);
  });

  it("allows simulated deploy in development", () => {
    process.env.NODE_ENV = "development";
    const release = emptyRelease();
    release.deploy = {
      attempted: false,
      triggered: false,
      simulated: true,
      reason: "not configured",
    };

    expect(() =>
      assertReleaseReadyForShip(release, { hadOpenPr: false, hadGithubConnection: false }),
    ).not.toThrow();
  });

  it("blocks ship when deploy webhook fails", () => {
    const release = emptyRelease();
    release.deploy = {
      attempted: true,
      triggered: false,
      simulated: false,
      reason: "500 error",
    };

    expect(() =>
      assertReleaseReadyForShip(release, { hadOpenPr: false, hadGithubConnection: false }),
    ).toThrow(/Deploy webhook failed/);
  });
});
