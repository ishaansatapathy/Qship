import type { PrdContent } from "@repo/database/schema";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

import { ServiceError } from "./errors";
import { createChatCompletion, isOpenAiConfigured } from "./ai/openai";
import type { RepoFileSnippet } from "./github/repo-context";

export type GeneratedCodeFile = {
  path: string;
  content: string;
  action: "create" | "update";
  summary: string;
};

export type FeatureCodegenResult = {
  files: GeneratedCodeFile[];
  implementationNotes: string;
};

const MAX_FILES = Number(process.env.SHIPFLOW_CODEGEN_MAX_FILES ?? 8);
const MAX_LINES_PER_FILE = Number(process.env.SHIPFLOW_CODEGEN_MAX_LINES ?? 400);

const BLOCKED_PATH_RE =
  /(?:^|\/)(?:\.env|\.git|node_modules|dist|build|\.next|coverage|vendor)(?:\/|$)/i;

const BLOCKED_FILE_RE = /\.(?:pem|key|p12|pfx|lock)$/i;

/** Validates generated file paths before any GitHub write. */
export function validateCodegenPath(path: string): void {
  const normalized = path.trim().replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("..")) {
    throw new ServiceError("PRECONDITION_FAILED", `Invalid generated path: ${path}`);
  }
  if (BLOCKED_PATH_RE.test(normalized) || BLOCKED_FILE_RE.test(normalized)) {
    throw new ServiceError("PRECONDITION_FAILED", `Blocked generated path: ${normalized}`);
  }
}

/** Validates file size and normalizes line endings. */
export function sanitizeGeneratedContent(content: string): string {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  if (lines.length > MAX_LINES_PER_FILE) {
    throw new ServiceError(
      "PRECONDITION_FAILED",
      `Generated file exceeds ${MAX_LINES_PER_FILE} lines`,
    );
  }
  return lines.join("\n").trimEnd() + "\n";
}

function scriptKindForPath(path: string): ts.ScriptKind | null {
  if (path.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (path.endsWith(".ts")) return ts.ScriptKind.TS;
  if (path.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".cjs")) {
    return ts.ScriptKind.JS;
  }
  return null;
}

/** Parses generated JS/TS files and rejects syntax errors before any GitHub write. */
export function validateGeneratedCodeSyntax(files: GeneratedCodeFile[]): void {
  for (const file of files) {
    validateCodegenPath(file.path);
    const content = sanitizeGeneratedContent(file.content);
    const kind = scriptKindForPath(file.path);
    if (!kind) continue;

    const result = ts.transpileModule(content, {
      reportDiagnostics: true,
      compilerOptions: {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.ESNext,
        ...(kind === ts.ScriptKind.TSX || kind === ts.ScriptKind.JSX
          ? { jsx: ts.JsxEmit.ReactJSX }
          : {}),
      },
      fileName: file.path,
    });

    const diagnostics = result.diagnostics ?? [];
    if (diagnostics.length > 0) {
      const diagnostic = diagnostics[0]!;
      const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
      throw new ServiceError(
        "PRECONDITION_FAILED",
        `Generated code syntax error in ${file.path}: ${message}`,
      );
    }
  }
}

function compilerOptionsForDiskTypecheck(rootDir: string): ts.CompilerOptions {
  return {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Node10,
    rootDir,
    strict: true,
    skipLibCheck: true,
    noEmit: true,
    esModuleInterop: true,
    allowJs: true,
    jsx: ts.JsxEmit.ReactJSX,
  };
}

