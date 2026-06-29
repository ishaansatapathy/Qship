import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const executePath = path.join(root, "shipflow-agent-tools", "execute.ts");
const handlersDir = path.join(root, "shipflow-agent-tools", "handlers");
const content = fs.readFileSync(executePath, "utf8");

const switchStart = content.indexOf("  switch (name) {");
const switchEnd = content.lastIndexOf("    default:");
if (switchStart < 0 || switchEnd < 0) {
  throw new Error("Could not locate switch block in execute.ts");
}

const switchBody = content.slice(switchStart, switchEnd);
const caseRegex = /case "([^"]+)":\s*\{/g;
const cases = [];
let match;
while ((match = caseRegex.exec(switchBody)) !== null) {
  cases.push({ name: match[1], start: match.index, end: -1 });
}
for (let i = 0; i < cases.length; i += 1) {
  cases[i].end = i + 1 < cases.length ? cases[i + 1].start : switchBody.length;
}

const GROUPS = {
  "workspace-features.ts": [
    "get_workspace",
    "list_feature_requests",
    "get_feature_request",
    "create_feature_request",
    "triage_feature_request",
    "add_clarification",
    "update_feature_status",
    "get_pipeline_summary",
    "check_existing_capability",
    "intake_from_channel",
    "get_feature_delivery",
    "update_engineering_task_status",
  ],
  "delivery-workflows.ts": [
    "generate_feature_prd",
    "generate_feature_tasks",
    "implement_feature_code",
  ],
  "review-release.ts": [
    "run_ai_review",
    "request_human_review",
    "list_ai_reviews",
    "get_review_delta",
    "get_review_stats",
    "approve_feature",
    "ship_feature",
    "reject_feature",
    "request_changes",
    "get_approval_history",
    "get_approval_briefing",
    "resolve_review_issue",
    "analyze_change_request",
    "get_review_loop_health",
  ],
  "github-analytics.ts": [
    "github_connection_status",
    "list_github_repositories",
    "predict_delivery_timeline",
    "check_pipeline_duplicates",
    "get_pipeline_health",
    "get_developer_onboarding_guide",
  ],
  "walkthrough.ts": ["explain_engineering_task", "advance_task_walkthrough"],
};

const importsHeader = content.slice(0, content.indexOf("export async function executeShipflowTool"));

function extractCaseBody(caseBlock) {
  return caseBlock.replace(/^case "[^"]+":\s*\{/, "").replace(/\}\s*$/, "").trim();
}

const caseBodies = new Map();
for (const row of cases) {
  const block = switchBody.slice(row.start, row.end).trim();
  caseBodies.set(row.name, extractCaseBody(block));
}

fs.mkdirSync(handlersDir, { recursive: true });

const handlerExports = [];

for (const [fileName, toolNames] of Object.entries(GROUPS)) {
  const ns = fileName.replace(".ts", "").replace(/-/g, "_");
  const fns = [];
  for (const toolName of toolNames) {
    const body = caseBodies.get(toolName);
    if (!body) {
      console.warn("missing case", toolName);
      continue;
    }
    const fnName = `handle_${toolName.replace(/[^a-z0-9]+/gi, "_")}`;
    fns.push(`export async function ${fnName}(\n  ctx: ShipflowToolContext,\n  args: Record<string, unknown>,\n): Promise<string> {\n${body.split("\n").map((l) => (l ? `  ${l}` : l)).join("\n")}\n}`);
    handlerExports.push(`  ${toolName}: ${ns}.${fnName},`);
  }

  fs.writeFileSync(
    path.join(handlersDir, fileName),
    `${importsHeader}
import type { ShipflowToolContext } from "../definitions";
import { featureSummary, loadAuthorizedFeature } from "../helpers";

${fns.join("\n\n")}
`,
  );
}

const registry = `${importsHeader}
import * as workspace_features from "./workspace-features";
import * as delivery_workflows from "./delivery-workflows";
import * as review_release from "./review-release";
import * as github_analytics from "./github-analytics";
import * as walkthrough from "./walkthrough";

type ToolHandler = (ctx: ShipflowToolContext, args: Record<string, unknown>) => Promise<string>;

export const SHIPFLOW_TOOL_HANDLERS: Record<string, ToolHandler> = {
${handlerExports.join("\n")}
};
`;

fs.writeFileSync(path.join(handlersDir, "registry.ts"), registry);

const newExecute = `${importsHeader}
import type { ShipflowToolContext } from "./definitions";
import { SHIPFLOW_TOOL_HANDLERS } from "./handlers/registry";

export async function executeShipflowTool(
  ctx: ShipflowToolContext,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  const handler = SHIPFLOW_TOOL_HANDLERS[name];
  if (!handler) {
    throw new ServiceError("NOT_FOUND", \`Unknown ShipFlow tool: \${name}\`);
  }
  return handler(ctx, args);
}
`;

fs.writeFileSync(executePath, newExecute);
console.log("split execute into", Object.keys(GROUPS).length, "handler files,", handlerExports.length, "tools");
