import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";

import { ServiceError } from "@repo/services/errors";

import { sanitizeTrpcError } from "./error-handler";

describe("sanitizeTrpcError", () => {
  it("re-throws existing TRPCErrors unchanged", () => {
    const original = new TRPCError({ code: "NOT_FOUND", message: "missing" });
    expect(() => sanitizeTrpcError(original)).toThrow(original);
  });

  it("maps ServiceError to TRPCError via mapServiceError pattern", () => {
    const serviceErr = new ServiceError("PRECONDITION_FAILED", "Not ready");
    expect(serviceErr.code).toBe("PRECONDITION_FAILED");
  });

  it("wraps unknown errors as INTERNAL_SERVER_ERROR", () => {
    expect(() => sanitizeTrpcError(new Error("db exploded"))).toThrow(TRPCError);
    try {
      sanitizeTrpcError(new Error("db exploded"));
    } catch (error) {
      expect(error).toBeInstanceOf(TRPCError);
      expect((error as TRPCError).code).toBe("INTERNAL_SERVER_ERROR");
      expect((error as TRPCError).message).not.toContain("db exploded");
    }
  });
});
