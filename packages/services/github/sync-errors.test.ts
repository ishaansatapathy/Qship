import { describe, expect, it } from "vitest";

import { ServiceError } from "../errors";
import { rethrowGithubSyncError } from "./sync-errors";

describe("rethrowGithubSyncError", () => {
  it("passes through ServiceError unchanged", () => {
    const err = new ServiceError("FORBIDDEN", "nope");
    expect(() => rethrowGithubSyncError(err)).toThrow(err);
  });

  it("maps GitHub 403 to PRECONDITION_FAILED", () => {
    expect(() => rethrowGithubSyncError({ status: 403, message: "Forbidden" })).toThrow(
      /cannot access this installation/i,
    );
  });

  it("maps GitHub 404 to NOT_FOUND", () => {
    expect(() => rethrowGithubSyncError({ status: 404, message: "Not Found" })).toThrow(
      /installation not found/i,
    );
  });

  it("maps Postgres unique violations to CONFLICT", () => {
    expect(() => rethrowGithubSyncError({ code: "23505" })).toThrow(/already linked/i);
  });
});