/** Type-checks generated TS/TSX on disk — avoids broken virtual lib loading (Array global error). */
export function validateGeneratedCodeTypes(files: GeneratedCodeFile[]): void {
  const normalized = files.map((file) => {
    validateCodegenPath(file.path);
    return {
      path: file.path.trim().replace(/\\/g, "/").replace(/^\/+/, ""),
      content: sanitizeGeneratedContent(file.content),
      kind: scriptKindForPath(file.path),
    };
  });

  const typedFiles = normalized.filter(
    (file): file is typeof file & { kind: ts.ScriptKind } => file.kind !== null,
  );
  if (typedFiles.length === 0) return;

  const hasTypeScript = typedFiles.some(
    (file) => file.path.endsWith(".ts") || file.path.endsWith(".tsx"),
  );
  // Static HTML features usually ship plain .js — syntax gate above is enough.
  if (!hasTypeScript) return;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "shipflow-codegen-"));
  try {
    for (const file of normalized) {
      const absPath = path.join(tmpDir, file.path);
      fs.mkdirSync(path.dirname(absPath), { recursive: true });
      fs.writeFileSync(absPath, file.content, "utf8");
    }

    const rootNames = typedFiles.map((file) => path.join(tmpDir, file.path));
    const program = ts.createProgram(rootNames, compilerOptionsForDiskTypecheck(tmpDir));

    const errors = ts.getPreEmitDiagnostics(program).filter(
      (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
    );

    if (errors.length > 0) {
      const diagnostic = errors[0]!;
      const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
      const absFile = diagnostic.file?.fileName;
      const displayFile = absFile?.startsWith(tmpDir)
        ? path.relative(tmpDir, absFile).replace(/\\/g, "/")
        : (absFile ?? "generated");
      throw new ServiceError(
        "PRECONDITION_FAILED",
        `Generated code type error in ${displayFile}: ${message}`,
      );
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

/** Syntax + type gate run before any generated code is committed to GitHub. */
export function validateGeneratedCodeGate(files: GeneratedCodeFile[]): void {
  validateGeneratedCodeSyntax(files);
  validateGeneratedCodeTypes(files);
}

function requireOpenAi() {
  if (!isOpenAiConfigured()) {
    throw new ServiceError("PRECONDITION_FAILED", "OpenAI is not configured. Set OPENAI_API_KEY.");
  }
}

function parseJson<T>(raw: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new ServiceError("INTERNAL", "AI returned invalid JSON for code generation.");
  }
}

/**
 * Generates implementation files for a feature from PRD + engineering tasks.
 * When repo snippets are provided, outputs integrate with existing codebase patterns.
 */
export async function generateFeatureImplementation(input: {
  featureId: string;
  title: string;
  rawRequest: string;
  prd: PrdContent;
  tasks: Array<{
    title: string;
    description: string;
    taskType?: string | null;
    acceptanceCriteria?: string[] | null;
  }>;
  repoSnippets?: RepoFileSnippet[];
}): Promise<FeatureCodegenResult> {
  requireOpenAi();

  const repoContext =
    input.repoSnippets && input.repoSnippets.length > 0
      ? input.repoSnippets
          .map((s) => `--- ${s.path} ---\n${s.excerpt}`)
          .join("\n\n")
          .slice(0, 12_000)
      : null;

  const content = await createChatCompletion(
    [
      {
        role: "system",
        content: `You are a senior full-stack engineer implementing a feature in a production SaaS codebase.

Return JSON with keys:
- implementationNotes: string (2-4 sentences on approach)
- files: array (max ${MAX_FILES}) of:
  - path: string (repo-relative, use forward slashes, no .. segments)
  - action: "create" | "update"
  - summary: string (one line — what this file does)
  - content: string (full file contents)

Rules:
1. Produce REAL, compilable code — TypeScript/React for web, typed handlers for API routes when relevant.
2. Include at least one test file when the feature has backend or utility logic.
3. Prefer paths under src/, apps/, packages/, or .shipflow/implementations/<featureId>/ when repo layout is unknown.
4. Never generate secrets, .env files, or credentials.
5. Match patterns from repo context when provided; otherwise use clean modular structure.
6. Each file must be complete — no placeholders like "// TODO implement".
7. Keep each file under ${MAX_LINES_PER_FILE} lines.`,
      },
      {
        role: "user",
        content: [
          `Feature ID: ${input.featureId}`,
          `Title: ${input.title}`,
          "",
          "Request:",
          input.rawRequest,
          "",
          "PRD:",
          JSON.stringify(input.prd, null, 2),
          "",
          "Engineering tasks:",
          JSON.stringify(input.tasks, null, 2),
          repoContext ? `\nRepo context:\n${repoContext}` : "\nNo repo context — use .shipflow/implementations/ paths.",
        ].join("\n"),
      },
    ],
    { jsonObject: true, temperature: 0.15 },
  );

  const parsed = parseJson<{
    implementationNotes?: string;
    files?: GeneratedCodeFile[];
  }>(content);

  const rawFiles = parsed.files ?? [];
  if (rawFiles.length === 0) {
    throw new ServiceError("INTERNAL", "AI returned no implementation files.");
  }
  if (rawFiles.length > MAX_FILES) {
    throw new ServiceError("PRECONDITION_FAILED", `AI returned too many files (max ${MAX_FILES}).`);
  }

  const files: GeneratedCodeFile[] = rawFiles.map((file) => {
    validateCodegenPath(file.path);
    const sanitized = sanitizeGeneratedContent(file.content ?? "");
    if (!sanitized.trim()) {
      throw new ServiceError("PRECONDITION_FAILED", `Empty content for ${file.path}`);
    }
    return {
      path: file.path.trim().replace(/\\/g, "/").replace(/^\/+/, ""),
      content: sanitized,
      action: file.action === "update" ? "update" : "create",
      summary: (file.summary ?? "Implementation file").slice(0, 200),
    };
  });

  return {
    files,
    implementationNotes: parsed.implementationNotes?.trim() || "AI-generated implementation committed to feature branch.",
  };
}
