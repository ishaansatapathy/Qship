/**
 * One-shot script: add .output() to every OpenAPI-tagged tRPC procedure missing one.
 * Run: node scripts/fix-openapi-outputs.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const routesDir = path.join(root, "packages/trpc/server/routes");

const importBlock = `import {
  openApiResponse,
  workspaceOutput,
  pipelineSummaryOutput,
  intakeSummaryOutput,
  cancelWorkflowOutput,
  agentStatusOutput,
  billingStatusOutput,
  githubInstallUrlOutput,
  githubConnectionOutput,
  githubRepoListOutput,
} from "../../openapi-outputs";`;

const namedOutputs = {
  workspace: "workspaceOutput",
  pipelineSummary: "pipelineSummaryOutput",
  intakeSummary: "intakeSummaryOutput",
  cancelWorkflow: "cancelWorkflowOutput",
  status: "agentStatusOutput", // agent + billing both use status - handled per file
};

function patchFile(filePath) {
  let content = fs.readFileSync(filePath, "utf8");
  if (!content.includes("openapi:")) return 0;

  if (!content.includes("openapi-outputs")) {
    content = content.replace(
      /import \{ mapServiceError.*\} from "\.\.\/\.\.\/trpc";/,
      `${importBlock}\nimport { mapServiceError, protectedProcedure, publicProcedure, router } from "../../trpc";`,
    );
    if (!content.includes("openapi-outputs") && filePath.includes("health")) {
      // health doesn't need openapi-outputs import
    } else if (!content.includes("openapi-outputs")) {
      content = content.replace(
        /import \{ mapServiceError.*\} from "\.\.\/\.\.\/trpc";/,
        (m) => `${importBlock}\n${m}`,
      );
    }
  }

  // Re-read named outputs per file
  const fileOutputs = { ...namedOutputs };
  if (filePath.includes("billing")) {
    fileOutputs.status = "billingStatusOutput";
  } else if (filePath.includes("agent")) {
    fileOutputs.status = "agentStatusOutput";
  } else if (filePath.includes("github")) {
    fileOutputs.connectionStatus = "githubConnectionOutput";
    fileOutputs.getInstallUrl = "githubInstallUrlOutput";
    fileOutputs.listRepositories = "githubRepoListOutput";
  } else if (filePath.includes("workspace")) {
    fileOutputs.get = "openApiResponse";
  }

  let patches = 0;
  const procRegex = /(\n  (\w+): \w+Procedure[\s\S]*?\.meta\(\{[\s\S]*?openapi:[\s\S]*?\}\)[\s\S]*?)(\.(?:query|mutation)\()/g;

  content = content.replace(procRegex, (full, prefix, procName, suffix) => {
    if (prefix.includes(".output(")) return full;
    let output = "openApiResponse";
    if (fileOutputs[procName]) output = fileOutputs[procName];
    patches++;
    return `${prefix}.output(${output})${suffix}`;
  });

  fs.writeFileSync(filePath, content);
  return patches;
}

let total = 0;
for (const rel of [
  "feature/route.ts",
  "workspace/route.ts",
  "github/route.ts",
  "billing/route.ts",
  "agent/route.ts",
]) {
  const n = patchFile(path.join(routesDir, rel));
  console.log(`${rel}: ${n} procedures patched`);
  total += n;
}
console.log(`Total: ${total}`);
