import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isInngestCloudConfigured } from "../inngest/client";

const mockProcessOutbox = vi.fn(async () => 3);

vi.mock("./webhook-outbox", () => ({
  processGithubWebhookOutbox: mockProcessOutbox,
}));

vi.mock("../inngest/client", () => ({
  isInngestCloudConfigured: vi.fn(() => false),
}));

import { startGithubWebhookOutboxProcessor } from "./webhook-outbox-scheduler";

describe("startGithubWebhookOutboxProcessor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses interval fallback when Inngest cloud is not configured", async () => {
    vi.mocked(isInngestCloudConfigured).mockReturnValue(false);
    startGithubWebhookOutboxProcessor();

    await vi.advanceTimersByTimeAsync(60_000);
    expect(mockProcessOutbox).toHaveBeenCalledWith(20);
  });

  it("skips interval when Inngest cloud cron is configured", () => {
    vi.mocked(isInngestCloudConfigured).mockReturnValue(true);
    startGithubWebhookOutboxProcessor();

    vi.advanceTimersByTime(120_000);
    expect(mockProcessOutbox).not.toHaveBeenCalled();
  });
});
