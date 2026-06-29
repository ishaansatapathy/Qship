import { describe, expect, it } from "vitest";

import { mutationProcedure, verifiedProcedure } from "./trpc";

describe("mutationProcedure", () => {
  it("is wired to verifiedProcedure (email verification required)", () => {
    expect(mutationProcedure).toBe(verifiedProcedure);
  });
});
