import { describe, expect, it } from "vitest";

import { env } from "./env";

describe("api env defaults", () => {
  it("defaults OpenAPI docs to off (opt-in with PUBLIC_OPENAPI_DOCS=true)", () => {
    expect(env.PUBLIC_OPENAPI_DOCS).toBe("false");
  });
});
