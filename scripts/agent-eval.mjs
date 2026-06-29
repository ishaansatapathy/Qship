#!/usr/bin/env node
/**
 * Agent control-plane eval harness (no live OpenAI required).
 * Run from repo root: node scripts/agent-eval.mjs
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const servicesDir = path.join(root, "packages", "services");

const result = spawnSync("pnpm", ["exec", "vitest", "run", "ai/agent-eval.golden.test.ts", "ai/agent-loop.integration.test.ts"], {
  cwd: servicesDir,
  stdio: "inherit",
  shell: true,
});

process.exit(result.status ?? 1);
