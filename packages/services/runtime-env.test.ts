import { afterEach, describe, expect, it } from "vitest";

import { isDemoModeEnabled, isLegacyUiStubsEnabled, shouldRunMigrationsOnBoot } from "./runtime-env";

describe("runtime-env production gates", () => {
  const prevNodeEnv = process.env.NODE_ENV;
  const prevDemo = process.env.DEMO_LOGIN_ENABLED;
  const prevLegacy = process.env.LEGACY_UI_STUBS_ENABLED;
  const prevMigrate = process.env.RUN_MIGRATIONS_ON_BOOT;

  afterEach(() => {
    process.env.NODE_ENV = prevNodeEnv;
    process.env.DEMO_LOGIN_ENABLED = prevDemo;
    process.env.LEGACY_UI_STUBS_ENABLED = prevLegacy;
    process.env.RUN_MIGRATIONS_ON_BOOT = prevMigrate;
  });

  it("blocks demo mode in production", () => {
    process.env.NODE_ENV = "production";
    process.env.DEMO_LOGIN_ENABLED = "true";
    expect(isDemoModeEnabled()).toBe(false);
  });

  it("allows demo mode in development when enabled", () => {
    process.env.NODE_ENV = "development";
    process.env.DEMO_LOGIN_ENABLED = "true";
    expect(isDemoModeEnabled()).toBe(true);
  });

  it("disables legacy UI stubs in production by default", () => {
    process.env.NODE_ENV = "production";
    delete process.env.LEGACY_UI_STUBS_ENABLED;
    expect(isLegacyUiStubsEnabled()).toBe(false);
  });

  it("allows disabling boot migrations explicitly", () => {
    process.env.RUN_MIGRATIONS_ON_BOOT = "false";
    expect(shouldRunMigrationsOnBoot()).toBe(false);
  });
});
