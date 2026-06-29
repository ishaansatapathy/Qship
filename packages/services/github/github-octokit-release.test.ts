import { beforeEach, describe, expect, it, vi } from "vitest";

const octokitMocks = vi.hoisted(() => ({
  mockPullsGet: vi.fn(),
  mockPullsMerge: vi.fn(),
  mockUpdate: vi.fn(() => ({
    set: vi.fn(() => ({ where: vi.fn(async () => ({})) })),
  })),
}));

vi.mock("./client", () => ({
  getInstallationOctokit: vi.fn(() => ({
    rest: {
      pulls: {
        get: (...args: unknown[]) => octokitMocks.mockPullsGet(...args),
        merge: (...args: unknown[]) => octokitMocks.mockPullsMerge(...args),
      },
    },
  })),
}));

vi.mock("../feature-request", () => ({
  getFeatureRequest: vi.fn(async () => ({
    id: "feat-octokit-1",
    title: "Bulk export",
    pullRequests: [
      {
        id: "pr-row-1",
        state: "open",
        githubPrNumber: 7,
        url: "https://github.com/acme/core/pull/7",
        repository: { owner: "acme", name: "core" },
      },
    ],
  })),
}));

vi.mock("@repo/database", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@repo/database")>();
  return {
    ...actual,
    default: {
      update: octokitMocks.mockUpdate,
    },
  };
});

import { executeFeatureRelease } from "./release-ship";

describe("executeFeatureRelease Octokit contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    octokitMocks.mockPullsGet.mockResolvedValue({
      data: { merged: false, state: "open", html_url: "https://github.com/acme/core/pull/7" },
    });
    octokitMocks.mockPullsMerge.mockResolvedValue({ data: { merged: true, message: "Pull Request successfully merged" } });
    delete process.env.SHIP_DEPLOY_WEBHOOK_URL;
  });

  it("squash-merges linked open PR via installation Octokit", async () => {
    const result = await executeFeatureRelease({
      featureId: "feat-octokit-1",
      organizationId: "org-1",
      installationId: "inst-99",
    });

    expect(octokitMocks.mockPullsGet).toHaveBeenCalledWith({
      owner: "acme",
      repo: "core",
      pull_number: 7,
    });
    expect(octokitMocks.mockPullsMerge).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: "acme",
        repo: "core",
        pull_number: 7,
        merge_method: "squash",
      }),
    );
    expect(result.merge.merged).toBe(true);
    expect(result.merge.prNumber).toBe(7);
    expect(octokitMocks.mockUpdate).toHaveBeenCalled();
  });

  it("reports already_merged when GitHub PR is merged", async () => {
    octokitMocks.mockPullsGet.mockResolvedValueOnce({
      data: { merged: true, state: "closed", html_url: "https://github.com/acme/core/pull/7" },
    });

    const result = await executeFeatureRelease({
      featureId: "feat-octokit-1",
      organizationId: "org-1",
      installationId: "inst-99",
    });

    expect(octokitMocks.mockPullsMerge).not.toHaveBeenCalled();
    expect(result.merge.merged).toBe(true);
    expect(result.merge.reason).toBe("already_merged");
  });
});
