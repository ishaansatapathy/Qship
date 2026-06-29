import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcPath = path.join(root, "shipflow-agent-tools.ts");
const src = fs.readFileSync(srcPath, "utf8");
const lines = src.split(/\r?\n/);
const dir = path.join(root, "shipflow-agent-tools");
fs.mkdirSync(dir, { recursive: true });

const defEnd = lines.findIndex((l, i) => i > 490 && l.startsWith("function featureSummary"));
const execStart = lines.findIndex((l) => l.startsWith("export async function executeShipflowTool"));
const execEnd = lines.findIndex((l) => l.startsWith("export function isShipflowTool"));

const header = lines.slice(0, 4).join("\n");
const importsBlock = lines
  .slice(5, 62)
  .join("\n")
  .replaceAll("./ai/openai-tools", "../ai/openai-tools")
  .replaceAll("./errors", "../errors")
  .replaceAll("./feature-request", "../feature-request")
  .replaceAll("./feature-ai", "../feature-ai")
  .replaceAll("./feature-analytics", "../feature-analytics")
  .replaceAll("./feature-education", "../feature-education")
  .replaceAll("./feature-intake", "../feature-intake")
  .replaceAll("./inngest/dispatch", "../inngest/dispatch")
  .replaceAll("./review", "../review")
  .replaceAll("./workflow-guards", "../workflow-guards")
  .replaceAll("./github/installation", "../github/installation")
  .replaceAll("./task-walkthrough", "../task-walkthrough")
  .replaceAll("./workflow", "../workflow");

const definitions = lines.slice(62, defEnd).join("\n");
const helpers = lines.slice(defEnd, execStart).join("\n");
const execute = lines.slice(execStart, execEnd).join("\n");
const tail = lines.slice(execEnd).join("\n");

const executeImports = `${importsBlock}

import type { ShipflowToolContext } from "./definitions";
import { featureSummary, loadAuthorizedFeature } from "./helpers";

`;

fs.writeFileSync(
  path.join(dir, "definitions.ts"),
  `${header}

${importsBlock.split("\n").filter((l) => !l.startsWith("import { ServiceError")).join("\n")}

${definitions}`,
);

fs.writeFileSync(
  path.join(dir, "helpers.ts"),
  `import { ServiceError } from "../errors";
import { assertFeatureInUserWorkspace } from "../feature-request";

${helpers.replace(/^function featureSummary/, "export function featureSummary").replace(/^async function loadAuthorizedFeature/, "export async function loadAuthorizedFeature")}`,
);

fs.writeFileSync(path.join(dir, "execute.ts"), executeImports + execute);

fs.writeFileSync(
  path.join(dir, "focus.ts"),
  `import { SHIPFLOW_MCP_TOOLS } from "./definitions";

${tail}`,
);

fs.writeFileSync(
  path.join(dir, "index.ts"),
  `export type { ShipflowToolContext, McpToolDef } from "./definitions";
export { SHIPFLOW_MCP_TOOLS, SHIPFLOW_AGENT_TOOLS } from "./definitions";
export { executeShipflowTool } from "./execute";
export {
  isShipflowTool,
  FEATURE_FOCUS_PREFIX,
  isFeatureFocusId,
  toFeatureFocusId,
  fromFeatureFocusId,
} from "./focus";
`,
);

fs.writeFileSync(srcPath, "export * from \"./shipflow-agent-tools/index\";\n");
console.log("split ok", { defEnd, execStart, execEnd });
