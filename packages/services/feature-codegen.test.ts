import { describe, expect, it } from "vitest";

import { ServiceError } from "./errors";
import { sanitizeGeneratedContent, validateCodegenPath, validateGeneratedCodeGate } from "./feature-codegen";

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

  it("accepts plain HTML/CSS/JS static implementations without TS typecheck", () => {
    expect(() =>
      validateGeneratedCodeGate([
        {
          path: "index.html",
          content: "<!DOCTYPE html><html><body><h1>Hi</h1></body></html>\n",
          action: "create",
          summary: "html",
        },
        {
          path: "app.js",
          content: "document.getElementById('btn')?.addEventListener('click', () => {});\n",
          action: "create",
          summary: "js",
        },
      ]),
    ).not.toThrow();
  });

  it("resolves cross-file relative imports between generated files", () => {
    expect(() =>
      validateGeneratedCodeGate([
        {
          path: "src/feature/util.ts",
          content: "export function add(a: number, b: number): number { return a + b; }\n",
          action: "create",
          summary: "util",
        },
        {
          path: "src/feature/index.ts",
          content: 'import { add } from "./util";\nexport const total: number = add(1, 2);\n',
          action: "create",
          summary: "entry",
        },
      ]),
    ).not.toThrow();
  });

  it("rejects strict type errors via tsc gate", () => {
    expect(() =>
      validateGeneratedCodeGate([
        {
          path: "src/types.ts",
          content: "export const count: number = true;\n",
          action: "create",
          summary: "bad types",
        },
      ]),
    ).toThrow(ServiceError);
  });
});
