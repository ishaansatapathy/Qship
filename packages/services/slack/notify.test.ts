import { describe, expect, it } from "vitest";

import { buildFeatureRequestsUrl, getSlackIntegrationStatus, parseSlackChannel } from "./notify";

describe("slack notify helpers", () => {
  it("parses channel from raw request", () => {
    expect(
      parseSlackChannel("Notify #product-shipping in Slack when a feature passes human approval"),
    ).toBe("#product-shipping");
  });

  it("returns null when no channel hash", () => {
    expect(parseSlackChannel("Send email to admins")).toBeNull();
  });

  it("builds feature deep link", () => {
    process.env.CLIENT_URL = "https://qship.ishaandev.co.in";
    expect(buildFeatureRequestsUrl("abc-123")).toBe(
      "https://qship.ishaandev.co.in/requests?id=abc-123",
    );
  });

  it("reports integration status for evaluators", () => {
    delete process.env.SLACK_WEBHOOK_URL;
    expect(getSlackIntegrationStatus()).toMatchObject({
      configured: false,
      mode: "simulated",
      channelHint: "#product-shipping",
    });

    process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.com/services/test";
    expect(getSlackIntegrationStatus()).toMatchObject({
      configured: true,
      mode: "live",
    });
  });
});
