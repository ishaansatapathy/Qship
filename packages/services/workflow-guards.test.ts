import { describe, expect, it } from "vitest";

import { RELEASE_REVIEWER_ROLES } from "./workflow-guards";

describe("workflow-guards", () => {
  it("restricts release actions to owner and admin roles", () => {
    expect(RELEASE_REVIEWER_ROLES.has("owner")).toBe(true);
    expect(RELEASE_REVIEWER_ROLES.has("admin")).toBe(true);
    expect(RELEASE_REVIEWER_ROLES.has("member")).toBe(false);
    expect(RELEASE_REVIEWER_ROLES.has("viewer")).toBe(false);
  });
});
