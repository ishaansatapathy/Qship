import { describe, expect, it } from "vitest";

import { ServiceError, serviceError } from "./errors";

describe("ServiceError", () => {
  it("carries a typed error code", () => {
    const err = new ServiceError("NOT_FOUND", "Feature not found");
    expect(err.code).toBe("NOT_FOUND");
    expect(err.message).toBe("Feature not found");
    expect(err.name).toBe("ServiceError");
  });

  it("serviceError factory creates equivalent instances", () => {
    const err = serviceError("FORBIDDEN", "Access denied");
    expect(err).toBeInstanceOf(ServiceError);
    expect(err.code).toBe("FORBIDDEN");
  });
});

describe("ServiceError codes", () => {
  const codes = [
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "PRECONDITION_FAILED",
    "INTERNAL",
  ] as const;

  it.each(codes)("accepts code %s", (code) => {
    expect(new ServiceError(code, "test").code).toBe(code);
  });
});
