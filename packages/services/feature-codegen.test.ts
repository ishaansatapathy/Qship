import { describe, expect, it } from "vitest";

import { ServiceError } from "./errors";
import { sanitizeGeneratedContent, validateCodegenPath } from "./feature-codegen";

describe("feature-codegen validation", () => {
  it("accepts safe repo-relative paths", () => {
    expect(() => validateCodegenPath("src/features/export/handler.ts")).not.toThrow();
    expect(() => validateCodegenPath(".shipflow/implementations/abc/module.ts")).not.toThrow();
  });

  it("blocks path traversal and secrets", () => {
    expect(() => validateCodegenPath("../etc/passwd")).toThrow(ServiceError);
    expect(() => validateCodegenPath(".env")).toThrow(ServiceError);
    expect(() => validateCodegenPath("node_modules/pkg/index.js")).toThrow(ServiceError);
    expect(() => validateCodegenPath("keys/private.pem")).toThrow(ServiceError);
  });

  it("normalizes content and enforces line limits", () => {
    const content = sanitizeGeneratedContent("export const ok = true;\n");
    expect(content.endsWith("\n")).toBe(true);
  });

  it("rejects oversized generated files", () => {
    const huge = Array.from({ length: 500 }, (_, i) => `line ${i}`).join("\n");
    expect(() => sanitizeGeneratedContent(huge)).toThrow(ServiceError);
  });
});
